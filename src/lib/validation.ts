export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_SLIDES_BYTES = 50 * 1024 * 1024; // 50 MB
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

/** Slides are optional: null file is fine. */
export function validateSlides(file: File | null): string | null {
  if (!file) return null;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return `“${file.name}” isn’t a PDF. Export your slides as a PDF and try again.`;
  if (file.size > MAX_SLIDES_BYTES) {
    return `That PDF is ${formatBytes(file.size)}. The limit is ${mb(MAX_SLIDES_BYTES)}.`;
  }
  return null;
}
