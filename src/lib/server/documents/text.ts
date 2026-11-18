import "server-only";
import { DocumentError, MAX_UNIT_CHARS, MAX_UNITS_PER_DOC, splitText, type Unit } from "./errors";

/** Decodes an uploaded text file. Binary files are refused instead of turned into garbage. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.subarray(0, 8192).includes(0)) throw new DocumentError("This looks like a binary file, not text.");
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

export const shorten = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * Cuts lines `first..last` (1-based, inclusive) into passages of about one chunk each, preferring
 * to break at a blank line. Each passage is labelled with its exact line range.
 */
export function lineBlocks(lines: string[], first = 1, last = lines.length, max = MAX_UNIT_CHARS): Unit[] {
  const len = (ln: number) => Math.min(lines[ln - 1].length, max) + 1;
  const spans: [number, number][] = [];
  let a = first;
  let size = 0;
  let blank = -1;
  for (let ln = first; ln <= last; ln++) {
    if (size + len(ln) > max && ln > a) {
      const cut = blank >= a + 2 ? blank : ln - 1; // prefer a paragraph boundary
      spans.push([a, cut]);
      a = cut + 1;
      size = 0;
      blank = -1;
      for (let k = a; k < ln; k++) {
        size += len(k);
        if (!lines[k - 1].trim()) blank = k;
      }
    }
    size += len(ln);
    if (!lines[ln - 1].trim()) blank = ln;
  }
  if (a <= last) spans.push([a, last]);

  const out: Unit[] = [];
  for (let [s, e] of spans) {
    while (s <= e && !lines[s - 1].trim()) s++;
    while (e >= s && !lines[e - 1].trim()) e--;
    if (s > e) continue;
    const text = lines.slice(s - 1, e).map((l) => (l.length > max ? `${l.slice(0, max)} …` : l)).join("\n");
    out.push({ locator: s === e ? `line ${s}` : `lines ${s}-${e}`, text });
  }
  return out;
}

/** Plain text: passages labelled by line range. */
export function readPlainText(text: string): Unit[] {
  return lineBlocks(text.split("\n")).slice(0, MAX_UNITS_PER_DOC);
}

const plainHeading = (s: string) =>
  s
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+#+\s*$/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();

/** Markdown: passages by heading (headings inside code fences are ignored). */
export function readMarkdown(text: string): Unit[] {
  const lines = text.split("\n");
  const marks: { line: number; title: string }[] = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    else if (!fence && /^#{1,6}\s+\S/.test(l)) marks.push({ line: i, title: plainHeading(l) });
  });
  if (marks.length === 0) return lineBlocks(lines).slice(0, MAX_UNITS_PER_DOC); // no structure: by lines

  const units: Unit[] = [];
  const sections = [
    ...(marks[0].line > 0 ? [{ line: 0, title: "" }] : []),
    ...marks,
  ];
  sections.forEach((s, i) => {
    const end = i + 1 < sections.length ? sections[i + 1].line : lines.length;
    const body = lines.slice(s.line, end).join("\n").trim();
    if (!body) return;
    const base = s.title ? shorten(s.title) : "Start of document";
    splitText(body).forEach((part, k) => units.push({ locator: k === 0 ? base : `${base} (part ${k + 1})`, text: part }));
  });
  return units.slice(0, MAX_UNITS_PER_DOC);
}
