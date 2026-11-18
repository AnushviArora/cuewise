"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ArrowRightIcon, FileIcon, TranscriptIcon, UploadIcon, VideoIcon } from "@/components/ui/Icons";
import { abortChat } from "@/lib/ask/chat";
import { registerLectureContext } from "@/lib/ask/lectureContext";
import { downloadTranscript, type ExportKind } from "@/lib/captions/export";
import {
  DEFAULT_CAPTION_SETTINGS,
  loadSettings,
  saveSettings,
} from "@/lib/captions/settings";
import type { CaptionSettings } from "@/lib/captions/types";
import { useLecture, type Lecture } from "@/lib/lecture-context";
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
export function Workspace() {
  const { lecture } = useLecture();
  if (!lecture) return <EmptyWorkspace />;
  return <LectureWorkspace key={lecture.id} lecture={lecture} />;
}

function EmptyWorkspace() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg items-center px-5">
      <GlassPanel className="w-full p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <UploadIcon />
        </span>
        <h1 className="mt-4 text-xl font-semibold">No lecture loaded</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Lectures live in your browser, so reloading the page clears them. Upload a lecture
          to get started.
        </p>
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

function LectureWorkspace({ lecture }: { lecture: Lecture }) {
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
          />
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
    </main>
  );
}
