/**
 * Request/response shapes shared by the browser and the API routes.
 * Each AI feature = (1) fill in the route handler, (2) call the wrapper in
 * ./client.ts from the matching tab. Types here are the seam between them.
 * This file must stay free of secrets and server-only imports.
 */
import type { CaptionCue, CaptionEdit, SlidePage, SlideTerm } from "../captions/types";

export interface ApiError {
  error: string;
  message: string;
}

/**
 * POST /api/transcribe — multipart: `audio` (WAV chunk), optional `courseName`.
 * Cue times are relative to the chunk; the browser adds the chunk's offset.
 */
export interface TranscribeResponse {
  cues: { start: number; end: number; text: string }[];
}

/** POST /api/slides — multipart: one or more `slides` (PDF) fields, plus `courseName`. */
export interface SlidesResponse {
  /** Merged and de-duplicated across all documents, most relevant first. */
  terms: SlideTerm[];
  /** Documents that had readable text and were used. */
  documentsUsed: number;
  /** Names of documents skipped because they had no readable text. */
  skipped: string[];
  /** Documents that were readable but whose term check failed (others still count). */
  failed?: string[];
  /** Readable text of each page, so questions can cite slide numbers. */
  pages?: SlidePage[];
}

/** POST /api/correct — check a batch of cues against slide terms. */
export interface CorrectRequest {
  courseName: string;
  terms: SlideTerm[];
  cues: CaptionCue[];
}
/** Validated edits (without ids); the browser applies them to the cues. */
export interface CorrectResponse {
  edits: Omit<CaptionEdit, "id">[];
}

/** POST /api/review — find likely-wrong terms (names, jargon) in captions. */
export interface ReviewRequest {
  courseName: string;
  cues: CaptionCue[];
  /** Plain text extracted from slides, used to bias spelling of jargon. */
  slideText?: string;
}
export interface ReviewSuggestion {
  cueId: string;
  original: string;
  suggested: string;
  reason: string;
}
export interface ReviewResponse {
  suggestions: ReviewSuggestion[];
}

/** POST /api/embed — turn texts into vectors for finding the most relevant lecture passages. */
export interface EmbedRequest {
  texts: string[];
}
export interface EmbedResponse {
  /** One unit-length vector per text, in order. */
  vectors: number[][];
}

/** One lecture passage sent to the model as evidence. */
export interface AskExcerpt {
  /** "T4" (transcript) or "S2" (course file page): what the model cites. */
  id: string;
  /** Human-readable origin, e.g. "transcript 12:34" or "notes.pdf, page 7". */
  label: string;
  text: string;
  /** True for a near-miss: too weak to answer from, only usable to link back to the course. */
  related?: boolean;
}

export type AskSource = "lecture" | "materials" | "general";

/** One labeled piece of an answer. `citations` are excerpt ids that were sent. */
export interface AskPart {
  source: AskSource;
  text: string;
  citations: string[];
}
export interface AskResponse {
  parts: AskPart[];
}

/**
 * POST /api/ask — question -> answer split into labeled parts (lecture / materials / general).
 * The browser picks the excerpts, so only the relevant passages are sent. `excerpts` may be
 * empty: then the answer is general knowledge.
 */
export interface AskRequest {
  courseName: string;
  question: string;
  /** The last few turns, for follow-up questions. */
  history: { role: "user" | "assistant"; content: string }[];
  excerpts: AskExcerpt[];
}
