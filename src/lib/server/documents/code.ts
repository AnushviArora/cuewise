import "server-only";
import type { CodeLanguage } from "@/lib/documents";
import type { SlideTerm } from "@/lib/captions/types";
import { MAX_UNITS_PER_DOC, type Unit } from "./errors";
import { lineBlocks } from "./text";

/**
 * Source files are read as plain TEXT: split by function or class with line patterns, and
 * scanned for names. Nothing is parsed by a language runtime, imported or executed.
 */

const MAX_TERMS_PER_FILE = 60;
const MIN_CHUNK_CHARS = 60;
const MAX_LINE_SCAN = 300; // never run patterns over a huge (e.g. minified) line

interface Lang {
  /** A line that starts a function / class / top-level block. */
  top: RegExp;
  /** A method-like line, a boundary only while inside a class. */
  method?: RegExp;
  /** Names declared on a line that matched `top` or `method`. */
  declared: RegExp;
  /** Name on a `method` line, when `declared` doesn't cover it. */
  methodName?: RegExp;
  /** Variable / constant / field names anywhere in the file. */
  vars?: RegExp;
}

const JS_TOP =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b|^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+[\w$]|^(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=]+)?=>|^(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*=\s*(?:async\s+)?function\b/;
const TS_EXTRA = /^(?:export\s+)?(?:declare\s+)?(?:interface|type|enum|namespace)\s+[\w$]/;
const JS_METHOD =
  /^\s{2,}(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{=]+)?\{\s*$/;
const JS_METHOD_NAME = /^\s*(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/;
const JS_DECLARED =
  /(?:function\*?\s+|class\s+|interface\s+|type\s+|enum\s+|namespace\s+|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)/;

const JAVA_NOT_METHOD = /^(?:if|for|while|switch|return|new|else|catch|try|throw|synchronized|do|case|assert)\b/;
const JAVA_TYPE = /^\s{0,4}(?:(?:public|private|protected|abstract|final|static|sealed)\s+)*(?:class|interface|enum|record)\s+[A-Za-z_]\w*/;
const JAVA_METHOD =
  /^\s{2,}(?:(?:public|private|protected|static|final|abstract|synchronized|native|default)\s+)*(?:<[^>]+>\s+)?(?:[\w.<>\[\],?]+\s+)+[A-Za-z_]\w*\s*\([^;]*;?\s*$/;

const C_KEYWORD = /^(?:if|for|while|switch|return|else|do|typedef|sizeof|case|goto|using|extern)\b/;
const C_TYPE = /^(?:typedef\s+)?(?:struct|class|enum|union|namespace)\s+[A-Za-z_]\w*/;
const C_FUNC = /^[A-Za-z_][\w\s*&:<>,~\[\]]*?\s+[*&]*[\w:~]+\s*\([^;]*$/;
const C_METHOD = /^\s+(?:virtual\s+|static\s+|inline\s+)*[\w:<>*&~\s]+?\s+[*&]*[\w~]+\s*\([^;]*\)\s*(?:const\s*)?\{\s*$/;

const LANGS: Record<CodeLanguage, Lang> = {
  py: {
    top: /^(?:async\s+def|def|class)\s+[A-Za-z_]\w*/,
    method: /^\s+(?:async\s+def|def)\s+[A-Za-z_]\w*/,
    declared: /^\s*(?:async\s+def|def|class)\s+([A-Za-z_]\w*)/,
    vars: /^\s*([A-Za-z_]\w*)\s*(?::\s*[^=\n]+)?=(?!=)/gm,
  },
  js: { top: JS_TOP, method: JS_METHOD, declared: JS_DECLARED, methodName: JS_METHOD_NAME, vars: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g },
  ts: {
    top: new RegExp(`${JS_TOP.source}|${TS_EXTRA.source}`),
    method: JS_METHOD,
    declared: JS_DECLARED,
    methodName: JS_METHOD_NAME,
    // variables, plus property names inside interfaces and classes ("readonly rowCount: number;")
    vars: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)|^\s+(?:(?:readonly|public|private|protected|static)\s+)*([A-Za-z_$][\w$]*)\??\s*:\s*[^=;(\n]+;?\s*$/gm,
  },
  java: {
    top: JAVA_TYPE,
    declared: /(?:class|interface|enum|record)\s+([A-Za-z_]\w*)|([A-Za-z_]\w*)\s*\(/,
    vars: /\b(?:int|long|short|byte|double|float|char|boolean|String|var|final\s+\w+|[A-Z]\w*(?:<[^>]*>)?)\s+([a-z_]\w*)\s*(?:=|;|,)/g,
  },
  c: {
    top: C_TYPE,
    declared: /(?:struct|enum|union)\s+([A-Za-z_]\w*)|([A-Za-z_]\w*)\s*\(/,
    vars: /\b(?:int|long|short|double|float|char|size_t|bool|unsigned|void\s*\*|[A-Za-z_]\w*_t)\s+\*?([a-z_]\w*)\s*(?:=|;|\[|,)/g,
  },
  cpp: {
    top: C_TYPE,
    method: C_METHOD,
    declared: /(?:struct|class|enum|union|namespace)\s+([A-Za-z_]\w*)|([A-Za-z_~][\w:~]*)\s*\(/,
    vars: /\b(?:int|long|short|double|float|char|size_t|bool|auto|unsigned|std::\w+(?:<[^>]*>)?|[A-Z]\w*(?:<[^>]*>)?)\s+[*&]*([a-z_]\w*)\s*(?:=|;|\[|,|\{)/g,
  },
  html: {
    top: /^\s{0,6}<(?:head|body|header|nav|main|section|article|aside|footer|form|table|script|style|ul|ol|h[1-6])\b/i,
    declared: /(?:id|class)\s*=\s*["']([^"']+)["']/,
    vars: /\b(?:id|name)\s*=\s*["']([A-Za-z][\w-]*)["']/g,
  },
  css: {
    top: /^(?:@[\w-]+[^{]*|[^\s@}/][^{}]*)\{\s*$/,
    declared: /[.#]([A-Za-z_][\w-]*)/,
    vars: /(--[A-Za-z][\w-]*)\s*:/g,
  },
  sql: {
    top: /^(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT|WITH|MERGE|TRUNCATE|GRANT|BEGIN|DECLARE)\b/i,
    declared: /\b(?:TABLE|VIEW|FUNCTION|PROCEDURE|INDEX|TRIGGER|TYPE|SCHEMA)\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?([A-Za-z_][\w.]*)/i,
    vars: /^\s+[`"[]?([A-Za-z_]\w*)[`"\]]?\s+(?:INT|INTEGER|BIGINT|SMALLINT|SERIAL|VARCHAR|CHAR|TEXT|DATE|DATETIME|TIMESTAMP|BOOLEAN|BOOL|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|UUID|JSON|BLOB)\b/gim,
  },
};

const KEYWORDS = new Set(
  ("abstract and as assert async await break case catch char class const constructor continue def default del do double elif else " +
    "enum except export extends false final finally float for from function global if implements import in instanceof " +
    "int interface is lambda let long new none not null of or package pass print private protected public raise " +
    "return self short static string struct super switch synchronized this throw throws true try type typedef " +
    "typeof union unsigned var virtual void volatile while with yield select insert update delete create table " +
    "values where from join group order having limit index primary key foreign references constraint").split(" "),
);

const isMethodLine = (lang: CodeLanguage, line: string): boolean => {
  const l = line.slice(0, MAX_LINE_SCAN);
  if (lang === "java") {
    const t = l.trim();
    // Interface methods end with ";", but a statement like "x = foo(y);" must not count.
    return !JAVA_NOT_METHOD.test(t) && !t.includes("=") && JAVA_METHOD.test(l);
  }
  return !!LANGS[lang].method?.test(l);
};

const isTopLine = (lang: CodeLanguage, line: string): boolean => {
  const l = line.slice(0, MAX_LINE_SCAN);
  if (lang === "java") return JAVA_TYPE.test(l);
  if (lang === "c" || lang === "cpp") {
    if (C_TYPE.test(l)) return true;
    return /^[A-Za-z_]/.test(l) && !C_KEYWORD.test(l) && !l.trimEnd().endsWith(";") && !/=/.test(l.split("(")[0]) && C_FUNC.test(l);
  }
  if (lang === "sql") return LANGS.sql.top.test(l);
  return LANGS[lang].top.test(l);
};

const CLASSY = /\b(?:class|interface|enum|record|struct|namespace)\b/;

/** Splits a source file into passages by function / class, each labelled with its line range. */
export function chunkCode(text: string, lang: CodeLanguage): Unit[] {
  const lines = text.split("\n");
  const starts: number[] = []; // 1-based line numbers where a new function/class begins
  let inClass = false;
  lines.forEach((line, i) => {
    if (isTopLine(lang, line)) {
      starts.push(i + 1);
      inClass = CLASSY.test(line);
    } else if (inClass && isMethodLine(lang, line)) starts.push(i + 1);
  });

  // A comment block or decorator directly above a declaration belongs with it.
  const decorated = starts.map((s, k) => {
    let a = s;
    const floor = (k > 0 ? starts[k - 1] : 0) + 1;
    while (a - 1 >= floor && /^\s*(?:#|\/\/|\/\*|\*|@|--|<!--)/.test(lines[a - 2])) a--;
    return a;
  });

  if (decorated.length === 0) return lineBlocks(lines).slice(0, MAX_UNITS_PER_DOC);

  const spans: [number, number][] = [];
  if (decorated[0] > 1) spans.push([1, decorated[0] - 1]); // imports, includes, setup
  decorated.forEach((a, k) => spans.push([a, k + 1 < decorated.length ? decorated[k + 1] - 1 : lines.length]));

  // Merge tiny fragments. A short declaration header ("class Foo {") belongs with the code
  // that follows it; a trailing scrap (a lone closing brace) belongs with the code before it.
  const declStarts = new Set(decorated);
  const merged: [number, number][] = [];
  let carry: number | null = null; // start line of a header waiting to join the next chunk
  spans.forEach((sp, k) => {
    const start = carry ?? sp[0];
    carry = null;
    const size = lines.slice(start - 1, sp[1]).join("\n").trim().length;
    const prev = merged[merged.length - 1];
    if (size >= MIN_CHUNK_CHARS) merged.push([start, sp[1]]);
    else if (declStarts.has(sp[0]) && k + 1 < spans.length) carry = start;
    else if (prev) prev[1] = sp[1];
    else merged.push([start, sp[1]]);
  });

  const units: Unit[] = [];
  for (const [a, b] of merged) {
    // lineBlocks labels by range and splits anything longer than one passage.
    units.push(...lineBlocks(lines, a, b));
    if (units.length >= MAX_UNITS_PER_DOC) break;
  }
  return units.slice(0, MAX_UNITS_PER_DOC);
}

/**
 * Names worth teaching the caption corrector: declared functions, classes and tables, plus
 * compound identifiers (camelCase / snake_case) used more than once. A speech recognizer
 * hears "get user name" for getUserName; these terms let the captions spell it correctly.
 */
export function codeTerms(text: string, lang: CodeLanguage): SlideTerm[] {
  const cfg = LANGS[lang];
  const score = new Map<string, number>();
  const bump = (name: string | undefined, by: number, declared = false) => {
    if (!name) return;
    name = name.replace(/^[.#]/, "");
    if (name.length < 3 || name.length > 60 || /^_|^__.*__$/.test(name)) return;
    if (KEYWORDS.has(name.toLowerCase()) && lang !== "css" && lang !== "html") return;
    const compound = /_|-|[a-z][A-Z]|[A-Z]{2,}[a-z]/.test(name);
    // A lone lowercase word ("data", "main") is usually ordinary English: skip unless it is a real declaration.
    if (!compound && !(declared && (name.length >= 5 || /^[A-Z]/.test(name)))) return;
    score.set(name, (score.get(name) ?? 0) + by);
  };

  const lines = text.split("\n");
  for (const raw of lines) {
    const line = raw.slice(0, MAX_LINE_SCAN);
    const top = isTopLine(lang, line);
    if (top || isMethodLine(lang, line)) {
      const m = (top ? cfg.declared : (cfg.methodName ?? cfg.declared)).exec(line);
      if (m) for (const g of m.slice(1)) if (g) bump(g.split("::").pop(), 10, true);
      if (lang === "html") for (const m2 of line.matchAll(/(?:id|class)\s*=\s*["']([^"']+)["']/g)) m2[1].split(/\s+/).forEach((c) => bump(c, 6, true));
    }
  }
  if (lang === "css") for (const m of text.matchAll(/[.#]([A-Za-z_][\w-]*)\s*[{,:\s]/g)) bump(m[1], 4, true);
  if (lang === "html") {
    for (const m of text.matchAll(/\bclass\s*=\s*["']([^"']+)["']/g)) m[1].split(/\s+/).forEach((c) => bump(c, 3, true));
  }
  if (cfg.vars) for (const m of text.matchAll(cfg.vars)) bump(m.slice(1).find(Boolean), 3);
  // Compound identifiers used repeatedly (calls, fields, parameters) are worth knowing too.
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/[A-Za-z_$][\w$]*/g)) counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  for (const [id, n] of counts) if (n >= 2) bump(id, Math.min(n, 5));

  const seen = new Set<string>();
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .filter(([n]) => {
      const k = n.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_TERMS_PER_FILE)
    .map(([term]) => ({ term, kind: "technical" as const }));
}
