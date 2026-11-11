/**
 * Request/response shapes shared by the browser and the API routes.
 * Each AI feature = (1) fill in the route handler, (2) call the wrapper in
 * ./client.ts from the matching tab. Types here are the seam between them.
 * This file must stay free of secrets and server-only imports.
 */
import type { CaptionCue, CaptionEdit, SlideTerm } from "../captions/types";

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

/** POST /api/ask — student question → answer grounded in the lecture. */
export interface AskRequest {
  courseName: string;
  question: string;
  cues: CaptionCue[];
}
export interface AskResponse {
  answer: string;
  /** Where in the video the answer comes from, so the UI can seek there. */
  citations: { cueId: string; start: number }[];
}
