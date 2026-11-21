"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/ui/Icons";
import { clock } from "@/lib/captions/export";
import { findCue } from "@/lib/captions/corrections";
import type { CaptionCue } from "@/lib/captions/types";
import { copyText, shareUrl } from "@/lib/share";

interface Note {
  ok: boolean;
  time: string;
  line: string | null;
}

/** Copies a link to a moment and shows a small, non-blocking confirmation. */
export function useShare(lectureId: string, title: string, cues: CaptionCue[]) {
  const [note, setNote] = useState<Note | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const share = useCallback(
    async (seconds: number, question?: string) => {
      const t = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
      const ok = await copyText(shareUrl(lectureId, t, { question, title }));
      // Preview: the caption line being spoken at that moment.
      const line = findCue(cues, t)?.text.replace(/\s+/g, " ").trim() || null;
      setNote({ ok, time: clock(t), line });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setNote(null), 3500);
    },
    [lectureId, title, cues],
  );

  return { share, note };
}

/** Small pill at the bottom of the screen. Never covers the video and ignores clicks. */
export function ShareToast({ note }: { note: Note | null }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {note && (
        <p className="max-w-sm rounded-xl border border-white/15 bg-[#14151e]/95 px-3.5 py-2 text-xs text-ink shadow-glass backdrop-blur">
          <span className="inline-flex items-center gap-1.5 font-medium">
            {note.ok ? <CheckIcon width={14} height={14} className="text-accent" /> : null}
            {note.ok ? `Link copied · ${note.time}` : "Couldn’t copy the link. Copy it from the address bar."}
          </span>
          {note.ok && note.line && <span className="mt-0.5 block truncate text-muted">“{note.line}”</span>}
        </p>
      )}
    </div>
  );
}
