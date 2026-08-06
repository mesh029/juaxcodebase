/**
 * Repository-style mutators: try API when healthy, else durable outbox.
 * Screens should prefer these over raw api() for write paths.
 */
import {
  ApiError,
  confirmBnbBookingPayment,
  confirmSubscriptionPayment,
  createBnbBooking,
  createLaundryOrder,
  createListingRequest,
  createSubscription,
  replyToListingRequest,
  submitFeedback,
  updateProfile,
  initiateMpesaPayment,
  type MpesaIntentResponse,
} from './api';
import { checkApiHealth } from './offline/health';
import { enqueueMutation } from './offline/sync';

async function canWriteOnline(): Promise<boolean> {
  const health = await checkApiHealth();
  return health === 'up';
}

export async function mutateLaundryOrder(body: Record<string, unknown>) {
  if (await canWriteOnline()) {
    try {
      return { ok: true as const, queued: false, result: await createLaundryOrder(body) };
    } catch (err) {
      if (!(err instanceof ApiError && (err.code === 'network_error' || err.code === 'timeout'))) throw err;
    }
  }
  const item = await enqueueMutation('laundry_order', body, {
    dedupeKey: `laundry:${JSON.stringify(body).slice(0, 120)}`,
  });
  return { ok: true as const, queued: true, outboxId: item.id, result: null };
}

export async function mutateBnbBooking(body: {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
}) {
  if (await canWriteOnline()) {
    try {
      return { ok: true as const, queued: false, result: await createBnbBooking(body) };
    } catch (err) {
      if (!(err instanceof ApiError && (err.code === 'network_error' || err.code === 'timeout'))) throw err;
    }
  }
  const item = await enqueueMutation('bnb_booking', body, {
    dedupeKey: `bnb:${body.listingId}:${body.checkIn}:${body.checkOut}`,
  });
  return { ok: true as const, queued: true, outboxId: item.id, result: null };
}

export async function mutateBnbPaymentConfirm(bookingId: string, mpesaReceipt?: string) {
  if (await canWriteOnline()) {
    try {
      return {
        ok: true as const,
        queued: false,
        result: await confirmBnbBookingPayment(bookingId, mpesaReceipt),
      };
    } catch (err) {
      if (!(err instanceof ApiError && (err.code === 'network_error' || err.code === 'timeout'))) throw err;
    }
  }
  const item = await enqueueMutation(
    'bnb_payment_confirm',
    { bookingId, mpesaReceipt },
    { dedupeKey: `bnb_pay:${bookingId}` },
  );
  return { ok: true as const, queued: true, outboxId: item.id, result: null };
}

export async function mutateListingRequest(body: {
  listingId: string;
  kind: 'viewing' | 'tour' | 'stay';
  userNote?: string;
  pickupMode?: 'taxi' | 'rider';
}) {
  if (await canWriteOnline()) {
    try {
      return { ok: true as const, queued: false, result: await createListingRequest(body) };
    } catch (err) {
      if (!(err instanceof ApiError && (err.code === 'network_error' || err.code === 'timeout'))) throw err;
    }
  }
  const item = await enqueueMutation('listing_request', body, {
    dedupeKey: `listing_req:${body.listingId}:${body.kind}`,
  });
  return { ok: true as const, queued: true, outboxId: item.id, result: null };
}

export async function mutateListingRequestReply(id: string, body: string) {
  if (await canWriteOnline()) {
    try {
      return { ok: true as const, queued: false, result: await replyToListingRequest(id, body) };
    } catch (err) {
      if (!(err instanceof ApiError && (err.code === 'network_error' || err.code === 'timeout'))) throw err;
    }
  }
  const item = await enqueueMutation('listing_request_reply', { id, body });
  return { ok: true as const, queued: true, outboxId: item.id, result: null };
}

export async function mutateFeedback(body: {
  service: 'fua' | 'mamafua' | 'bnb' | 'rental' | 'general' | 'app';
  category?: 'rating' | 'complaint' | 'suggestion' | 'praise';
  rating?: number;
  title?: string;
  body: string;
  orderId?: string;
  listingId?: string;
}) {
  if (await canWriteOnline()) {
    try {
      return { ok: true as const, queued: false, result: await submitFeedback(body) };
    } catch (err) {
      if (!(err instanceof ApiError && (err.code === 'network_error' || err.code === 'timeout'))) throw err;
    }
  }
  const item = await enqueueMutation('feedback', body);
  return { ok: true as const, queued: true, outboxId: item.id, result: null };
}

export async function mutateSubscription(plan: string) {
  if (await canWriteOnline()) {
    try {
      return { ok: true as const, queued: false, result: await createSubscription(plan) };
    } catch (err) {
      if (!(err instanceof ApiError && (err.code === 'network_error' || err.code === 'timeout'))) throw err;
    }
  }
  const item = await enqueueMutation('subscription_intent', { plan }, { dedupeKey: `sub:${plan}` });
  return { ok: true as const, queued: true, outboxId: item.id, result: null };
}

export async function mutateSubscriptionConfirm(subscriptionId: string, mpesaReceipt?: string) {
  if (await canWriteOnline()) {
    try {
      return {
        ok: true as const,
        queued: false,
        result: await confirmSubscriptionPayment(subscriptionId, mpesaReceipt),
      };
    } catch (err) {
      if (!(err instanceof ApiError && (err.code === 'network_error' || err.code === 'timeout'))) throw err;
    }
  }
  const item = await enqueueMutation(
    'subscription_confirm',
    { subscriptionId, mpesaReceipt },
    { dedupeKey: `sub_pay:${subscriptionId}` },
  );
  return { ok: true as const, queued: true, outboxId: item.id, result: null };
}

export async function mutateProfilePatch(body: {
  displayName?: string;
  email?: string | null;
  county?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}) {
  if (await canWriteOnline()) {
    try {
      return { ok: true as const, queued: false, result: await updateProfile(body) };
    } catch (err) {
      if (!(err instanceof ApiError && (err.code === 'network_error' || err.code === 'timeout'))) throw err;
    }
  }
  const item = await enqueueMutation('profile_patch', body, { dedupeKey: 'profile_patch' });
  return { ok: true as const, queued: true, outboxId: item.id, result: null };
}

/** M-Pesa STK — never invents success in production; queues intent when offline. */
export async function mutateMpesaIntent(body: {
  purpose: string;
  amountKes: number;
  phone?: string;
  referenceId?: string;
}): Promise<{ queued: boolean; result: MpesaIntentResponse | null }> {
  if (await canWriteOnline()) {
    try {
      const started = await initiateMpesaPayment(body);
      if (started.intentId || started.checkoutRequestId) {
        const id = started.intentId ?? started.checkoutRequestId!;
        // Short poll for webhook / dev auto-complete — reuse existing pending UI.
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 700));
          try {
            const { fetchMpesaPaymentStatus } = await import('./api');
            const status = await fetchMpesaPaymentStatus(id);
            if (status.status === 'completed' || status.status === 'success') {
              return { queued: false, result: { ...started, ...status, status: 'completed' } };
            }
          } catch {
            break;
          }
        }
      }
      return { queued: false, result: started };
    } catch (err) {
      if (!(err instanceof ApiError && (err.code === 'network_error' || err.code === 'timeout' || err.status === 404))) {
        throw err;
      }
    }
  }
  await enqueueMutation('payment_intent', body, {
    dedupeKey: `pay:${body.purpose}:${body.referenceId ?? ''}`,
  });
  return {
    queued: true,
    result: {
      ok: true,
      status: 'queued',
      message: 'Payment will start when you are back online',
    },
  };
}
