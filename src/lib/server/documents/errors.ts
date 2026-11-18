/** A document couldn't be read. The message is safe to show to the person who uploaded it. */
export class DocumentError extends Error {}

/** Every passage is kept small so each stays focused (the Ask feature embeds them one by one). */
export const MAX_UNIT_CHARS = 1_100;
/** One document can contribute at most this many passages. */
export const MAX_UNITS_PER_DOC = 600;

export interface Unit {
  /** Human-readable position: "Slide 7", "Intro", "lines 12-30". */
  locator: string;
  text: string;
}

/** Splits text into pieces of at most `max` characters, at line breaks, then spaces. */
export function splitText(text: string, max = MAX_UNIT_CHARS): string[] {
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const raw of text.split("\n")) {
    let line = raw;
    while (line.length > max) {
      // A single enormous line: cut at the last space before the limit.
      const cut = line.lastIndexOf(" ", max);
      const at = cut > max / 2 ? cut : max;
      if (cur) push();
      out.push(line.slice(0, at).trim());
      line = line.slice(at);
    }
    if (cur && cur.length + line.length + 1 > max) push();
    cur += (cur ? "\n" : "") + line;
  }
  push();
  return out.filter(Boolean);
}
