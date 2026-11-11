"use client";

import { forwardRef, useEffect } from "react";
import { CloseIcon } from "@/components/ui/Icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Slider } from "@/components/ui/Slider";
import { DEFAULT_CAPTION_SETTINGS, FONT_SIZE_RANGE } from "@/lib/captions/settings";
import type { CaptionSettings } from "@/lib/captions/types";
import { PositionPicker } from "./PositionPicker";

interface Props {
  id: string;
  settings: CaptionSettings;
  onChange: (next: CaptionSettings) => void;
  onClose: () => void;
  className?: string;
}

/** Small caption settings panel that sits over the video, so every change is seen instantly. */
export const CaptionSettingsPanel = forwardRef<HTMLDivElement, Props>(function CaptionSettingsPanel(
  { id, settings, onChange, onClose, className = "" },
  ref,
) {
  const set = <K extends keyof CaptionSettings>(key: K, value: CaptionSettings[K]) =>
    onChange({ ...settings, [key]: value });

  // Move focus into the panel when it opens, so keyboard users can start right away.
  useEffect(() => {
    const el = document.getElementById(id);
    el?.focus({ preventScroll: true });
  }, [id]);

  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label="Caption settings"
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      className={`space-y-3.5 overflow-y-auto rounded-2xl border border-white/15 bg-[#12131b]/95 p-4 shadow-glass outline-none backdrop-blur-md ${className}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Caption settings</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close caption settings"
          className="-mr-1 grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-white/10 hover:text-ink"
        >
          <CloseIcon width={16} height={16} />
        </button>
      </div>

      <SegmentedControl
        compact
        legend="Rows"
        value={settings.rows}
        onChange={(v) => set("rows", v)}
        options={[
          { value: 1, label: "1" },
          { value: 2, label: "2" },
          { value: 3, label: "3" },
        ]}
      />

      <div className="flex items-center justify-between gap-3">
        <span id={`${id}-pos`} className="text-sm font-medium">
          Position
        </span>
        <PositionPicker
          vertical={settings.position}
          horizontal={settings.horizontal}
          onChange={(position, horizontal) => onChange({ ...settings, position, horizontal })}
        />
      </div>

      <Slider
        label="Font size"
        {...FONT_SIZE_RANGE}
        value={settings.fontSize}
        display={`${Math.round((settings.fontSize / DEFAULT_CAPTION_SETTINGS.fontSize) * 100)}%`}
        onChange={(v) => set("fontSize", v)}
      />

      <SegmentedControl
        compact
        legend="Alignment"
        value={settings.align}
        onChange={(v) => set("align", v)}
        options={[
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ]}
      />

      <button
        type="button"
        onClick={() => onChange(DEFAULT_CAPTION_SETTINGS)}
        className="w-full rounded-xl border border-edge bg-white/[0.04] px-3 py-2 text-sm text-ink transition-colors hover:border-ink/60 hover:bg-white/[0.09]"
      >
        Reset to defaults
      </button>
    </div>
  );
});
