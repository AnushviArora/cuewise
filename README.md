# Cuewise

Accurate lecture captions that know your course's own terms, plus a chat that answers questions from the lecture and links to the exact moment.

> 🎬 **Demo video:** _coming soon_ 

## The problem

- **Auto-captions get technical terms wrong.** Names and jargon are exactly what speech-to-text mishears (for example "eigenvalue" heard as "I can value"), and a wrong caption is worse than none for students who rely on them.
- **Students can't quickly find what was taught.** A recording is a long video; finding the five minutes that explain one idea means scrubbing and guessing.

Cuewise fixes the captions using the lecture's own slides, notes and code, lets the professor review only the words that need it, and lets students ask the lecture questions.

## Features

Everything below works today.

### Captions that spell your course's terms correctly
- Upload a lecture video (MP4, up to 2 GB). The audio is extracted in your browser and transcribed with OpenAI Whisper; **the video itself never leaves your computer**.
- Optionally add slides, notes, handouts and code (up to 15 files). Cuewise reads them to learn the names and technical terms the lecture uses, then fixes captions that sound like one of those terms.
- Safe by design: the model only *proposes* word-level fixes. The app checks each one (the word is really in the caption, the correction is a real term from your files) and applies it itself, so timing and wording stay untouched. Capitalization alone is never a "fix": ordinary terms stay lowercase in a sentence, while names and acronyms (Strang, MATLAB) keep their capitals.
- Captions appear as soon as the transcript is ready, and corrections fill in section by section with progress and a time estimate. If a step fails, **Try again** re-runs only that step and reuses the transcript that already succeeded.
- Results are cached in your browser, so uploading the same video and files again is instant.

### Multi-format uploads
| Format | How it is read | Cited in answers as |
|---|---|---|
| PDF | page by page | `Slide 3` (adds the file name when several documents are uploaded) |
| PowerPoint `.pptx` | one passage per slide, including speaker notes and tables | `Slide 7 · deck.pptx` |
| Word `.docx` | by heading (or by section when there are no headings) | `Finding eigenvalues · notes.docx` |
| Plain text `.txt`, Markdown `.md` | `.md` by heading, `.txt` by line range | `Diagonalization · notes.md`, `lines 1-3 · notes.txt` |
| Code `.py .java .js .ts .c .cpp .html .css .sql` | by function or class | `lines 12-30 · solver.py` |

- Function, class and variable names from code files join the caption term list, so a spoken "get user name" can be captioned `getUserName`.
- Every file is read strictly as **text**. Nothing uploaded is ever executed or imported.
- Unsupported types are rejected with a message listing what is accepted. Limits: PDF 50 MB, `.pptx`/`.docx` 25 MB, text and code 1 MB, 15 files.

### Professor review
- A banner such as "3 words need review · 6 fixed automatically" opens a step-by-step review queue. Each item shows what was heard, the suggestion and the matching term, and plays the few seconds around it.
- Accept, edit or keep the original, then move to the next. Keyboard shortcuts: **A**, **E**, **K**, arrow keys, **R** to replay.
- Automatic fixes can be reviewed too, with an easy undo. Every decision updates the captions and transcript immediately.
- A full **transcript** view with timestamps, and downloads of the reviewed captions as **`.txt`** and **`.srt`**.

### Video player
- Captions over the video, playback speed 0.75× to 2× (remembered), fullscreen, and keyboard controls.
- A caption settings panel on the player: rows, a 3×3 position picker (to move captions off slides or board content), font size and alignment. Changes show instantly, with a sample caption when none is playing.
- Video and side panel sit side by side from 768 px wide; on smaller screens the video stays pinned while you scroll.

### Ask this lecture
- Ask a question and get an answer **grounded only in that upload's transcript and document text**. If the lecture doesn't cover it, you are told plainly ("This lecture doesn't seem to cover that") instead of getting a guess.
- Every answer cites its sources: **timestamps that seek the video** to that moment, and slide, section or line labels for documents.
- Only the most relevant passages are sent for each question, found with OpenAI embeddings (with a keyword-search fallback), so cost and latency stay low. Answers are short and stream in as they are written.
- Errors show a Retry button, follow-up questions work, history is kept per upload for the session, and **Clear chat** resets it. Enter sends and Shift+Enter adds a line.

### Accessibility and privacy
- Keyboard-operable controls, labelled form fields, screen-reader announcements for review and chat progress, and animation that respects the OS "reduce motion" setting.
- What is sent to OpenAI: short audio chunks, the text of your documents, and the few lecture passages needed to answer a question. The video is not uploaded.
- Your API key stays on the server (it is read in one server-only file and never sent to the browser). Each upload is isolated: its captions, review decisions and chat never mix with another lecture's.

## Tech stack
- **Next.js 15** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS 3**, **Framer Motion**
- **OpenAI API**: `whisper-1` (transcription), `gpt-4o-mini` by default (term extraction, corrections and answers; override with `OPENAI_TEXT_MODEL`), `text-embedding-3-small` (finding relevant passages)
- **Document reading:** `unpdf` (PDF), `fflate` + `fast-xml-parser` (`.pptx`, `.docx`)
- **In the browser:** Web Audio for audio extraction, IndexedDB for the on-device cache. There is no database and no accounts.

## Run it locally

Requires Node 18.18+ (Node 20+ recommended) and an [OpenAI API key](https://platform.openai.com/api-keys). Using it is billed to your OpenAI account; transcription is the main cost.

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and paste your key after `OPENAI_API_KEY=`. `.env.local` is gitignored; never commit it and never prefix the key with `NEXT_PUBLIC_`. Optional settings in [`.env.example`](.env.example): `OPENAI_TEXT_MODEL` (default `gpt-4o-mini`) and `OPENAI_BASE_URL` (point at an OpenAI-compatible server, for example a local mock).

```bash
npm run dev
```

Open http://localhost:3000, enter a course name, add an MP4 (and optionally documents), and open the workspace.

Other scripts: `npm run typecheck`, `npm run build`, `npm start`.

## What's next

**Known limits today**
- Lectures live in your browser session: reloading the page clears the lecture, its review decisions and the chat. Only the on-device cache (transcript, terms, corrections, search vectors) and your display settings are kept.
- MP4 video only. The whole audio track is decoded in memory, so keep lectures to roughly an hour or less.
- Scanned or image-only PDFs have no text to read and are skipped (there is no OCR). Legacy `.ppt` and `.doc` files are not supported; save them as `.pptx` or `.docx`.
- Code is split into functions and classes with line patterns rather than a full parser, so unusual styles may be split coarsely.
- There are no automated tests and no linter configured yet.

**Not built yet**
- **Publish:** save a lecture with its reviewed captions on a server and share a student page with captions and the Ask chat. This is the main next step; it also needs accounts and storage.
- OCR for scanned PDFs, WebVTT (`.vtt`) export, and streaming audio decoding for longer lectures.
- AI flagging of likely misheard words that are *not* in your documents (an `/api/review` placeholder exists but does nothing).
- ESLint and automated tests.

## Credits

Demo lecture content from MIT OpenCourseWare 6.0001 (Fall 2016), licensed CC BY-NC-SA 4.0.

No lecture content is included in this repository.
