import type {
  ApiError,
  AskRequest,
  AskResponse,
  CorrectRequest,
  CorrectResponse,
  ReviewRequest,
  ReviewResponse,
  SlidesResponse,
  TranscribeResponse,
} from "./contracts";

async function post<TReq extends object, TRes>(url: string, body: TReq | FormData): Promise<TRes> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn’t reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(err?.message ?? "Something went wrong. Please try again.");
  }
  return (await res.json()) as TRes;
}

/** Browser-side wrappers. They only talk to our own API routes — never to OpenAI. */
export const reviewCaptions = (req: ReviewRequest) =>
  post<ReviewRequest, ReviewResponse>("/api/review", req);

export const askLecture = (req: AskRequest) => post<AskRequest, AskResponse>("/api/ask", req);

export function transcribeChunk(audio: Blob, courseName: string) {
  const form = new FormData();
  form.append("audio", audio, "audio.wav");
  form.append("courseName", courseName);
  return post<FormData, TranscribeResponse>("/api/transcribe", form);
}

export function extractSlideTerms(slides: File, courseName: string) {
  const form = new FormData();
  form.append("slides", slides);
  form.append("courseName", courseName);
  return post<FormData, SlidesResponse>("/api/slides", form);
}

export const correctCues = (req: CorrectRequest) =>
  post<CorrectRequest, CorrectResponse>("/api/correct", req);
