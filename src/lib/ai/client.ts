import type {
  ApiError,
  AskRequest,
  AskResponse,
  ReviewRequest,
  ReviewResponse,
} from "./contracts";

async function post<TReq, TRes>(url: string, body: TReq): Promise<TRes> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
