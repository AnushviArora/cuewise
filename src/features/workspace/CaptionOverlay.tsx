"use client";

import { motion } from "framer-motion";
import { splitIntoRows } from "@/lib/captions/settings";
import type { CaptionCue, CaptionSettings } from "@/lib/captions/types";

const JUSTIFY = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

interface Props {
  /** The cue to show right now. Later: derive from currentTime + CaptionCue[]. */
  cue: CaptionCue | null;
  settings: CaptionSettings;
}

/**
 * Renders captions over the video. Its parent must set `container-type: inline-size`
 * so font size and spacing (cqw units) scale with the player, including fullscreen.
 */
export function CaptionOverlay({ cue, settings }: Props) {
  if (!cue) return null;
  const { rows, position, align, indent, fontSize } = settings;
  const lines = splitIntoRows(cue.text, rows);

  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col"
      style={{ justifyContent: JUSTIFY[position], padding: "3cqw" }}
    >
      <motion.div
        layout="position"
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        style={{
          fontSize: `${fontSize}cqw`,
          textAlign: align,
          paddingLeft: align === "right" ? 0 : `${indent}%`,
          paddingRight: align === "left" ? 0 : `${indent}%`,
          lineHeight: 1.45,
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
