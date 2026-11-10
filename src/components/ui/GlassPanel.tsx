import type { HTMLAttributes } from "react";

/** Soft frosted-glass surface used for all major panels. */
export function GlassPanel({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/[0.04] shadow-glass backdrop-blur-xl ${className}`}
      {...rest}
    />
  );
}
