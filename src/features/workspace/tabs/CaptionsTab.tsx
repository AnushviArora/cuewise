"use client";

import type { CaptionResult } from "@/lib/captions/types";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Checking, PipelineState, StepFailure } from "@/features/captions/useCaptionPipeline";
import { CueText, MarkerLegend } from "@/features/review/CueText";
import type { ReviewModel } from "@/features/review/useCaptionReview";

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

interface Props {
  pipeline: PipelineState;
  onRetry: () => void;
  review: ReviewModel;
  activeCueId: string | null;
  onSeek: (seconds: number) => void;
  onOpenReview: (editId?: string) => void;
}

const card = "rounded-2xl border border-white/10 bg-black/20 p-4";
const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-1.5 text-xs leading-relaxed text-muted">{children}</p>
);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function Summary({
  result,
  review,
  checking,
  failure,
  onRetry,
}: {
  result: CaptionResult;
  review: ReviewModel;
  checking: Checking | null;
  failure: StepFailure | null;
  onRetry: () => void;
}) {
  const fixed = review.autoFixed;
  const needsReview = review.pending;
  const { documentsUploaded, documentsUsed, documentsSkipped } = result;

  if (documentsUploaded === 0) {
    return (
      <div className={card}>
        <p className="text-sm font-medium">Transcript ready</p>
        <Note>
          Adding your slides, notes or handouts improves accuracy: Cuewise uses them to correct
          names and technical terms.{" "}
          <Link href="/" className="text-accent underline underline-offset-2">
            Upload with documents
          </Link>
        </Note>
      </div>
    );
  }
  if (failure) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
        <p className="text-sm font-medium">Transcript ready, terms not fully checked</p>
        <Note>{failure.message}</Note>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-xl border border-edge bg-white/[0.06] px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink/60 hover:bg-white/[0.12]"
        >
          Try again
        </button>
        <Note>Only the failed step runs again. Your transcript is kept.</Note>
      </div>
    );
  }
  if (checking) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent-soft p-4">
        <p className="text-sm font-medium">
          {checking.phase === "documents"
            ? "Reading your documents…"
            : `Checking terms… ${checking.done} of ${checking.total} sections`}
        </p>
        <Note>Your transcript is ready. Corrections appear as each section finishes.</Note>
      </div>
    );
  }
  if (documentsUsed === 0 || result.terms.length === 0) {
    return (
      <div className={card}>
        <p className="text-sm font-medium">Transcript ready</p>
        <Note>
          We couldn’t find readable text in your {documentsUploaded === 1 ? "document" : "documents"}{" "}
          (scanned images?), so no terms were checked. Text-based PDF exports work best.
        </Note>
      </div>
    );
  }
  const docs = plural(documentsUsed, "document");
  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft p-4">
      <p className="text-sm font-medium">
        {fixed === 0 && needsReview === 0
          ? `No terms needed fixing (checked against ${docs})`
          : `Fixed ${plural(fixed, "term")} using ${docs}${needsReview ? ` · ${needsReview} need${needsReview === 1 ? "s" : ""} review` : ""}`}
      </p>
      <Note>
        Checked against {plural(result.terms.length, "term")} from your {documentsUsed === 1 ? "document" : "documents"}.
        {documentsSkipped.length > 0 &&
          ` Skipped ${documentsSkipped.length} with no readable text: ${documentsSkipped.join(", ")}.`}
        {(result.documentsFailed?.length ?? 0) > 0 &&
          ` Couldn’t check ${result.documentsFailed!.join(", ")}; try uploading again.`}
      </Note>
    </div>
  );
}

function Transcript({
  review,
  activeCueId,
  onSeek,
  onOpenReview,
}: {
  review: ReviewModel;
  activeCueId: string | null;
  onSeek: (seconds: number) => void;
  onOpenReview: (editId: string) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the current line visible, scrolling only this list (never the page).
  useEffect(() => {
    const list = listRef.current;
    const el = activeCueId ? list?.querySelector<HTMLElement>(`[data-cue="${activeCueId}"]`) : null;
    if (!list || !el) return;
    const top = el.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: top - list.clientHeight / 3, behavior: "smooth" });
    }
  }, [activeCueId]);

  return (
    <ol
      ref={listRef}
      aria-label="Transcript"
      className="relative max-h-72 space-y-0.5 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-1.5"
    >
      {review.cues.map((cue) => {
        const active = cue.id === activeCueId;
        return (
          <li
            key={cue.id}
            data-cue={cue.id}
            onClick={() => onSeek(cue.start + 0.01)}
            className={`flex cursor-pointer gap-3 rounded-xl px-3 py-2 text-sm leading-relaxed transition-colors ${
              active ? "bg-white/10 text-ink" : "text-muted hover:bg-white/[0.06] hover:text-ink"
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSeek(cue.start + 0.01);
              }}
              aria-current={active ? "true" : undefined}
              aria-label={`Jump to ${fmt(cue.start)}`}
              className="mt-px w-9 shrink-0 text-left text-xs tabular-nums text-subtle hover:text-ink"
            >
              {fmt(cue.start)}
            </button>
            <span>
              <CueText cue={cue} review={review} onMarkClick={onOpenReview} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function CaptionsTab({
  pipeline,
  onRetry,
  review,
  activeCueId,
  onSeek,
  onOpenReview,
}: Props) {

  return (
    <div className="space-y-6">
      {pipeline.status === "done" ? (
        <section aria-label="Transcript" className="space-y-3">
          <Summary
            result={pipeline.result}
            review={review}
            checking={pipeline.checking}
            failure={pipeline.failure}
            onRetry={onRetry}
          />
          <Transcript review={review} activeCueId={activeCueId} onSeek={onSeek} onOpenReview={onOpenReview} />
          <p className="text-xs text-muted">Select a line to jump there. Select a marked word to review it.</p>
          <MarkerLegend />
        </section>
      ) : (
        <p className={`${card} text-sm text-muted`}>
          {pipeline.status === "error"
            ? "Captions couldn’t be created. See the message above."
            : "Your transcript will appear here as soon as it’s ready."}
        </p>
      )}

      <div className={card}>
        <h2 className="text-sm font-semibold">Caption appearance</h2>
        <Note>
          Use the <span className="font-medium text-ink">settings button</span> next to CC on the video to
          change position, font size, rows and alignment. Changes show on the video right away.
        </Note>
      </div>
    </div>
  );
}
