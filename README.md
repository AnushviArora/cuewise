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

## Adding an AI feature

1. Request/response types live in `src/lib/ai/contracts.ts`.
2. Implement the route in `src/app/api/{transcribe,review,ask}/route.ts` (currently 501 stubs) using `getOpenAIKey()`.
3. Call the wrapper in `src/lib/ai/client.ts` from the matching tab in `src/features/workspace/tabs/`.
4. Real captions: produce `CaptionCue[]` and pick the active cue by `currentTime`, then pass it to `CaptionOverlay` instead of `SAMPLE_CUE`.
