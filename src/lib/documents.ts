/**
 * Which uploaded files are accepted as "slides, notes and handouts", and how big they may be.
 * Shared by the browser (to explain problems right away) and the server (which re-checks).
 * Every format is read as TEXT ONLY: nothing uploaded is ever executed or imported.
 */
export type DocKind = "pdf" | "pptx" | "docx" | "markdown" | "text" | "code";

export const CODE_EXTENSIONS = ["py", "java", "js", "ts", "c", "cpp", "html", "css", "sql"] as const;
export type CodeLanguage = (typeof CODE_EXTENSIONS)[number];

const MB = 1024 * 1024;
/** PDF keeps its original 50 MB limit. Office files are zips, so they get a tighter cap. */
export const DOC_LIMITS: Record<DocKind, number> = {
  pdf: 50 * MB,
  pptx: 25 * MB,
  docx: 25 * MB,
  markdown: 1 * MB,
  text: 1 * MB,
  code: 1 * MB,
};

export const ACCEPTED_LABEL =
  "PDF, PowerPoint (.pptx), Word (.docx), plain text and Markdown (.txt, .md), and code (.py, .java, .js, .ts, .c, .cpp, .html, .css, .sql)";

/** For the file picker's `accept` attribute. */
export const ACCEPT_ATTR = [
  "application/pdf",
  ".pdf",
  ".pptx",
  ".docx",
  ".txt",
  ".md",
  ...CODE_EXTENSIONS.map((e) => `.${e}`),
].join(",");

const extOf = (name: string) => /\.([A-Za-z0-9]+)$/.exec(name)?.[1].toLowerCase() ?? "";

export function codeLanguage(name: string): CodeLanguage | null {
  const e = extOf(name);
  return (CODE_EXTENSIONS as readonly string[]).includes(e) ? (e as CodeLanguage) : null;
}

/** The format of a file, judged by its extension (a PDF without one is recognised by its type). */
export function docKindOf(name: string, mime = ""): DocKind | null {
  const e = extOf(name);
  if (e === "pdf" || (!e && mime === "application/pdf")) return "pdf";
  if (e === "pptx") return "pptx";
  if (e === "docx") return "docx";
  if (e === "md") return "markdown";
  if (e === "txt") return "text";
  return codeLanguage(name) ? "code" : null;
}

const mb = (n: number) => `${Math.round(n / MB)} MB`;
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
// Same formatting the PDF message always used, so that message is unchanged.
const size = (n: number) =>
  n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= MB ? `${(n / MB).toFixed(1)} MB` : kb(n);
const limitText = (n: number) => (n >= MB ? mb(n) : kb(n));

const NAMES: Record<DocKind, string> = {
  pdf: "PDF",
  pptx: "PowerPoint file",
  docx: "Word file",
  markdown: "Markdown file",
  text: "text file",
  code: "code file",
};

/** Why a file can't be used, or null when it's fine. PDF wording is unchanged from before. */
export function validateDocument(file: { name: string; size: number; type?: string }): string | null {
  const kind = docKindOf(file.name, file.type);
  if (!kind) {
    const e = extOf(file.name);
    const hint =
      e === "ppt" ? " Save it as .pptx (File > Save As) and try again."
      : e === "doc" ? " Save it as .docx (File > Save As) and try again."
      : "";
    return `“${file.name}” isn’t a supported file type.${hint} Accepted: ${ACCEPTED_LABEL}.`;
  }
  if (file.size === 0 && kind !== "pdf") return `“${file.name}” appears to be empty.`;
  if (file.size > DOC_LIMITS[kind]) {
    return kind === "pdf"
      ? `That PDF is ${size(file.size)}. The limit is ${mb(DOC_LIMITS.pdf)}.`
      : `“${file.name}” is ${size(file.size)}. The limit for a ${NAMES[kind]} is ${limitText(DOC_LIMITS[kind])}.`;
  }
  return null;
}
