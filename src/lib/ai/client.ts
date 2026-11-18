import type {
  ApiError,
  AskRequest,
  AskStreamEvent,
  CorrectRequest,
  CorrectResponse,
  EmbedRequest,
  EmbedResponse,
  ReviewRequest,
  ReviewResponse,
  SlidesResponse,
  TranscribeResponse,
} from "./contracts";

/** Failure from our API. `retryable` = worth trying again automatically (busy / timeout / network). */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

async function post<TReq extends object, TRes>(
  url: string,
  body: TReq | FormData,
  signal?: AbortSignal,
): Promise<TRes> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? body : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e; // cancelled on purpose, not a network failure
    throw new ApiRequestError("Couldn’t reach the server. Check your internet connection and try again.", 0);
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(err?.message ?? "Something went wrong. Please try again.", res.status);
  }
  return (await res.json()) as TRes;
}

/** Browser-side wrappers. They only talk to our own API routes — never to OpenAI. */
export const reviewCaptions = (req: ReviewRequest) =>
  post<ReviewRequest, ReviewResponse>("/api/review", req);

export const embedTexts = (texts: string[], signal?: AbortSignal) =>
  post<EmbedRequest, EmbedResponse>("/api/embed", { texts }, signal).then((r) => r.vectors);

/**
 * Asks a question and streams the answer. `onDelta` receives text as it is generated.
 * Resolves with `truncated` when the answer hit the length cap; rejects with an
 * ApiRequestError (friendly message) if the request or the stream fails.
 */
export async function streamAnswer(
  req: AskRequest,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ truncated: boolean }> {
  let res: Response;
  try {
    res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ApiRequestError("Couldn’t reach the server. Check your internet connection and try again.", 0);
  }
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(err?.message ?? "Something went wrong. Please try again.", res.status);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let truncated = false;
  let finished = false;
  const handle = (row: string) => {
    if (!row.trim()) return;
    const ev = JSON.parse(row) as AskStreamEvent;
    if (ev.t === "delta") onDelta(ev.v);
    else if (ev.t === "done") {
      finished = true;
      truncated = !!ev.truncated;
    } else throw new ApiRequestError(ev.message, 502);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        handle(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    handle(buffer);
  } catch (e) {
    if (signal?.aborted || e instanceof ApiRequestError) throw e;
    throw new ApiRequestError("The connection was interrupted. Try again.", 0);
  }
  if (!finished) throw new ApiRequestError("The answer was cut off. Try again.", 0);
  return { truncated };
}

export function transcribeChunk(audio: Blob, courseName: string, signal?: AbortSignal) {
  const form = new FormData();
  form.append("audio", audio, "audio.wav");
  form.append("courseName", courseName);
  return post<FormData, TranscribeResponse>("/api/transcribe", form, signal);
}

export function extractSlideTerms(slides: File[], courseName: string, signal?: AbortSignal) {
  const form = new FormData();
  for (const f of slides) form.append("slides", f);
  form.append("courseName", courseName);
  return post<FormData, SlidesResponse>("/api/slides", form, signal);
}

export const correctCues = (req: CorrectRequest, signal?: AbortSignal) =>
  post<CorrectRequest, CorrectResponse>("/api/correct", req, signal);
