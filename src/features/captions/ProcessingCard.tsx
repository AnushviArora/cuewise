"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { AlertIcon } from "@/components/ui/Icons";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { PipelineState, StepId } from "./useCaptionPipeline";

const ALL_STEPS: { id: StepId; label: string }[] = [
  { id: "transcribe", label: "Transcribing" },
  { id: "slides", label: "Reading slides" },
  { id: "terms", label: "Checking terms" },
  { id: "done", label: "Done" },
];

function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <motion.path
        d="m5 12.5 4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
    </svg>
  );
}

interface Props {
  state: Extract<PipelineState, { status: "running" | "error" }>;
  hasSlides: boolean;
  onRetry: () => void;
}

/** Progress steps shown while captions are being made, or a friendly error with retry. */
export function ProcessingCard({ state, hasSlides, onRetry }: Props) {
  // Reading documents runs alongside transcription, and term checking continues after
  // captions appear (see CheckStatus), so only transcription blocks here.
  const steps = ALL_STEPS.filter((s) => s.id === "transcribe" || s.id === "done");
  const current = steps.findIndex((s) => s.id === state.step);
  const failed = state.status === "error";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <GlassPanel className="p-5 sm:p-6" role={failed ? "alert" : "status"} aria-live="polite">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
          {steps.map((step, i) => {
            const done = i < current;
            const active = i === current && !failed;
            const bad = i === current && failed;
            return (
              <li key={step.id} className="flex items-center gap-2">
                <motion.span
                  layout
                  className={`grid h-6 w-6 place-items-center rounded-full border text-xs font-semibold ${
                    done
                      ? "border-accent bg-accent text-accent-on"
                      : bad
                        ? "border-danger text-danger"
                        : active
                          ? "border-accent text-accent"
                          : "border-white/15 text-subtle"
                  }`}
                  animate={active ? { boxShadow: ["0 0 0 0 rgba(139,155,255,0.45)", "0 0 0 7px rgba(139,155,255,0)"] } : { boxShadow: "0 0 0 0 rgba(139,155,255,0)" }}
                  transition={active ? { duration: 1.6, repeat: Infinity, ease: "easeOut" } : { duration: 0.2 }}
                  aria-hidden
                >
                  {done ? <CheckMark /> : bad ? "!" : i + 1}
                </motion.span>
                <span
                  className={`text-sm ${active ? "font-medium text-ink" : done ? "text-muted" : bad ? "text-danger" : "text-subtle"}`}
                  aria-current={active ? "step" : undefined}
                >
                  {step.label}
                </span>
                {i < steps.length - 1 && (
                  <span className="relative mx-1 hidden h-px w-8 overflow-hidden bg-white/10 sm:block" aria-hidden>
                    <motion.span
                      className="absolute inset-0 origin-left bg-accent"
                      initial={false}
                      animate={{ scaleX: done ? 1 : 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        <AnimatePresence mode="wait" initial={false}>
          {failed ? (
            <motion.div
              key="err"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 flex flex-wrap items-center justify-between gap-3"
            >
              <p className="flex max-w-2xl items-start gap-2 text-sm leading-relaxed text-danger">
                <AlertIcon className="mt-0.5 shrink-0" width={16} height={16} />
                {state.message}
              </p>
              <Button variant="ghost" onClick={onRetry}>
                Try again
              </Button>
            </motion.div>
          ) : (
            <motion.p
              key={`${state.step}-${state.detail}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-sm text-muted"
            >
              {state.detail ??
                (hasSlides
                  ? "Listening to the lecture while reading your documents"
                  : "Listening to the lecture")}
            </motion.p>
          )}
        </AnimatePresence>
      </GlassPanel>
    </motion.div>
  );
}
