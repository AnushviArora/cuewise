import { NextResponse } from "next/server";
import type { EmbedRequest, EmbedResponse } from "@/lib/ai/contracts";
import { apiError, badRequest } from "@/lib/server/http";
import { embed } from "@/lib/server/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TEXTS = 96;
const MAX_CHARS = 3_000;

/** Embeds lecture passages (once per lecture) and questions (once per question). */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as EmbedRequest | null;
    if (!body || !Array.isArray(body.texts) || body.texts.length === 0) return badRequest("Invalid request.");
    if (body.texts.length > MAX_TEXTS) return badRequest("Too many passages in one request.");
    if (!body.texts.every((t) => typeof t === "string" && t.trim())) return badRequest("Invalid request.");
    const vectors = await embed(
      body.texts.map((t) => t.slice(0, MAX_CHARS)),
      req.signal,
    );
    return NextResponse.json({ vectors } satisfies EmbedResponse);
  } catch (e) {
    return apiError(e);
  }
}
