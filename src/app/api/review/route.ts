import { notImplemented } from "@/lib/server/http";

// Future: validate the body, call OpenAI with getOpenAIKey() from
// "@/lib/server/env", and return the matching type from "@/lib/ai/contracts".
export async function POST() {
  return notImplemented("Caption review");
}
