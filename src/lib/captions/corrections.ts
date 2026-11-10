import type {
  CaptionCue,
  CaptionEdit,
  CaptionMark,
  Confidence,
  SlideTerm,
} from "./types";

/** An edit as proposed by the model, before we trust it. */
export interface RawEdit {
  cueId: string;
  original: string;
  corrected: string;
  term: string;
  confidence: Confidence;
  reason: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const squash = (s: string) => norm(s).replace(/ /g, "");

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/** 0–1 spelling similarity, ignoring case, spaces and punctuation. */
export function similarity(a: string, b: string): number {
  const x = squash(a);
  const y = squash(b);
  const max = Math.max(x.length, y.length);
  return max === 0 ? 1 : 1 - levenshtein(x, y) / max;
}

/** Below this, a "high confidence" fix looks too different from what was said to apply silently. */
const MIN_AUTO_APPLY_SIMILARITY = 0.35;
const MAX_WORDS = 4;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whole-word occurrences of `needle` in `text` (case-insensitive), skipping any that
 * already read exactly as `alreadyCorrect` (so a right spelling isn't counted as a fix).
 */
function findAll(
  text: string,
  needle: string,
  alreadyCorrect?: string,
): { start: number; end: number }[] {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(needle)}(?![\\p{L}\\p{N}])`, "giu");
  return [...text.matchAll(re)]
    .filter((m) => m[0] !== alreadyCorrect)
    .map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
}

function matchesTerm(corrected: string, terms: SlideTerm[]): SlideTerm | null {
  const c = norm(corrected);
  if (!c) return null;
  for (const t of terms) {
    const tn = norm(t.term);
    if (tn === c) return t;
  }
  // Allow a single word of a multi-word term (e.g. "Okonkwo" from "Professor Okonkwo").
  for (const t of terms) {
    if (norm(t.term).split(" ").includes(c)) return t;
  }
  return null;
}

/**
 * Drops anything that isn't a plausible fix: unknown cue, original not in the cue,
 * correction not from the slide terms, no-op, or absurdly long. Also downgrades
 * high-confidence fixes that look nothing like the spoken word.
 * `status` decides whether the text is changed (applied) or only flagged.
 */
export function validateEdits(
  raw: RawEdit[],
  cues: CaptionCue[],
  terms: SlideTerm[],
): Omit<CaptionEdit, "id">[] {
  const byId = new Map(cues.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: Omit<CaptionEdit, "id">[] = [];

  for (const e of raw) {
    const cue = byId.get(e.cueId);
    const original = e.original?.trim();
    const corrected = e.corrected?.trim();
    if (!cue || !original || !corrected || original === corrected) continue;
    if (original.split(/\s+/).length > MAX_WORDS || corrected.split(/\s+/).length > MAX_WORDS) continue;
    if (findAll(cue.text, original, corrected).length === 0) continue;
    const matched = matchesTerm(corrected, terms);
    if (!matched) continue;
    const key = `${cue.id}|${original.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const confident =
      e.confidence === "high" && similarity(original, corrected) >= MIN_AUTO_APPLY_SIMILARITY;
    out.push({
      cueId: cue.id,
      original,
      corrected,
      term: matched.term,
      confidence: e.confidence,
      reason: (e.reason ?? "").slice(0, 200),
      status: confident ? "applied" : "needs_review",
    });
  }
  return out;
}

/**
 * Applies validated edits to cues WITHOUT touching anything else: only the matched
 * words are replaced, timestamps are kept, and `marks` record where each edit landed
 * in the final text (for highlighting). Returns cues plus edits with stable ids.
 */
export function applyEdits(
  cues: CaptionCue[],
  edits: Omit<CaptionEdit, "id">[],
): { cues: CaptionCue[]; edits: CaptionEdit[] } {
  const withIds: CaptionEdit[] = edits.map((e, i) => ({ ...e, id: `e${i + 1}` }));
  const byCue = new Map<string, CaptionEdit[]>();
  for (const e of withIds) byCue.set(e.cueId, [...(byCue.get(e.cueId) ?? []), e]);

  const outCues = cues.map((cue): CaptionCue => {
    const list = byCue.get(cue.id);
    if (!list) return cue;

    // Collect non-overlapping spans in the original text.
    const spans: { start: number; end: number; edit: CaptionEdit }[] = [];
    for (const edit of list) {
      for (const hit of findAll(cue.text, edit.original, edit.corrected)) {
        if (!spans.some((s) => hit.start < s.end && hit.end > s.start)) spans.push({ ...hit, edit });
      }
    }
    spans.sort((a, b) => a.start - b.start);

    let text = "";
    let cursor = 0;
    const marks: CaptionMark[] = [];
    for (const s of spans) {
      text += cue.text.slice(cursor, s.start);
      const piece = s.edit.status === "applied" ? s.edit.corrected : cue.text.slice(s.start, s.end);
      marks.push({ start: text.length, end: text.length + piece.length, editId: s.edit.id });
      text += piece;
      cursor = s.end;
    }
    text += cue.text.slice(cursor);

    return {
      ...cue,
      text,
      marks,
      originalText: text !== cue.text ? cue.text : undefined,
    };
  });

  return { cues: outCues, edits: withIds };
}

export function summarize(edits: CaptionEdit[]) {
  return {
    fixed: edits.filter((e) => e.status === "applied").length,
    needsReview: edits.filter((e) => e.status === "needs_review").length,
  };
}

/** Binary search for the cue showing at time `t` (cues are sorted, non-overlapping). */
export function findCue(cues: CaptionCue[], t: number): CaptionCue | null {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return c;
  }
  return null;
}
