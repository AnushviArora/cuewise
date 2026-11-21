import { ApiRequestError, askLecture, embedTexts } from "@/lib/ai/client";
import type { AskRequest, AskSource } from "@/lib/ai/contracts";
import { checkParts } from "./citations";
import { getLectureContext } from "./lectureContext";
import { retrieve } from "./retrieve";

/** A passage an answer relied on, shown as a clickable timestamp or a slide label. */
export interface SourceRef {
  id: string;
  kind: "transcript" | "slide";
  /** "12:34" for transcript, "Slide 7" for documents. */
  label: string;
  /** Full origin, e.g. "notes.pdf, page 7". */
  title: string;
  /** Start of the passage in seconds (transcript only). */
  start?: number;
  /** Opening words of the passage, taken from the real text. */
  snippet: string;
}

/** One labeled piece of an answer. */
export interface ChatPart {
  source: AskSource;
  text: string;
  /** Ids of passages this part relied on (all of them are in `refs`). */
  citations: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "pending" | "streaming" | "done" | "error";
  /** While pending: what is happening ("Reading the lecture…"). */
  phase?: string;
  /** Assistant only: the question it answers (for Retry). */
  question?: string;
  /** Ids that were sent to the model (the only citations that count) and what each one is. */
  refs?: Record<string, SourceRef>;
  /** The finished answer, split by source. `text` holds the same words as plain text. */
  parts?: ChatPart[];
  error?: string;
}

// ---- tiny external store, one conversation per upload id (lives for the session) ----
const chats = new Map<string, ChatMessage[]>();
const active = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const EMPTY: ChatMessage[] = [];

export const subscribeChat = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
export const getChat = (uploadId: string) => chats.get(uploadId) ?? EMPTY;
export const isAsking = (uploadId: string) => active.has(uploadId);

function setChat(uploadId: string, next: ChatMessage[]) {
  if (next.length === 0) chats.delete(uploadId);
  else chats.set(uploadId, next);
  listeners.forEach((l) => l());
}
function patch(uploadId: string, id: string, p: Partial<ChatMessage>) {
  const cur = getChat(uploadId);
  if (!cur.some((m) => m.id === id)) return; // cleared meanwhile
  setChat(uploadId, cur.map((m) => (m.id === id ? { ...m, ...p } : m)));
}

const uid = () => Math.random().toString(36).slice(2, 10);
const HISTORY_TURNS = 4;

async function execute(
  uploadId: string,
  courseName: string,
  question: string,
  assistantId: string,
  prior: ChatMessage[],
  ctrl: AbortController,
) {
  const { signal } = ctrl;
  const update = (p: Partial<ChatMessage>) => patch(uploadId, assistantId, p);
  try {
    update({ status: "pending", phase: "Reading the lecture…" });
    const ctx = await getLectureContext(uploadId);
    if (ctx.chunks.length === 0) throw new ApiRequestError("This lecture isn’t ready for questions yet.", 0);

    update({ phase: "Finding the relevant parts…" });
    const priorDone = prior.filter((m) => m.status === "done" && m.text);
    const lastQuestion = [...priorDone].reverse().find((m) => m.role === "user")?.text;
    // A short follow-up ("why?") borrows the previous question so retrieval still has context.
    const query = question.split(/\s+/).length < 5 && lastQuestion ? `${lastQuestion} ${question}` : question;
    let qv: ArrayLike<number> | null = null;
    if (ctx.vectors) {
      try {
        qv = (await embedTexts([query], signal))[0] ?? null;
      } catch (e) {
        if (signal.aborted) throw e;
        qv = null; // fall back to keyword search
      }
    }
    const found = retrieve(query, ctx.chunks, qv ? ctx.vectors : null, qv);

    // Real matches are sent as evidence. When there are none, the nearest passages are sent
    // only as "loosely related" so a general answer can link back to the course.
    const answering = found.hits;
    const near = found.covered ? [] : found.nearest;
    const sent = [...answering, ...near];
    const req: AskRequest = {
      courseName,
      question,
      history: priorDone.slice(-HISTORY_TURNS * 2).map((m) => ({ role: m.role, content: m.text })),
      excerpts: sent.map((c) => ({ id: c.id, label: c.label, text: c.text, related: near.includes(c) || undefined })),
    };
    const shortName = (n: string) => (n.length > 28 ? `${n.slice(0, 25)}…` : n);
    const snip = (t: string) => (t.length > 140 ? `${t.slice(0, 137).trimEnd()}…` : t);
    const toRef = (c: (typeof sent)[number]): SourceRef =>
      c.kind === "transcript"
        ? { id: c.id, kind: "transcript", label: c.label.replace("transcript ", ""), title: c.label, start: c.start, snippet: snip(c.text) }
        : {
            id: c.id,
            kind: "slide",
            // Always name the file, plus its slide / section / lines / page.
            label: `${shortName(c.doc ?? "")} · ${c.locator ?? `page ${c.page}`}`,
            title: c.label,
            snippet: snip(c.text),
          };
    update({ phase: "Writing the answer…", refs: Object.fromEntries(sent.map((c) => [c.id, toRef(c)])) });
    const res = await askLecture(req, signal);
    const parts = checkParts(
      Array.isArray(res?.parts) ? res.parts : [],
      new Set(sent.map((c) => c.id)),
      new Set(answering.map((c) => c.id)),
    );
    if (parts.length === 0) throw new ApiRequestError("I couldn’t write an answer. Please try again.", 0);
    update({ status: "done", phase: undefined, text: parts.map((p) => p.text).join("\n\n"), parts });
  } catch (e) {
    const stopped = signal.aborted;
    update({
      status: "error",
      phase: undefined,
      error: stopped
        ? "Stopped. Try again."
        : e instanceof Error && e.message
          ? e.message
          : "Something went wrong. Please try again.",
    });
  } finally {
    if (active.get(uploadId) === ctrl) active.delete(uploadId);
    listeners.forEach((l) => l());
  }
}

/** Sends a question. Ignored while another answer is still being written for this upload. */
export function sendQuestion(uploadId: string, courseName: string, question: string): void {
  const q = question.trim();
  if (!q || active.has(uploadId)) return;
  const prior = getChat(uploadId);
  const assistantId = uid();
  setChat(uploadId, [
    ...prior,
    { id: uid(), role: "user", text: q, status: "done" },
    { id: assistantId, role: "assistant", text: "", status: "pending", phase: "Reading the lecture…", question: q },
  ]);
  const ctrl = new AbortController();
  active.set(uploadId, ctrl);
  void execute(uploadId, courseName, q, assistantId, prior, ctrl);
}

/** Re-asks the question behind a failed answer, replacing that answer in place. */
export function retryQuestion(uploadId: string, courseName: string, assistantId: string): void {
  if (active.has(uploadId)) return;
  const cur = getChat(uploadId);
  const i = cur.findIndex((m) => m.id === assistantId);
  const question = cur[i]?.question;
  if (i < 1 || !question) return;
  setChat(
    uploadId,
    cur.map((m) =>
      m.id === assistantId
        ? { id: m.id, role: "assistant", text: "", status: "pending", phase: "Reading the lecture…", question }
        : m,
    ),
  );
  const ctrl = new AbortController();
  active.set(uploadId, ctrl);
  void execute(uploadId, courseName, question, assistantId, cur.slice(0, i - 1), ctrl);
}

/** Stops any answer in progress (e.g. when leaving the lecture). */
export function abortChat(uploadId: string): void {
  active.get(uploadId)?.abort();
}

export function clearChat(uploadId: string): void {
  abortChat(uploadId);
  active.delete(uploadId);
  setChat(uploadId, []);
}
