/**
 * Client-side Dropbox helper — production should prefer POST /api/v1/media/upload
 * (server holds refresh token). This path activates only when an access token exists.
 */
import { getDropboxAccessToken } from '../config';
import { upsertLocalMedia } from '../offline/cache';

export function isDropboxConfigured(): boolean {
  return !!getDropboxAccessToken();
}

export type DropboxUploadResult = {
  path: string;
  sharedUrl?: string;
  directUrl?: string;
};

async function readUriAsBlob(uri: string, mimeType?: string): Promise<Blob> {
  const res = await fetch(uri);
  const blob = await res.blob();
  if (mimeType && blob.type !== mimeType) {
    return new Blob([blob], { type: mimeType });
  }
  return blob;
}

/** Upload bytes to Dropbox and return a shared/direct URL when possible. */
export async function uploadToDropbox(opts: {
  uri: string;
  path: string;
  mimeType?: string;
}): Promise<DropboxUploadResult> {
  const token = getDropboxAccessToken();
  if (!token) {
    throw new Error('Dropbox access token not configured');
  }

  const blob = await readUriAsBlob(opts.uri, opts.mimeType);
  const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: opts.path.startsWith('/') ? opts.path : `/${opts.path}`,
        mode: 'add',
        autorename: true,
        mute: true,
      }),
    },
    body: blob,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    throw new Error(`Dropbox upload failed (${uploadRes.status}): ${text.slice(0, 120)}`);
  }

  const uploaded = (await uploadRes.json()) as { path_display?: string; path_lower?: string };
  const path = uploaded.path_display ?? uploaded.path_lower ?? opts.path;

  let sharedUrl: string | undefined;
  try {
    const shareRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, settings: { requested_visibility: 'public' } }),
    });
    if (shareRes.ok) {
      const share = (await shareRes.json()) as { url?: string };
      sharedUrl = share.url?.replace('?dl=0', '?raw=1');
    } else if (shareRes.status === 409) {
      const listRes = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path, direct_only: true }),
      });
      if (listRes.ok) {
        const list = (await listRes.json()) as { links?: { url?: string }[] };
        sharedUrl = list.links?.[0]?.url?.replace('?dl=0', '?raw=1');
      }
    }
  } catch {
    /* shared link optional */
  }

  return {
    path,
    sharedUrl,
    directUrl: sharedUrl,
  };
}

export async function resolveMediaUrl(opts: {
  uri: string;
  purpose: string;
  offline?: boolean;
}): Promise<{ url: string; localOnly: boolean }> {
  const id = `media_${Date.now().toString(36)}`;
  if (opts.offline || !isDropboxConfigured()) {
    await upsertLocalMedia({
      id,
      localUri: opts.uri,
      purpose: opts.purpose,
      createdAt: new Date().toISOString(),
    });
    return { url: opts.uri, localOnly: true };
  }

  const path = `/juax/${opts.purpose}/${id}.jpg`;
  const result = await uploadToDropbox({ uri: opts.uri, path, mimeType: 'image/jpeg' });
  const url = result.directUrl ?? result.sharedUrl ?? opts.uri;
  await upsertLocalMedia({
    id,
    localUri: opts.uri,
    remoteUrl: url,
    purpose: opts.purpose,
    createdAt: new Date().toISOString(),
  });
  return { url, localOnly: !result.directUrl && !result.sharedUrl };
}
