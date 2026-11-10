import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import type { SlidesResponse } from "@/lib/ai/contracts";
import type { SlideTerm, SlideTermKind } from "@/lib/captions/types";
import { getOpenAIKey } from "@/lib/server/env";
import { apiError, badRequest } from "@/lib/server/http";
import { chatJson } from "@/lib/server/openai";
import { MAX_SLIDES_BYTES, MAX_SLIDES_FILES } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Total text sent to the model, however many documents there are (~15k tokens). */
const TOTAL_CHAR_BUDGET = 60_000;
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

export async function POST(req: Request) {
  try {
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

    const caps = allocate(usable.map((d) => d.text.length), TOTAL_CHAR_BUDGET);
    const corpus = usable
      .map((d, i) => `=== Document ${i + 1}: ${d.name} ===\n${d.text.slice(0, caps[i])}`)
      .join("\n\n");

    const { terms: raw } = await chatJson<{ terms: SlideTerm[] }>({
      system: SYSTEM,
      user: `Course: ${course || "(unknown)"}\n\n${corpus}`,
      schemaName: "slide_terms",
      schema: SCHEMA,
    });

    // Merge and de-duplicate (case/punctuation-insensitive), keeping the model's relevance order.
    const seen = new Set<string>();
    const terms: SlideTerm[] = [];
    for (const t of raw) {
      const term = t.term?.trim();
      if (!term) continue;
      const key = term.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      terms.push({ term, kind: t.kind as SlideTermKind });
      if (terms.length >= MAX_TERMS) break;
    }
    return NextResponse.json({ terms, documentsUsed: readable.length, skipped } satisfies SlidesResponse);
  } catch (e) {
    return apiError(e);
  }
}
