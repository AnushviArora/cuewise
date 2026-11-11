"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CheckIcon } from "@/components/ui/Icons";
import { PLAYBACK_RATES, formatRate } from "@/lib/playback";

/** Playback speed button + menu (WAI-ARIA menu button, radio items). Opens upward. */
export function SpeedMenu({ rate, onChange }: { rate: number; onChange: (r: number) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };

  // Focus the current speed when opening; close when clicking elsewhere.
  useEffect(() => {
    if (!open) return;
    items.current[PLAYBACK_RATES.indexOf(rate)]?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onMenuKey = (e: KeyboardEvent) => {
    const i = items.current.findIndex((el) => el === document.activeElement);
    const n = PLAYBACK_RATES.length;
    const go = (to: number) => {
      e.preventDefault();
      items.current[(to + n) % n]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(n - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Playback speed, ${formatRate(rate)}`}
        onClick={() => setOpen((v) => !v)}
        className={`grid h-10 min-w-[3.25rem] place-items-center rounded-lg px-2 text-sm font-semibold tabular-nums transition-colors hover:bg-white/10 ${
          rate === 1 ? "text-ink" : "text-accent"
        }`}
      >
        {formatRate(rate)}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Playback speed"
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute bottom-full right-0 z-20 mb-2 w-36 origin-bottom-right rounded-xl border border-white/15 bg-[#161722] p-1 shadow-glass"
          >
            {PLAYBACK_RATES.map((r, i) => {
              const selected = r === rate;
              return (
                <button
                  key={r}
                  ref={(el) => {
                    items.current[i] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  tabIndex={-1}
                  onClick={() => {
                    onChange(r);
                    close(true);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm tabular-nums transition-colors hover:bg-white/10 ${
                    selected ? "text-accent" : "text-ink"
                  }`}
                >
                  <span>{r === 1 ? "1× (Normal)" : formatRate(r)}</span>
                  {selected && <CheckIcon width={16} height={16} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
