/**
 * Tiny on-device cache (IndexedDB) so re-uploading the same video and PDFs reuses the
 * transcript, terms and corrections instead of paying for them again. Entries never leave
 * this browser. If storage is unavailable everything still works, just without the cache.
 */
const DB_NAME = "cuewise-cache";
const STORE = "kv";
/** Bump to invalidate everything (e.g. when prompts or models change). */
export const CACHE_VERSION = "v1";
const MAX_ENTRIES = 40;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = <T,>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

interface Entry {
  t: number;
  value: unknown;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    const e = (await done(db.transaction(STORE).objectStore(STORE).get(`${CACHE_VERSION}|${key}`))) as
      | Entry
      | undefined;
    db.close();
    return e?.value as T | undefined;
  } catch {
    return undefined;
  }
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    await done(store.put({ t: Date.now(), value } satisfies Entry, `${CACHE_VERSION}|${key}`));
    // Keep only the newest entries.
    const all = (await done(db.transaction(STORE).objectStore(STORE).getAllKeys())) as string[];
    if (all.length > MAX_ENTRIES) {
      const entries = await Promise.all(
        all.map(async (k) => ({
          k,
          t: ((await done(db.transaction(STORE).objectStore(STORE).get(k))) as Entry).t,
        })),
      );
      entries.sort((a, b) => a.t - b.t);
      const w = db.transaction(STORE, "readwrite").objectStore(STORE);
      for (const { k } of entries.slice(0, all.length - MAX_ENTRIES)) w.delete(k);
    }
    db.close();
  } catch {
    /* cache is best-effort */
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await open();
    await done(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
    db.close();
  } catch {
    /* ignore */
  }
}

const SLICE = 1 << 20;

/**
 * Content fingerprint: size + SHA-256 of the first, middle and last MB. Fast even for
 * multi-GB videos, and unaffected by renaming or re-saving the same file. Null if unavailable.
 */
export async function fingerprint(file: File): Promise<string | null> {
  try {
    const mid = Math.max(0, Math.floor(file.size / 2 - SLICE / 2));
    const parts = await Promise.all(
      [file.slice(0, SLICE), file.slice(mid, mid + SLICE), file.slice(Math.max(0, file.size - SLICE))].map((b) =>
        b.arrayBuffer(),
      ),
    );
    const size = new TextEncoder().encode(`${file.size}:`);
    const all = new Uint8Array(size.length + parts.reduce((n, p) => n + p.byteLength, 0));
    all.set(size);
    let at = size.length;
    for (const p of parts) {
      all.set(new Uint8Array(p), at);
      at += p.byteLength;
    }
    const hash = await crypto.subtle.digest("SHA-256", all);
    return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
