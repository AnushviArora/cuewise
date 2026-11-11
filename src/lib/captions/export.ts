import type { CaptionCue } from "@/lib/captions/types";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** SRT timestamp: 00:01:02,345 (rounds once so milliseconds never read 1000). */
export function srtTime(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/** Readable timestamp: 1:02, or 1:01:02 for lectures over an hour. */
export function clock(seconds: number, withHours = false): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = pad(t % 60);
  return withHours || h > 0 ? `${h}:${pad(m)}:${s}` : `${m}:${s}`;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export function toSrt(cues: CaptionCue[]): string {
  return (
    cues
      .map((c, i) => {
        const next = cues[i + 1];
        // Never overlap the next cue, and never end before we start.
        let end = next && next.start > c.start ? Math.min(c.end, next.start) : c.end;
        if (end <= c.start) end = c.start + 0.5;
        return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(end)}\n${oneLine(c.text)}\n`;
      })
      .join("\n")
  );
}

export function toText(cues: CaptionCue[], title: string): string {
  const long = (cues.at(-1)?.end ?? 0) >= 3600;
  const lines = cues.map((c) => `[${clock(c.start, long)}] ${oneLine(c.text)}`);
  return `${title}\nTranscript\n\n${lines.join("\n")}\n`;
}

function slug(title: string): string {
  const s = title.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 60) || "lecture";
}

export type ExportKind = "txt" | "srt";

export function downloadTranscript(kind: ExportKind, cues: CaptionCue[], title: string): void {
  const body = kind === "srt" ? toSrt(cues) : toText(cues, title);
  const mime = kind === "srt" ? "application/x-subrip" : "text/plain";
  const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(title)}-${kind === "srt" ? "captions.srt" : "transcript.txt"}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
