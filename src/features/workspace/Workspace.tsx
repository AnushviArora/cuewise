"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ArrowRightIcon, FileIcon, UploadIcon } from "@/components/ui/Icons";
import {
  DEFAULT_CAPTION_SETTINGS,
  loadSettings,
  saveSettings,
} from "@/lib/captions/settings";
import type { CaptionSettings } from "@/lib/captions/types";
import { useLecture } from "@/lib/lecture-context";
import { ProcessingCard } from "../captions/ProcessingCard";
import { useCaptionPipeline } from "../captions/useCaptionPipeline";
import { SidePanel } from "./SidePanel";
import { VideoPlayer, type PlayerHandle } from "./VideoPlayer";

export function Workspace() {
  const { lecture } = useLecture();
  const [settings, setSettings] = useState<CaptionSettings>(DEFAULT_CAPTION_SETTINGS);
  const hydrated = useRef(false);
  const playerRef = useRef<PlayerHandle>(null);
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const { state, retry } = useCaptionPipeline(lecture);
  const cues = useMemo(() => (state.status === "done" ? state.result.cues : []), [state]);

  // Restore saved display preferences once, then persist every change.
  useEffect(() => {
    setSettings(loadSettings());
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (hydrated.current) saveSettings(settings);
  }, [settings]);

  if (!lecture) {
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
          {lecture.slides && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
              <FileIcon width={14} height={14} /> Slides: {lecture.slides.name}
            </p>
          )}
        </div>
        <Link
          href="/"
          className="rounded-xl border border-edge bg-white/[0.04] px-4 py-2.5 text-sm text-ink transition-colors hover:border-ink/60 hover:bg-white/[0.09]"
        >
          Upload another lecture
        </Link>
      </motion.header>

      <AnimatePresence>
        {state.status !== "done" && (
          <div className="mb-6" key="progress">
            <ProcessingCard state={state} hasSlides={!!lecture.slides} onRetry={retry} />
          </div>
        )}
      </AnimatePresence>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
        <motion.section
          aria-label="Lecture video"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <VideoPlayer
            src={lecture.videoUrl}
            title={lecture.courseName}
            ref={playerRef}
            cues={cues}
            settings={settings}
            onActiveCueChange={setActiveCueId}
          />
        </motion.section>

        <motion.section
          aria-label="Lecture tools"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
          className="lg:sticky lg:top-8 lg:max-h-[calc(100dvh-4rem)]"
        >
          <SidePanel
            settings={settings}
            onSettingsChange={setSettings}
            pipeline={state}
            activeCueId={activeCueId}
            onSeek={(t) => playerRef.current?.seek(t)}
          />
        </motion.section>
      </div>
    </main>
  );
}
