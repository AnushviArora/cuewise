import { validateDocument } from "./documents";

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_SLIDES_BYTES = 50 * 1024 * 1024; // 50 MB (PDF limit; other formats: see lib/documents.ts)
export const MAX_SLIDES_FILES = 15;
export const MAX_COURSE_NAME = 120;

const mb = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function validateCourseName(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter a course name, for example “CS 101: Intro to Algorithms”.";
  if (v.length > MAX_COURSE_NAME) return `Keep the course name under ${MAX_COURSE_NAME} characters.`;
  return null;
}

export function validateVideo(file: File | null): string | null {
  if (!file) return "Add your lecture video to continue.";
  const isMp4 = file.type === "video/mp4" || /\.mp4$/i.test(file.name);
  if (!isMp4) return `“${file.name}” isn’t an MP4. Export or convert the lecture to .mp4 and try again.`;
  if (file.size === 0) return `“${file.name}” appears to be empty. Try exporting the video again.`;
  if (file.size > MAX_VIDEO_BYTES) {
    return `That video is ${formatBytes(file.size)}. The limit is ${mb(MAX_VIDEO_BYTES)} — try compressing it first.`;
  }
  return null;
}

/**
 * Adds newly picked/dropped PDFs to the current list. Invalid files, duplicates and
 * anything past the 15-file cap are skipped; `messages` explains each in friendly words.
 */
export function addSlideFiles(
  current: File[],
  incoming: File[],
): { files: File[]; messages: string[] } {
  const files = [...current];
  const messages: string[] = [];
  let overLimit = 0;
  const same = (a: File, b: File) =>
    a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

  for (const f of incoming) {
    const problem = validateSlides(f);
    if (problem) messages.push(problem);
    else if (files.some((x) => same(x, f))) messages.push(`“${f.name}” is already added.`);
    else if (files.length >= MAX_SLIDES_FILES) overLimit++;
    else files.push(f);
  }
  if (overLimit > 0) {
    messages.push(
      `You can add up to ${MAX_SLIDES_FILES} documents. ${overLimit} ${overLimit === 1 ? "file wasn’t" : "files weren’t"} added. Remove one to make room.`,
    );
  }
  return { files, messages };
}

/** One document is valid when it is a supported type under that type's size limit. */
export function validateSlides(file: File | null): string | null {
  if (!file) return null;
  return validateDocument(file);
}
