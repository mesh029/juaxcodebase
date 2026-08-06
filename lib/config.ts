/** Shared env-derived config — avoid circular imports between api and offline. */

export function getApiBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
}

export function getWsUrl(): string {
  const explicit = (process.env.EXPO_PUBLIC_WS_URL ?? '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const base = getApiBaseUrl();
  if (!base) return '';
  if (base.startsWith('https://')) return `wss://${base.slice('https://'.length)}`;
  if (base.startsWith('http://')) return `ws://${base.slice('http://'.length)}`;
  return '';
}

export function getMapboxToken(): string {
  return (process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '').trim();
}

export function getSentryDsn(): string {
  return (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();
}

export function getDropboxAccessToken(): string {
  return (process.env.EXPO_PUBLIC_DROPBOX_ACCESS_TOKEN ?? '').trim();
}

export function getDropboxAppKey(): string {
  return (process.env.EXPO_PUBLIC_DROPBOX_APP_KEY ?? '').trim();
}
