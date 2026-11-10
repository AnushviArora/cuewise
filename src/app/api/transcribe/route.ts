import { NextResponse } from "next/server";
import type { TranscribeResponse } from "@/lib/ai/contracts";
import { apiError, badRequest } from "@/lib/server/http";
import { transcribe } from "@/lib/server/openai";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI's own limit

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) return badRequest("No audio was provided.");
    if (audio.size > MAX_AUDIO_BYTES) return badRequest("That audio chunk is too large.");
    const course = String(form.get("courseName") ?? "").slice(0, 120);

    const segments = await transcribe(audio, course ? `Lecture: ${course}.` : undefined);
    const cues = segments
      .filter((s) => s.text.trim() && (s.no_speech_prob ?? 0) < 0.9)
      .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
    return NextResponse.json({ cues } satisfies TranscribeResponse);
  } catch (e) {
    return apiError(e);
  }
}
