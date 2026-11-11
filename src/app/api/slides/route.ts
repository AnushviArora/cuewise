import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import type { SlidesResponse } from "@/lib/ai/contracts";
import type { SlideTerm, SlideTermKind } from "@/lib/captions/types";
import { getOpenAIKey } from "@/lib/server/env";
import { apiError, badRequest, OpenAIError } from "@/lib/server/http";
import { chatJsonRaw } from "@/lib/server/openai";
import { MAX_SLIDES_BYTES, MAX_SLIDES_FILES } from "@/lib/validation";

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

const SYSTEM = `You build a glossary from lecture documents (slides, lecture notes, handouts), to help fix speech-to-text errors.
List words and short phrases that a speech recognizer would likely get wrong:
- "name": people, authors, places, organizations, product names
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
    getOpenAIKey(); // fail fast with a friendly error before parsing PDFs
    const form = await req.formData();
    const files = form.getAll("slides").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return badRequest("No documents were provided.");
    if (files.length > MAX_SLIDES_FILES) {
      return badRequest(`You can add up to ${MAX_SLIDES_FILES} documents.`);
    }
    if (files.some((f) => f.size > MAX_SLIDES_BYTES)) return badRequest("A PDF is too large.");
    const course = String(form.get("courseName") ?? "").slice(0, 120);

    // Extract all PDFs in parallel; one unreadable file shouldn't sink the rest.
    const extracted = await Promise.all(
      files.map(async (file) => {
        try {
          const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
          const out = await extractText(pdf, { mergePages: false });
          return { name: file.name, pages: out.text, ok: true as const };
        } catch {
          return { name: file.name, pages: [] as string[], ok: false as const };
        }
      }),
    );
    if (extracted.every((d) => !d.ok)) {
      return badRequest("Those PDFs couldn’t be read. Try re-exporting them as PDF.");
    }

    const seenLines = new Set<string>();
    const docs = extracted.map((d) => ({
      name: d.name,
      // Judged before de-duplication, so a copy of another document isn't called "unreadable".
      readable: d.pages.join("").replace(/\s+/g, "").length >= 20,
      text: condense(d.pages, seenLines),
    }));
    // Scanned/image-only documents have almost no text layer.
    const readable = docs.filter((d) => d.readable);
    const skipped = docs.filter((d) => !d.readable).map((d) => d.name);
    const usable = readable.filter((d) => d.text.length > 0); // text left after de-dup
    if (usable.length === 0) {
      return NextResponse.json({ terms: [], documentsUsed: readable.length, skipped } satisfies SlidesResponse);
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
    if (failed.length === lists.length) throw (failed[0] as { error: unknown }).error;

    // Merge round-robin so every document is represented, then de-duplicate
    // (case/punctuation-insensitive), keeping each document's relevance order.
    const ok = lists.map((l) => l.terms ?? []);
    const seen = new Set<string>();
    const terms: SlideTerm[] = [];
    for (let rank = 0; terms.length < MAX_TERMS; rank++) {
      let any = false;
      for (const list of ok) {
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
    const t2 = performance.now();
    console.info(
      `[timing] slides: read ${files.length} PDFs ${Math.round(t1 - t0)}ms, ` +
        `terms (${usable.length} docs, ${caps.reduce((a, b) => a + b, 0)} chars) ${Math.round(t2 - t1)}ms, ` +
        `${terms.length} terms${failed.length ? `, ${failed.length} failed` : ""}`,
    );
    return NextResponse.json({
      terms,
      documentsUsed: readable.length,
      skipped,
      failed: failed.map((f) => f.name),
    } satisfies SlidesResponse);
  } catch (e) {
    return apiError(e);
  }
}
