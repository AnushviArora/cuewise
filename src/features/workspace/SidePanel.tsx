"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Tabs } from "@/components/ui/Tabs";
import type { CaptionCue, CaptionSettings } from "@/lib/captions/types";
import { AskTab } from "./tabs/AskTab";
import { CaptionsTab } from "./tabs/CaptionsTab";
import { ReviewTab } from "./tabs/ReviewTab";

interface Props {
  settings: CaptionSettings;
  onSettingsChange: (next: CaptionSettings) => void;
  cue: CaptionCue;
}

export function SidePanel({ settings, onSettingsChange, cue }: Props) {
  return (
    <GlassPanel className="flex h-full min-h-[28rem] flex-col p-5 sm:p-6">
      <Tabs
        label="Lecture tools"
        items={[
          {
            id: "captions",
            label: "Captions",
            content: <CaptionsTab settings={settings} onChange={onSettingsChange} cue={cue} />,
          },
          { id: "review", label: "Review", content: <ReviewTab /> },
          { id: "ask", label: "Ask this lecture", content: <AskTab /> },
        ]}
      />
    </GlassPanel>
  );
}
