# Cuewise

Foundation + UI shell for accurate lecture captions. No AI yet — it's structured so each AI feature plugs into one place.

## Run locally

Requires Node 18.18+ (Node 20+ recommended).

```bash
npm install
npm run dev
```

Open http://localhost:3000, upload an MP4, and open the workspace.

## Secrets

Put your OpenAI key in `.env.local` (already in `.gitignore`; see `.env.example`):

```
OPENAI_API_KEY=sk-...
```

It is read only in `src/lib/server/env.ts`, which imports `server-only` so the build fails if client code imports it. Never prefix it with `NEXT_PUBLIC_`.

## How grounded captions work

1. **Transcribe** — the browser decodes the video's audio to 16 kHz mono WAV in 10-minute chunks (the video itself is never uploaded) and sends each to `/api/transcribe` (`whisper-1`, the only OpenAI speech model with segment timestamps).
2. **Read slides** — `/api/slides` extracts the PDF text (`unpdf`) and `gpt-4o-mini` lists names, technical and course terms.
3. **Check terms** — `/api/correct` asks the model for *edit proposals only* (never rewritten text). `src/lib/captions/corrections.ts` validates them (word must exist in the cue, correction must be a slide term) and applies them itself, so timestamps and wording are untouched. Only high-confidence, spelling-similar fixes are applied; everything else is kept as spoken and marked `needs_review`.

Edits are stored as `CaptionEdit[]` (original, corrected, matched term, confidence, reason, status) — the data the Review tab will use. The pipeline lives in `src/features/captions/useCaptionPipeline.ts`.

Prototype limits: the whole audio track is decoded in memory, so keep clips to roughly an hour or less.

## Adding another AI feature

1. Request/response types live in `src/lib/ai/contracts.ts`.
2. Implement the route in `src/app/api/<name>/route.ts` using `chatJson()` from `src/lib/server/openai.ts` and `apiError()` from `src/lib/server/http.ts`.
3. Add a browser wrapper in `src/lib/ai/client.ts` and call it from the matching tab. `/api/review` and `/api/ask` are still 501 stubs.
