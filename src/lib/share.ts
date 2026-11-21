import { fingerprint } from "@/lib/cache";

/** Turns a ?t= value into seconds. Anything missing, negative or not a number becomes 0. */
export function parseStart(raw: string | string[] | null | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !/^\d+(\.\d+)?$/.test(v.trim())) return 0;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? n : 0;
}

const MAX_QUESTION = 200;
const MAX_TITLE = 100;

/** Plain, short text from a query value: one line, no control characters, or null if empty. */
function cleanText(raw: string | string[] | null | undefined, max: number): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
}
export const parseQuestion = (raw: string | string[] | null | undefined) => cleanText(raw, MAX_QUESTION);
export const parseTitle = (raw: string | string[] | null | undefined) => cleanText(raw, MAX_TITLE);

/**
 * Link to a moment, built from the current site (works on localhost and after deploy).
 * `question` and `title` are optional and are trimmed and URL-encoded.
 */
export function shareUrl(
  lectureId: string,
  seconds: number,
  extra: { question?: string; title?: string } = {},
): string {
  const t = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const p = new URLSearchParams({ t: String(t) });
  const q = parseQuestion(extra.question);
  const c = parseTitle(extra.title);
  if (q) p.set("q", q);
  if (c) p.set("c", c);
  return `${window.location.origin}/lecture/${encodeURIComponent(lectureId)}?${p}`;
}

/** Same video file -> same id. Uses the file's content; falls back to its size and name. */
export async function stableLectureId(video: File): Promise<string> {
  const fp = await fingerprint(video);
  if (fp) return fp;
  let h = 0;
  for (const ch of video.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `f${video.size.toString(36)}-${h.toString(36)}`;
}

/** Copies text to the clipboard. Returns false if the browser blocks it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure pages: use a hidden textarea.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
