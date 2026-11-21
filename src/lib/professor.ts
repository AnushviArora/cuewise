import { clock } from "@/lib/captions/export";
import { parseQuestion, shareUrl } from "@/lib/share";
import type { ChatMessage } from "@/lib/ask/chat";
import { parseAnswer } from "@/lib/ask/citations";

/** Basic email check: one address, no spaces, commas or semicolons (so no extra recipients). */
export function validEmail(v: string): boolean {
  const e = v.trim();
  return e.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
}

const KEY = (lectureId: string) => `cuewise:professor-email:v1:${lectureId}`;

/** The professor's email, remembered per lecture in this browser only. */
export function loadProfessorEmail(lectureId: string): string {
  try {
    return window.localStorage.getItem(KEY(lectureId)) ?? "";
  } catch {
    return "";
  }
}
export function saveProfessorEmail(lectureId: string, email: string): void {
  try {
    window.localStorage.setItem(KEY(lectureId), email.trim());
  } catch {
    /* storage unavailable: it just won't be remembered */
  }
}

const SOURCE_LABEL = {
  lecture: "from the lecture",
  materials: "from the course materials",
  general: "general knowledge, not from this lecture",
} as const;

/** One line on what Cuewise said: the first sentence of the first part, without [T4] markers. */
function answerSummary(m: ChatMessage): string {
  const part = m.parts?.[0];
  if (!part) return "";
  const plain = parseAnswer(part.text, new Set(Object.keys(m.refs ?? {})), false)
    .map((s) => (s.kind === "text" ? s.text : ""))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1") // a removed [T4] marker can leave a gap before punctuation
    .trim();
  const first = plain.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? plain;
  const short = first.length > 180 ? `${first.slice(0, 177).trimEnd()}…` : first;
  return short ? `${short} (${SOURCE_LABEL[part.source]})` : "";
}

/** The first lecture moment the answer cited, in whole seconds (null if it cited none). */
export function answerMoment(m: ChatMessage): number | null {
  for (const p of m.parts ?? []) {
    for (const id of p.citations) {
      const r = m.refs?.[id];
      if (r?.kind === "transcript" && r.start !== undefined) return Math.floor(r.start);
    }
  }
  return null;
}

/** A short, polite first draft in the student's voice. The student can edit it. */
export function buildDraft(opts: { lectureId: string; title: string; message: ChatMessage }): string {
  const { lectureId, title, message } = opts;
  const question = parseQuestion(message.question ?? "") ?? (message.question ?? "").trim();
  const t = answerMoment(message);
  const summary = answerSummary(message);
  const lines = [
    "Hi Professor,",
    "",
    t !== null
      ? `I was reviewing ${title} and got stuck at ${clock(t)}.`
      : `I was reviewing ${title} and have a question.`,
    "",
    `My question: ${question}`,
  ];
  if (summary) lines.push("", `Cuewise's answer was: ${summary}`, "It didn't fully clear it up for me.");
  if (t !== null) lines.push("", `Link to that moment: ${shareUrl(lectureId, t, { question, title })}`);
  lines.push("", "Thank you!");
  return lines.join("\n");
}

/** Short subject, e.g. "Question about Lecture 2 at 42:14". */
export function buildSubject(title: string, moment: number | null): string {
  return moment !== null ? `Question about ${title} at ${clock(moment)}` : `Question about ${title}`;
}

/** Most mail apps and browsers choke on very long links. */
const MAX_LINK = 1900;

export type MailTarget = "app" | "outlook" | "gmail";

/** encodeURIComponent keeps spaces as %20 (URLSearchParams would use "+", which webmail shows literally). */
const enc = encodeURIComponent;

/**
 * Link that opens a compose window with everything filled in, or null if it would be too long.
 * "app" is a mailto link; "outlook" and "gmail" are webmail compose pages.
 */
export function composeLink(target: MailTarget, email: string, subject: string, body: string): string | null {
  const to = email.trim();
  const url =
    target === "outlook"
      ? `https://outlook.office.com/mail/deeplink/compose?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`
      : target === "gmail"
        ? `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`
        : `mailto:${enc(to).replace("%40", "@")}?subject=${enc(subject)}&body=${enc(body.replace(/\r?\n/g, "\r\n"))}`;
  return url.length <= MAX_LINK ? url : null;
}
