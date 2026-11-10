import "server-only"; // build fails if a client component ever imports this file

/**
 * The only place the OpenAI key is read. It comes from `.env.local` (gitignored)
 * and has no NEXT_PUBLIC_ prefix, so Next.js never ships it to the browser.
 */
export function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env.local (see .env.example).");
  }
  return key;
}
