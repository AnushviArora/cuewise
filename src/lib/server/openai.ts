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
export async function transcribe(
  audio: Blob,
  prompt?: string,
  signal?: AbortSignal,
): Promise<WhisperSegment[]> {
  const form = new FormData();
  form.append("file", audio, "audio.wav");
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("temperature", "0");
  if (prompt) form.append("prompt", prompt);
  const res = await guarded(() =>
    fetch(`${BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getOpenAIKey()}` },
      body: form,
      signal: withTimeout(signal, WHISPER_TIMEOUT_MS),
    }),
  );
  const json = (await res.json()) as { segments?: WhisperSegment[] };
  return json.segments ?? [];
}

/** Stop waiting for OpenAI after this long (a hung request must not run for minutes). */
const CHAT_TIMEOUT_MS = 90_000;
const WHISPER_TIMEOUT_MS = 240_000;

/** Combines the browser's cancel signal with a timeout. */
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}

async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await check(await run());
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new OpenAIError(504, "request timed out", "timeout");
    }
    throw e;
  }
}

/**
 * Chat completion constrained to a strict JSON schema. Returns the raw text and why the
 * model stopped, so callers can tell a complete answer from one cut off at `maxTokens`.
 */
export async function chatJsonRaw(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  /** Hard cap on the reply. Without it a runaway list can take minutes and be cut off mid-string. */
  maxTokens?: number;
  /** Aborts the OpenAI request (e.g. when the browser leaves the lecture). */
  signal?: AbortSignal;
}): Promise<{ content: string; finishReason: string }> {
  const res = await guarded(() =>
    fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: withTimeout(opts.signal, CHAT_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${getOpenAIKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TEXT_MODEL,
        temperature: 0,
        max_tokens: opts.maxTokens ?? 3000,
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
  const json = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const choice = json.choices?.[0];
  const content = choice?.message?.content;
  if (!content) throw new OpenAIError(502, "empty completion", "bad_output");
  return { content, finishReason: choice?.finish_reason ?? "stop" };
}

/** Like chatJsonRaw but parsed. A truncated or malformed reply is a clear, typed error. */
export async function chatJson<T>(opts: Parameters<typeof chatJsonRaw>[0]): Promise<T> {
  const { content, finishReason } = await chatJsonRaw(opts);
  if (finishReason === "length") throw new OpenAIError(502, "reply truncated at max_tokens", "truncated");
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new OpenAIError(502, "reply was not valid JSON", "bad_output");
  }
}
