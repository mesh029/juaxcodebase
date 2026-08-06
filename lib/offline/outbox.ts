import { storageGet, storageSet } from './storage';

export type OutboxMutationType =
  | 'laundry_order'
  | 'bnb_booking'
  | 'bnb_payment_confirm'
  | 'viewing_request'
  | 'listing_request'
  | 'feedback'
  | 'subscription_intent'
  | 'subscription_confirm'
  | 'payment_intent'
  | 'profile_patch'
  | 'device_token'
  | 'media_upload'
  | 'listing_request_reply';

export type OutboxItem = {
  id: string;
  type: OutboxMutationType;
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
  lastError?: string;
  idempotencyKey: string;
  /** Optional dedupe key — same key replaces pending item */
  dedupeKey?: string;
};

const OUTBOX_KEY = 'outbox:queue';
const MAX_RETRIES = 12;
const MAX_ITEMS = 200;

function newId(): string {
  return `ob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadOutbox(): Promise<OutboxItem[]> {
  const items = await storageGet<OutboxItem[]>(OUTBOX_KEY);
  return items ?? [];
}

async function saveOutbox(items: OutboxItem[]): Promise<void> {
  await storageSet(OUTBOX_KEY, items.slice(0, MAX_ITEMS));
}

export async function enqueueOutbox(
  type: OutboxMutationType,
  payload: Record<string, unknown>,
  opts?: { dedupeKey?: string; idempotencyKey?: string },
): Promise<OutboxItem> {
  const items = await loadOutbox();
  const dedupeKey = opts?.dedupeKey;
  if (dedupeKey) {
    const existing = items.find((i) => i.dedupeKey === dedupeKey && i.retries < MAX_RETRIES);
    if (existing) {
      const updated: OutboxItem = {
        ...existing,
        payload,
        lastError: undefined,
      };
      await saveOutbox(items.map((i) => (i.id === existing.id ? updated : i)));
      return updated;
    }
  }
  const item: OutboxItem = {
    id: newId(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    retries: 0,
    idempotencyKey: opts?.idempotencyKey ?? newId(),
    dedupeKey,
  };
  await saveOutbox([item, ...items]);
  return item;
}

export async function removeOutboxItem(id: string): Promise<void> {
  const items = await loadOutbox();
  await saveOutbox(items.filter((i) => i.id !== id));
}

export async function markOutboxFailure(id: string, error: string): Promise<OutboxItem | null> {
  const items = await loadOutbox();
  let updated: OutboxItem | null = null;
  const next = items
    .map((i) => {
      if (i.id !== id) return i;
      updated = { ...i, retries: i.retries + 1, lastError: error };
      return updated;
    })
    .filter((i) => i.retries <= MAX_RETRIES);
  await saveOutbox(next);
  return updated;
}

export function outboxBackoffMs(retries: number): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.min(retries, 6));
  const jitter = Math.floor(Math.random() * 400);
  return base + jitter;
}

export function getOutboxMaxRetries(): number {
  return MAX_RETRIES;
}
