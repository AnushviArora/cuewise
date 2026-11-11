import type { CaptionSettings } from "./types";

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
  rows: 2,
  position: "bottom",
  horizontal: "center",
  align: "center",
  fontSize: 2.6,
};

export const FONT_SIZE_RANGE = { min: 1.6, max: 4, step: 0.1 } as const;

const STORAGE_KEY = "cuewise:caption-settings:v1";

const isSide = (v: unknown): v is "left" | "center" | "right" =>
  v === "left" || v === "center" || v === "right";

/** Validates unknown input into a safe CaptionSettings (bad fields fall back to defaults). */
export function sanitizeSettings(input: unknown): CaptionSettings {
  const d = DEFAULT_CAPTION_SETTINGS;
  if (typeof input !== "object" || input === null) return d;
  const o = input as Record<string, unknown>;
  const clamp = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    rows: o.rows === 1 || o.rows === 2 || o.rows === 3 ? o.rows : d.rows,
    position:
      o.position === "top" || o.position === "middle" || o.position === "bottom"
        ? o.position
        : d.position,
    align: isSide(o.align) ? o.align : d.align,
    // Older saved settings had no horizontal position; their alignment is the closest match.
    horizontal: isSide(o.horizontal) ? o.horizontal : isSide(o.align) ? o.align : d.horizontal,
    fontSize: clamp(o.fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, d.fontSize),
  };
}

export function loadSettings(): CaptionSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : DEFAULT_CAPTION_SETTINGS;
  } catch {
    return DEFAULT_CAPTION_SETTINGS;
  }
}

export function saveSettings(settings: CaptionSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}

/** Splits text into `rows` lines of roughly equal length without breaking words. */
export function splitIntoRows(text: string, rows: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (rows <= 1 || words.length <= 1) return [words.join(" ")];
  const total = words.join(" ").length;
  const target = total / rows;
  const lines: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    const candidate = [...current, word].join(" ");
    const remainingLines = rows - lines.length - 1;
    // Start a new line once we pass the target length (but never exceed `rows`).
    if (current.length > 0 && candidate.length > target && remainingLines > 0) {
      lines.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) lines.push(current.join(" "));
  return lines;
}
