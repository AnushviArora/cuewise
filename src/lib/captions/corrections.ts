import type {
  CaptionCue,
  CaptionEdit,
  CaptionMark,
  Confidence,
  EditDecision,
  EditState,
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
    const clean = cleanEdit(
      {
        cueId: cue.id,
        original,
        corrected,
        term: matched.term,
        confidence: e.confidence,
        reason: (e.reason ?? "").slice(0, 200),
        status: confident ? "applied" : "needs_review",
      },
      terms,
    );
    if (clean) out.push(clean);
  }
  return out;
}

/** What the edit puts in the text, or null to leave the transcribed words as heard. */
export function replacementFor(edit: CaptionEdit, decision?: EditDecision): string | null {
  if (decision) {
    return decision.kind === "kept" ? null : decision.kind === "edited" ? decision.text : edit.corrected;
  }
  return edit.status === "applied" ? edit.corrected : null;
}

export function editState(edit: CaptionEdit, decision?: EditDecision): EditState {
  if (decision) return decision.kind;
  return edit.status === "applied" ? "auto" : "pending";
}

/** Cues as transcribed: no corrections, no marks. */
export function rawCues(cues: CaptionCue[]): CaptionCue[] {
  return cues.map(({ id, start, end, text, originalText }) => ({
    id,
    start,
    end,
    text: originalText ?? text,
  }));
}

/**
 * Builds display cues from the RAW transcript plus edits and the professor's decisions.
 * Only matched words are replaced, timestamps are kept, and `marks` record where each
 * edit landed in the final text (for highlighting). Cheap enough to re-run on every decision.
 */
export function renderCues(
  raw: CaptionCue[],
  edits: CaptionEdit[],
  decisions: Record<string, EditDecision> = {},
): CaptionCue[] {
  const byCue = new Map<string, CaptionEdit[]>();
  for (const e of edits) byCue.set(e.cueId, [...(byCue.get(e.cueId) ?? []), e]);

  return raw.map((cue): CaptionCue => {
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
      const piece = replacementFor(s.edit, decisions[s.edit.id]) ?? cue.text.slice(s.start, s.end);
      marks.push({ start: text.length, end: text.length + piece.length, editId: s.edit.id });
      text += piece;
      cursor = s.end;
    }
    text += cue.text.slice(cursor);

    return { ...cue, text, marks, originalText: text !== cue.text ? cue.text : undefined };
  });
}

/**
 * Ids derived from the cue ("c12.1"), not from arrival order, so they never change as
 * sections finish in any order and decisions made on an edit stay attached to it.
 */
export function withStableIds(edits: Omit<CaptionEdit, "id">[]): CaptionEdit[] {
  const seen = new Map<string, number>();
  return edits.map((e) => {
    const n = (seen.get(e.cueId) ?? 0) + 1;
    seen.set(e.cueId, n);
    return { ...e, id: `${e.cueId}.${n}` };
  });
}

/**
 * True when the term is written with capitals in running text too: people and places
 * ("Strang"), acronyms ("MATLAB", "SVD"), and mixed-case names ("ReLU", "LaTeX").
 * Title Case copied from a slide heading ("Linear Combinations") does NOT count.
 */
export function needsCapitals(term: string, kind?: SlideTerm["kind"]): boolean {
  if (kind === "name") return true;
  const letters = term.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 2 && letters === letters.toUpperCase()) return true; // acronym
  return /\p{Ll}\p{Lu}/u.test(term); // capital inside a word
}

/**
 * Makes one edit a REAL correction or drops it. Differences in capitalization alone are
 * not corrections: ordinary terms are written in lowercase in a sentence (capitalized only
 * where the heard word was, i.e. at a sentence start), while names and acronyms keep the
 * slides' capitals. Returns null when nothing would change, or when the only change is
 * capitalization that wasn't confident enough to apply silently.
 */
export function cleanEdit(
  e: Omit<CaptionEdit, "id">,
  terms: SlideTerm[],
): Omit<CaptionEdit, "id"> | null {
  // A misheard word is about as long as the real one. If the lengths differ by more than 2x
  // it isn't a misspelling: the model swapped a phrase for a different, longer or shorter
  // term (e.g. "Introduction" -> a whole book title), which would damage the sentence.
  const heard = squash(e.original).length;
  const real = squash(e.corrected).length;
  if (heard === 0 || real / heard > 2 || real / heard < 0.5) return null;

  const kind = terms.find((t) => norm(t.term) === norm(e.term))?.kind;
  let corrected = e.corrected;
  if (!needsCapitals(e.term, kind)) {
    corrected = corrected.toLowerCase();
    if (/^\p{Lu}/u.test(e.original) && corrected) corrected = corrected[0].toUpperCase() + corrected.slice(1);
  }
  if (corrected === e.original) return null;
  const caseOnly = corrected.toLowerCase() === e.original.toLowerCase();
  if (caseOnly && e.status !== "applied") return null;
  return { ...e, corrected, caseOnly: caseOnly || undefined };
}

export function cleanEdits(edits: Omit<CaptionEdit, "id">[], terms: SlideTerm[]) {
  return edits.flatMap((e) => cleanEdit(e, terms) ?? []);
}

/** Gives validated edits stable ids and applies them to the raw transcript. */
export function applyEdits(
  cues: CaptionCue[],
  edits: Omit<CaptionEdit, "id">[],
): { cues: CaptionCue[]; edits: CaptionEdit[] } {
  const withIds: CaptionEdit[] = edits.map((e, i) => ({ ...e, id: `e${i + 1}` }));
  return { cues: renderCues(cues, withIds), edits: withIds };
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
