"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon } from "@/components/ui/Icons";
import type { ChatMessage } from "@/lib/ask/chat";
import {
  answerMoment,
  buildDraft,
  buildSubject,
  composeLink,
  loadProfessorEmail,
  saveProfessorEmail,
  validEmail,
  type MailTarget,
} from "@/lib/professor";
import { copyText } from "@/lib/share";

const field =
  "w-full rounded-lg border border-edge bg-black/30 px-3 py-2 text-sm placeholder:text-subtle focus:border-accent";
const btn =
  "rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink/60 hover:bg-white/[0.08]";

/** Small panel under an answer: edit a message to the professor, then email it or copy it. */
export function ProfessorPanel({
  lectureId,
  title,
  message,
  onClose,
}: {
  lectureId: string;
  title: string;
  message: ChatMessage;
  onClose: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => buildDraft({ lectureId, title, message }));
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [openedIn, setOpenedIn] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The remembered address is read after mount (browser-only storage).
  useEffect(() => setEmail(loadProfessorEmail(lectureId)), [lectureId]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const say = (t: string) => {
    setNote(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 3000);
  };

  const VIA: Record<MailTarget, string> = { outlook: "Outlook", gmail: "Gmail", app: "your email app" };

  const send = (target: MailTarget) => {
    setOpenedIn(null);
    if (!validEmail(email)) {
      setEmailError("Enter a valid email address, like prof@school.edu.");
      return;
    }
    setEmailError(null);
    const link = composeLink(target, email, buildSubject(title, answerMoment(message)), draft);
    if (!link) {
      say("Too long for an email link. Use “Copy” instead, or shorten the message.");
      return;
    }
    saveProfessorEmail(lectureId, email);
    // Webmail opens in a new tab; the mail app link hands over to the system.
    if (target === "app") window.location.href = link;
    else window.open(link, "_blank", "noopener,noreferrer");
    setOpenedIn(VIA[target]);
  };

  const copy = async () => say((await copyText(draft)) ? "Copied" : "Couldn’t copy. Select the text and copy it.");

  return (
    <div role="group" aria-label="Ask my professor" className="mt-2 space-y-2 border-t border-white/10 pt-2">
      <label htmlFor={`${id}-draft`} className="block text-xs text-muted">
        Your message (you can edit it)
      </label>
      <textarea
        id={`${id}-draft`}
        value={draft}
        rows={9}
        maxLength={1500}
        onChange={(e) => setDraft(e.target.value)}
        className={`${field} resize-y leading-snug`}
      />
      <div>
        <label htmlFor={`${id}-email`} className="block text-xs text-muted">
          Professor’s email (saved for this lecture in this browser)
        </label>
        <input
          id={`${id}-email`}
          type="email"
          value={email}
          placeholder="prof@school.edu"
          autoComplete="off"
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${id}-err` : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(null);
          }}
          className={`${field} mt-1 ${emailError ? "border-danger" : ""}`}
        />
        {emailError && (
          <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-danger">
            {emailError}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(["outlook", "gmail", "app"] as const).map((t) => (
          <button key={t} type="button" onClick={() => send(t)} disabled={!draft.trim()} className={`${btn} bg-accent/20 disabled:opacity-50`}>
            {t === "outlook" ? "Open in Outlook" : t === "gmail" ? "Open in Gmail" : "Use my email app"}
          </button>
        ))}
        <button type="button" onClick={() => void copy()} disabled={!draft.trim()} className={`${btn} disabled:opacity-50`}>
          Copy for Ed Discussion / Slack
        </button>
        <button type="button" onClick={onClose} className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
          Close
        </button>
        <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-xs text-muted">
          {note === "Copied" && <CheckIcon width={13} height={13} className="text-accent" />}
          {note}
        </span>
      </div>
      {openedIn && (
        <p role="status" className="text-xs leading-relaxed text-muted">
          Draft opened in {openedIn}. Hit send there to email your professor. Cuewise doesn’t send the email itself.{" "}
          <button type="button" onClick={() => void copy()} className="underline underline-offset-2 hover:text-ink">
            Didn’t open? Copy the message instead
          </button>
        </p>
      )}
    </div>
  );
}
