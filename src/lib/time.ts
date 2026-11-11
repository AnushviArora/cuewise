/** "a few seconds", "about 40 seconds", "about 3 min" for rough progress estimates. */
export function formatEta(seconds: number): string {
  if (seconds < 8) return "a few seconds";
  if (seconds < 55) return `about ${Math.round(seconds / 5) * 5} seconds`;
  return `about ${Math.max(1, Math.round(seconds / 60))} min`;
}

export const secs = (ms: number) => Math.round(ms / 100) / 10;
