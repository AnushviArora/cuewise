"use client";

import { SparkIcon } from "@/components/ui/Icons";
import { AskPanel } from "@/features/ask/AskPanel";
import { Placeholder } from "./Placeholder";

interface Props {
  uploadId: string;
  courseName: string;
  /** Captions (the transcript) are ready, so questions can be answered. */
  ready: boolean;
  onSeek: (seconds: number) => void;
}

/** "Ask this lecture": grounded Q&A over this upload's transcript and slide text. */
export function AskTab({ uploadId, courseName, ready, onSeek }: Props) {
  if (!ready) {
    return (
      <Placeholder icon={<SparkIcon />} title="Questions open when captions are ready">
        Once the transcript is ready you can ask what the lecture covers and jump straight to the moment that
        answers it.
      </Placeholder>
    );
  }
  return <AskPanel uploadId={uploadId} courseName={courseName} onSeek={onSeek} />;
}
