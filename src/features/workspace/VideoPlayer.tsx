"use client";

import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { createPortal } from "react-dom";
import {
  CaptionsIcon,
  FullscreenIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  VolumeIcon,
} from "@/components/ui/Icons";
import { findCue } from "@/lib/captions/corrections";
import type { CaptionCue, CaptionSettings } from "@/lib/captions/types";
import { PLAYBACK_RATES, loadRate, saveRate } from "@/lib/playback";
import { CaptionOverlay, SAMPLE_CUE } from "./CaptionOverlay";
import { CaptionSettingsPanel } from "./CaptionSettingsPanel";
import { SpeedMenu } from "./SpeedMenu";

const SKIP_SECONDS = 5;

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export interface PlayerHandle {
  seek: (seconds: number) => void;
  /** Where the playhead is now, in seconds. */
  getTime: () => number;
  /** Jump to `start`, play, and pause automatically at `end` (at the current speed). */
  playClip: (start: number, end: number) => void;
}

interface Props {
  src: string;
  title: string;
  /** Real captions, sorted by time. The active cue is picked from the playhead. */
  cues: CaptionCue[];
  settings: CaptionSettings;
  /** Lets the on-video settings panel change caption display settings. */
  onSettingsChange: (next: CaptionSettings) => void;
  /** Called whenever the cue under the playhead changes (null = silence). */
  onActiveCueChange?: (id: string | null) => void;
  /** Start here once the video loads (from a shared link). Ignored if past the end. */
  startAt?: number;
  ref?: Ref<PlayerHandle>;
}

/**
 * Video with a caption overlay. Controls sit *below* the picture (not over it),
 * so bottom-positioned captions are never hidden by the player UI.
 */
/** Below this player width the settings panel becomes a bottom sheet instead of a side panel. */
const SIDE_PANEL_MIN_WIDTH = 520;
// Full class names (Tailwind can't see names built from pieces).
const SIDE_CLASS = { left: "left-3", right: "right-3" } as const;
const EDGE_CLASS = { top: "top-3", bottom: "bottom-3" } as const;

