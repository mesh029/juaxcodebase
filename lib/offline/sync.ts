import {
  createBnbBooking,
  createLaundryOrder,
  createListingRequest,
  createSubscription,
  confirmBnbBookingPayment,
  confirmSubscriptionPayment,
  replyToListingRequest,
  submitFeedback,
  updateProfile,
  registerDeviceToken,
  initiateMpesaPayment,
  uploadMedia,
} from '../api';
import { checkApiHealth } from './health';
import {
  enqueueOutbox,
  loadOutbox,
  markOutboxFailure,
  outboxBackoffMs,
  removeOutboxItem,
  type OutboxItem,
  type OutboxMutationType,
} from './outbox';

type SyncListener = (info: { flushed: number; remaining: number; error?: string }) => void;

let flushing = false;
let listeners = new Set<SyncListener>();
const nextAttemptAt = new Map<string, number>();

export function subscribeOutboxSync(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(info: { flushed: number; remaining: number; error?: string }) {
  listeners.forEach((l) => {
    try {
      l(info);
    } catch {
      /* ignore */
    }
  });
}

async function dispatchItem(item: OutboxItem): Promise<void> {
  const p = item.payload;
  const idem = item.idempotencyKey;

  switch (item.type) {
    case 'laundry_order':
      await createLaundryOrder(p, { idempotencyKey: idem });
      return;
    case 'bnb_booking':
      await createBnbBooking(
        {
          listingId: String(p.listingId),
          checkIn: String(p.checkIn),
          checkOut: String(p.checkOut),
          guests: typeof p.guests === 'number' ? p.guests : undefined,
        },
        { idempotencyKey: idem },
      );
      return;
    case 'bnb_payment_confirm':
      await confirmBnbBookingPayment(String(p.bookingId), p.mpesaReceipt as string | undefined, {
        idempotencyKey: idem,
      });
      return;
    case 'viewing_request':
    case 'listing_request':
      await createListingRequest(
        {
          listingId: String(p.listingId),
          kind: p.kind as 'viewing' | 'tour' | 'stay',
          userNote: p.userNote as string | undefined,
          pickupMode: p.pickupMode as 'taxi' | 'rider' | undefined,
        },
        { idempotencyKey: idem },
      );
      return;
    case 'listing_request_reply':
      await replyToListingRequest(String(p.id), String(p.body), { idempotencyKey: idem });
      return;
    case 'feedback':
      await submitFeedback(
        p as {
          service: 'fua' | 'mamafua' | 'bnb' | 'rental' | 'general' | 'app';
          category?: 'rating' | 'complaint' | 'suggestion' | 'praise';
          rating?: number;
          title?: string;
          body: string;
          orderId?: string;
          listingId?: string;
        },
        { idempotencyKey: idem },
      );
      return;
    case 'subscription_intent':
      await createSubscription(String(p.plan), { idempotencyKey: idem });
      return;
    case 'subscription_confirm':
      await confirmSubscriptionPayment(
        String(p.subscriptionId),
        p.mpesaReceipt as string | undefined,
        { idempotencyKey: idem },
      );
      return;
    case 'payment_intent':
      await initiateMpesaPayment(
        {
          purpose: String(p.purpose ?? 'generic'),
          amountKes: Number(p.amountKes ?? 0),
          phone: p.phone as string | undefined,
          referenceId: p.referenceId as string | undefined,
        },
        { idempotencyKey: idem },
      );
      return;
    case 'profile_patch':
      await updateProfile(
        p as {
          displayName?: string;
          email?: string | null;
          county?: string | null;
          bio?: string | null;
          avatarUrl?: string | null;
        },
        { idempotencyKey: idem },
      );
      return;
    case 'device_token':
      await registerDeviceToken(
        {
          token: String(p.token),
          platform: String(p.platform ?? 'unknown'),
        },
        { idempotencyKey: idem },
      );
      return;
    case 'media_upload':
      await uploadMedia(
        {
          uri: String(p.uri),
          purpose: String(p.purpose ?? 'generic'),
          fileName: p.fileName as string | undefined,
          mimeType: p.mimeType as string | undefined,
        },
        { idempotencyKey: idem },
      );
      return;
    default:
      throw new Error(`Unknown outbox type: ${item.type}`);
  }
}

export async function enqueueMutation(
  type: OutboxMutationType,
  payload: Record<string, unknown>,
  opts?: { dedupeKey?: string; idempotencyKey?: string },
): Promise<OutboxItem> {
  return enqueueOutbox(type, payload, opts);
}

/** Flush durable outbox when online + API healthy. */
export async function flushOutbox(): Promise<{ flushed: number; remaining: number }> {
  if (flushing) {
    const remaining = (await loadOutbox()).length;
    return { flushed: 0, remaining };
  }
  flushing = true;
  let flushed = 0;
  try {
    const health = await checkApiHealth({ force: true });
    if (health !== 'up') {
      const remaining = (await loadOutbox()).length;
      emit({ flushed: 0, remaining });
      return { flushed: 0, remaining };
    }

    const items = await loadOutbox();
    const now = Date.now();
    for (const item of [...items].reverse()) {
      const waitUntil = nextAttemptAt.get(item.id) ?? 0;
      if (now < waitUntil) continue;
      try {
        await dispatchItem(item);
        await removeOutboxItem(item.id);
        nextAttemptAt.delete(item.id);
        flushed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'flush failed';
        const updated = await markOutboxFailure(item.id, message);
        if (updated) {
          nextAttemptAt.set(item.id, Date.now() + outboxBackoffMs(updated.retries));
        } else {
          nextAttemptAt.delete(item.id);
        }
      }
    }
    const remaining = (await loadOutbox()).length;
    emit({ flushed, remaining });
    return { flushed, remaining };
  } finally {
    flushing = false;
  }
}
