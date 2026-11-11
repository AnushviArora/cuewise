export const PLAYBACK_RATES: readonly number[] = [0.75, 1, 1.25, 1.5, 1.75, 2];
const KEY = "cuewise:playback-rate:v1";

export const formatRate = (r: number) => `${r}×`;

export function loadRate(): number {
  try {
    const n = Number(window.localStorage.getItem(KEY));
    return PLAYBACK_RATES.includes(n) ? n : 1;
  } catch {
    return 1;
  }
}

export function saveRate(rate: number): void {
  try {
    window.localStorage.setItem(KEY, String(rate));
  } catch {
    /* storage unavailable: speed just won't be remembered */
  }
}
