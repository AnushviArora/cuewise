import "server-only";
import { XMLParser } from "fast-xml-parser";
import { DocumentError } from "./errors";

/** A node from the ordered parse: `{ "a:p": [children...], ":@": { "@_attr": "value" } }`. */
export type XNode = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

/**
 * Parses XML from an Office file. Office documents never need a DTD, so any DOCTYPE or
 * ENTITY declaration (the basis of "billion laughs" attacks) is refused outright.
 */
export function parseXml(xml: string): XNode[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new DocumentError("This file contains content that can’t be read safely.");
  try {
    return parser.parse(xml) as XNode[];
  } catch {
    throw new DocumentError("This file’s contents couldn’t be read.");
  }
}

export const tagOf = (n: XNode): string => Object.keys(n).find((k) => k !== ":@") ?? "";

export function kids(n: XNode): XNode[] {
  const v = n[tagOf(n)];
  return Array.isArray(v) ? (v as XNode[]) : [];
}

export function attr(n: XNode | undefined, name: string): string | undefined {
  const a = (n?.[":@"] as Record<string, string> | undefined)?.[`@_${name}`];
  return a;
}

/** First direct child with this tag. */
export const child = (nodes: XNode[], tag: string): XNode | undefined => nodes.find((n) => tagOf(n) === tag);

/** First descendant with this tag (depth-first). */
export function findDeep(nodes: XNode[], tag: string): XNode | undefined {
  for (const n of nodes) {
    if (tagOf(n) === tag) return n;
    const hit = findDeep(kids(n), tag);
    if (hit) return hit;
  }
  return undefined;
}

/** Concatenated text of a node's direct text children. */
export function textOf(nodes: XNode[]): string {
  let s = "";
  for (const n of nodes) if ("#text" in n) s += String(n["#text"]);
  return s;
}
