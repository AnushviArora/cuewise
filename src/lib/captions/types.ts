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
  /**
   * The only change is capitalization that is genuinely required (a name or acronym), e.g.
   * "matlab" -> "MATLAB". Applied silently: not a real correction, so it is never shown in
   * Review or counted as a fix.
   */
  caseOnly?: boolean;
}

/** A professor's decision on one edit. Without a decision, an edit keeps its default behaviour. */
export interface EditDecision {
  kind: "accepted" | "edited" | "kept";
  /** What the transcript shows for this word: suggestion, typed text, or the original. */
  text: string;
}

/** Where an edit stands: "auto" = fixed automatically, "pending" = awaiting review. */
export type EditState = "auto" | "pending" | EditDecision["kind"];

export interface CaptionResult {
  cues: CaptionCue[];
  edits: CaptionEdit[];
  terms: SlideTerm[];
  /** How many documents (slides, notes, handouts) were uploaded. */
  documentsUploaded: number;
  /** How many of them had readable text and contributed terms. */
  documentsUsed: number;
  /** Names of uploaded documents with no readable text (e.g. scanned images). */
  documentsSkipped: string[];
  /** Documents whose term check failed even though they were readable. */
  documentsFailed?: string[];
  /** Slides were uploaded but checking them failed; captions are the raw transcript. */
  slidesError?: string;
}

export type CaptionPosition = "top" | "middle" | "bottom";
/** Where the caption block sits across the video. */
export type CaptionHorizontal = "left" | "center" | "right";
/** How text lines align inside the caption block. */
export type CaptionAlign = "left" | "center" | "right";

export interface CaptionSettings {
  /** How many lines the caption text is balanced across (1–3). */
  rows: 1 | 2 | 3;
  /** Vertical placement of the caption block. */
  position: CaptionPosition;
  /** Horizontal placement of the caption block (move it off slides or board content). */
  horizontal: CaptionHorizontal;
  /** Text alignment inside the caption block. */
  align: CaptionAlign;
  /** Font size as % of video width (1.6–4). Scales with the player. */
  fontSize: number;
}
