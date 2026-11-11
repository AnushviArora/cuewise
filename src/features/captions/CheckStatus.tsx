"use client";

import { motion } from "framer-motion";
import { AlertIcon } from "@/components/ui/Icons";
import { formatEta } from "@/lib/time";
import type { Checking, StepFailure } from "./useCaptionPipeline";

/** Progress (or a retryable failure) for the work that continues after captions appear. */
export function CheckStatus({
  checking,
  failure,
  onRetry,
}: {
  checking: Checking | null;
  failure: StepFailure | null;
  onRetry: () => void;
}) {
  if (!checking && !failure) return null;

  if (failure) {
    return (
      <div
        role="alert"
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3"
      >
        <p className="flex min-w-0 flex-1 items-start gap-2 text-sm leading-relaxed">
          <AlertIcon className="mt-0.5 shrink-0 text-danger" width={16} height={16} />
          <span>
            <span className="font-medium">
              {failure.step === "documents" ? "Couldn’t read your documents." : "Term checking didn’t finish."}
            </span>{" "}
            Your captions are ready to use. {failure.message}
          </span>
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl border border-edge bg-white/[0.06] px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink/60 hover:bg-white/[0.12]"
        >
          Try again
        </button>
      </div>
    );
  }

  const c = checking!;
  const pct = c.phase === "sections" ? Math.round((c.done / c.total) * 100) : null;
  return (
    <div role="status" aria-live="polite" className="mb-4 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3">
      <p className="text-sm font-medium">
        {c.phase === "documents"
          ? "Reading your documents…"
          : `Checking terms… ${c.done} of ${c.total} sections${c.etaSeconds ? ` · ${formatEta(c.etaSeconds)} left` : ""}`}
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <motion.div
          className="h-full rounded-full bg-accent"
          initial={false}
          animate={pct === null ? { x: ["-100%", "250%"], width: "40%" } : { width: `${pct}%` }}
          transition={pct === null ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted">Captions are already usable. Corrections appear as each section finishes.</p>
    </div>
  );
}
