"use client";

import { useId } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Human-readable value, e.g. "12%". */
  display: string;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step, display, onChange }: Props) {
  const id = useId();
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <output htmlFor={id} className="text-sm tabular-nums text-muted">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={display}
        className="h-2 w-full cursor-pointer accent-[#8b9bff]"
      />
    </div>
  );
}
