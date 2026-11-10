"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Accessible tabs (WAI-ARIA "tabs" pattern): roving tabindex, Arrow/Home/End
 * keys, animated indicator and cross-fade between panels.
 */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  const uid = useId();
  const [active, setActive] = useState(items[0].id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: string) => {
    setActive(id);
    refs.current[id]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const next =
      e.key === "ArrowRight" ? (index + 1) % items.length
      : e.key === "ArrowLeft" ? (index - 1 + items.length) % items.length
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    select(items[next].id);
  };

  const current = items.find((t) => t.id === active) ?? items[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label={label} className="flex gap-1 rounded-2xl bg-black/30 p-1">
        {items.map((tab, i) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[tab.id] = el;
              }}
              role="tab"
              id={`${uid}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`relative flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                selected ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {selected && (
                <motion.span
                  layoutId={`${uid}-indicator`}
                  className="absolute inset-0 rounded-xl border border-white/10 bg-white/10"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="relative mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id}
            role="tabpanel"
            id={`${uid}-panel-${current.id}`}
            aria-labelledby={`${uid}-tab-${current.id}`}
            tabIndex={0}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="rounded-xl"
          >
            {current.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
