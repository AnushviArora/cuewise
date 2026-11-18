import { clock } from "@/lib/captions/export";
import type { CaptionCue, SlidePage } from "@/lib/captions/types";

/** One searchable passage of the lecture: a stretch of transcript or a page of a document. */
export interface Chunk {
  /** "T12" (transcript) or "S3" (document page): what answers cite. */
  id: string;
  kind: "transcript" | "slide";
  /** Text shown to the model. */
  text: string;
  /** Text that is embedded (slides get their file name and page, which helps matching). */
  embedText: string;
  /** Origin for the model and the UI, e.g. "transcript 12:34" or "notes.pdf, page 7". */
  label: string;
  /** Transcript only: where it starts (for seeking) and which cues it spans. */
  start?: number;
  end?: number;
  cueFrom?: number;
  cueTo?: number;
  /** Document only. */
  doc?: string;
  page?: number;
}

/** About 45 seconds of speech per chunk, half overlapping, so a moment is never split in two. */
const WINDOW = 8;
const STRIDE = 4;
const MAX_SLIDE_CHARS = 1_200;

export function transcriptChunks(cues: CaptionCue[]): Chunk[] {
  const out: Chunk[] = [];
  for (let i = 0; i < cues.length; i += STRIDE) {
    const w = cues.slice(i, i + WINDOW);
    const text = w.map((c) => c.text.trim()).join(" ");
    out.push({
      id: `T${out.length + 1}`,
      kind: "transcript",
      text,
      embedText: text,
      label: `transcript ${clock(w[0].start)}`,
      start: w[0].start,
      end: w[w.length - 1].end,
      cueFrom: i,
      cueTo: i + w.length - 1,
    });
    if (i + WINDOW >= cues.length) break;
  }
  return out;
}

export function slideChunks(pages: SlidePage[]): Chunk[] {
  const out: Chunk[] = [];
  for (const p of pages) {
    // Split a long page at line breaks so each part stays focused.
    const parts: string[] = [];
    let cur = "";
    for (const l of p.text.split("\n")) {
      if (cur && cur.length + l.length > MAX_SLIDE_CHARS) {
        parts.push(cur);
        cur = "";
      }
      cur += (cur ? "\n" : "") + l;
    }
    if (cur) parts.push(cur);
    for (const text of parts) {
      out.push({
        id: `S${out.length + 1}`,
        kind: "slide",
        text,
        embedText: `${p.doc}, page ${p.page}: ${text}`,
        label: `${p.doc}, page ${p.page}`,
        doc: p.doc,
        page: p.page,
      });
    }
  }
  return out;
}
