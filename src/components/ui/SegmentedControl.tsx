"use client";

import { useId, type ReactNode } from "react";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface Props<T extends string | number> {
  legend: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  /** Label and options on one line, with tighter buttons (for small panels). */
  compact?: boolean;
}

/** Radio group styled as a segmented control. Native radios give arrow-key support for free. */
export function SegmentedControl<T extends string | number>({
  legend,
  value,
  options,
  onChange,
  compact = false,
}: Props<T>) {
  const name = useId();
  return (
    <fieldset className={compact ? "flex items-center justify-between gap-3" : undefined}>
      <legend className={compact ? "sr-only" : "mb-2 text-sm font-medium text-ink"}>{legend}</legend>
      {compact && (
        <span aria-hidden className="text-sm font-medium text-ink">
          {legend}
        </span>
      )}
      <div
        className={`grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-black/30 p-1 ${compact ? "ml-auto min-w-[8.5rem]" : ""}`}
      >
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          return (
            <div key={String(o.value)} className="relative">
              <input
                id={id}
                type="radio"
                name={name}
                checked={o.value === value}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-transparent px-2 text-muted transition-colors hover:text-ink peer-checked:border-accent/50 peer-checked:bg-accent-soft peer-checked:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${compact ? "py-1.5 text-xs" : "py-2 text-sm"}`}
              >
                {o.icon}
                {o.label}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
