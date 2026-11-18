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

/** Small, cheap embedding model. 512 dimensions keep payloads and cached vectors small. */
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMENSIONS = 512;
const EMBED_TIMEOUT_MS = 30_000;

/** Unit-length embedding vectors (rounded to 4 decimals), one per input text, in order. */
export async function embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  const res = await guarded(() =>
    fetch(`${BASE}/embeddings`, {
      method: "POST",
      signal: withTimeout(signal, EMBED_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${getOpenAIKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMENSIONS }),
    }),
  );
  const json = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
  const rows = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
  if (rows.length !== texts.length) throw new OpenAIError(502, "wrong number of embeddings", "bad_output");
  return rows.map(({ embedding }) => {
    const norm = Math.hypot(...embedding) || 1;
    return embedding.map((x) => Math.round((x / norm) * 1e4) / 1e4);
  });
}

const STREAM_TIMEOUT_MS = 60_000;
const enc = new TextEncoder();
const line = (o: unknown) => enc.encode(`${JSON.stringify(o)}\n`);

/**
 * Streams a chat completion as NDJSON events ({t:"delta"|"done"|"error"}). Request-level
 * failures (bad key, rate limit, ...) throw BEFORE streaming starts, so the route can reply
 * with a normal error. Failures after the first byte become an {t:"error"} event with a
 * plain-language message; raw upstream text is never forwarded.
 */
export async function chatStream(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const signal = withTimeout(opts.signal, STREAM_TIMEOUT_MS);
  const res = await guarded(() =>
    fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${getOpenAIKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEXT_MODEL,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens,
        stream: true,
        messages: [{ role: "system", content: opts.system }, ...opts.messages],
      }),
    }),
  );
  if (!res.body) throw new OpenAIError(502, "no response body", "bad_output");
  const upstream = res.body.getReader();
  const dec = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let finish = "";
      try {
        for (;;) {
          const { done, value } = await upstream.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const row = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!row.startsWith("data:")) continue;
            const data = row.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const choice = (JSON.parse(data) as { choices?: { delta?: { content?: string }; finish_reason?: string | null }[] })
                .choices?.[0];
              if (choice?.delta?.content) controller.enqueue(line({ t: "delta", v: choice.delta.content }));
              if (choice?.finish_reason) finish = choice.finish_reason;
            } catch {
              /* ignore a malformed keep-alive row */
            }
          }
        }
        controller.enqueue(line({ t: "done", truncated: finish === "length" || undefined }));
      } catch (e) {
        if (opts.signal?.aborted) {
          // The browser went away: nothing to tell anyone.
        } else {
          const timedOut = e instanceof DOMException && e.name === "TimeoutError";
          controller.enqueue(
            line({
              t: "error",
              message: timedOut
                ? "The answer took too long. Try again."
                : "The connection was interrupted. Try again.",
            }),
          );
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      void upstream.cancel().catch(() => {});
    },
  });
}
