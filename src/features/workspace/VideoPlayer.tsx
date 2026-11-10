"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  CaptionsIcon,
  FullscreenIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  VolumeIcon,
} from "@/components/ui/Icons";
import type { CaptionCue, CaptionSettings } from "@/lib/captions/types";
import { CaptionOverlay } from "./CaptionOverlay";

const SKIP_SECONDS = 5;

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

interface Props {
  src: string;
  title: string;
  cue: CaptionCue | null;
  settings: CaptionSettings;
}

/**
 * Video with a caption overlay. Controls sit *below* the picture (not over it),
 * so bottom-positioned captions are never hidden by the player UI.
 */
export function VideoPlayer({ src, title, cue, settings }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);

  useEffect(() => {
    setCanFullscreen(document.fullscreenEnabled);
    const onChange = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    setError(false);
    setPlaying(false);
    setTime(0);
  }, [src]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setError(true));
    else v.pause();
  }, []);

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration || 0);
  };

  const onVideoKey = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      seekBy(-SKIP_SECONDS);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      seekBy(SKIP_SECONDS);
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen();
  };

  const ctrl =
    "grid h-10 w-10 place-items-center rounded-lg text-ink transition-colors hover:bg-white/10";

  return (
    <div
      ref={wrapRef}
      className={`flex flex-col overflow-hidden bg-black ${
        fullscreen ? "h-full w-full" : "rounded-3xl border border-white/10 shadow-glass"
      }`}
    >
      <div
        className={`relative bg-black [container-type:inline-size] ${
          fullscreen ? "min-h-0 flex-1" : "aspect-video"
        }`}
      >
        <video
          ref={videoRef}
          src={src}
          tabIndex={0}
          aria-label={`${title} lecture video. Press space to play or pause, left and right arrows to skip ${SKIP_SECONDS} seconds.`}
          onKeyDown={onVideoKey}
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          onError={() => setError(true)}
          playsInline
          className="absolute inset-0 h-full w-full cursor-pointer object-contain"
        />
        {captionsOn && !error && <CaptionOverlay cue={cue} settings={settings} />}

        {error && (
          <div role="alert" className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center">
            <p className="max-w-sm text-sm text-ink">
              This video couldn’t be played. Your browser may not support its encoding — try
              re-exporting it as H.264 MP4.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-white/10 bg-[#0d0e15] px-2 py-1.5">
        <button
          type="button"
          onClick={toggle}
          className={ctrl}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className="min-w-[5.5rem] px-1 text-xs tabular-nums text-muted">
          {fmt(time)} / {fmt(duration)}
        </span>
        <input
          type="range"
          aria-label="Seek"
          aria-valuetext={`${fmt(time)} of ${fmt(duration)}`}
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          onChange={(e) => {
            const t = Number(e.target.value);
            if (videoRef.current) videoRef.current.currentTime = t;
            setTime(t);
          }}
          className="mx-2 h-2 min-w-0 flex-1 cursor-pointer accent-[#8b9bff]"
        />
        <button
          type="button"
          onClick={() => {
            if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
          }}
          className={ctrl}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MuteIcon /> : <VolumeIcon />}
        </button>
        <button
          type="button"
          onClick={() => setCaptionsOn((v) => !v)}
          aria-pressed={captionsOn}
          aria-label="Captions"
          className={`${ctrl} ${captionsOn ? "text-accent" : "text-muted"}`}
        >
          <CaptionsIcon />
        </button>
        {canFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className={ctrl}
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          >
            <FullscreenIcon />
          </button>
        )}
      </div>
    </div>
  );
}
