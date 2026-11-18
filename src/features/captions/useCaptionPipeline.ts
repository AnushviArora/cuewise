"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, correctCues, extractSlideTerms, transcribeChunk } from "@/lib/ai/client";
import type { SlidesResponse } from "@/lib/ai/contracts";
import { extractAudioChunks } from "@/lib/audio/extract";
import { cacheGet, cacheSet, fingerprint } from "@/lib/cache";
import { registerLectureContext } from "@/lib/ask/lectureContext";
import { cleanEdits, withStableIds } from "@/lib/captions/corrections";
import type { CaptionCue, CaptionEdit, CaptionResult, SlidePage, SlideTerm } from "@/lib/captions/types";
import type { Lecture } from "@/lib/lecture-context";
import { formatEta, secs } from "@/lib/time";

export type StepId = "transcribe" | "slides" | "terms" | "done";

/** Progress of the work that continues AFTER captions are already on screen. */
export type Checking =
  | { phase: "documents" }
  | { phase: "sections"; done: number; total: number; etaSeconds: number | null };

/** Captions are fine; one later step failed and can be retried on its own. */
export interface StepFailure {
  step: "documents" | "terms";
  message: string;
}

/** Every state records which lecture produced it, so it can never be shown for another. */
export type PipelineState = { lectureId: string } & (
  | { status: "running"; step: StepId; detail?: string }
  | { status: "done"; result: CaptionResult; checking: Checking | null; failure: StepFailure | null }
  | { status: "error"; message: string; step: StepId }
);
type Unscoped<T> = T extends unknown ? Omit<T, "lectureId"> : never;
type NextState = Unscoped<PipelineState>;

/** Cues per term-check request, and how many requests run at once. */
const SECTION_SIZE = 30;
const SECTION_PARALLEL = 4;
const TRANSCRIBE_PARALLEL = 3;
const AUTO_RETRIES = 2;

type RawEdits = Omit<CaptionEdit, "id">[];
type Terms = Pick<SlidesResponse, "terms" | "documentsUsed" | "skipped"> & {
  failed: string[];
  /** Per-page text, so questions can cite slide numbers. */
  pages: SlidePage[];
};

/** What has already succeeded for this lecture, kept so a retry redoes only what failed. */
interface Done {
  keys?: { transcript: string; terms: string } | null;
  cues?: CaptionCue[];
  terms?: Terms | null;
  sections: Map<number, RawEdits>;
  /** Case-only "fixes" dropped so far (kept for the log). */
  ignored: number;
}

/** Turns whisper segments into ordered cues with stable ids. */
function toCues(segments: { start: number; end: number; text: string }[]): CaptionCue[] {
  return segments
    .sort((a, b) => a.start - b.start)
    .map((s, i) => ({ id: `c${i + 1}`, start: s.start, end: Math.max(s.end, s.start + 0.5), text: s.text }));
}

/** Runs `fn` over `items`, at most `limit` at once. `fn` must not throw. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/** Retries busy / timeout / network failures a couple of times before giving up. */
async function withRetry<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      const retryable = e instanceof ApiRequestError && e.retryable;
      if (signal.aborted || !retryable || attempt >= AUTO_RETRIES) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

const friendly = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const roundTimes = (t: Record<string, number>) =>
  JSON.stringify(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, secs(v)])));

/**
 * Captions pipeline, built so long lectures feel fast and failures are cheap:
 *  - Documents are read WHILE the video is transcribed (they don't depend on each other).
 *  - Captions appear the moment the transcript exists; corrections stream in section by section.
 *  - Term checking is split into small sections that run in parallel.
 *  - Everything that succeeded is remembered (in memory for retries, on-device for re-uploads),
 *    so "Try again" redoes only the step that failed.
 */
