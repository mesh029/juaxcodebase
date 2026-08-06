import { ApiError, uploadMedia, getApiBaseUrl } from '../api';
import { checkApiHealth } from '../offline/health';
import { enqueueMutation } from '../offline/sync';
import { isDropboxConfigured, resolveMediaUrl } from './dropbox';

/**
 * Upload listing/profile/laundry proof image.
 * Order: backend media route → client Dropbox (if token) → local URI + outbox.
 */
export async function uploadAppMedia(opts: {
  uri: string;
  purpose: string;
  fileName?: string;
  mimeType?: string;
}): Promise<{ url: string; queued: boolean }> {
  const health = await checkApiHealth();
  const online = health === 'up' && !!getApiBaseUrl();

  if (online) {
    try {
      const res = await uploadMedia({
        uri: opts.uri,
        purpose: opts.purpose,
        fileName: opts.fileName,
        mimeType: opts.mimeType,
      });
      if (res.url) return { url: res.url, queued: false };
    } catch (err) {
      // 404 = route not deployed yet — fall through
      if (!(err instanceof ApiError && (err.status === 404 || err.code === 'network_error'))) {
        /* try dropbox / local */
      }
    }
  }

  if (online && isDropboxConfigured()) {
    try {
      const resolved = await resolveMediaUrl({
        uri: opts.uri,
        purpose: opts.purpose,
        offline: false,
      });
      return { url: resolved.url, queued: false };
    } catch {
      /* local fallback */
    }
  }

  const local = await resolveMediaUrl({
    uri: opts.uri,
    purpose: opts.purpose,
    offline: true,
  });

  if (!online) {
    await enqueueMutation(
      'media_upload',
      {
        uri: opts.uri,
        purpose: opts.purpose,
        fileName: opts.fileName,
        mimeType: opts.mimeType,
      },
      { dedupeKey: `media:${opts.uri}` },
    );
    return { url: local.url, queued: true };
  }

  return { url: local.url, queued: false };
}
