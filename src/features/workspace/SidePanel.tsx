"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Tabs } from "@/components/ui/Tabs";
import type { PipelineState } from "../captions/useCaptionPipeline";
import { AskTab } from "./tabs/AskTab";
import { CaptionsTab } from "./tabs/CaptionsTab";
import { ReviewTab } from "./tabs/ReviewTab";

interface Props {
  pipeline: PipelineState;
  activeCueId: string | null;
  onSeek: (seconds: number) => void;
}

export function SidePanel({ pipeline, activeCueId, onSeek }: Props) {
  return (
    <GlassPanel className="flex h-full min-h-[28rem] flex-col p-5 sm:p-6">
      <Tabs
        label="Lecture tools"
        items={[
          {
            id: "captions",
            label: "Captions",
            content: (
              <CaptionsTab
                pipeline={pipeline}
                activeCueId={activeCueId}
                onSeek={onSeek}
              />
            ),
          },
          { id: "review", label: "Review", content: <ReviewTab /> },
          { id: "ask", label: "Ask this lecture", content: <AskTab /> },
        ]}
      />
    </GlassPanel>
  );
}
