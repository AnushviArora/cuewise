import type { CaptionCue, CaptionEdit, EditState } from "@/lib/captions/types";
import type { ReviewModel } from "./useCaptionReview";

const STYLE: Record<EditState, string> = {
  // Needs review: strong amber fill, ring and thick underline (shape, not just colour).
  pending:
    "rounded px-1 py-px bg-amber-300/25 font-medium text-amber-50 ring-1 ring-amber-300/60 underline decoration-amber-300 decoration-2 underline-offset-[3px]",
  auto: "rounded px-0.5 bg-accent/20 underline decoration-accent/70 decoration-1 underline-offset-2",
  accepted:
    "rounded px-0.5 bg-emerald-300/20 underline decoration-emerald-300/80 decoration-1 underline-offset-2",
  edited:
    "rounded px-0.5 bg-emerald-300/20 underline decoration-emerald-300/80 decoration-1 underline-offset-2",
  kept: "rounded px-0.5 underline decoration-subtle decoration-dotted decoration-1 underline-offset-2",
};

function describe(edit: CaptionEdit, state: EditState): string {
  switch (state) {
    case "pending":
      return `Needs review: might be “${edit.corrected}” (from “${edit.term}” in your documents)`;
    case "auto":
      return `Corrected from “${edit.original}” to match “${edit.term}” in your documents`;
    case "accepted":
      return `Reviewed: accepted “${edit.corrected}”`;
    case "edited":
      return `Reviewed: edited by you (heard “${edit.original}”)`;
    case "kept":
      return `Reviewed: kept as heard (“${edit.original}”)`;
  }
}

interface Props {
  cue: CaptionCue;
  review: ReviewModel;
  /** When given, marked words become buttons that open that word in the review queue. */
  onMarkClick?: (editId: string) => void;
}

/** A cue's text with its corrected / flagged words marked by review state. */
export function CueText({ cue, review, onMarkClick }: Props) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const m of cue.marks ?? []) {
    const edit = review.editById.get(m.editId);
    if (!edit || edit.caseOnly) continue; // silent capitalization: show as plain text
    parts.push(cue.text.slice(at, m.start));
    const state = review.stateOf(edit);
    const word = cue.text.slice(m.start, m.end);
    const tip = describe(edit, state);
    parts.push(
      onMarkClick ? (
        <button
          key={m.start}
          type="button"
          title={tip}
          aria-label={`${word}. ${tip}. Open in review.`}
          onClick={(e) => {
            e.stopPropagation();
            onMarkClick(edit.id);
          }}
          className={`inline cursor-pointer text-inherit transition-[filter] hover:brightness-125 ${STYLE[state]}`}
        >
          {word}
        </button>
      ) : (
        <mark key={m.start} title={tip} className={`text-inherit ${STYLE[state]}`}>
          {word}
        </mark>
      ),
    );
    at = m.end;
  }
  parts.push(cue.text.slice(at));
  return <>{parts}</>;
}

/** Colour key matching the marker styles. */
export function MarkerLegend() {
  const chip = "mx-0.5 inline-block rounded px-1.5";
  return (
    <p className="text-xs leading-relaxed text-muted">
      <span className={`${chip} ${STYLE.pending}`}>Needs review</span>
      <span className={`${chip} ${STYLE.auto}`}>Fixed automatically</span>
      <span className={`${chip} ${STYLE.accepted}`}>Reviewed</span>
    </p>
  );
}
