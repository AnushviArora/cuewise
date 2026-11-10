/**
 * Request/response shapes shared by the browser and the API routes.
 * Each AI feature = (1) fill in the route handler, (2) call the wrapper in
 * ./client.ts from the matching tab. Types here are the seam between them.
 * This file must stay free of secrets and server-only imports.
 */
import type { CaptionCue } from "../captions/types";

export interface ApiError {
  error: string;
  message: string;
}

/** POST /api/transcribe — lecture audio → timed captions. */
export interface TranscribeResponse {
  cues: CaptionCue[];
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
