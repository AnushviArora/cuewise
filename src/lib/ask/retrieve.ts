import type { Chunk } from "./chunks";

export interface Retrieval {
  /** The most relevant chunks, transcript in time order, then documents. */
  hits: Chunk[];
  /** False when nothing in the lecture is close enough: don't ask the model at all. */
  covered: boolean;
  method: "semantic" | "keyword";
  /** Best match score (cosine similarity, or 0..1 keyword score). */
  best: number;
}

const TRANSCRIPT_HITS = 6;
const SLIDE_HITS = 3;
/** Below this the lecture is treated as not covering the question. Tuned on real embeddings. */
export const COVER_MIN_SEMANTIC = 0.3;
export const COVER_MIN_KEYWORD = 0.34;
const UNSEEN_WORD_WEIGHT = 0.4;
/** Keep chunks within this distance of the best match, so weak stragglers aren't sent. */
const KEEP_MARGIN_SEMANTIC = 0.14;
const KEEP_MARGIN_KEYWORD = 0.3;

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

const STOP = new Set(
  ("the a an and or of to in on for with is are was were be been being it its this that these those what which who whom " +
    "how why when where do does did can could should would will you your we our i me my they their them from at by as " +
    "about into than then so if not no yes there here have has had tell explain say said mean means lecture professor " +
    "teacher class covered discuss talk please give show").split(" "),
);

/** Lowercase word tokens without filler, with a light plural strip ("eigenvalues" ~ "eigenvalue"). */
export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

/** BM25-style score in 0..1: how much of the question's (rare-word-weighted) vocabulary a chunk has. */
function keywordScores(question: string, chunks: Chunk[]): number[] {
  const q = [...new Set(tokenize(question))];
  if (q.length === 0) return chunks.map(() => 0);
  const docs = chunks.map((c) => {
    const tf = new Map<string, number>();
    for (const t of tokenize(c.embedText)) tf.set(t, (tf.get(t) ?? 0) + 1);
    return tf;
  });
  const N = chunks.length;
  const df = q.map((t) => docs.reduce((n, d) => n + (d.has(t) ? 1 : 0), 0));
  const idf = df.map((n) => Math.log(1 + (N - n + 0.5) / (n + 0.5)));
  // Words the lecture never uses count against a match, but only partly: one stray word
  // ("related", "help") shouldn't veto a chunk that has every other word of the question.
  const total = idf.reduce((sum, w, i) => sum + w * (df[i] > 0 ? 1 : UNSEEN_WORD_WEIGHT), 0);
  return docs.map((d) => q.reduce((s, t, i) => s + idf[i] * ((d.get(t) ?? 0) / ((d.get(t) ?? 0) + 1.2)), 0) / total);
}

/** Words that, on their own, mean "tell me about the lecture as a whole". */
const OVERVIEW_WORD =
  /^(summar\w*|overview|outline|recap|main|key|points?|ideas?|topics?|takeaways?|else|also|more|other|covers?|whole|entire|brief\w*|short|quick|agenda|highlights?|today|session|week|day)$/;

/**
 * "Summarize this lecture", "what else does it cover?": questions with no topic words, which
 * similarity search can't match to any passage. They get a spread across the lecture instead.
 */
export function isOverviewQuestion(question: string): boolean {
  if (/\b(summar\w*|overview|recap|outline|agenda|takeaways?|highlights?)\b/i.test(question)) return true;
  const words = tokenize(question);
  if (words.length === 0) return /\b(about|cover\w*|lecture|class|video|topics?)\b/i.test(question);
  return words.every((w) => OVERVIEW_WORD.test(w));
}

const OVERVIEW_TRANSCRIPT = 8;
const OVERVIEW_SLIDES = 2;

/** Evenly spaced transcript windows (so the whole lecture is represented) plus the first document pages. */
function overviewHits(chunks: Chunk[]): Chunk[] {
  const t = chunks.filter((c) => c.kind === "transcript");
  const spread: Chunk[] = [];
  for (let i = 0; i < Math.min(OVERVIEW_TRANSCRIPT, t.length); i++) {
    const c = t[Math.round((i * (t.length - 1)) / Math.max(1, Math.min(OVERVIEW_TRANSCRIPT, t.length) - 1))];
    if (!spread.includes(c) && !overlapsChosen(c, spread)) spread.push(c);
  }
  return [...spread, ...chunks.filter((c) => c.kind === "slide").slice(0, OVERVIEW_SLIDES)];
}

/** Transcript windows overlap by half; skip one that mostly repeats an already chosen window. */
function overlapsChosen(c: Chunk, chosen: Chunk[]): boolean {
  if (c.cueFrom === undefined || c.cueTo === undefined) return false;
  const len = c.cueTo - c.cueFrom + 1;
  return chosen.some((o) => {
    const lo = Math.max(c.cueFrom!, o.cueFrom!);
    const hi = Math.min(c.cueTo!, o.cueTo!);
    return hi >= lo && (hi - lo + 1) / len > 0.5;
  });
}

/**
 * Picks the few most relevant chunks for a question. Uses embeddings when available
 * (`vectors` aligned with `chunks`, plus the question's vector), otherwise keywords.
 */
export function retrieve(
  question: string,
  chunks: Chunk[],
  vectors: (ArrayLike<number> | null)[] | null,
  queryVector: ArrayLike<number> | null,
): Retrieval {
  if (chunks.length > 0 && isOverviewQuestion(question)) {
    return { hits: overviewHits(chunks), covered: true, method: "keyword", best: 1 };
  }
  const semantic = !!vectors && !!queryVector && vectors.length === chunks.length;
  const scores = semantic
    ? chunks.map((_, i) => (vectors![i] ? dot(queryVector!, vectors![i]!) : 0))
    : keywordScores(question, chunks);
  const best = Math.max(0, ...scores);
  const method = semantic ? "semantic" : "keyword";
  const covered = best >= (semantic ? COVER_MIN_SEMANTIC : COVER_MIN_KEYWORD);
  if (!covered) return { hits: [], covered: false, method, best };

  const floor = best - (semantic ? KEEP_MARGIN_SEMANTIC : KEEP_MARGIN_KEYWORD);
  const ranked = chunks.map((c, i) => ({ c, s: scores[i] })).sort((a, b) => b.s - a.s);
  const pick = (kind: Chunk["kind"], n: number) => {
    const chosen: Chunk[] = [];
    for (const { c, s } of ranked) {
      if (chosen.length >= n) break;
      if (c.kind !== kind || s < floor || s <= 0 || overlapsChosen(c, chosen)) continue;
      chosen.push(c);
    }
    return chosen;
  };
  const transcript = pick("transcript", TRANSCRIPT_HITS).sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const slides = pick("slide", SLIDE_HITS).sort(
    (a, b) => (a.doc ?? "").localeCompare(b.doc ?? "") || (a.page ?? 0) - (b.page ?? 0),
  );
  return { hits: [...transcript, ...slides], covered: true, method, best };
}
