"use client";

import { useCallback, useMemo, useState } from "react";
import { editState, rawCues, renderCues } from "@/lib/captions/corrections";
import type { CaptionCue, CaptionEdit, CaptionResult, EditDecision, EditState } from "@/lib/captions/types";

/**
 * The single source of truth for reviewed captions. Display cues are always derived from
 * the raw transcript + edits + decisions, so every decision updates the video overlay,
 * transcript and downloads at once, and any decision can be undone.
 */
export function useCaptionReview(result: CaptionResult | null, ownerKey: string) {
  // Decisions are stored WITH the lecture they were made on (corrections stream in, so the
  // result object changes often; the lecture does not). Decisions for any other lecture are
  // ignored immediately, since edit ids like "c1.1" repeat across lectures.
  const [store, setStore] = useState<{ owner: string; map: Record<string, EditDecision> }>({
    owner: "",
    map: {},
  });
  const decisions = useMemo(() => (store.owner === ownerKey ? store.map : {}), [store, ownerKey]);

  const raw = useMemo(() => (result ? rawCues(result.cues) : []), [result]);
  const edits = useMemo(() => result?.edits ?? [], [result]);
  const cues = useMemo(() => renderCues(raw, edits, decisions), [raw, edits, decisions]);

  const rawById = useMemo(() => new Map(raw.map((c) => [c.id, c])), [raw]);
  const editById = useMemo(() => new Map(edits.map((e) => [e.id, e])), [edits]);

  const reviewItems = useMemo(() => edits.filter((e) => e.status === "needs_review"), [edits]);
  // Capitalization-only fixes (a name or acronym) are applied silently: not real corrections.
  const autoItems = useMemo(() => edits.filter((e) => e.status === "applied" && !e.caseOnly), [edits]);

  const pending = reviewItems.filter((e) => !decisions[e.id]).length;
  const autoFixed = autoItems.filter((e) => decisions[e.id]?.kind !== "kept").length;

  const decide = useCallback(
    (editId: string, d: EditDecision) =>
      setStore((cur) => ({
        owner: ownerKey,
        map: { ...(cur.owner === ownerKey ? cur.map : {}), [editId]: d },
      })),
    [ownerKey],
  );
  const clear = useCallback(
    (editId: string) =>
      setStore((cur) => {
        if (cur.owner !== ownerKey) return cur;
        const { [editId]: _removed, ...rest } = cur.map;
        return { owner: ownerKey, map: rest };
      }),
    [ownerKey],
  );
  const stateOf = useCallback(
    (e: CaptionEdit): EditState => editState(e, decisions[e.id]),
    [decisions],
  );

  return {
    cues,
    edits,
    rawById,
    editById,
    decisions,
    reviewItems,
    autoItems,
    pending,
    autoFixed,
    decide,
    clear,
    stateOf,
  };
}

export type ReviewModel = ReturnType<typeof useCaptionReview>;
export type { CaptionCue };
