import "server-only";
import { DocumentError, MAX_UNIT_CHARS, MAX_UNITS_PER_DOC, splitText, type Unit } from "./errors";
import { readZipText } from "./zip";
import { attr, child, findDeep, kids, parseXml, tagOf, textOf, type XNode } from "./xml";

type Block = { heading: number; text: string };

interface StyleInfo {
  name: string;
  basedOn?: string;
}

function readStyles(xml: string | undefined): Map<string, StyleInfo> {
  const map = new Map<string, StyleInfo>();
  if (!xml) return map;
  const root = findDeep(parseXml(xml), "w:styles");
  for (const s of root ? kids(root) : []) {
    if (tagOf(s) !== "w:style") continue;
    const id = attr(s, "w:styleId");
    if (!id) continue;
    map.set(id, {
      name: (attr(child(kids(s), "w:name"), "w:val") ?? "").toLowerCase(),
      basedOn: attr(child(kids(s), "w:basedOn"), "w:val"),
    });
  }
  return map;
}

/** Heading level (1..9) of a paragraph from its outline level or (inherited) style, else 0. */
function headingLevel(pPr: XNode[], styles: Map<string, StyleInfo>): number {
  const outline = attr(child(pPr, "w:outlineLvl"), "w:val");
  if (outline !== undefined && /^\d$/.test(outline) && +outline < 9) return +outline + 1;
  let id = attr(child(pPr, "w:pStyle"), "w:val");
  for (let hops = 0; id && hops < 4; hops++) {
    const info = styles.get(id);
    const m = /^heading\s*(\d)/i.exec(info?.name ?? "") ?? /^heading(\d)$/i.exec(id);
    if (m) return +m[1];
    if (info?.name === "title") return 1;
    if (info?.name === "subtitle") return 2;
    id = info?.basedOn;
  }
  return 0;
}

/** Text of a paragraph: runs, tabs, line breaks, hyperlinks and tracked insertions. */
function runText(nodes: XNode[]): string {
  let s = "";
  for (const n of nodes) {
    switch (tagOf(n)) {
      case "w:r":
        for (const k of kids(n)) {
          const t = tagOf(k);
          if (t === "w:t") s += textOf(kids(k));
          else if (t === "w:tab" || t === "w:br" || t === "w:noBreakHyphen") s += t === "w:noBreakHyphen" ? "-" : " ";
        }
        break;
      case "w:hyperlink":
      case "w:ins":
      case "w:smartTag":
      case "w:fldSimple":
      case "w:sdt":
      case "w:sdtContent":
        s += runText(kids(n));
        break;
    }
  }
  return s;
}

/** Text boxes hide inside runs; their paragraphs are collected separately. */
function textboxParagraphs(nodes: XNode[], styles: Map<string, StyleInfo>, out: Block[]): void {
  for (const n of nodes) {
    if (tagOf(n) === "w:txbxContent") walkBlocks(kids(n), styles, out);
    else if (tagOf(n) === "mc:AlternateContent") {
      const choice = child(kids(n), "mc:Choice");
      if (choice) textboxParagraphs(kids(choice), styles, out);
    } else textboxParagraphs(kids(n), styles, out);
  }
}

function walkBlocks(nodes: XNode[], styles: Map<string, StyleInfo>, out: Block[]): void {
  for (const n of nodes) {
    switch (tagOf(n)) {
      case "w:p": {
        const pPr = kids(child(kids(n), "w:pPr") ?? {});
        const text = runText(kids(n)).replace(/\s+/g, " ").trim();
        const heading = headingLevel(pPr, styles);
        if (text) out.push({ heading, text: !heading && child(pPr, "w:numPr") ? `- ${text}` : text });
        textboxParagraphs(kids(n), styles, out);
        break;
      }
      case "w:tbl":
        for (const row of kids(n).filter((r) => tagOf(r) === "w:tr")) {
          const cells = kids(row)
            .filter((c) => tagOf(c) === "w:tc")
            .map((c) => {
              const inner: Block[] = [];
              walkBlocks(kids(c), styles, inner);
              return inner.map((b) => b.text).join(" ");
            });
          if (cells.some(Boolean)) out.push({ heading: 0, text: cells.join(" | ") });
        }
        break;
      case "mc:AlternateContent": {
        const choice = child(kids(n), "mc:Choice");
        if (choice) walkBlocks(kids(choice), styles, out);
        break;
      }
      case "w:document":
      case "w:body":
      case "w:sdt":
      case "w:sdtContent":
      case "w:ins":
      case "w:customXml":
      case "w:smartTag":
        walkBlocks(kids(n), styles, out);
        break;
    }
  }
}

const shorten = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Passages by heading (or by paragraph blocks when the document has no headings). */
export function readDocx(data: Uint8Array): Unit[] {
  const parts = readZipText(data, (n) => n === "word/document.xml" || n === "word/styles.xml");
  const doc = parts.get("word/document.xml");
  if (!doc) throw new DocumentError("This doesn’t look like a Word (.docx) file.");
  const styles = readStyles(parts.get("word/styles.xml"));
  const blocks: Block[] = [];
  walkBlocks(parseXml(doc), styles, blocks);
  if (blocks.length === 0) return [];

  const units: Unit[] = [];
  const hasHeadings = blocks.some((b) => b.heading > 0);
  let title = "";
  let body: string[] = [];
  let sectionNo = 0;

  const flush = () => {
    const text = body.join("\n");
    body = [];
    if (!text.trim() && !title) return;
    const parts = splitText(title ? `${title}\n${text}` : text, MAX_UNIT_CHARS);
    sectionNo++;
    const base = title ? shorten(title) : hasHeadings ? "Start of document" : `Section ${sectionNo}`;
    parts.forEach((p, i) => units.push({ locator: i === 0 ? base : `${base} (part ${i + 1})`, text: p }));
    title = "";
  };

  for (const b of blocks) {
    if (b.heading > 0) {
      flush();
      title = b.text;
    } else {
      body.push(b.text);
      // Without headings, cut into blocks of roughly one passage each.
      if (!hasHeadings && body.join("\n").length > MAX_UNIT_CHARS * 0.8) flush();
    }
    if (units.length >= MAX_UNITS_PER_DOC) break;
  }
  flush();
  return units.slice(0, MAX_UNITS_PER_DOC);
}
