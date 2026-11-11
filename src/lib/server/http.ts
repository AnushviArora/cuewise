import "server-only";
import { NextResponse } from "next/server";
import { MissingKeyError } from "./env";

/** Placeholder response for routes whose AI feature isn't built yet. */
export function notImplemented(feature: string) {
  return NextResponse.json(
    { error: "not_implemented", message: `${feature} isn’t available yet.` },
    { status: 501 },
  );
}

/** An error from OpenAI, carrying its HTTP status. */
export class OpenAIError extends Error {
  constructor(
    public status: number,
    detail: string,
    /** "truncated": the reply hit the output limit. "timeout": we stopped waiting. */
    public kind?: "truncated" | "timeout" | "bad_output",
  ) {
    super(detail);
  }
}

export function badRequest(message: string) {
  return NextResponse.json({ error: "bad_request", message }, { status: 400 });
}

/** Maps any thrown error to a friendly JSON response. Never leaks the key or raw upstream bodies. */
export function apiError(err: unknown) {
  if (err instanceof MissingKeyError) {
    return NextResponse.json(
      {
        error: "missing_api_key",
        message:
          "The OpenAI API key isn’t set. Add OPENAI_API_KEY to .env.local, then restart the dev server.",
      },
      { status: 503 },
    );
  }
  if (err instanceof OpenAIError) {
    const s = err.status;
    const message =
      err.kind === "timeout"
        ? "OpenAI took too long to answer. Nothing was lost. Try again in a moment."
        : err.kind === "truncated" || err.kind === "bad_output"
          ? "The AI’s answer came back incomplete. Nothing was lost. Try again; it will check in smaller pieces."
          : s === 401
        ? "OpenAI rejected the API key. Check OPENAI_API_KEY in .env.local."
        : s === 429
          ? "OpenAI is rate-limiting this key or the account is out of credit. Wait a moment and retry, or check your billing."
          : s === 413
            ? "That audio chunk was too large for OpenAI. Try a shorter clip."
            : s >= 500
              ? "OpenAI is having trouble right now. Please try again in a moment."
              : "OpenAI couldn’t process that request. Please try again.";
    console.error(`[openai] ${s}: ${err.message}`);
    return NextResponse.json({ error: "openai_error", message }, { status: s === 401 ? 502 : s });
  }
  console.error("[api]", err);
  return NextResponse.json(
    { error: "internal", message: "Something went wrong on our side. Please try again." },
    { status: 500 },
  );
}
