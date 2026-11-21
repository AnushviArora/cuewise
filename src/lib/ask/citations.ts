import type { AskPart, AskSource } from "@/lib/ai/contracts";

export type Segment = { kind: "text"; text: string } | { kind: "cite"; ids: string[] };

const CITE = /\[([TS]\d+(?:\s*[,;]\s*[TS]\d+)*)\]/g;

/**
 * Splits an answer into plain text and citations. Only ids in `valid` (the excerpts that
 * were actually sent) survive, so an invented [T99] never becomes a link. While streaming,
 * a half-written "[T" at the end is held back instead of flashing on screen.
 */
export function parseAnswer(text: string, valid: Set<string>, streaming: boolean): Segment[] {
  let src = text;
  if (streaming) src = src.replace(/\[[^\]]{0,24}$/, "");
  const out: Segment[] = [];
  let at = 0;
  const pushText = (t: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last?.kind === "text") last.text += t;
    else out.push({ kind: "text", text: t });
  };
  for (const m of src.matchAll(CITE)) {
    pushText(src.slice(at, m.index));
    at = m.index! + m[0].length;
    const ids = [...new Set(m[1].split(/[,;]/).map((s) => s.trim()))].filter((id) => valid.has(id));
    if (ids.length === 0) continue; // invented id: drop the marker
    const last = out[out.length - 1];
    if (last?.kind === "cite") last.ids = [...new Set([...last.ids, ...ids])];
    else out.push({ kind: "cite", ids });
  }
  pushText(src.slice(at));
  return out;
}

/** Valid ids cited in an answer, in order of first appearance. */
export function citedIds(text: string, valid: Set<string>): string[] {
  const ids: string[] = [];
  for (const s of parseAnswer(text, valid, false)) if (s.kind === "cite") for (const id of s.ids) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** An answer part after checking it against what retrieval actually found. */
export interface CheckedPart {
  source: AskSource;
  text: string;
  /** Valid excerpt ids only: cited inline or listed by the model. */
  citations: string[];
}

/**
 * Retrieval, not the model, has the last word on a part's label. "lecture" needs a cited
 * transcript passage that was found as an answer; "materials" needs a cited file passage.
 * Anything else becomes "general". Ids that were never sent are dropped.
 * @param sent every id sent to the model; @param answering the ids that were real matches
 */
export function checkParts(parts: AskPart[], sent: Set<string>, answering: Set<string>): CheckedPart[] {
  const out: CheckedPart[] = [];
  for (const p of parts) {
    const text = typeof p?.text === "string" ? p.text.trim() : "";
    if (!text) continue;
    const listed = Array.isArray(p.citations) ? p.citations.map(String) : [];
    const citations = [...new Set([...citedIds(text, sent), ...listed.filter((id) => sent.has(id))])];
    const real = citations.filter((id) => answering.has(id));
    let source: AskSource = "general";
    if (p.source === "lecture" || p.source === "materials") {
      if (real.some((id) => id.startsWith("T"))) source = "lecture";
      else if (real.some((id) => id.startsWith("S"))) source = "materials";
    }
    out.push({ source, text, citations });
  }
  return out;
}
