import { NextResponse } from "next/server";
import type { CorrectRequest, CorrectResponse } from "@/lib/ai/contracts";
import { validateEdits, type RawEdit } from "@/lib/captions/corrections";
import { apiError, badRequest } from "@/lib/server/http";
import { chatJson } from "@/lib/server/openai";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM = `You fix speech-to-text errors in lecture captions using a glossary taken from the lecture's own slides.

You do NOT rewrite captions. You only report individual words or short phrases that were clearly misheard or misspelled versions of a glossary term.

Rules:
- Report an edit ONLY if the caption word(s) sound like or are a misspelling of a specific glossary term and the context supports it. "corrected" must be that glossary term, spelled exactly as in the glossary (or one word of a multi-word term).
- Never fix grammar, punctuation, wording, filler words or style. Never add, remove, reorder or summarize content.
- "original" must be copied exactly from the caption text. Report each distinct wrong word once per caption.
- confidence "high": a clear, unambiguous match. "medium": plausible but could be a different real word. "low": possible match, you can't tell. Use medium/low freely — a human will review them.
- If a word might be a glossary term but you can't tell, report it with low confidence rather than guessing high.
- Capitalization alone is NOT an error. Never report a word that is already right apart from upper/lower case ("linear combinations" is correct; do not change it to "Linear Combinations"). Glossary entries copied from slide titles are often in Title Case; in a sentence, ordinary terms stay lowercase. Write "corrected" lowercase unless the term is a person's name, a place, an acronym or always capitalized.
- If nothing needs fixing, return an empty list. Most captions need no edits.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["edits"],
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cueId", "original", "corrected", "term", "confidence", "reason"],
        properties: {
          cueId: { type: "string" },
          original: { type: "string" },
          corrected: { type: "string" },
          term: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

export async function POST(req: Request) {
  try {
    const t0 = performance.now();
    const body = (await req.json().catch(() => null)) as CorrectRequest | null;
    if (!body || !Array.isArray(body.cues) || !Array.isArray(body.terms)) {
      return badRequest("Invalid request.");
    }
    if (body.cues.length > 80) return badRequest("Too many captions in one request.");
    if (body.terms.length === 0 || body.cues.length === 0) {
      return NextResponse.json({ edits: [] } satisfies CorrectResponse);
    }

    const glossary = body.terms.map((t) => `- ${t.term} (${t.kind})`).join("\n");
    const captions = body.cues.map((c) => `[${c.id}] ${c.text}`).join("\n");
    const { edits } = await chatJson<{ edits: RawEdit[] }>({
      system: SYSTEM,
      user: `Course: ${String(body.courseName ?? "").slice(0, 120) || "(unknown)"}\n\nGlossary:\n${glossary}\n\nCaptions:\n${captions}`,
      schemaName: "caption_edits",
      schema: SCHEMA,
      maxTokens: 2500,
      signal: req.signal,
    });
    console.info(`[timing] correct: ${body.cues.length} cues ${Math.round(performance.now() - t0)}ms`);

    return NextResponse.json({
      edits: validateEdits(edits, body.cues, body.terms),
    } satisfies CorrectResponse);
  } catch (e) {
    return apiError(e);
  }
}
