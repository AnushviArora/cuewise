"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertIcon, ArrowRightIcon, ReplayIcon, SparkIcon } from "@/components/ui/Icons";
import { clearChat, retryQuestion, sendQuestion, type ChatMessage } from "@/lib/ask/chat";
import { parseAnswer } from "@/lib/ask/citations";
import { prepareLecture } from "@/lib/ask/lectureContext";
import { AnswerText, SourceBadge } from "./AnswerText";
import { useAskChat } from "./useAskChat";

const MAX_QUESTION = 500;

const SPOKEN: Record<string, string> = {
  lecture: "From the lecture",
  materials: "From your course materials",
  general: "Not from this lecture",
};

/** Plain text of an answer (no citation markers), part by part with its source, for the screen reader. */
function spoken(m: ChatMessage): string {
  const valid = new Set(Object.keys(m.refs ?? {}));
  const clean = (t: string) =>
    parseAnswer(t, valid, false)
      .map((s) => (s.kind === "text" ? s.text : ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  const parts = (m.parts ?? []).map((p) => {
    const src = p.citations.map((id) => m.refs?.[id]?.label).filter(Boolean).join(", ");
    return `${SPOKEN[p.source]}: ${clean(p.text)}${src ? ` Sources: ${src}.` : ""}`;
  });
  return `Answer. ${parts.join(" ")}`;
}

/** Nearest ancestor that scrolls, so the chat can follow new text without moving the page. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

interface Props {
  uploadId: string;
  courseName: string;
  onSeek: (seconds: number) => void;
}

export function AskPanel({ uploadId, courseName, onSeek }: Props) {
  const { messages, asking } = useAskChat(uploadId);
  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const announced = useRef<string | null>(null);

  // Embed the lecture in the background so the first question is fast.
  useEffect(() => {
    void prepareLecture(uploadId);
  }, [uploadId]);

  // Follow new text, unless the reader has scrolled up to re-read something.
  const last = messages[messages.length - 1];
  useEffect(() => {
    const sp = scrollParent(endRef.current);
    if (sp && sp.scrollHeight - sp.scrollTop - sp.clientHeight < 160) sp.scrollTop = sp.scrollHeight;
  }, [messages]);

  // Tell screen-reader users when an answer starts and when it is finished (not word by word).
  useEffect(() => {
    if (!last || last.role !== "assistant") return;
    const key = `${last.id}:${last.status}`;
    if (announced.current === key) return;
    if (last.status === "pending" && announced.current?.startsWith(`${last.id}:`)) return;
    announced.current = key;
    if (last.status === "pending") setAnnounce("Looking through the lecture…");
    else if (last.status === "done") setAnnounce(spoken(last));
    else if (last.status === "error") setAnnounce(`Error: ${last.error ?? "Something went wrong."} Retry is available.`);
  }, [last]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const q = draft.trim();
    if (!q || asking) return;
    sendQuestion(uploadId, courseName, q);
    setDraft("");
    const el = inputRef.current;
    if (el) el.style.height = "auto";
    el?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a line. Never send while an IME is composing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const clear = () => {
    clearChat(uploadId);
    setAnnounce("Chat cleared.");
    announced.current = null;
    inputRef.current?.focus();
  };

  return (
    <section aria-label="Ask this lecture" className="flex min-h-full flex-col">
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>

      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-xs leading-relaxed text-muted">
          Answers say where they come from: the lecture, your course materials, or general knowledge.
        </p>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-lg border border-edge px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-ink/60 hover:bg-white/[0.08]"
          >
            Clear chat
          </button>
        )}
      </div>

      <ol
        aria-label="Conversation"
        // Stacked layout: keep the chat in its own scroll area so the input stays right under it.
        className="flex-1 space-y-4 pb-4 max-md:max-h-[40dvh] max-md:overflow-y-auto"
      >
        {messages.length === 0 && (
          <li className="flex flex-col items-center px-2 py-8 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-soft text-accent">
              <SparkIcon />
            </span>
            <h2 className="mt-3 text-base font-semibold">Ask this lecture</h2>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
              Ask anything. You’ll get an answer from the lecture or your course files when they cover it, and a clearly labeled general answer when they don’t.
            </p>
          </li>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <li key={m.id} className="flex justify-end">
              <p className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent/20 px-3.5 py-2 text-sm leading-relaxed">
                <span className="sr-only">You asked: </span>
                {m.text}
              </p>
            </li>
          ) : (
            <li key={m.id} className="flex">
              <article
                aria-label="Answer"
                aria-busy={m.status === "pending" || m.status === "streaming"}
                className="max-w-[94%] rounded-2xl rounded-bl-md border border-white/10 bg-black/25 px-3.5 py-2.5"
              >
                {m.status === "pending" && (
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <span aria-hidden className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
                          style={{ animationDelay: `${i * 160}ms` }}
                        />
                      ))}
                    </span>
                    {m.phase ?? "Working…"}
                  </p>
                )}

                {m.status === "error" && (
                  <div>
                    <p className="flex items-start gap-2 text-sm leading-relaxed text-danger">
                      <AlertIcon className="mt-0.5 shrink-0" width={16} height={16} />
                      {m.error}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        retryQuestion(uploadId, courseName, m.id);
                        inputRef.current?.focus();
                      }}
                      disabled={asking}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink/60 hover:bg-white/[0.08] disabled:opacity-50"
                    >
                      <ReplayIcon width={14} height={14} /> Retry
                    </button>
                  </div>
                )}

                {m.status === "done" && (
                  <div className="space-y-3">
                    {(m.parts ?? []).map((p, i) => (
                      <div key={i}>
                        <div className="mb-1">
                          <SourceBadge source={p.source} />
                        </div>
                        <AnswerText part={p} refs={m.refs ?? {}} onSeek={onSeek} />
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </li>
          ),
        )}
        <div ref={endRef} aria-hidden />
      </ol>

      <form
        onSubmit={submit}
        className="sticky bottom-0 -mx-1 border-t border-white/10 bg-[#0e0f16]/95 px-1 pb-1 pt-3 backdrop-blur"
      >
        <label htmlFor="ask-input" className="sr-only">
          Your question about this lecture
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="ask-input"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={MAX_QUESTION}
            placeholder="Ask a question about this lecture"
            aria-describedby="ask-hint"
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={onKeyDown}
            className="max-h-32 min-h-[2.75rem] min-w-0 flex-1 resize-none rounded-xl border border-edge bg-black/30 px-3.5 py-2.5 text-sm leading-snug placeholder:text-subtle focus:border-accent"
          />
          <button
            type="submit"
            disabled={!draft.trim() || asking}
            aria-label={asking ? "Answering, please wait" : "Send question"}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-on shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <ArrowRightIcon width={18} height={18} />
          </button>
        </div>
        <p id="ask-hint" className="mt-1.5 text-[11px] text-subtle">
          Enter to send · Shift+Enter for a new line
        </p>
      </form>
    </section>
  );
}
