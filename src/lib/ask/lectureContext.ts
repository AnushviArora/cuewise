import { embedTexts } from "@/lib/ai/client";
import { cacheGet, cacheSet } from "@/lib/cache";
import type { CaptionCue, SlidePage } from "@/lib/captions/types";
import { slideChunks, transcriptChunks, type Chunk } from "./chunks";

/**
 * Everything the Ask feature knows about one lecture, read through ONE function:
 * getLectureContext(uploadId). Today the data is registered in this browser session by
 * the caption pipeline; when lectures are published to server storage, this file is the
 * only thing that changes (fetch the same shape from the server instead).
 */
export interface LectureContext {
  uploadId: string;
  courseName: string;
  /** Transcript windows then document pages, in a fixed order. */
  chunks: Chunk[];
  /** One unit vector per chunk (same order), or null when embeddings aren't available. */
  vectors: (ArrayLike<number> | null)[] | null;
}

type Vectors = Float32Array[];

interface Entry {
  courseName: string;
  cues: CaptionCue[];
  pages: SlidePage[];
  /** Content keys, so embeddings are cached per transcript / document set. */
  keys: { transcript: string; terms: string } | null;
  tVecs?: Vectors;
  tCount?: number;
  sVecs?: Vectors;
  sSig?: string;
  failedAt?: number;
  preparing?: Promise<void>;
}

const store = new Map<string, Entry>();
const CHUNK_VERSION = "1";
const BATCH = 64;
const PARALLEL = 3;
const RETRY_AFTER_MS = 60_000;

const entry = (id: string): Entry => {
  let e = store.get(id);
  if (!e) store.set(id, (e = { courseName: "", cues: [], pages: [], keys: null }));
  return e;
};

/** Called by the app as lecture data becomes available (any subset of fields, any time). */
export function registerLectureContext(
  uploadId: string,
  patch: Partial<Pick<Entry, "courseName" | "cues" | "pages" | "keys">>,
): void {
  Object.assign(entry(uploadId), patch);
}

export function clearLectureContext(uploadId: string): void {
  store.delete(uploadId);
}

const pagesSig = (pages: SlidePage[]) => `${pages.length}:${pages[0]?.doc ?? ""}:${pages.at(-1)?.page ?? 0}`;

async function embedAll(chunks: Chunk[]): Promise<Vectors> {
  const batches: Chunk[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH) batches.push(chunks.slice(i, i + BATCH));
  const out: Vectors[] = new Array(batches.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, batches.length) }, async () => {
      while (next < batches.length) {
        const i = next++;
        out[i] = (await embedTexts(batches[i].map((c) => c.embedText))).map((v) => Float32Array.from(v));
      }
    }),
  );
  return out.flat();
}

/** Embeds whatever isn't embedded yet (cached on this device per file). Safe to call often. */
export function prepareLecture(uploadId: string): Promise<void> {
  const e = entry(uploadId);
  if (e.preparing) return e.preparing;
  const tNeeded = e.cues.length > 0 && (!e.tVecs || e.tCount !== e.cues.length);
  const sNeeded = e.pages.length > 0 && (!e.sVecs || e.sSig !== pagesSig(e.pages));
  if (!tNeeded && !sNeeded) return Promise.resolve();
  if (e.failedAt && Date.now() - e.failedAt < RETRY_AFTER_MS) return Promise.resolve();

  e.preparing = (async () => {
    try {
      if (tNeeded) {
        const chunks = transcriptChunks(e.cues);
        const key = e.keys ? `e|${e.keys.transcript}|T|${CHUNK_VERSION}|${e.cues.length}` : null;
        const hit = key ? await cacheGet<Vectors>(key) : undefined;
        const vecs = hit && hit.length === chunks.length ? hit : await embedAll(chunks);
        if (!hit && key) void cacheSet(key, vecs);
        e.tVecs = vecs;
        e.tCount = e.cues.length;
      }
      if (sNeeded) {
        const chunks = slideChunks(e.pages);
        const sig = pagesSig(e.pages);
        const key = e.keys ? `e|${e.keys.terms}|S|${CHUNK_VERSION}|${sig}` : null;
        const hit = key ? await cacheGet<Vectors>(key) : undefined;
        const vecs = hit && hit.length === chunks.length ? hit : await embedAll(chunks);
        if (!hit && key) void cacheSet(key, vecs);
        e.sVecs = vecs;
        e.sSig = sig;
      }
      e.failedAt = undefined;
    } catch {
      // Embeddings are an optimization: without them questions fall back to keyword search.
      e.failedAt = Date.now();
    } finally {
      e.preparing = undefined;
    }
  })();
  return e.preparing;
}

export async function getLectureContext(uploadId: string): Promise<LectureContext> {
  await prepareLecture(uploadId);
  const e = entry(uploadId);
  const t = transcriptChunks(e.cues);
  const s = slideChunks(e.pages);
  const haveT = !!e.tVecs && e.tVecs.length === t.length;
  const haveS = !!e.sVecs && e.sVecs.length === s.length;
  const vectors =
    (t.length === 0 || haveT) && (s.length === 0 || haveS) && t.length + s.length > 0
      ? [...(haveT ? e.tVecs! : []), ...(haveS ? e.sVecs! : [])]
      : null;
  return { uploadId, courseName: e.courseName, chunks: [...t, ...s], vectors };
}
