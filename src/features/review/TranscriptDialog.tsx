"use client";

import { useEffect, useRef } from "react";
import { CloseIcon, DownloadIcon } from "@/components/ui/Icons";
import { clock, type ExportKind } from "@/lib/captions/export";
import { CueText, MarkerLegend } from "./CueText";
import type { ReviewModel } from "./useCaptionReview";

interface Props {
  open: boolean;
  title: string;
  review: ReviewModel;
  onClose: () => void;
  onDownload: (kind: ExportKind) => void;
  /** Open a marked word in the review queue. */
  onOpenReview: (editId?: string) => void;
}

/** Full transcript in a clean reading view, built from the reviewed captions. */
export function TranscriptDialog({ open, title, review, onClose, onDownload, onOpenReview }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const long = (review.cues.at(-1)?.end ?? 0) >= 3600;
  const pending = review.pending;
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-[background-color,border-color,filter] ";

  return (
    <dialog
      ref={ref}
      aria-labelledby="transcript-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(46rem,calc(100vw-1.5rem))] rounded-3xl border border-white/15 bg-[#12131b] p-0 text-ink shadow-glass backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="flex max-h-[88dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
            <div className="min-w-0">
              <h2 id="transcript-title" className="text-lg font-semibold">
                Transcript
              </h2>
              <p className="truncate text-sm text-muted">{title}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close transcript"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white/10 hover:text-ink"
            >
              <CloseIcon />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {pending > 0 && (
              <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm">
                <span>
                  {pending} {pending === 1 ? "word still needs" : "words still need"} review. They download as originally heard.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenReview();
                  }}
                  className="font-semibold underline underline-offset-2 hover:text-accent"
                >
                  Review now
                </button>
              </p>
            )}
            <ol className="space-y-3">
              {review.cues.map((cue) => (
                <li key={cue.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3">
                  <span className="pt-0.5 text-xs tabular-nums text-subtle">{clock(cue.start, long)}</span>
                  <p className="text-[15px] leading-7 text-ink">
                    <CueText
                      cue={cue}
                      review={review}
                      onMarkClick={(id) => {
                        onClose();
                        onOpenReview(id);
                      }}
                    />
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <footer className="space-y-3 border-t border-white/10 px-6 py-4">
            <MarkerLegend />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onDownload("txt")}
                className={`${btn} bg-accent font-semibold text-accent-on shadow-glow hover:brightness-110`}
              >
                <DownloadIcon width={16} height={16} /> Download .txt
              </button>
              <button
                type="button"
                onClick={() => onDownload("srt")}
                className={`${btn} border border-edge bg-white/[0.04] hover:border-ink/60 hover:bg-white/[0.09]`}
              >
                <DownloadIcon width={16} height={16} /> Download .srt
              </button>
            </div>
          </footer>
        </div>
      )}
    </dialog>
  );
}
