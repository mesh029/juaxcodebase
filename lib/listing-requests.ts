import type { ListingRequest, ListingRequestKind, ServiceFeedback } from './api-types';

export const VIEWING_PICKUP_MODE_LABELS: Record<'taxi' | 'rider', string> = {
  taxi: 'Car / taxi pickup',
  rider: 'Motorbike rider',
};

export const LISTING_REQUEST_STEPS = [
  'requested',
  'agent_contacted',
  'rider_assigned',
  'rider_en_route',
  'viewing_completed',
] as const;

export const LISTING_REQUEST_STATUS_LABELS: Record<string, string> = {
  requested: 'Request submitted',
  agent_contacted: 'Agent contacted you',
  rider_assigned: 'Rider assigned',
  rider_en_route: 'Rider on the way',
  viewing_completed: 'Viewing complete',
  cancelled: 'Cancelled',
};

export function isActiveListingRequest(status: string): boolean {
  return !['viewing_completed', 'cancelled', 'resolved'].includes(status);
}

export function listingRequestStepIndex(status: string): number {
  if (status === 'cancelled') return -1;
  const idx = LISTING_REQUEST_STEPS.indexOf(status as (typeof LISTING_REQUEST_STEPS)[number]);
  return idx >= 0 ? idx : 0;
}

/** Legacy feedback rows (viewing/tour/stay) — fallback when new API empty. */
export function feedbackToListingRequest(f: ServiceFeedback): ListingRequest | null {
  if (!f.listingId || f.category !== 'suggestion') return null;
  if (f.service !== 'rental' && f.service !== 'bnb') return null;

  let kind: ListingRequestKind = 'stay';
  const title = f.title ?? '';
  if (/tour/i.test(title)) kind = 'tour';
  else if (/viewing/i.test(title)) kind = 'viewing';

  const titleMatch = f.body.match(/"([^"]+)"/);
  const legacyStatus =
    f.status === 'new' ? 'requested' : f.status === 'reviewed' ? 'agent_contacted' : f.status;

  return {
    id: f.id,
    listingId: f.listingId,
    listingTitle: titleMatch?.[1] ?? f.title ?? 'Listing',
    kind,
    service: f.service as 'rental' | 'bnb',
    status: legacyStatus,
    statusLabel: LISTING_REQUEST_STATUS_LABELS[legacyStatus] ?? f.status,
    stepIndex: listingRequestStepIndex(legacyStatus),
    createdAt: f.createdAt,
  };
}

export function parseListingRequestsFromFeedback(feedback: ServiceFeedback[]): ListingRequest[] {
  return feedback
    .map(feedbackToListingRequest)
    .filter((r): r is ListingRequest => r !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function mergeListingRequests(primary: ListingRequest[], legacy: ListingRequest[]): ListingRequest[] {
  const seen = new Set(primary.map((r) => r.listingId + r.kind + r.createdAt.slice(0, 10)));
  const merged = [...primary];
  for (const row of legacy) {
    const key = row.listingId + row.kind + row.createdAt.slice(0, 10);
    if (!seen.has(key)) merged.push(row);
  }
  return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
