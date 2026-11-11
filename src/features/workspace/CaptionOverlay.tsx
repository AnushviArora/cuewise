"use client";

import { motion } from "framer-motion";
import { splitIntoRows } from "@/lib/captions/settings";
import type { CaptionCue, CaptionSettings } from "@/lib/captions/types";

const VERTICAL = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;
const HORIZONTAL = { left: "flex-start", center: "center", right: "flex-end" } as const;

/** Shown while the settings panel is open and nothing is being said, so changes stay visible. */
export const SAMPLE_CUE: CaptionCue = {
  id: "sample",
  start: 0,
  end: 0,
  text: "This is how your captions will look on the lecture video.",
};

interface Props {
  /** The cue to show right now. */
  cue: CaptionCue | null;
  settings: CaptionSettings;
}

/**
 * Renders captions over the video. Its parent must set `container-type: inline-size`
 * so font size and spacing (cqw units) scale with the player, including fullscreen.
 *
 * The caption is a shrink-to-fit block that sits in one of nine places (top / middle /
 * bottom x left / center / right). Side positions use a narrower block so they sit clearly
 * to one side, leaving the rest of the slide or board uncovered.
 */
export function CaptionOverlay({ cue, settings }: Props) {
  if (!cue) return null;
  const { rows, position, horizontal, align, fontSize } = settings;
  const lines = splitIntoRows(cue.text, rows);

  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col"
      style={{
        justifyContent: VERTICAL[position],
        alignItems: HORIZONTAL[horizontal],
        padding: "3cqw",
      }}
    >
      <motion.div
        layout="position"
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        style={{
          fontSize: `${fontSize}cqw`,
          textAlign: align,
          lineHeight: 1.45,
          maxWidth: horizontal === "center" ? "94%" : "52%",
        }}
      >
        {lines.map((line, i) => (
          <p key={`${i}-${line}`}>
            <span className="box-decoration-clone rounded-[0.2em] bg-black/80 px-[0.5em] py-[0.12em] font-medium text-white">
              {line}
            </span>
          </p>
        ))}
      </motion.div>
    </div>
  );
}
