import "server-only"; // build fails if a client component ever imports this file

export class MissingKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not set. Add it to .env.local (see .env.example).");
  }
}

/**
 * The only place the OpenAI key is read. It comes from `.env.local` (gitignored)
 * and has no NEXT_PUBLIC_ prefix, so Next.js never ships it to the browser.
 */
export function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new MissingKeyError();
  return key;
}

/** Cheap text model for term extraction + correction. Override with OPENAI_TEXT_MODEL. */
export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-mini";
/** whisper-1 is the only OpenAI speech model that returns timestamped segments. */
export const TRANSCRIBE_MODEL = "whisper-1";
