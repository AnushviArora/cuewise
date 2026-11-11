"use client";

import { useRef, type KeyboardEvent } from "react";
import type { CaptionHorizontal, CaptionPosition } from "@/lib/captions/types";

const ROWS: CaptionPosition[] = ["top", "middle", "bottom"];
const COLS: CaptionHorizontal[] = ["left", "center", "right"];
const JUSTIFY = { left: "justify-start", center: "justify-center", right: "justify-end" } as const;

const name = (v: CaptionPosition, h: CaptionHorizontal) =>
  v === "middle" && h === "center" ? "Center" : `${v[0].toUpperCase()}${v.slice(1)} ${h}`;

interface Props {
  vertical: CaptionPosition;
  horizontal: CaptionHorizontal;
  onChange: (vertical: CaptionPosition, horizontal: CaptionHorizontal) => void;
}

/**
 * 3x3 picker (like a tic-tac-toe board) drawn as a tiny video frame. The highlighted bar
 * shows exactly where the captions sit. Radio group semantics: one tab stop, arrow keys
 * move the selection in two dimensions.
 */
export function PositionPicker({ vertical, horizontal, onChange }: Props) {
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, r: number, c: number) => {
    const d =
      e.key === "ArrowLeft" ? [0, -1]
      : e.key === "ArrowRight" ? [0, 1]
      : e.key === "ArrowUp" ? [-1, 0]
      : e.key === "ArrowDown" ? [1, 0]
      : null;
    if (!d) return;
    e.preventDefault();
    const nr = Math.min(2, Math.max(0, r + d[0]));
    const nc = Math.min(2, Math.max(0, c + d[1]));
    onChange(ROWS[nr], COLS[nc]);
    cells.current[nr * 3 + nc]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Caption position"
      className="grid aspect-video w-[8.75rem] shrink-0 grid-cols-3 grid-rows-3 gap-px overflow-hidden rounded-lg border border-white/20 bg-white/15"
    >
      {ROWS.map((v, r) =>
        COLS.map((h, c) => {
          const selected = v === vertical && h === horizontal;
          return (
            <button
              key={`${v}-${h}`}
              ref={(el) => {
                cells.current[r * 3 + c] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={name(v, h)}
              title={name(v, h)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(v, h)}
              onKeyDown={(e) => onKeyDown(e, r, c)}
              className={`flex items-center px-1 transition-colors focus-visible:z-10 ${JUSTIFY[h]} ${
                selected ? "bg-accent/25" : "bg-[#12131b] hover:bg-white/10"
              }`}
            >
              {selected ? (
                <span className="h-2 w-[85%] rounded-full bg-accent" />
              ) : (
                <span className="h-1 w-1 rounded-full bg-white/30" />
              )}
            </button>
          );
        }),
      )}
    </div>
  );
}
