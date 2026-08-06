import type { ListingRequest, ListingRequestMessage } from '../api-types';

export type ActivityFeedKind = 'chat' | 'status';
export type ActivityFeedEntity = 'listing_request' | 'laundry' | 'stay';

export type ActivityFeedItem = {
  id: string;
  kind: ActivityFeedKind;
  entity: ActivityFeedEntity;
  entityId: string;
  title: string;
  body: string;
  timeLabel: string;
  sortMs: number;
};

export type ActivityViewedSnapshot = {
  requestMessages: Map<string, string>;
  requestStatus: Map<string, string>;
  laundryStatus: Map<string, string>;
  stayStatus: Map<string, string>;
};

export function emptyActivityViewed(): ActivityViewedSnapshot {
  return {
    requestMessages: new Map(),
    requestStatus: new Map(),
    laundryStatus: new Map(),
    stayStatus: new Map(),
  };
}

export function listingRequestMessageKey(req: ListingRequest): string {
  const latest = req.messages?.[req.messages.length - 1];
  return latest ? `${latest.senderRole}:${latest.createdAt}` : '';
}

export function listingRequestActivityTitle(req: ListingRequest): string {
  if (req.kind === 'tour') return `BnB tour · ${req.listingTitle}`;
  if (req.kind === 'viewing') return `House viewing · ${req.listingTitle}`;
  return `Stay · ${req.listingTitle}`;
}

export function mergeRequestMessages(
  existing: ListingRequestMessage[] | undefined,
  incoming: ListingRequestMessage[] | undefined,
): ListingRequestMessage[] {
  const rows = [...(existing ?? []), ...(incoming ?? [])];
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (!row?.id || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function mergeListingRequestWithLocalMessages(
  previous: ListingRequest | null | undefined,
  incoming: ListingRequest,
): ListingRequest {
  if (!previous) return incoming;
  return {
    ...previous,
    ...incoming,
    messages: mergeRequestMessages(previous.messages, incoming.messages),
  };
}
