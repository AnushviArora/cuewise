"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { correctCues, extractSlideTerms, transcribeChunk } from "@/lib/ai/client";
import { extractAudioChunks } from "@/lib/audio/extract";
import { applyEdits } from "@/lib/captions/corrections";
import type { CaptionCue, CaptionEdit, CaptionResult, SlideTerm } from "@/lib/captions/types";
import type { Lecture } from "@/lib/lecture-context";

export type StepId = "transcribe" | "slides" | "terms" | "done";
export type PipelineState =
  | { status: "running"; step: StepId; detail?: string }
  | { status: "done"; result: CaptionResult }
  | { status: "error"; message: string; step: StepId };

const BATCH = 40; // cues per correction request

/** Turns the pipeline's raw whisper segments into ordered cues with stable ids. */
function toCues(segments: { start: number; end: number; text: string }[]): CaptionCue[] {
  return segments
    .sort((a, b) => a.start - b.start)
    .map((s, i) => ({ id: `c${i + 1}`, start: s.start, end: Math.max(s.end, s.start + 0.5), text: s.text }));
}

/**
 * Runs Transcribe → Read slides → Check terms once per uploaded lecture.
 * Without slides it stops after transcription. `retry()` re-runs after an error.
 */
export function useCaptionPipeline(lecture: Lecture | null) {
  const [state, setState] = useState<PipelineState>({ status: "running", step: "transcribe" });
  const runKey = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!lecture) return;
    const key = `${lecture.videoUrl}#${attempt}`;
    if (runKey.current === key) return; // StrictMode double-invoke: don't bill twice
    runKey.current = key;
    const live = () => runKey.current === key;
    const set = (s: PipelineState) => live() && setState(s);

    let step: StepId = "transcribe";
    const go = (s: StepId, detail?: string) => {
      step = s;
      set({ status: "running", step: s, detail });
    };

    (async () => {
      try {
        go("transcribe", "Preparing audio");
        const chunks = await extractAudioChunks(lecture.video);
        const segments: { start: number; end: number; text: string }[] = [];
        for (let i = 0; i < chunks.length; i++) {
          if (!live()) return;
          if (chunks.length > 1) go("transcribe", `Part ${i + 1} of ${chunks.length}`);
          else go("transcribe", "Listening to the lecture");
          const { cues } = await transcribeChunk(chunks[i].blob, lecture.courseName);
          for (const c of cues) {
            segments.push({ start: c.start + chunks[i].offset, end: c.end + chunks[i].offset, text: c.text });
          }
        }
        let cues = toCues(segments);
        if (cues.length === 0) {
          throw new Error("No speech was found in this video. Check that it has an audible audio track.");
        }

        let terms: SlideTerm[] = [];
        let edits: CaptionEdit[] = [];
        let slidesUnreadable = false;

        let slidesError: string | undefined;
        if (lecture.slides) {
          // A failure here shouldn't throw away a finished (and paid-for) transcript.
          try {
            go("slides");
            const res = await extractSlideTerms(lecture.slides, lecture.courseName);
            terms = res.terms;
            slidesUnreadable = !res.readable || res.terms.length === 0;

            if (terms.length > 0) {
              go("terms");
              const raw: Omit<CaptionEdit, "id">[] = [];
              for (let i = 0; i < cues.length; i += BATCH) {
                if (!live()) return;
                const out = await correctCues({
                  courseName: lecture.courseName,
                  terms,
                  cues: cues.slice(i, i + BATCH),
                });
                raw.push(...out.edits);
              }
              ({ cues, edits } = applyEdits(cues, raw));
            }
          } catch (e) {
            slidesError = e instanceof Error ? e.message : "Checking terms failed.";
            terms = [];
            edits = [];
          }
        }

        go("done");
        set({
          status: "done",
          result: { cues, edits, terms, hadSlides: !!lecture.slides, slidesUnreadable, slidesError },
        });
      } catch (e) {
        set({
          status: "error",
          step,
          message: e instanceof Error ? e.message : "Something went wrong. Please try again.",
        });
      }
    })();
  }, [lecture, attempt]);

  const retry = useCallback(() => {
    setState({ status: "running", step: "transcribe" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
