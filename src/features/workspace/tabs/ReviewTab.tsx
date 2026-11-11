"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  DownloadIcon,
  ReplayIcon,
  SparkIcon,
  UndoIcon,
} from "@/components/ui/Icons";
import { clock, type ExportKind } from "@/lib/captions/export";
import type { CaptionEdit } from "@/lib/captions/types";
import type { PipelineState } from "@/features/captions/useCaptionPipeline";
import type { ReviewModel } from "@/features/review/useCaptionReview";
import { Placeholder } from "./Placeholder";

/** Play from a few seconds before the cue, and a moment past it. */
const LEAD_SECONDS = 3;
const TAIL_SECONDS = 1;

export interface ReviewRequest {
  /** Open straight to this word (e.g. clicked in the transcript). */
  editId?: string;
  n: number;
}

interface Props {
  review: ReviewModel;
  status: PipelineState["status"];
  /** Term checking still running or failed: the list may grow, so don't call it final. */
  incomplete: boolean;
  request: ReviewRequest | null;
  onRequestHandled: () => void;
  onPlayClip: (start: number, end: number) => void;
  onDownload: (kind: ExportKind) => void;
}

type Mode = "review" | "auto";

const firstUndecided = (items: CaptionEdit[], decisions: ReviewModel["decisions"]) => {
  const i = items.findIndex((e) => !decisions[e.id]);
  return i < 0 ? items.length : i;
};

const btn =
  "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-[background-color,border-color,filter,transform] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
const btnGhost = `${btn} border border-edge bg-white/[0.04] text-ink hover:border-ink/60 hover:bg-white/[0.09]`;
const btnPrimary = `${btn} bg-accent font-semibold text-accent-on shadow-glow hover:brightness-110`;
const Kbd = ({ children }: { children: string }) => (
  <kbd className="rounded border border-current/30 px-1 text-[10px] font-semibold leading-4 opacity-70">
    {children}
  </kbd>
);

export function ReviewTab(props: Props) {
  const { review, status } = props;
  if (status !== "done") {
    return (
      <Placeholder icon={<SparkIcon />} title="Nothing to review yet">
        Once your captions are ready, words that may be wrong show up here one at a time, so you
        only check what matters instead of rereading the whole transcript.
      </Placeholder>
    );
  }
  if (review.reviewItems.length + review.autoItems.length === 0) {
    return (
      <div className="space-y-4">
        <Placeholder icon={<CheckIcon />} title="Nothing to review">
          No words were flagged. Add slides or notes when you upload a lecture and Cuewise will
          check names and technical terms against them.
        </Placeholder>
        <Downloads onDownload={props.onDownload} />
      </div>
    );
  }
  return <Queue {...props} />;
}

function Downloads({ onDownload }: { onDownload: (kind: ExportKind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onDownload("txt")} className={btnPrimary}>
        <DownloadIcon width={16} height={16} /> Text (.txt)
      </button>
      <button type="button" onClick={() => onDownload("srt")} className={btnGhost}>
        <DownloadIcon width={16} height={16} /> Captions (.srt)
      </button>
    </div>
  );
}

