import type {
  ApiUser,
  AppCatalogBootstrap,
  BnbBooking,
  LaundryOrder,
  ListingRequest,
  UserProfile,
} from '../api-types';
import { storageGet, storageRemove, storageSet } from './storage';

export const CACHE_KEYS = {
  catalog: 'cache:catalog',
  profile: 'cache:profile',
  user: 'cache:user',
  laundryOrders: 'cache:laundryOrders',
  bnbBookings: 'cache:bnbBookings',
  listingRequests: 'cache:listingRequests',
  inbox: 'cache:inbox',
  trips: 'cache:trips',
  mapPins: 'cache:mapPins',
  mediaIndex: 'cache:mediaIndex',
  activitySnapshot: 'cache:activitySnapshot',
} as const;

export type CachedCatalog = AppCatalogBootstrap & { cachedAt: string };
export type CachedTrips = { items: unknown[]; cachedAt: string };
export type CachedInbox = { items: unknown[]; cachedAt: string };
export type LocalMediaEntry = {
  id: string;
  localUri: string;
  remoteUrl?: string;
  purpose: string;
  createdAt: string;
};

export async function cacheCatalog(catalog: AppCatalogBootstrap): Promise<void> {
  await storageSet<CachedCatalog>(CACHE_KEYS.catalog, {
    ...catalog,
    cachedAt: new Date().toISOString(),
  });
}

export async function loadCachedCatalog(): Promise<CachedCatalog | null> {
  return storageGet<CachedCatalog>(CACHE_KEYS.catalog);
}

export async function cacheUser(user: ApiUser): Promise<void> {
  await storageSet(CACHE_KEYS.user, user);
}

export async function loadCachedUser(): Promise<ApiUser | null> {
  return storageGet<ApiUser>(CACHE_KEYS.user);
}

export async function cacheProfile(profile: UserProfile): Promise<void> {
  await storageSet(CACHE_KEYS.profile, profile);
}

export async function loadCachedProfile(): Promise<UserProfile | null> {
  return storageGet<UserProfile>(CACHE_KEYS.profile);
}

export async function clearAuthCaches(): Promise<void> {
  await Promise.all([
    storageRemove(CACHE_KEYS.user),
    storageRemove(CACHE_KEYS.profile),
    storageRemove(CACHE_KEYS.laundryOrders),
    storageRemove(CACHE_KEYS.bnbBookings),
    storageRemove(CACHE_KEYS.listingRequests),
    storageRemove(CACHE_KEYS.activitySnapshot),
  ]);
}

export async function cacheLaundryOrders(orders: LaundryOrder[]): Promise<void> {
  await storageSet(CACHE_KEYS.laundryOrders, { items: orders, cachedAt: new Date().toISOString() });
}

export async function loadCachedLaundryOrders(): Promise<LaundryOrder[]> {
  const row = await storageGet<{ items: LaundryOrder[] }>(CACHE_KEYS.laundryOrders);
  return row?.items ?? [];
}

export async function cacheBnbBookings(bookings: BnbBooking[]): Promise<void> {
  await storageSet(CACHE_KEYS.bnbBookings, { items: bookings, cachedAt: new Date().toISOString() });
}

export async function loadCachedBnbBookings(): Promise<BnbBooking[]> {
  const row = await storageGet<{ items: BnbBooking[] }>(CACHE_KEYS.bnbBookings);
  return row?.items ?? [];
}

export async function cacheListingRequests(requests: ListingRequest[]): Promise<void> {
  await storageSet(CACHE_KEYS.listingRequests, {
    items: requests,
    cachedAt: new Date().toISOString(),
  });
}

export async function loadCachedListingRequests(): Promise<ListingRequest[]> {
  const row = await storageGet<{ items: ListingRequest[] }>(CACHE_KEYS.listingRequests);
  return row?.items ?? [];
}

export async function cacheActivitySnapshot(snapshot: unknown): Promise<void> {
  await storageSet(CACHE_KEYS.activitySnapshot, {
    snapshot,
    cachedAt: new Date().toISOString(),
  });
}

export async function loadCachedActivitySnapshot(): Promise<unknown | null> {
  const row = await storageGet<{ snapshot: unknown }>(CACHE_KEYS.activitySnapshot);
  return row?.snapshot ?? null;
}

export async function cacheMapPins(pins: unknown[]): Promise<void> {
  await storageSet(CACHE_KEYS.mapPins, { pins, cachedAt: new Date().toISOString() });
}

export async function loadCachedMapPins(): Promise<unknown[]> {
  const row = await storageGet<{ pins: unknown[] }>(CACHE_KEYS.mapPins);
  return row?.pins ?? [];
}

export async function upsertLocalMedia(entry: LocalMediaEntry): Promise<void> {
  const row = (await storageGet<{ items: LocalMediaEntry[] }>(CACHE_KEYS.mediaIndex)) ?? {
    items: [],
  };
  const next = [entry, ...row.items.filter((i) => i.id !== entry.id)].slice(0, 200);
  await storageSet(CACHE_KEYS.mediaIndex, { items: next });
}

export async function loadLocalMediaIndex(): Promise<LocalMediaEntry[]> {
  const row = await storageGet<{ items: LocalMediaEntry[] }>(CACHE_KEYS.mediaIndex);
  return row?.items ?? [];
}
