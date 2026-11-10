"use client";

import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Slider } from "@/components/ui/Slider";
import {
  DEFAULT_CAPTION_SETTINGS,
  FONT_SIZE_RANGE,
  INDENT_RANGE,
} from "@/lib/captions/settings";
import { summarize } from "@/lib/captions/corrections";
import type { CaptionPosition, CaptionResult, CaptionSettings } from "@/lib/captions/types";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { PipelineState } from "@/features/captions/useCaptionPipeline";

/** Tiny frame icon showing where the caption bar sits. */
function PositionGlyph({ at }: { at: CaptionPosition }) {
  const y = at === "top" ? 3 : at === "middle" ? 8 : 13;
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden focusable="false">
      <rect x="1" y="1" width="14" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="4" y={y - 1} width="8" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

interface Props {
  settings: CaptionSettings;
  onChange: (next: CaptionSettings) => void;
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

export function CaptionsTab({ settings, onChange, pipeline, activeCueId, onSeek }: Props) {
  const set = <K extends keyof CaptionSettings>(key: K, value: CaptionSettings[K]) =>
    onChange({ ...settings, [key]: value });

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

      <div>
        <h2 className="text-base font-semibold">Caption display</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Changes appear on the video instantly. Move captions away from slide content so
          they never hide diagrams or equations.
        </p>
      </div>

      <SegmentedControl
        legend="Rows"
        value={settings.rows}
        onChange={(v) => set("rows", v)}
        options={[
          { value: 1, label: "1" },
          { value: 2, label: "2" },
          { value: 3, label: "3" },
        ]}
      />
      <SegmentedControl
        legend="Position"
        value={settings.position}
        onChange={(v) => set("position", v)}
        options={(["top", "middle", "bottom"] as const).map((p) => ({
          value: p,
          label: p[0].toUpperCase() + p.slice(1),
          icon: <PositionGlyph at={p} />,
        }))}
      />
      <SegmentedControl
        legend="Alignment"
        value={settings.align}
        onChange={(v) => set("align", v)}
        options={[
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ]}
      />
      <Slider
        label="Indentation"
        {...INDENT_RANGE}
        value={settings.indent}
        display={`${settings.indent}%`}
        onChange={(v) => set("indent", v)}
      />
      <Slider
        label="Font size"
        {...FONT_SIZE_RANGE}
        value={settings.fontSize}
        display={`${Math.round((settings.fontSize / DEFAULT_CAPTION_SETTINGS.fontSize) * 100)}%`}
        onChange={(v) => set("fontSize", v)}
      />

      <Button variant="ghost" className="w-full" onClick={() => onChange(DEFAULT_CAPTION_SETTINGS)}>
        Reset to defaults
      </Button>
    </div>
  );
}