function Queue({ review, incomplete, request, onRequestHandled, onPlayClip, onDownload }: Props) {
  const { decisions } = review;
  const rootRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<Mode>("review");
  const items = mode === "review" ? review.reviewItems : review.autoItems;
  const auto = mode === "auto";
  const [index, setIndex] = useState(() => firstUndecided(review.reviewItems, decisions));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState("");

  const current = index < items.length ? items[index] : null;
  const decision = current ? decisions[current.id] : undefined;
  const rawCue = current ? review.rawById.get(current.cueId) : undefined;
  const reviewedCount = items.filter((e) => decisions[e.id]).length;

  // Open from the status banner or a transcript marker.
  useEffect(() => {
    if (!request) return;
    const target = request.editId ? review.editById.get(request.editId) : undefined;
    if (target) {
      const m: Mode = target.status === "applied" ? "auto" : "review";
      const list = m === "review" ? review.reviewItems : review.autoItems;
      setMode(m);
      setIndex(Math.max(0, list.findIndex((e) => e.id === target.id)));
    } else {
      // From the status banner: start at the first word that still needs a decision.
      setMode("review");
      setIndex(firstUndecided(review.reviewItems, decisions));
    }
    rootRef.current?.focus({ preventScroll: true });
    onRequestHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const playCurrent = useCallback(() => {
    if (rawCue) onPlayClip(Math.max(0, rawCue.start - LEAD_SECONDS), rawCue.end + TAIL_SECONDS);
  }, [rawCue, onPlayClip]);

  // Jump to the moment and play it whenever a new item comes up.
  const currentId = current?.id;
  useEffect(() => {
    setEditing(false);
    playCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setIndex(firstUndecided(m === "review" ? review.reviewItems : review.autoItems, decisions));
  };

  /** Next item with no decision (after this one, else wrapping), or the finish screen. */
  const advanceFrom = (id: string) => {
    const open = (e: CaptionEdit) => e.id !== id && !decisions[e.id];
    let next = items.findIndex((e, i) => i > index && open(e));
    if (next < 0) next = items.findIndex(open);
    setIndex(next < 0 ? items.length : next);
  };

  const resolve = (kind: "accepted" | "edited" | "kept", text: string) => {
    if (!current) return;
    review.decide(current.id, { kind, text });
    setEditing(false);
    const label =
      kind === "accepted" ? `Accepted “${current.corrected}”`
      : kind === "kept" ? `Kept “${current.original}”`
      : `Changed to “${text}”`;
    setAnnounce(`${label}. Captions updated.`);
    advanceFrom(current.id);
  };
  const accept = () => current && resolve("accepted", current.corrected);
  const keep = () => current && resolve("kept", current.original);
  const startEdit = () => {
    if (!current) return;
    setDraft(decision?.kind === "edited" ? decision.text : current.corrected);
    setEditing(true);
  };
  const saveEdit = () => {
    if (!current) return;
    const text = draft.trim();
    if (!text) return;
    resolve(text === current.original ? "kept" : text === current.corrected ? "accepted" : "edited", text);
  };
  const resetCurrent = () => {
    if (!current) return;
    review.clear(current.id);
    setAnnounce(auto ? "Automatic fix restored." : "Decision cleared.");
  };
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(items.length - 1, i + 1));

  // Keyboard shortcuts, active while this tab is open and you're not typing.
  const keysRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keysRef.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select, video, [contenteditable], [role=tab], [role=menu]")) return;
    if (document.querySelector("dialog[open]")) return;
    const key = e.key.toLowerCase();
    const run = (fn: () => void) => {
      e.preventDefault();
      fn();
    };
    if (key === "arrowright" || key === "n") run(next);
    else if (key === "arrowleft" || key === "p") run(prev);
    else if (!current) return;
    else if (key === "a") run(accept);
    else if (key === "e") run(startEdit);
    else if (key === "k") run(keep);
    else if (key === "r") run(playCurrent);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keysRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const heardCtx = (() => {
    if (!current || !rawCue) return null;
    const i = rawCue.text.toLowerCase().indexOf(current.original.toLowerCase());
    if (i < 0) return { before: rawCue.text, word: "", after: "" };
    const end = i + current.original.length;
    return { before: rawCue.text.slice(0, i), word: rawCue.text.slice(i, end), after: rawCue.text.slice(end) };
  })();

  const total = items.length;
  const finished = current === null;

  return (
    <section ref={rootRef} tabIndex={-1} aria-label="Review queue" className="space-y-4 outline-none">
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>

      <div role="group" aria-label="Which words to review" className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1">
        {(
          [
            ["review", `Needs review · ${review.reviewItems.length}`],
            ["auto", `Fixed automatically · ${review.autoItems.length}`],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => switchMode(m)}
            className={`rounded-lg border px-2 py-2 text-sm transition-colors ${
              mode === m
                ? "border-accent/50 bg-accent-soft text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {total > 0 && (
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">
              {finished ? "Review complete" : `${index + 1} of ${total}`}
            </h2>
            <span className="text-xs text-muted">
              {reviewedCount} of {total} reviewed
            </span>
          </div>
          <ol aria-hidden className="mt-2 flex gap-1">
            {items.map((e, i) => {
              const d = decisions[e.id];
              return (
                <li key={e.id} className="min-w-0 flex-1">
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setIndex(i)}
                    className={`block h-1.5 w-full rounded-full transition-colors ${
                      d ? "bg-emerald-300/80" : i === index ? "bg-amber-300" : "bg-white/15"
                    } ${i === index ? "ring-2 ring-white/40 ring-offset-1 ring-offset-transparent" : ""}`}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {finished ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="space-y-4 rounded-2xl border border-emerald-300/40 bg-emerald-300/10 p-5 text-center"
          >
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-emerald-300/20 text-emerald-200">
              <CheckIcon />
            </span>
            <div>
              <p className="text-base font-semibold">
                {auto
                  ? "All automatic fixes checked."
                  : review.pending > 0
                    ? `${review.pending} still need a decision.`
                    : incomplete
                      ? "Everything found so far is reviewed."
                      : "All captions reviewed. Ready to publish."}
              </p>
              <p className="mt-1 text-sm text-muted">
                {incomplete
                  ? "Term checking isn’t finished, so more words may appear here."
                  : "Your decisions are already in the captions and transcript."}
              </p>
            </div>
            <Downloads onDownload={onDownload} />
            <div className="flex flex-wrap justify-center gap-2">
              {total > 0 && (
                <button type="button" onClick={() => setIndex(total - 1)} className={btnGhost}>
                  <ArrowLeftIcon width={16} height={16} /> Go back over them
                </button>
              )}
              {!auto && review.autoItems.length > 0 && (
                <button type="button" onClick={() => switchMode("auto")} className={btnGhost}>
                  Check {review.autoItems.length} automatic fixes
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-2 text-xs text-subtle">
                <span className="tabular-nums">
                  {clock(rawCue?.start ?? 0)} · {current.confidence} confidence
                </span>
                <button
                  type="button"
                  onClick={playCurrent}
                  aria-keyshortcuts="R"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-white/10"
                >
                  <ReplayIcon width={14} height={14} /> Replay clip <Kbd>R</Kbd>
                </button>
              </div>

              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Heard</p>
                  <p className="mt-1 break-words rounded-lg bg-white/10 px-2.5 py-1.5 text-base font-medium">
                    {current.original}
                  </p>
                </div>
                <ArrowRightIcon className="mt-5 text-subtle" width={18} height={18} />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                    {auto ? "Changed to" : "Suggested"}
                  </p>
                  <p className="mt-1 break-words rounded-lg bg-accent/20 px-2.5 py-1.5 text-base font-semibold text-accent">
                    {current.corrected}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-sm">
                <span className="text-muted">Matched slide term: </span>
                <span className="font-semibold">{current.term}</span>
              </p>
              {current.reason && <p className="mt-0.5 text-xs leading-relaxed text-muted">{current.reason}</p>}

              {heardCtx && (
                <blockquote className="mt-3 border-l-2 border-white/20 pl-3 text-sm leading-relaxed text-muted">
                  {heardCtx.before}
                  {heardCtx.word && (
                    <mark className="rounded bg-amber-300/25 px-0.5 font-medium text-amber-50">{heardCtx.word}</mark>
                  )}
                  {heardCtx.after}
                </blockquote>
              )}
            </div>

            {decision && !editing && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-emerald-300/10 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-200">
                  <CheckIcon width={16} height={16} />
                  {decision.kind === "accepted"
                    ? auto ? "Confirmed" : "Accepted"
                    : decision.kind === "edited" ? `Edited to “${decision.text}”`
                    : auto ? "Fix undone, original kept" : "Kept original"}
                </span>
                <button
                  type="button"
                  onClick={resetCurrent}
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink underline underline-offset-2 hover:text-accent"
                >
                  <UndoIcon width={14} height={14} />
                  {auto ? "Re-apply fix" : "Clear decision"}
                </button>
              </p>
            )}
            {!decision && auto && (
              <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-ink">
                Fixed automatically. Check it sounds right.
              </p>
            )}

            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveEdit();
                }}
                className="space-y-2"
              >
                <label htmlFor="review-edit" className="text-sm font-medium">
                  Type the correct word
                </label>
                <input
                  id="review-edit"
                  value={draft}
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setEditing(false);
                      rootRef.current?.focus({ preventScroll: true });
                    }
                  }}
                  className="w-full rounded-xl border border-edge bg-black/30 px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button type="submit" disabled={!draft.trim()} className={btnPrimary}>
                    Save <Kbd>Enter</Kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      rootRef.current?.focus({ preventScroll: true });
                    }}
                    className={btnGhost}
                  >
                    Cancel <Kbd>Esc</Kbd>
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={accept} aria-keyshortcuts="A" className={`${btnPrimary} col-span-2`}>
                  <CheckIcon width={16} height={16} />
                  {auto ? "Looks right" : "Accept suggestion"} <Kbd>A</Kbd>
                </button>
                <button type="button" onClick={startEdit} aria-keyshortcuts="E" className={btnGhost}>
                  Edit <Kbd>E</Kbd>
                </button>
                <button type="button" onClick={keep} aria-keyshortcuts="K" className={btnGhost}>
                  {auto ? "Undo fix" : "Keep original"} <Kbd>K</Kbd>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {total > 0 && (
        <div className="flex items-center justify-between border-t border-white/10 pt-3">
          <button type="button" onClick={prev} disabled={index === 0} aria-keyshortcuts="ArrowLeft P" className={btnGhost}>
            <ArrowLeftIcon width={16} height={16} /> Previous
          </button>
          <button
            type="button"
            onClick={next}
            disabled={finished || index >= total - 1}
            aria-keyshortcuts="ArrowRight N"
            className={btnGhost}
          >
            Next <ArrowRightIcon width={16} height={16} />
          </button>
        </div>
      )}
      <p className="text-center text-[11px] text-subtle">
        Shortcuts: <Kbd>A</Kbd> accept · <Kbd>E</Kbd> edit · <Kbd>K</Kbd> keep · <Kbd>←</Kbd> <Kbd>→</Kbd> previous / next · <Kbd>R</Kbd> replay
      </p>
    </section>
  );
}
