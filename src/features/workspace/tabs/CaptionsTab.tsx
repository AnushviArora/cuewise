"use client";

import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Slider } from "@/components/ui/Slider";
import {
  DEFAULT_CAPTION_SETTINGS,
  FONT_SIZE_RANGE,
  INDENT_RANGE,
} from "@/lib/captions/settings";
import type { CaptionCue, CaptionPosition, CaptionSettings } from "@/lib/captions/types";

/** Tiny frame icon showing where the caption bar sits. */
function PositionGlyph({ at }: { at: CaptionPosition }) {
  const y = at === "top" ? 3 : at === "middle" ? 8 : 13;
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden focusable="false">
      <rect x="1" y="1" width="14" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="4" y={y - 1} width="8" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

interface Props {
  settings: CaptionSettings;
  onChange: (next: CaptionSettings) => void;
  cue: CaptionCue;
}

export function CaptionsTab({ settings, onChange, cue }: Props) {
  const set = <K extends keyof CaptionSettings>(key: K, value: CaptionSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Caption display</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Changes appear on the video instantly. Move captions away from slide content so
          they never hide diagrams or equations.
        </p>
      </div>

      <SegmentedControl
        legend="Rows"
        value={settings.rows}
        onChange={(v) => set("rows", v)}
        options={[
          { value: 1, label: "1" },
          { value: 2, label: "2" },
          { value: 3, label: "3" },
        ]}
      />
      <SegmentedControl
        legend="Position"
        value={settings.position}
        onChange={(v) => set("position", v)}
        options={(["top", "middle", "bottom"] as const).map((p) => ({
          value: p,
          label: p[0].toUpperCase() + p.slice(1),
          icon: <PositionGlyph at={p} />,
        }))}
      />
      <SegmentedControl
        legend="Alignment"
        value={settings.align}
        onChange={(v) => set("align", v)}
        options={[
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ]}
      />
      <Slider
        label="Indentation"
        {...INDENT_RANGE}
        value={settings.indent}
        display={`${settings.indent}%`}
        onChange={(v) => set("indent", v)}
      />
      <Slider
        label="Font size"
        {...FONT_SIZE_RANGE}
        value={settings.fontSize}
        display={`${Math.round((settings.fontSize / DEFAULT_CAPTION_SETTINGS.fontSize) * 100)}%`}
        onChange={(v) => set("fontSize", v)}
      />

      <Button variant="ghost" className="w-full" onClick={() => onChange(DEFAULT_CAPTION_SETTINGS)}>
        Reset to defaults
      </Button>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">Sample caption</p>
        <p className="mt-2 text-sm leading-relaxed text-ink">{cue.text}</p>
        <p className="mt-2 text-xs text-muted">
          Real captions will replace this once transcription is added.
        </p>
      </div>
    </div>
  );
}
