import type { CaptionCue } from "./types";

/**
 * One hard-coded caption so the overlay can be previewed.
 * Later: replace with cues from the transcription API and pick the active one
 * by `currentTime` (see CaptionOverlay's `cue` prop).
 */
export const SAMPLE_CUE: CaptionCue = {
  id: "sample-1",
  start: 0,
  end: Number.POSITIVE_INFINITY,
  text: "Professor Okonkwo explains that an eigenvalue tells us how much a matrix stretches space.",
};
