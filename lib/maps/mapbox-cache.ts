/**
 * Rate-limit + cache Mapbox HTTP calls (geocoding / directions).
 * Prevents request storms when sheets remount or search types quickly.
 */

type CacheEntry = { at: number; body: unknown };

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 350;
let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = MIN_GAP_MS - (now - lastRequestAt);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestAt = Date.now();
}

export async function mapboxFetchJson<T>(
  url: string,
  opts?: { ttlMs?: number; signal?: AbortSignal },
): Promise<T> {
  const ttl = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const cached = memory.get(url);
  if (cached && Date.now() - cached.at < ttl) {
    return cached.body as T;
  }

  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    await throttle();
    const res = await fetch(url, { signal: opts?.signal });
    if (!res.ok) {
      throw new Error(`Mapbox request failed (${res.status})`);
    }
    const body = (await res.json()) as T;
    memory.set(url, { at: Date.now(), body });
    // Cap memory
    if (memory.size > 80) {
      const oldest = [...memory.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) memory.delete(oldest[0]);
    }
    return body;
  })();

  inflight.set(url, promise);
  try {
    return (await promise) as T;
  } finally {
    inflight.delete(url);
  }
}

export function getCachedMapboxJson<T>(url: string): T | null {
  const cached = memory.get(url);
  if (!cached) return null;
  return cached.body as T;
}

/** Append width/quality params for remote carousel images when possible. */
export function sizedImageUrl(url: string | null | undefined, width = 640): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('file://') || url.startsWith('content://')) return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes('unsplash.com') || u.hostname.includes('images.unsplash.com')) {
      u.searchParams.set('w', String(width));
      u.searchParams.set('q', '80');
      u.searchParams.set('auto', 'format');
      return u.toString();
    }
    if (u.hostname.includes('dropbox.com') || u.hostname.includes('dl.dropboxusercontent.com')) {
      u.searchParams.set('raw', '1');
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}
