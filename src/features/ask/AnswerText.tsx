"use client";

import { parseAnswer } from "@/lib/ask/citations";
import type { AskSource } from "@/lib/ai/contracts";
import type { ChatPart, SourceRef } from "@/lib/ask/chat";

const chip =
  "mx-0.5 inline-flex items-center rounded-md border px-1.5 py-px align-baseline text-xs font-semibold tabular-nums";

/** A cited source: a timestamp that seeks the video, or a slide/page label. */
export function SourceChip({
  source,
  onSeek,
  srPrefix = true,
}: {
  source: SourceRef;
  onSeek: (seconds: number) => void;
  /** Say "Source:" to screen readers (not needed inside a list already titled "Sources"). */
  srPrefix?: boolean;
}) {
  if (source.kind === "transcript" && source.start !== undefined) {
    return (
      <button
        type="button"
        onClick={() => onSeek(source.start! + 0.01)}
        aria-label={`Jump to ${source.label} in the video`}
        title={`Jump to ${source.label}: ${source.snippet}`}
        className={`${chip} border-accent/40 bg-accent-soft text-accent transition-colors hover:bg-accent/30`}
      >
        {source.label}
      </button>
    );
  }
  return (
    <span title={`${source.title}: ${source.snippet}`} className={`${chip} border-white/20 bg-white/10 text-ink`}>
      {srPrefix && <span className="sr-only">Source: </span>}
      {source.label}
    </span>
  );
}

const BADGES: Record<AskSource, { text: string; cls: string }> = {
  lecture: { text: "From lecture", cls: "border-accent/40 bg-accent-soft text-accent" },
  materials: { text: "From your course materials", cls: "border-white/25 bg-white/10 text-ink" },
  general: { text: "Not from this lecture", cls: "border-white/15 bg-transparent text-muted" },
};

/** Small label saying where a part of the answer comes from. */
export function SourceBadge({ source }: { source: AskSource }) {
  const b = BADGES[source];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-px text-[11px] font-medium ${b.cls}`}>
      {b.text}
    </span>
  );
}

/** One answer part: [T4] / [S2] markers become chips; unknown ids are dropped. */
export function AnswerText({
  part,
  refs,
  onSeek,
}: {
  part: ChatPart;
  refs: Record<string, SourceRef>;
  onSeek: (seconds: number) => void;
}) {
  const segments = parseAnswer(part.text, new Set(Object.keys(refs)), false);
  const inline = new Set(segments.flatMap((s) => (s.kind === "cite" ? s.ids : [])));
  // Citations the model listed but did not place in the text still show, after it.
  const rest = part.citations.filter((id) => !inline.has(id) && refs[id]);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {segments.map((s, i) =>
        s.kind === "text" ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span key={i}>
            {s.ids.map((id) => (
              <SourceChip key={id} source={refs[id]} onSeek={onSeek} />
            ))}
          </span>
        ),
      )}
      {rest.map((id) => (
        <SourceChip key={id} source={refs[id]} onSeek={onSeek} />
      ))}
    </p>
  );
}
