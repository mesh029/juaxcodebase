import { getApiBaseUrl } from '../config';

export type ApiHealthStatus = 'unknown' | 'up' | 'down';

const HEALTH_TIMEOUT_MS = 4500;

let lastStatus: ApiHealthStatus = 'unknown';
let lastCheckedAt = 0;
let inFlight: Promise<ApiHealthStatus> | null = null;

export function getLastApiHealth(): ApiHealthStatus {
  return lastStatus;
}

async function probe(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Lightweight health check. Tries /api/v1/health then /api/health (backend today). */
export async function checkApiHealth(opts?: { force?: boolean }): Promise<ApiHealthStatus> {
  const base = getApiBaseUrl();
  if (!base) {
    lastStatus = 'down';
    lastCheckedAt = Date.now();
    return lastStatus;
  }

  const now = Date.now();
  if (!opts?.force && inFlight) return inFlight;
  if (!opts?.force && now - lastCheckedAt < 8_000 && lastStatus !== 'unknown') {
    return lastStatus;
  }

  inFlight = (async () => {
    const v1 = await probe(`${base}/api/v1/health`);
    if (v1) {
      lastStatus = 'up';
      lastCheckedAt = Date.now();
      return lastStatus;
    }
    const legacy = await probe(`${base}/api/health`);
    lastStatus = legacy ? 'up' : 'down';
    lastCheckedAt = Date.now();
    return lastStatus;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function isApiConfigured(): boolean {
  return !!getApiBaseUrl();
}
