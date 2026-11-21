"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ArrowRightIcon, CloseIcon, FileIcon, ShareIcon, TranscriptIcon, UploadIcon, VideoIcon } from "@/components/ui/Icons";
import { abortChat } from "@/lib/ask/chat";
import { registerLectureContext } from "@/lib/ask/lectureContext";
import { downloadTranscript, type ExportKind } from "@/lib/captions/export";
import {
  DEFAULT_CAPTION_SETTINGS,
  loadSettings,
  saveSettings,
} from "@/lib/captions/settings";
import type { CaptionSettings } from "@/lib/captions/types";
import { clock } from "@/lib/captions/export";
import { useLecture, type Lecture } from "@/lib/lecture-context";
import { ShareToast, useShare } from "../share/useShare";
import { ProcessingCard } from "../captions/ProcessingCard";
import { useCaptionPipeline } from "../captions/useCaptionPipeline";
import { CheckStatus } from "../captions/CheckStatus";
import { ReviewStatus } from "../review/ReviewStatus";
import { TranscriptDialog } from "../review/TranscriptDialog";
import { useCaptionReview } from "../review/useCaptionReview";
import { SidePanel } from "./SidePanel";
import type { ReviewRequest } from "./tabs/ReviewTab";
import { VideoPlayer, type PlayerHandle } from "./VideoPlayer";

/**
 * Keyed by lecture id: a new upload remounts everything below, so captions, review
 * decisions, transcript, tabs and player state can never carry over from a previous lecture.
 */
interface SharedLink {
  lectureId?: string;
  /** Seconds from ?t= (0 when missing or bad). */
  startAt?: number;
  /** Question and course title carried in the link, already cleaned. Shown as plain text only. */
  question?: string | null;
  title?: string | null;
}

export function Workspace({ lectureId, startAt = 0, question = null, title = null }: SharedLink = {}) {
  const { lecture } = useLecture();
  const link = { startAt, question, title };
  if (!lecture) return <EmptyWorkspace shared={!!lectureId} link={link} />;
  // A shared link for a different lecture than the one loaded here.
  if (lectureId && lecture.id !== lectureId) return <EmptyWorkspace shared link={link} />;
  return <LectureWorkspace key={lecture.session} lecture={lecture} startAt={startAt} question={question} />;
}

/** The question a link carries, with its moment. Text only: never rendered as HTML. */
function SharedQuestion({ at, question, onClose }: { at: number; question: string; onClose?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm">
      <p className="min-w-0 flex-1 leading-relaxed">
        <span className="text-muted">Shared question at {clock(at)}: </span>
        <span className="break-words">{question}</span>
      </p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss shared question"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-ink"
        >
          <CloseIcon width={14} height={14} />
        </button>
      )}
    </div>
  );
}

function EmptyWorkspace({
  shared = false,
  link,
}: {
  shared?: boolean;
  link?: { startAt: number; question: string | null; title: string | null };
}) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg items-center px-5">
      <GlassPanel className="w-full p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <UploadIcon />
        </span>
        <h1 className="mt-4 text-xl font-semibold">{shared ? "This lecture isn’t available here" : "No lecture loaded"}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {shared
            ? "Lectures live in the browser they were uploaded in, so this link only opens where that lecture is loaded. Upload the same video here, then open the link again."
            : "Lectures live in your browser, so reloading the page clears them. Upload a lecture to get started."}
        </p>
        {shared && link && (link.question || link.title) && (
          <div className="mt-5 space-y-2 text-left">
            {link.title && <p className="text-center text-xs text-subtle">Lecture: {link.title}</p>}
            {link.question ? (
              <SharedQuestion at={link.startAt} question={link.question} />
            ) : (
              <p className="text-center text-xs text-muted">Shared moment: {clock(link.startAt)}</p>
            )}
          </div>
        )}
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-on shadow-glow transition hover:brightness-110"
        >
          Upload a lecture <ArrowRightIcon width={18} height={18} />
        </Link>
      </GlassPanel>
    </main>
  );
}

