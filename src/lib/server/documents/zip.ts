import "server-only";
import { unzipSync } from "fflate";
import { DocumentError } from "./errors";

/** One XML part (e.g. a single slide) may inflate to at most this much. */
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
/** Everything we inflate from one file, in total. Guards against decompression bombs. */
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

/**
 * Reads only the parts of an Office file that `wanted` selects, as text. Parts that are
 * not wanted (images, media, embedded files) are never inflated. Sizes are checked BEFORE
 * inflating, and the output buffer is capped at the declared size, so a malicious file
 * can't expand beyond the limits above.
 */
export function readZipText(data: Uint8Array, wanted: (name: string) => boolean): Map<string, string> {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter(f) {
        if (!wanted(f.name)) return false;
        if (f.originalSize > MAX_ENTRY_BYTES) throw new DocumentError("A part of this file is too large to read.");
        total += f.originalSize;
        if (total > MAX_TOTAL_BYTES) throw new DocumentError("This file expands to too much text to read.");
        return true;
      },
    });
  } catch (e) {
    if (e instanceof DocumentError) throw e;
    throw new DocumentError("This file couldn’t be opened. It may be corrupted or password-protected.");
  }
  const dec = new TextDecoder("utf-8");
  const out = new Map<string, string>();
  for (const [name, bytes] of Object.entries(files)) out.set(name, dec.decode(bytes));
  return out;
}
