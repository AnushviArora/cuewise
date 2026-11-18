"use client";

import { parseAnswer } from "@/lib/ask/citations";
import type { ChatMessage, SourceRef } from "@/lib/ask/chat";

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
        title={`Jump to ${source.label}`}
        className={`${chip} border-accent/40 bg-accent-soft text-accent transition-colors hover:bg-accent/30`}
      >
        {source.label}
      </button>
    );
  }
  return (
    <span title={source.title} className={`${chip} border-white/20 bg-white/10 text-ink`}>
      {srPrefix && <span className="sr-only">Source: </span>}
      {source.label}
    </span>
  );
}

/** The answer text with [T4] / [S2] markers turned into chips. Unknown ids are dropped. */
export function AnswerText({ message, onSeek }: { message: ChatMessage; onSeek: (seconds: number) => void }) {
  const refs = message.refs ?? {};
  const segments = parseAnswer(message.text, new Set(Object.keys(refs)), message.status === "streaming");
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
    </p>
  );
}
