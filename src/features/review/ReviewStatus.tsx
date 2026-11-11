"use client";

import { motion } from "framer-motion";
import { AlertIcon, ArrowRightIcon, CheckIcon } from "@/components/ui/Icons";
import type { ReviewModel } from "./useCaptionReview";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The workspace-level review status. Clicking it opens the Review queue. */
export function ReviewStatus({
  review,
  incomplete,
  onOpen,
}: {
  review: ReviewModel;
  /** Term checking is still running or failed, so the list may not be complete. */
  incomplete: boolean;
  onOpen: () => void;
}) {
  if (review.reviewItems.length + review.autoItems.length === 0) return null;
  const { pending, autoFixed } = review;
  const done = pending === 0 && !incomplete;
  const fixed = autoFixed > 0 ? ` · ${autoFixed} fixed automatically` : "";

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.995 }}
      className={`mb-6 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
        done
          ? "border-emerald-300/40 bg-emerald-300/10 hover:bg-emerald-300/15"
          : "border-amber-300/50 bg-amber-300/10 hover:bg-amber-300/15"
      }`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
          done ? "bg-emerald-300/20 text-emerald-200" : "bg-amber-300/20 text-amber-200"
        }`}
      >
        {done ? <CheckIcon /> : <AlertIcon />}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">
        {done
          ? `All captions reviewed. Ready to publish.${fixed}`
          : pending === 0
            ? `Nothing to review so far${fixed}`
            : `${plural(pending, "word needs review", "words need review")}${incomplete ? " so far" : ""}${fixed}`}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-ink">
        {done ? "Open review" : "Start review"} <ArrowRightIcon width={16} height={16} />
      </span>
    </motion.button>
  );
}
