/** A single timed caption. `text` is what is shown; `originalText` is what was transcribed. */
export interface CaptionCue {
  id: string;
  /** seconds */
  start: number;
  /** seconds */
  end: number;
  text: string;
  /** Raw transcript text, present only when a correction changed `text`. */
  originalText?: string;
  /** Character ranges in `text` touched by a correction or flagged for review. */
  marks?: CaptionMark[];
}

export interface CaptionMark {
  /** Offsets into the cue's `text` (end exclusive). */
  start: number;
  end: number;
  editId: string;
}

export type SlideTermKind = "name" | "technical" | "course";
export interface SlideTerm {
  term: string;
  kind: SlideTermKind;
}

export type Confidence = "high" | "medium" | "low";

/**
 * One term correction (or uncertain word). This is the Review tab's data:
 * - "applied": the cue text was changed from `original` to `corrected`.
 * - "needs_review": the cue text is UNCHANGED; `corrected` is only a suggestion.
 */
export interface CaptionEdit {
  id: string;
  cueId: string;
  original: string;
  corrected: string;
  /** The slide term this matched. */
  term: string;
  confidence: Confidence;
  reason: string;
  status: "applied" | "needs_review";
}

export interface CaptionResult {
  cues: CaptionCue[];
  edits: CaptionEdit[];
  terms: SlideTerm[];
  hadSlides: boolean;
  /** Slides were uploaded but yielded no usable text (e.g. scanned images). */
  slidesUnreadable: boolean;
  /** Slides were uploaded but checking them failed; captions are the raw transcript. */
  slidesError?: string;
}

export type CaptionPosition = "top" | "middle" | "bottom";
export type CaptionAlign = "left" | "center" | "right";

export interface CaptionSettings {
  /** How many lines the caption text is balanced across (1–3). */
  rows: 1 | 2 | 3;
  position: CaptionPosition;
  /** Inset from the aligned edge, as % of video width (0–20). */
  indent: number;
  align: CaptionAlign;
  /** Font size as % of video width (1.6–4). Scales with the player. */
  fontSize: number;
}