export function VideoPlayer({ src, title, cues, settings, onSettingsChange, onActiveCueChange, startAt, ref }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [boxWidth, setBoxWidth] = useState(1000);
  const boxRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const clipEnd = useRef<number | null>(null);
  const startApplied = useRef(false);

  useImperativeHandle(ref, () => ({
    getTime: () => videoRef.current?.currentTime ?? 0,
    seek: (t) => {
      const v = videoRef.current;
      if (!v) return;
      clipEnd.current = null;
      v.currentTime = Math.max(0, t);
      setTime(v.currentTime);
    },
    playClip: (start, end) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, start);
      setTime(v.currentTime);
      clipEnd.current = end;
      void v.play().catch(() => {
        clipEnd.current = null; // autoplay blocked: the reviewer can press play
      });
    },
  }));

  // Same page, new ?t= (e.g. another shared moment opened in this tab): jump there too.
  useEffect(() => {
    const v = videoRef.current;
    if (startAt && v && v.readyState >= 1 && startAt < v.duration && v.currentTime !== startAt) {
      v.currentTime = startAt;
      setTime(startAt);
    }
  }, [startAt]);

  // Keep the active cue in sync with the playhead. timeupdate only fires ~4x/second,
  // so while playing we also poll every frame (cheap: state only changes at cue edges).
  const syncCue = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    // Captions follow the media clock, so they stay in sync at every playback speed.
    setActiveId(findCue(cues, v.currentTime)?.id ?? null);
    if (clipEnd.current !== null && v.currentTime >= clipEnd.current) {
      clipEnd.current = null;
      v.pause();
    }
  }, [cues]);
  useEffect(() => {
    syncCue();
    if (!playing) return;
    let raf = requestAnimationFrame(function tick() {
      syncCue();
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, syncCue]);
  useEffect(() => onActiveCueChange?.(activeId), [activeId, onActiveCueChange]);
  const cue = activeId ? (cues.find((c) => c.id === activeId) ?? null) : null;
  // While the settings panel is open and no caption is showing (paused, silence, or CC off),
  // show a sample so every change is still visible on the video.
  const shownCue = settingsOpen && (!captionsOn || !cue) ? SAMPLE_CUE : captionsOn ? cue : null;
  // Keep the panel clear of the captions: opposite side of where they sit, and for centred
  // captions the opposite top/bottom edge. Small players use a bottom sheet instead.
  const placement =
    boxWidth >= SIDE_PANEL_MIN_WIDTH
      ? ({
          kind: "side",
          side: settings.horizontal === "right" ? "left" : "right",
          edge: settings.horizontal === "center" && settings.position === "bottom" ? "top" : "bottom",
        } as const)
      : ({ kind: "sheet", edge: settings.position === "bottom" ? "top" : "bottom" } as const);

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

  // Restore the saved speed, and re-apply it whenever the video element reloads.
  useEffect(() => setRate(loadRate()), []);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.defaultPlaybackRate = rate;
    v.playbackRate = rate;
  }, [rate, src]);
  const changeRate = useCallback((r: number) => {
    setRate(r);
    saveRate(r);
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setError(true));
    else v.pause();
  }, []);

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    clipEnd.current = null;
    v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration || 0);
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
    } else if (e.key === "<" || e.key === ">") {
      e.preventDefault();
      const i = PLAYBACK_RATES.indexOf(rate) + (e.key === ">" ? 1 : -1);
      changeRate(PLAYBACK_RATES[Math.min(PLAYBACK_RATES.length - 1, Math.max(0, i))]);
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen();
  };

  // Track the picture's width to choose between a side panel and a bottom sheet.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const closeSettings = useCallback((refocus: boolean) => {
    setSettingsOpen(false);
    if (refocus) gearRef.current?.focus();
  }, []);

  // Click anywhere outside the panel (and its button) closes it.
  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || gearRef.current?.contains(t)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [settingsOpen]);

  const ctrl =
    "grid h-10 w-10 place-items-center rounded-lg text-ink transition-colors hover:bg-white/10";

  return (
    <div
      ref={wrapRef}
      onKeyDown={(e) => {
        if (e.key === "Escape" && settingsOpen) {
          e.preventDefault();
          e.stopPropagation();
          closeSettings(true);
        }
      }}
      className={`flex flex-col overflow-hidden bg-black ${
        fullscreen ? "h-full w-full" : "rounded-3xl border border-white/10 shadow-glass"
      }`}
    >
      <div
        ref={boxRef}
        className={`relative bg-black [container-type:inline-size] ${
          fullscreen ? "min-h-0 flex-1" : "aspect-video max-md:max-h-[45dvh]"
        }`}
      >
        <video
          ref={videoRef}
          src={src}
          tabIndex={0}
          aria-label={`${title} lecture video. Press space to play or pause, left and right arrows to skip ${SKIP_SECONDS} seconds, less-than and greater-than to change speed.`}
          onKeyDown={onVideoKey}
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            clipEnd.current = null;
          }}
          onTimeUpdate={(e) => {
            setTime(e.currentTarget.currentTime);
            syncCue();
          }}
          onSeeked={syncCue}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setDuration(v.duration);
            v.playbackRate = rate;
            // Shared link: jump to the moment (not past the end), but don't autoplay.
            if (startAt && Number.isFinite(v.duration) && startAt < v.duration && !startApplied.current) {
              v.currentTime = startAt;
              setTime(startAt);
            }
            startApplied.current = true;
          }}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          onError={() => setError(true)}
          playsInline
          className="absolute inset-0 h-full w-full cursor-pointer object-contain"
        />
        {!error && <CaptionOverlay cue={shownCue} settings={settings} />}
        {settingsOpen && placement.kind === "side" && (
          <CaptionSettingsPanel
            ref={panelRef}
            id={panelId}
            settings={settings}
            onChange={onSettingsChange}
            onClose={() => closeSettings(true)}
            className={`absolute z-20 max-h-[calc(100%-1.5rem)] w-[16rem] ${SIDE_CLASS[placement.side]} ${EDGE_CLASS[placement.edge]}`}
          />
        )}
        {settingsOpen && placement.kind === "sheet" && fullscreen && (
          <CaptionSettingsPanel
            ref={panelRef}
            id={panelId}
            settings={settings}
            onChange={onSettingsChange}
            onClose={() => closeSettings(true)}
            className={`absolute inset-x-2 z-20 max-h-[70%] ${placement.edge === "top" ? "top-2" : "bottom-2"}`}
          />
        )}

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
            clipEnd.current = null;
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
        <button
          ref={gearRef}
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          aria-controls={settingsOpen ? panelId : undefined}
          aria-label="Caption settings"
          className={`${ctrl} ${settingsOpen ? "text-accent" : ""}`}
        >
          <SettingsIcon />
        </button>
        <SpeedMenu rate={rate} onChange={changeRate} />
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
      {settingsOpen &&
        placement.kind === "sheet" &&
        !fullscreen &&
        createPortal(
          <CaptionSettingsPanel
            ref={panelRef}
            id={panelId}
            settings={settings}
            onChange={onSettingsChange}
            onClose={() => closeSettings(true)}
            className="fixed inset-x-2 bottom-2 z-40 max-h-[52dvh]"
          />,
          document.body,
        )}
    </div>
  );
}