export function useCaptionPipeline(lecture: Lecture | null) {
  const [stored, setStored] = useState<PipelineState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const done = useRef<Done>({ sections: new Map(), ignored: 0 });

  useEffect(() => {
    if (!lecture) return;
    const lectureId = lecture.id;
    // Leaving the lecture (or retrying) aborts this run: in-flight requests are cancelled
    // and no further steps start. In dev, StrictMode aborts the first run before it reaches
    // any API call, so nothing is billed twice.
    const ctrl = new AbortController();
    const { signal } = ctrl;
    const live = () => !signal.aborted;
    const set = (s: NextState) => live() && setStored({ ...s, lectureId } as PipelineState);
    const mem = done.current;
    const times: Record<string, number> = {};
    const log = (msg: string) => console.info(`[cuewise] ${msg}`);
    const started = performance.now();

    (async () => {
      let step: StepId = "transcribe";
      try {
        set({ status: "running", step, detail: "Preparing" });

        // Content fingerprints identify "the same video and PDFs" for the on-device cache.
        if (mem.keys === undefined) {
          const [v, ...s] = await Promise.all([lecture.video, ...lecture.slides].map(fingerprint));
          mem.keys = v && s.every(Boolean) ? { transcript: `t|${v}`, terms: `s|${[...s].sort().join(",")}` } : null;
        }
        if (!live()) return;
        const keys = mem.keys;
        registerLectureContext(lectureId, { courseName: lecture.courseName, keys });

        // --- Documents: start now, in parallel with transcription -----------------------
        const hasDocs = lecture.slides.length > 0;
        let termsFailure: StepFailure | null = null;
        const termsTask: Promise<void> = (async () => {
          if (!hasDocs || mem.terms) return;
          const t0 = performance.now();
          try {
            const hit = keys ? await cacheGet<Terms>(keys.terms) : undefined;
            // Entries saved before page text was kept have no `pages`: read the documents again.
            if (hit?.pages) {
              mem.terms = hit;
              registerLectureContext(lectureId, { pages: hit.pages });
              times.documents = 0;
              log("documents: reused saved terms");
              return;
            }
            const res = await withRetry(
              () => extractSlideTerms(lecture.slides, lecture.courseName, signal),
              signal,
            );
            mem.terms = {
              terms: res.terms,
              documentsUsed: res.documentsUsed,
              skipped: res.skipped,
              failed: res.failed ?? [],
              pages: res.pages ?? [],
            };
            registerLectureContext(lectureId, { pages: mem.terms.pages });
            times.documents = performance.now() - t0;
            log(`documents: ${lecture.slides.length} files read in ${secs(times.documents)}s, ${res.terms.length} terms`);
            // Only remember complete results, so a partial answer isn't served again.
            if (keys && mem.terms.failed.length === 0) void cacheSet(keys.terms, mem.terms);
          } catch (e) {
            if (!live()) return;
            termsFailure = {
              step: "documents",
              message: friendly(e, "Couldn’t read your documents. Please try again."),
            };
          }
        })();

        // --- Transcript ------------------------------------------------------------------
        if (!mem.cues) {
          const hit = keys ? await cacheGet<CaptionCue[]>(keys.transcript) : undefined;
          if (hit) {
            mem.cues = hit;
            times.transcription = 0;
            log("transcription: reused saved transcript");
          } else {
            const t0 = performance.now();
            set({ status: "running", step, detail: "Preparing audio" });
            const chunks = await extractAudioChunks(lecture.video);
            if (!live()) return;
            const segments: { start: number; end: number; text: string }[] = [];
            let finished = 0;
            const say = () => {
              const left = chunks.length - finished;
              const eta = finished > 0 && left > 0 ? ((performance.now() - t0) / 1000 / finished) * left : null;
              set({
                status: "running",
                step,
                detail:
                  chunks.length > 1
                    ? `Listening to the lecture: ${finished} of ${chunks.length} parts done${eta ? `, ${formatEta(eta)} left` : ""}`
                    : "Listening to the lecture",
              });
            };
            say();
            const errors: unknown[] = [];
            await pool(
              chunks.map((_, i) => i),
              TRANSCRIBE_PARALLEL,
              async (i) => {
                if (!live()) return;
                try {
                  const { cues } = await withRetry(
                    () => transcribeChunk(chunks[i].blob, lecture.courseName, signal),
                    signal,
                  );
                  for (const c of cues) {
                    segments.push({ start: c.start + chunks[i].offset, end: c.end + chunks[i].offset, text: c.text });
                  }
                  finished++;
                  say();
                } catch (e) {
                  errors.push(e);
                }
              },
            );
            if (!live()) return;
            if (errors.length) throw errors[0];
            const cues = toCues(segments);
            if (cues.length === 0) {
              throw new Error("No speech was found in this video. Check that it has an audible audio track.");
            }
            mem.cues = cues;
            times.transcription = performance.now() - t0;
            log(`transcription: ${chunks.length} part(s) in ${secs(times.transcription)}s`);
            if (keys) void cacheSet(keys.transcript, cues);
          }
        }
        const cues = mem.cues!;

        // --- Captions are ready: show them now, then fill in corrections -----------------
        const sections: CaptionCue[][] = [];
        for (let i = 0; i < cues.length; i += SECTION_SIZE) sections.push(cues.slice(i, i + SECTION_SIZE));
        let termsInfo: Terms | null = mem.terms ?? null;

        /** Corrections shown so far: while running, only a contiguous prefix of sections (so
         * the review list only ever grows at the end); once settled, everything finished. */
        const editsNow = (settled: boolean): CaptionEdit[] => {
          const out: RawEdits = [];
          for (let i = 0; i < sections.length; i++) {
            const e = mem.sections.get(i);
            if (e) out.push(...e);
            else if (!settled) break;
          }
          return withStableIds(out);
        };
        const publish = (checking: Checking | null, failure: StepFailure | null, settled = false) => {
          const info = termsInfo;
          set({
            status: "done",
            checking,
            failure,
            result: {
              cues,
              edits: editsNow(settled),
              terms: info?.terms ?? [],
              documentsUploaded: lecture.slides.length,
              documentsUsed: info?.documentsUsed ?? 0,
              documentsSkipped: info?.skipped ?? [],
              documentsFailed: info?.failed ?? [],
              slidesError: failure?.message,
            },
          });
        };
        const finish = () => log(`timings (s) ${roundTimes(times)}, total ${secs(performance.now() - started)}s`);

        if (!hasDocs) {
          publish(null, null, true);
          finish();
          return;
        }

        publish(
          mem.terms
            ? { phase: "sections", done: mem.sections.size, total: sections.length, etaSeconds: null }
            : { phase: "documents" },
          null,
        );
        await termsTask;
        if (!live()) return;
        termsInfo = mem.terms ?? null;
        if (termsFailure || !termsInfo) {
          publish(
            null,
            termsFailure ?? { step: "documents", message: "Couldn’t read your documents. Please try again." },
            true,
          );
          return;
        }

        // --- Term checking: small sections, several at once ------------------------------
        step = "terms";
        const terms: SlideTerm[] = termsInfo.terms;
        if (terms.length === 0) {
          publish(null, null, true);
          finish();
          return;
        }
        const t0 = performance.now();
        const alreadyDone = mem.sections.size;
        const total = sections.length;
        const todo = sections.map((_, i) => i).filter((i) => !mem.sections.has(i));
        const progress = (): Checking => {
          const d = mem.sections.size;
          const fresh = d - alreadyDone;
          const eta = fresh > 0 && d < total ? ((performance.now() - t0) / 1000 / fresh) * (total - d) : null;
          return { phase: "sections", done: d, total, etaSeconds: eta };
        };
        publish(progress(), null);

        const errors: unknown[] = [];
        await pool(todo, SECTION_PARALLEL, async (i) => {
          if (!live()) return;
          try {
            const key = keys ? `c|${keys.transcript}|${keys.terms}|${SECTION_SIZE}|${i}` : null;
            const hit = key ? await cacheGet<RawEdits>(key) : undefined;
            const out =
              hit ??
              (
                await withRetry(
                  () => correctCues({ courseName: lecture.courseName, terms, cues: sections[i] }, signal),
                  signal,
                )
              ).edits;
            // Case-only changes are not corrections: drop them (also from older saved results).
            const real = cleanEdits(out, terms);
            mem.ignored += out.length - real.length;
            mem.sections.set(i, real);
            if (!hit && key) void cacheSet(key, real);
            publish(progress(), null);
          } catch (e) {
            if (live()) errors.push(e);
          }
        });
        if (!live()) return;
        times.terms = performance.now() - t0;
        const failedCount = total - mem.sections.size;
        if (failedCount > 0) {
          log(`term checking: ${failedCount} of ${total} sections failed after ${secs(times.terms)}s`);
          publish(
            null,
            {
              step: "terms",
              message:
                `${failedCount} of ${total} sections couldn’t be checked. ` +
                friendly(errors[0], "Please try again."),
            },
            true,
          );
          return;
        }
        {
          const all = [...mem.sections.values()].flat();
          const real = all.filter((e) => !e.caseOnly);
          log(
            `term checking: ${total} sections in ${secs(times.terms)}s. Real fixes: ` +
              `${real.filter((e) => e.status === "applied").length} automatic, ` +
              `${real.filter((e) => e.status === "needs_review").length} to review. ` +
              `Ignored ${mem.ignored} case-only; ${all.length - real.length} silent capitalization (names/acronyms).`,
          );
        }
        publish(null, null, true);
        finish();
      } catch (e) {
        if (!live()) return;
        set({ status: "error", step, message: friendly(e, "Something went wrong. Please try again.") });
      }
    })();

    return () => ctrl.abort();
  }, [lecture, attempt]);

  /** Re-runs the pipeline. Anything that already succeeded is reused, not redone. */
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Only ever expose a state that belongs to THIS lecture; otherwise we're just starting.
  const state: PipelineState =
    stored && lecture && stored.lectureId === lecture.id
      ? stored
      : { lectureId: lecture?.id ?? "", status: "running", step: "transcribe" };

  return { state, retry };
}
