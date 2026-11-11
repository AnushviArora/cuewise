"use client";

import { summarize } from "@/lib/captions/corrections";
import type { CaptionResult } from "@/lib/captions/types";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { PipelineState } from "@/features/captions/useCaptionPipeline";

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

interface Props {
  pipeline: PipelineState;
  activeCueId: string | null;
  onSeek: (seconds: number) => void;
}

const card = "rounded-2xl border border-white/10 bg-black/20 p-4";
const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-1.5 text-xs leading-relaxed text-muted">{children}</p>
);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function Summary({ result }: { result: CaptionResult }) {
  const { fixed, needsReview } = summarize(result.edits);
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
  if (result.slidesError) {
    return (
      <div className={card}>
        <p className="text-sm font-medium">Transcript ready, terms not checked</p>
        <Note>{result.slidesError}</Note>
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
      </Note>
    </div>
  );
}

function Transcript({
  result,
  activeCueId,
  onSeek,
}: {
  result: CaptionResult;
  activeCueId: string | null;
  onSeek: (seconds: number) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const editById = new Map(result.edits.map((e) => [e.id, e]));

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
      {result.cues.map((cue) => {
        const parts: React.ReactNode[] = [];
        let at = 0;
        for (const m of cue.marks ?? []) {
          const edit = editById.get(m.editId);
          if (!edit) continue;
          parts.push(cue.text.slice(at, m.start));
          const applied = edit.status === "applied";
          parts.push(
            <mark
              key={m.start}
              title={
                applied
                  ? `Corrected from “${edit.original}” to match “${edit.term}” in your documents`
                  : `Might be “${edit.corrected}” (from your documents) — needs review`
              }
              className={`rounded px-0.5 text-inherit ${
                applied
                  ? "bg-accent/20 underline decoration-accent/60 decoration-1 underline-offset-2"
                  : "bg-amber-300/15 underline decoration-amber-300/70 decoration-dotted underline-offset-2"
              }`}
            >
              {cue.text.slice(m.start, m.end)}
            </mark>,
          );
          at = m.end;
        }
        parts.push(cue.text.slice(at));
        const active = cue.id === activeCueId;
        return (
          <li key={cue.id} data-cue={cue.id}>
            <button
              type="button"
              onClick={() => onSeek(cue.start + 0.01)}
              aria-current={active ? "true" : undefined}
              aria-label={`Jump to ${fmt(cue.start)}`}
              className={`flex w-full gap-3 rounded-xl px-3 py-2 text-left text-sm leading-relaxed transition-colors ${
                active ? "bg-white/10 text-ink" : "text-muted hover:bg-white/[0.06] hover:text-ink"
              }`}
            >
              <span className="mt-px w-9 shrink-0 text-xs tabular-nums text-subtle">{fmt(cue.start)}</span>
              <span>{parts}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function CaptionsTab({ pipeline, activeCueId, onSeek }: Props) {
  return (
    <div className="space-y-6">
      {pipeline.status === "done" ? (
        <section aria-label="Transcript" className="space-y-3">
          <Summary result={pipeline.result} />
          <Transcript result={pipeline.result} activeCueId={activeCueId} onSeek={onSeek} />
          <p className="text-xs text-muted">
            Select a line to jump there.{" "}
            <span className="rounded bg-accent/20 px-1">Highlighted</span> words were corrected from
            your documents; <span className="rounded bg-amber-300/15 px-1">dotted</span> ones need review.
          </p>
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