function LectureWorkspace({ lecture, startAt, question }: { lecture: Lecture; startAt: number; question: string | null }) {
  const [settings, setSettings] = useState<CaptionSettings>(DEFAULT_CAPTION_SETTINGS);
  const hydrated = useRef(false);
  const playerRef = useRef<PlayerHandle>(null);
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const { state, retry } = useCaptionPipeline(lecture);
  const review = useCaptionReview(state.status === "done" ? state.result : null, lecture.id);
  const incomplete = state.status === "done" && (state.checking !== null || state.failure !== null);
  const [tab, setTab] = useState("captions");
  const [reviewRequest, setReviewRequest] = useState<ReviewRequest | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const toolsRef = useRef<HTMLElement>(null);
  const { share, note } = useShare(lecture.id, lecture.courseName, review.cues);
  const captionsReady = state.status === "done";
  const [questionShown, setQuestionShown] = useState(true);

  // "Ask this lecture" reads the reviewed captions (corrections included) through
  // getLectureContext; keep it current, and stop any answer in progress when leaving.
  useEffect(() => {
    if (state.status === "done") {
      registerLectureContext(lecture.id, { courseName: lecture.courseName, cues: review.cues });
    }
  }, [state.status, review.cues, lecture.id, lecture.courseName]);
  useEffect(() => () => abortChat(lecture.id), [lecture.id]);

  const openReview = useCallback((editId?: string) => {
    setTab("review");
    setReviewRequest((r) => ({ editId, n: (r?.n ?? 0) + 1 }));
    toolsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);
  const handled = useCallback(() => setReviewRequest(null), []);
  const playClip = useCallback((s: number, e: number) => playerRef.current?.playClip(s, e), []);
  const download = useCallback(
    (kind: ExportKind) => {
      downloadTranscript(kind, review.cues, lecture.courseName);
    },
    [lecture.courseName, review.cues],
  );

  // Restore saved display preferences once, then persist every change.
  useEffect(() => {
    setSettings(loadSettings());
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (hydrated.current) saveSettings(settings);
  }, [settings]);

  return (
    <main id="main" className="mx-auto min-h-dvh max-w-[96rem] px-5 py-8 sm:px-8">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6 flex flex-wrap items-center justify-between gap-4"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Workspace</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{lecture.courseName}</h1>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
            <VideoIcon width={14} height={14} />
            <span className="truncate">Video: {lecture.video.name}</span>
          </p>
          {lecture.slides.length > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <FileIcon width={14} height={14} />
              {lecture.slides.length === 1
                ? `Slides: ${lecture.slides[0].name}`
                : `${lecture.slides.length} documents`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={state.status !== "done"}
            onClick={() => setTranscriptOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-edge bg-white/[0.04] px-4 py-2.5 text-sm text-ink transition-colors hover:border-ink/60 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <TranscriptIcon width={18} height={18} /> Transcript
          </button>
          <Link
            href="/"
            className="rounded-xl border border-edge bg-white/[0.04] px-4 py-2.5 text-sm text-ink transition-colors hover:border-ink/60 hover:bg-white/[0.09]"
          >
            Upload another lecture
          </Link>
        </div>
      </motion.header>

      {state.status === "done" && (
        <CheckStatus checking={state.checking} failure={state.failure} onRetry={retry} />
      )}
      {state.status === "done" && (
        <ReviewStatus review={review} incomplete={incomplete} onOpen={() => openReview()} />
      )}

      <AnimatePresence>
        {state.status !== "done" && (
          <div className="mb-6" key="progress">
            <ProcessingCard state={state} hasSlides={lecture.slides.length > 0} onRetry={retry} />
          </div>
        )}
      </AnimatePresence>

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <motion.section
          aria-label="Lecture video"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          // On small screens the video stays pinned while you scroll the transcript below it.
          className="max-md:sticky max-md:top-2 max-md:z-30"
        >
          <VideoPlayer
            src={lecture.videoUrl}
            title={lecture.courseName}
            ref={playerRef}
            cues={review.cues}
            settings={settings}
            onSettingsChange={setSettings}
            onActiveCueChange={setActiveCueId}
            startAt={startAt}
          />
          {question && questionShown && (
            <div className="mt-3">
              <SharedQuestion at={startAt} question={question} onClose={() => setQuestionShown(false)} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              disabled={!captionsReady}
              aria-describedby={captionsReady ? undefined : "share-hint"}
              onClick={() => void share(playerRef.current?.getTime() ?? 0)}
              className="inline-flex items-center gap-2 rounded-xl border border-edge bg-white/[0.04] px-3.5 py-2 text-sm text-ink transition-colors hover:border-ink/60 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-edge disabled:hover:bg-white/[0.04]"
            >
              <ShareIcon width={16} height={16} /> Share this moment
            </button>
            {!captionsReady && (
              <span id="share-hint" className="text-xs text-subtle">
                Available once captions are ready.
              </span>
            )}
          </div>
        </motion.section>

        <motion.section
          ref={toolsRef}
          aria-label="Lecture tools"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
          className="md:sticky md:top-8 md:max-h-[calc(100dvh-4rem)]"
        >
          <SidePanel
            pipeline={state}
            onRetry={retry}
            incomplete={incomplete}
            review={review}
            activeCueId={activeCueId}
            onSeek={(t) => playerRef.current?.seek(t)}
            onShare={(t, q) => void share(t, q)}
            uploadId={lecture.id}
            courseName={lecture.courseName}
            tab={tab}
            onTabChange={setTab}
            reviewRequest={reviewRequest}
            onReviewRequestHandled={handled}
            onOpenReview={openReview}
            onPlayClip={playClip}
            onDownload={download}
          />
        </motion.section>
      </div>

      <TranscriptDialog
        open={transcriptOpen}
        title={lecture.courseName}
        review={review}
        onClose={() => setTranscriptOpen(false)}
        onDownload={download}
        onOpenReview={openReview}
      />
      <ShareToast note={note} />
    </main>
  );
}
