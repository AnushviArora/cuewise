import "server-only";
import { codeLanguage, type DocKind } from "@/lib/documents";
import type { SlideTerm } from "@/lib/captions/types";
import { chunkCode, codeTerms } from "./code";
import { readDocx } from "./docx";
import { DocumentError, type Unit } from "./errors";
import { readPptx } from "./pptx";
import { decodeText, readMarkdown, readPlainText } from "./text";

export { DocumentError } from "./errors";
export type { Unit } from "./errors";

export interface ParsedDocument {
  /** Passages, each labelled with where it is in the file. */
  units: Unit[];
  /** Names found directly in the file (code only): no AI needed to learn them. */
  terms: SlideTerm[];
}

/**
 * Reads a PowerPoint, Word, Markdown, text or code file as TEXT. (PDFs are read by the
 * route itself.) Throws a DocumentError with a friendly message when a file can't be read.
 */
export async function parseDocument(file: File, kind: Exclude<DocKind, "pdf">): Promise<ParsedDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  switch (kind) {
    case "pptx":
      return { units: readPptx(bytes), terms: [] };
    case "docx":
      return { units: readDocx(bytes), terms: [] };
    case "markdown":
      return { units: readMarkdown(decodeText(bytes)), terms: [] };
    case "text":
      return { units: readPlainText(decodeText(bytes)), terms: [] };
    case "code": {
      const lang = codeLanguage(file.name);
      if (!lang) throw new DocumentError("Unsupported code file.");
      const text = decodeText(bytes);
      return { units: chunkCode(text, lang), terms: codeTerms(text, lang) };
    }
  }
}
