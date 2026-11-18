import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import type { SlidesResponse } from "@/lib/ai/contracts";
import type { SlidePage, SlideTerm, SlideTermKind } from "@/lib/captions/types";
import { getOpenAIKey } from "@/lib/server/env";
import { apiError, badRequest, OpenAIError } from "@/lib/server/http";
import { chatJsonRaw } from "@/lib/server/openai";
import { DOC_LIMITS, docKindOf, validateDocument, type DocKind } from "@/lib/documents";
import { DocumentError, parseDocument, type Unit } from "@/lib/server/documents";
import { MAX_SLIDES_FILES } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Each document is checked in its own small request (several run at once), instead of one
 * huge request for everything. That keeps replies short, fast and impossible to cut off.
 */
const TOTAL_CHAR_BUDGET = 120_000;
const MAX_CHARS_PER_DOC = 30_000;
const TERMS_PER_DOC = 60;
const DOC_REPLY_TOKENS = 1_800;
const PARALLEL_DOCS = 5;
const MAX_TERMS = 150;
/** Page text kept for answering questions (with slide numbers). */
const MAX_PAGE_CHARS = 2_000;
const MAX_PAGES_TOTAL_CHARS = 400_000;

const SYSTEM = `You build a glossary from lecture documents (slides, lecture notes, handouts), to help fix speech-to-text errors.
List words and short phrases that a speech recognizer would likely get wrong:
- "name": people, authors, places, organizations, product names, and terms named after people (Gram-Schmidt, Cayley-Hamilton)
- "technical": technical vocabulary, notation read aloud, acronyms, foreign or Latinized terms
- "course": course-specific jargon and coined terms
Rules: copy each term EXACTLY as spelled in the documents. Skip common everyday English words, boilerplate, page numbers and URLs. Max 4 words per term. No duplicates across documents. Order the list by importance: terms that are central to the lecture or appear in several documents come first.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["terms"],
  properties: {
    terms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "kind"],
        properties: {
          term: { type: "string" },
          kind: { type: "string", enum: ["name", "technical", "course"] },
        },
      },
    },
  },
} as const;

/** Drops repeated headers/footers and tiny lines so the budget goes to real content. */
function condense(pages: string[], seen: Set<string>): string {
  const out: string[] = [];
  for (const page of pages) {
    for (const raw of page.split("\n")) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (line.length < 3 || /^\d+$/.test(line)) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue; // same line already seen in this or another document
      seen.add(key);
      out.push(line);
    }
  }
  return out.join("\n");
}

/** Fair-share split: short documents keep all their text, long ones share what's left. */
function allocate(lengths: number[], budget: number): number[] {
  const order = lengths.map((len, i) => ({ len, i })).sort((a, b) => a.len - b.len);
  const caps = new Array<number>(lengths.length).fill(0);
  let left = budget;
  order.forEach(({ len, i }, k) => {
    const share = Math.floor(left / (order.length - k));
    caps[i] = Math.min(len, share);
    left -= caps[i];
  });
  return caps;
}

/** Per-page text for citing slide numbers. Lines repeated across many pages (headers/footers) are dropped. */
function cleanPages(name: string, pages: string[]): SlidePage[] {
  const rows = pages.map((p) => p.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean));
  const freq = new Map<string, number>();
  for (const ls of rows) for (const l of new Set(ls.map((x) => x.toLowerCase()))) freq.set(l, (freq.get(l) ?? 0) + 1);
  const boilerplate = (l: string) =>
    /^\d+$/.test(l) || (pages.length >= 4 && (freq.get(l.toLowerCase()) ?? 0) >= Math.max(3, pages.length * 0.4));
  return rows
    .map((ls, i) => ({ doc: name, page: i + 1, text: ls.filter((l) => !boilerplate(l)).join("\n").slice(0, MAX_PAGE_CHARS) }))
    .filter((p) => p.text.replace(/\s+/g, "").length >= 20);
}

/**
 * Merges per-document term lists round-robin so every document is represented, then
 * de-duplicates (case/punctuation-insensitive), keeping each document's relevance order.
 */
function mergeTerms(lists: SlideTerm[][]): SlideTerm[] {
  const seen = new Set<string>();
  const terms: SlideTerm[] = [];
  for (let rank = 0; terms.length < MAX_TERMS; rank++) {
    let any = false;
    for (const list of lists) {
      const t = list[rank];
      if (!t) continue;
      any = true;
      const key = t.term.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      terms.push(t);
      if (terms.length >= MAX_TERMS) break;
    }
    if (!any) break;
  }
  return terms;
}

interface Extracted {
  name: string;
  kind: DocKind;
  /** Text per page (PDF) or per passage (other formats). */
  pages: string[];
  /** Non-PDF formats: passages with their locators ("Slide 7", "lines 12-30"). */
  units?: Unit[];
  /** Code files: names found in the file itself (no AI needed). */
  codeTerms: SlideTerm[];
  ok: boolean;
}

/** Runs `fn` over `items`, at most `limit` at a time, keeping result order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** Pulls whole {term, kind} objects out of a reply that was cut off mid-way. */
function salvageTerms(content: string): SlideTerm[] {
  const re = /\{\s*"term"\s*:\s*("(?:[^"\\]|\\.)*")\s*,\s*"kind"\s*:\s*"(name|technical|course)"\s*\}/g;
  return [...content.matchAll(re)].map((m) => ({ term: JSON.parse(m[1]) as string, kind: m[2] as SlideTermKind }));
}

async function termsForDoc(
  name: string,
  text: string,
  course: string,
  signal: AbortSignal,
): Promise<SlideTerm[]> {
  const { content, finishReason } = await chatJsonRaw({
    system: SYSTEM,
    user: `Course: ${course || "(unknown)"}\nReturn at most ${TERMS_PER_DOC} terms.\n\n=== ${name} ===\n${text}`,
    schemaName: "slide_terms",
    schema: SCHEMA,
    maxTokens: DOC_REPLY_TOKENS,
    signal,
  });
  let raw: SlideTerm[] | null = null;
  if (finishReason !== "length") {
    try {
      raw = (JSON.parse(content) as { terms: SlideTerm[] }).terms;
    } catch {
      /* fall through to salvage */
    }
  }
  // A cut-off reply still holds complete terms: keep those instead of failing.
  const list = (raw ?? salvageTerms(content)).filter((t) => typeof t.term === "string" && t.term.trim());
  if (list.length === 0) throw new OpenAIError(502, "no usable terms", "bad_output");
  return list.slice(0, TERMS_PER_DOC).map((t) => ({ term: t.term.trim(), kind: t.kind }));
}

export async function POST(req: Request) {
  try {
    const t0 = performance.now();
    getOpenAIKey(); // fail fast with a friendly error before parsing documents
    const form = await req.formData();
    const files = form.getAll("slides").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return badRequest("No documents were provided.");
    if (files.length > MAX_SLIDES_FILES) {
      return badRequest(`You can add up to ${MAX_SLIDES_FILES} documents.`);
    }
    for (const f of files) {
      const kind = docKindOf(f.name, f.type);
      if (!kind) return badRequest(validateDocument(f) ?? "That file type isn’t supported.");
      if (f.size > DOC_LIMITS[kind]) {
        return badRequest(kind === "pdf" ? "A PDF is too large." : (validateDocument(f) ?? "A file is too large."));
      }
    }
    const course = String(form.get("courseName") ?? "").slice(0, 120);

    // Read all files in parallel; one unreadable file shouldn't sink the rest.
    const extracted: Extracted[] = await Promise.all(
      files.map(async (file): Promise<Extracted> => {
        const kind = docKindOf(file.name, file.type) as DocKind;
        if (kind !== "pdf") {
          // PowerPoint, Word, Markdown, text and code: read as plain text, never executed.
          try {
            const parsed = await parseDocument(file, kind);
            return { name: file.name, kind, pages: parsed.units.map((u) => u.text), units: parsed.units, codeTerms: parsed.terms, ok: true };
          } catch (e) {
            if (!(e instanceof DocumentError)) throw e;
            return { name: file.name, kind, pages: [], units: [], codeTerms: [], ok: false };
          }
        }
        try {
          const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
          const out = await extractText(pdf, { mergePages: false });
          return { name: file.name, kind, pages: out.text, codeTerms: [], ok: true };
        } catch {
          return { name: file.name, kind, pages: [], codeTerms: [], ok: false };
        }
      }),
    );
    if (extracted.every((d) => !d.ok)) {
      return badRequest(
        extracted.every((d) => d.kind === "pdf")
          ? "Those PDFs couldn’t be read. Try re-exporting them as PDF."
          : "Those documents couldn’t be read. They may be corrupted, password-protected or empty.",
      );
    }

    const seenLines = new Set<string>();
    const docs = extracted.map((d) => ({
      name: d.name,
      // Judged before de-duplication, so a copy of another document isn't called "unreadable".
      readable: d.pages.join("").replace(/\s+/g, "").length >= 20,
      // Code files teach us names directly (below), so they skip the AI term extraction.
      text: d.kind === "code" ? "" : condense(d.pages, seenLines),
    }));
    // Scanned/image-only documents have almost no text layer.
    const readable = docs.filter((d) => d.readable);
    const skipped = docs.filter((d) => !d.readable).map((d) => d.name);
    const usable = readable.filter((d) => d.text.length > 0); // text left after de-dup
    let budget = MAX_PAGES_TOTAL_CHARS;
    const pages: SlidePage[] = [];
    for (const d of extracted) {
      if (!d.ok || !readable.some((r) => r.name === d.name)) continue;
      const own: SlidePage[] = d.units
        ? d.units.map((u, i) => ({ doc: d.name, page: i + 1, text: u.text, locator: u.locator }))
        : cleanPages(d.name, d.pages);
      for (const p of own) {
        if (budget < p.text.length) break;
        budget -= p.text.length;
        pages.push(p);
      }
    }
    // Names from code files (function, class and variable names), most important first.
    const codeLists = extracted
      .filter((d) => d.ok && d.kind === "code" && d.codeTerms.length > 0 && readable.some((r) => r.name === d.name))
      .map((d) => d.codeTerms);
    if (usable.length === 0) {
      return NextResponse.json({
        terms: mergeTerms(codeLists),
        documentsUsed: readable.length,
        skipped,
        pages,
      } satisfies SlidesResponse);
    }

    const caps = allocate(
      usable.map((d) => Math.min(d.text.length, MAX_CHARS_PER_DOC)),
      TOTAL_CHAR_BUDGET,
    );
    const t1 = performance.now();

    const lists = await mapPool(usable, PARALLEL_DOCS, async (d, i) => {
      try {
        return { name: d.name, terms: await termsForDoc(d.name, d.text.slice(0, caps[i]), course, req.signal) };
      } catch (e) {
        if (req.signal.aborted) throw e;
        console.error(`[slides] "${d.name}" failed:`, e instanceof Error ? e.message : e);
        return { name: d.name, terms: null, error: e };
      }
    });
    const failed = lists.filter((l) => l.terms === null);
    // Only a failure when nothing at all (not even names from code files) could be learned.
    if (failed.length === lists.length && codeLists.length === 0) throw (failed[0] as { error: unknown }).error;

    const terms = mergeTerms([...lists.map((l) => l.terms ?? []), ...codeLists]);
    const t2 = performance.now();
    console.info(
      `[timing] slides: read ${files.length} files ${Math.round(t1 - t0)}ms, ` +
        `terms (${usable.length} docs, ${caps.reduce((a, b) => a + b, 0)} chars) ${Math.round(t2 - t1)}ms, ` +
        `${terms.length} terms${failed.length ? `, ${failed.length} failed` : ""}`,
    );
    return NextResponse.json({
      terms,
      documentsUsed: readable.length,
      skipped,
      failed: failed.map((f) => f.name),
      pages,
    } satisfies SlidesResponse);
  } catch (e) {
    return apiError(e);
  }
}
