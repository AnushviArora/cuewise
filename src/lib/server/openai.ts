import "server-only";
import { getOpenAIKey, TEXT_MODEL, TRANSCRIBE_MODEL } from "./env";
import { OpenAIError } from "./http";

const BASE = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";

async function check(res: Response) {
  if (res.ok) return res;
  const body = await res.text().catch(() => "");
  throw new OpenAIError(res.status, body.slice(0, 300));
}

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  no_speech_prob?: number;
}

/** Whisper with segment timestamps. `prompt` biases spelling (we pass the course name). */
export async function transcribe(audio: Blob, prompt?: string): Promise<WhisperSegment[]> {
  const form = new FormData();
  form.append("file", audio, "audio.wav");
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("temperature", "0");
  if (prompt) form.append("prompt", prompt);
  const res = await check(
    await fetch(`${BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getOpenAIKey()}` },
      body: form,
    }),
  );
  const json = (await res.json()) as { segments?: WhisperSegment[] };
  return json.segments ?? [];
}

/** Chat completion constrained to a strict JSON schema. Returns the parsed object. */
export async function chatJson<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const res = await check(
    await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAIKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TEXT_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
        },
      }),
    }),
  );
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new OpenAIError(502, "empty completion");
  return JSON.parse(content) as T;
}
