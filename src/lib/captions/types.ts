/** A single timed caption. Future transcription will produce CaptionCue[]. */
export interface CaptionCue {
  id: string;
  /** seconds */
  start: number;
  /** seconds */
  end: number;
  text: string;
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
