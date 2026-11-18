import "server-only";
import { DocumentError, MAX_UNITS_PER_DOC, splitText, type Unit } from "./errors";
import { readZipText } from "./zip";
import { attr, child, findDeep, kids, parseXml, tagOf, textOf, type XNode } from "./xml";

const WANTED =
  /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|notesSlides\/notesSlide\d+\.xml)$/;

/** Text of one paragraph (a:p): its runs, fields and line breaks. */
function paraText(p: XNode): string {
  let s = "";
  for (const k of kids(p)) {
    const t = tagOf(k);
    if (t === "a:r" || t === "a:fld") {
      const run = child(kids(k), "a:t");
      if (run) s += textOf(kids(run));
    } else if (t === "a:br") s += " ";
  }
  return s.replace(/\s+/g, " ").trim();
}

const paragraphs = (txBody: XNode): string[] =>
  kids(txBody)
    .filter((n) => tagOf(n) === "a:p")
    .map(paraText)
    .filter(Boolean);

/** Placeholder kind of a shape ("title", "body", ...), "" for an ordinary text box, null if none. */
function placeholder(sp: XNode): string {
  const ph = findDeep(kids(sp).filter((n) => tagOf(n) === "p:nvSpPr"), "p:ph");
  return ph ? (attr(ph, "type") ?? "body") : "";
}

/** A table (a:tbl) as one line per row, cells separated by " | ". */
function tableLines(nodes: XNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (tagOf(n) === "a:tr") {
      const cells = kids(n)
        .filter((c) => tagOf(c) === "a:tc")
        .map((c) => {
          const body = child(kids(c), "a:txBody");
          return body ? paragraphs(body).join(" ") : "";
        });
      if (cells.some(Boolean)) out.push(cells.join(" | "));
    } else out.push(...tableLines(kids(n)));
  }
  return out;
}

interface Slide {
  title: string;
  lines: string[];
}

/** Collects text in reading (document) order. `notes` keeps only the speaker-notes body. */
function walk(nodes: XNode[], out: Slide, notes: boolean): void {
  for (const n of nodes) {
    switch (tagOf(n)) {
      case "p:sp": {
        const type = placeholder(n);
        if (notes ? type !== "body" : ["sldNum", "dt", "ftr"].includes(type)) break;
        const body = child(kids(n), "p:txBody");
        if (!body) break;
        const paras = paragraphs(body);
        if (type === "title" || type === "ctrTitle") out.title = [out.title, paras.join(" ")].filter(Boolean).join(" ");
        else out.lines.push(...paras);
        break;
      }
      case "p:graphicFrame":
        if (!notes) out.lines.push(...tableLines(kids(n)));
        break;
      case "mc:AlternateContent": {
        const choice = child(kids(n), "mc:Choice");
        if (choice) walk(kids(choice), out, notes);
        break;
      }
      case "p:grpSp":
      case "p:spTree":
      case "p:cSld":
      case "p:sld":
      case "p:notes":
        walk(kids(n), out, notes);
        break;
    }
  }
}

const blank = (): Slide => ({ title: "", lines: [] });

/** One passage per slide, numbered as in PowerPoint (presentation order), with speaker notes. */
export function readPptx(data: Uint8Array): Unit[] {
  const parts = readZipText(data, (name) => WANTED.test(name));
  const presentation = parts.get("ppt/presentation.xml");
  if (!presentation) throw new DocumentError("This doesn’t look like a PowerPoint (.pptx) file.");

  // Slide order lives in presentation.xml (r:id), resolved through its relationships.
  const rels = new Map<string, string>();
  const relRoot = findDeep(parseXml(parts.get("ppt/_rels/presentation.xml.rels") ?? "<r/>"), "Relationships");
  for (const n of relRoot ? kids(relRoot) : []) {
    const id = attr(n, "Id");
    const target = attr(n, "Target");
    if (id && target) rels.set(id, target);
  }
  const idList = findDeep(parseXml(presentation), "p:sldIdLst");
  let order = idList
    ? kids(idList)
        .map((n) => rels.get(attr(n, "r:id") ?? ""))
        .filter((t): t is string => !!t)
        .map((t) => `ppt/${t.replace(/^\/?(ppt\/)?/, "")}`)
    : [];
  if (order.length === 0) {
    order = [...parts.keys()]
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => parseInt(a.replace(/\D+/g, ""), 10) - parseInt(b.replace(/\D+/g, ""), 10));
  }

  const units: Unit[] = [];
  order.slice(0, MAX_UNITS_PER_DOC).forEach((path, i) => {
    const xml = parts.get(path);
    if (!xml) return;
    const slide = blank();
    walk(parseXml(xml), slide, false);

    // Speaker notes: the slide's relationships point at its notesSlide.
    const relsXml = parts.get(path.replace(/slides\/(slide\d+)\.xml$/, "slides/_rels/$1.xml.rels"));
    let notes = "";
    if (relsXml) {
      const root = findDeep(parseXml(relsXml), "Relationships");
      const rel = root ? kids(root).find((r) => /\/notesSlide$/.test(attr(r, "Type") ?? "")) : undefined;
      const target = attr(rel, "Target");
      const noteXml = target ? parts.get(`ppt/notesSlides/${target.split("/").pop()}`) : undefined;
      if (noteXml) {
        const ns = blank();
        walk(parseXml(noteXml), ns, true);
        notes = ns.lines.join(" ");
      }
    }

    const text = [slide.title, ...slide.lines, notes && `Speaker notes: ${notes}`].filter(Boolean).join("\n");
    if (!text.trim()) return; // an image-only slide still counts toward numbering
    for (const part of splitText(text)) units.push({ locator: `Slide ${i + 1}`, text: part });
  });
  return units;
}
