"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Tabs } from "@/components/ui/Tabs";
import type { ExportKind } from "@/lib/captions/export";
import type { PipelineState } from "../captions/useCaptionPipeline";
import type { ReviewModel } from "../review/useCaptionReview";
import { AskTab } from "./tabs/AskTab";
import { CaptionsTab } from "./tabs/CaptionsTab";
import { ReviewTab, type ReviewRequest } from "./tabs/ReviewTab";

interface Props {
  pipeline: PipelineState;
  onRetry: () => void;
  /** Term checking still running or failed: "all reviewed" isn't final yet. */
  incomplete: boolean;
  review: ReviewModel;
  activeCueId: string | null;
  onSeek: (seconds: number) => void;
  tab: string;
  onTabChange: (id: string) => void;
  reviewRequest: ReviewRequest | null;
  onReviewRequestHandled: () => void;
  onOpenReview: (editId?: string) => void;
  onPlayClip: (start: number, end: number) => void;
  onDownload: (kind: ExportKind) => void;
}

export function SidePanel({
  pipeline,
  onRetry,
  incomplete,
  review,
  activeCueId,
  onSeek,
  tab,
  onTabChange,
  reviewRequest,
  onReviewRequestHandled,
  onOpenReview,
  onPlayClip,
  onDownload,
}: Props) {
  return (
    <GlassPanel className="flex h-full min-h-[28rem] flex-col p-5 sm:p-6">
      <Tabs
        label="Lecture tools"
        value={tab}
        onValueChange={onTabChange}
        items={[
          {
            id: "captions",
            label: "Captions",
            content: (
              <CaptionsTab
                pipeline={pipeline}
                onRetry={onRetry}
                review={review}
                activeCueId={activeCueId}
                onSeek={onSeek}
                onOpenReview={onOpenReview}
              />
            ),
          },
          {
            id: "review",
            label: review.pending > 0 ? `Review (${review.pending})` : "Review",
            content: (
              <ReviewTab
                review={review}
                status={pipeline.status}
                incomplete={incomplete}
                request={reviewRequest}
                onRequestHandled={onReviewRequestHandled}
                onPlayClip={onPlayClip}
                onDownload={onDownload}
              />
            ),
          },
          { id: "ask", label: "Ask this lecture", content: <AskTab /> },
        ]}
      />
    </GlassPanel>
  );
}
