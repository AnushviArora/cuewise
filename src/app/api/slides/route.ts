import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import type { SlidesResponse } from "@/lib/ai/contracts";
import type { SlideTerm, SlideTermKind } from "@/lib/captions/types";
import { getOpenAIKey } from "@/lib/server/env";
import { apiError, badRequest } from "@/lib/server/http";
import { chatJson } from "@/lib/server/openai";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_CHARS = 60_000; // ~15k tokens of slide text is plenty for a prototype
const MAX_TERMS = 150;

const SYSTEM = `You build a glossary from lecture slides, to help fix speech-to-text errors.
List words and short phrases that a speech recognizer would likely get wrong:
- "name": people, authors, places, organizations, product names
- "technical": technical vocabulary, notation read aloud, acronyms, foreign or Latinized terms
- "course": course-specific jargon and coined terms
Rules: copy each term EXACTLY as spelled in the slides. Skip common everyday English words, slide boilerplate, page numbers and URLs. Max 4 words per term. No duplicates.`;

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

export async function POST(req: Request) {
  try {
    getOpenAIKey(); // fail fast with a friendly error before parsing the PDF
    const form = await req.formData();
    const file = form.get("slides");
    if (!(file instanceof Blob) || file.size === 0) return badRequest("No slides were provided.");
    if (file.size > MAX_PDF_BYTES) return badRequest("That PDF is too large.");
    const course = String(form.get("courseName") ?? "").slice(0, 120);

    let text = "";
    try {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const out = await extractText(pdf, { mergePages: false });
      text = out.text.map((p, i) => `--- Slide ${i + 1} ---\n${p}`).join("\n");
    } catch {
      return badRequest("That PDF couldn’t be read. Try re-exporting your slides as a PDF.");
    }

    // Scanned/image-only decks have almost no text layer.
    const plain = text.replace(/--- Slide \d+ ---/g, "").replace(/\s+/g, " ").trim();
    if (plain.length < 20) {
      return NextResponse.json({ terms: [], readable: false } satisfies SlidesResponse);
    }

    const { terms: raw } = await chatJson<{ terms: SlideTerm[] }>({
      system: SYSTEM,
      user: `Course: ${course || "(unknown)"}\n\nSlides text:\n${text.slice(0, MAX_CHARS)}`,
      schemaName: "slide_terms",
      schema: SCHEMA,
    });

    const seen = new Set<string>();
    const terms: SlideTerm[] = [];
    for (const t of raw) {
      const term = t.term?.trim();
      if (!term) continue;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push({ term, kind: t.kind as SlideTermKind });
      if (terms.length >= MAX_TERMS) break;
    }
    return NextResponse.json({ terms, readable: true } satisfies SlidesResponse);
  } catch (e) {
    return apiError(e);
  }
}
