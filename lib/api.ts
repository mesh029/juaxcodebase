import * as SecureStore from 'expo-secure-store';
import type {
  ApiErrorBody,
  ApiUser,
  AppCatalogBootstrap,
  AuthResponse,
  LaundryEstimate,
  LaundryOrder,
  LaundryStation,
  MamaFuaTasksResponse,
  OtpSendResponse,
  PublicListing,
  SubscriptionPlan,
  UserProfile,
  ServiceFeedback,
} from './api-types';
import { getApiBaseUrl as getConfiguredApiBaseUrl } from './config';
import { checkApiHealth, getLastApiHealth } from './offline/health';

export const TOKEN_KEY = 'juax_token';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_TIMEOUT_MS = 18_000;
const GET_DEDUPE_TTL_MS = 2_500;

export function getApiBaseUrl(): string {
  return getConfiguredApiBaseUrl();
}

function apiBase(): string {
  return getConfiguredApiBaseUrl();
}

export function isOfflineMode(): boolean {
  if (!apiBase()) return true;
  return getLastApiHealth() === 'down';
}

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

type ApiOpts = {
  method?: string;
  body?: unknown;
  token?: string | null;
  auth?: boolean;
  timeoutMs?: number;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Skip GET dedupe */
  noDedupe?: boolean;
};

const inflightGets = new Map<string, Promise<unknown>>();

function makeIdempotencyKey(): string {
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener('abort', onAbort);
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (init.signal) init.signal.removeEventListener('abort', onAbort);
  }
}

export async function api<T>(path: string, opts: ApiOpts = {}): Promise<T> {
  const BASE = apiBase();
  if (!BASE) {
    throw new ApiError('EXPO_PUBLIC_API_BASE_URL is not set', 'api_unconfigured');
  }

  const method = (opts.method ?? (opts.body ? 'POST' : 'GET')).toUpperCase();
  let token = opts.token;
  if (opts.auth !== false && token === undefined) {
    token = await getStoredToken();
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const isMutating = method !== 'GET' && method !== 'HEAD';
  if (isMutating) {
    headers['Idempotency-Key'] = opts.idempotencyKey ?? makeIdempotencyKey();
  }

  const url = `${BASE}${path}`;
  const dedupeKey = method === 'GET' && !opts.noDedupe ? `${token ?? ''}|${url}` : null;

  const run = async (): Promise<T> => {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: opts.signal,
        },
        opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
    } catch (err) {
      const aborted =
        (err instanceof Error && err.name === 'AbortError') ||
        (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError');
      throw new ApiError(
        aborted ? 'Request timed out' : 'Network error — check connection and API URL',
        aborted ? 'timeout' : 'network_error',
      );
    }

    const contentType = res.headers.get('content-type') ?? '';
    const data = (
      contentType.includes('application/json')
        ? await res.json().catch(() => ({}))
        : {}
    ) as T & ApiErrorBody;

    if (res.status === 401) {
      // Only clear token on authenticated routes — true session expiry.
      if (opts.auth !== false) {
        await clearStoredToken();
      }
      throw new ApiError(data.message ?? 'Session expired — sign in again', data.error ?? 'unauthorized', 401);
    }

    if (!res.ok) {
      const hint =
        res.status === 404
          ? 'Endpoint not found — redeploy backend or update the app'
          : data.message ?? `Request failed (${res.status})`;
      throw new ApiError(hint, data.error, res.status);
    }

    return data as T;
  };

  if (dedupeKey) {
    const existing = inflightGets.get(dedupeKey);
    if (existing) return existing as Promise<T>;
    const promise = run().finally(() => {
      setTimeout(() => inflightGets.delete(dedupeKey), GET_DEDUPE_TTL_MS);
    });
    inflightGets.set(dedupeKey, promise);
    return promise;
  }

  return run();
}

export type MutationOpts = { idempotencyKey?: string };

// ── Auth ────────────────────────────────────────────────────────────

export async function sendSignUpOtp(phone: string): Promise<OtpSendResponse> {
  return api('/api/v1/auth/signup/send', { method: 'POST', body: { phone }, auth: false });
}

export async function sendSignInOtp(phone: string): Promise<OtpSendResponse> {
  return api('/api/v1/auth/signin/send', { method: 'POST', body: { phone }, auth: false });
}

export async function verifySignUp(phone: string, code: string, name: string, county?: string): Promise<AuthResponse> {
  return api('/api/v1/auth/signup/verify', {
    method: 'POST',
    body: { phone, code, name, ...(county ? { county } : {}) },
    auth: false,
  });
}

export async function verifySignIn(phone: string, code: string): Promise<AuthResponse> {
  return api('/api/v1/auth/signin/verify', { method: 'POST', body: { phone, code }, auth: false });
}

export async function emailSignUp(
  email: string,
  password: string,
  name: string,
  county?: string,
  phone?: string,
): Promise<AuthResponse> {
  return api('/api/v1/auth/email/signup', {
    method: 'POST',
    body: { email, password, name, ...(county ? { county } : {}), ...(phone ? { phone } : {}) },
    auth: false,
  });
}

export async function emailSignIn(email: string, password: string): Promise<AuthResponse> {
  return api('/api/v1/auth/email/signin', { method: 'POST', body: { email, password }, auth: false });
}

export async function fetchMe(): Promise<{ user: ApiUser }> {
  return api('/api/v1/me', { auth: true });
}

export async function fetchProfile(): Promise<{ user: UserProfile }> {
  return api('/api/v1/me/profile', { auth: true });
}

// ── Catalog (prefer on app cold start — one request) ───────────────

export async function fetchAppCatalog(county = 'kisumu'): Promise<AppCatalogBootstrap> {
  try {
    return await api<AppCatalogBootstrap>(
      `/api/v1/catalog/bootstrap?county=${encodeURIComponent(county)}`,
      { auth: false },
    );
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) {
      throw err;
    }
  }

  const rentals = await fetchListings(county, 'rental');
  const bnbs = await fetchListings(county, 'bnb');
  const stations = await fetchLaundryStations();
  const mamaFua = await fetchMamaFuaTasks();
  const plans = await fetchSubscriptionPlans();

  return {
    county,
    kisumuOnly: county === 'kisumu',
    listings: { rental: rentals, bnb: bnbs },
    laundryStations: stations,
    mamaFua,
    subscriptionPlans: plans,
  };
}

// ── Listings ────────────────────────────────────────────────────────

export const PILOT_LISTING_COUNTIES = ['kisumu', 'nairobi', 'mombasa', 'nyamira'] as const;

export async function fetchListings(county: string, type: 'rental' | 'bnb'): Promise<PublicListing[]> {
  return api(`/api/v1/listings?county=${encodeURIComponent(county)}&type=${type}`, { auth: false });
}

export async function fetchAllPilotListings(type: 'rental' | 'bnb'): Promise<PublicListing[]> {
  const catalog = await fetchAppCatalog('pilot');
  return type === 'rental' ? catalog.listings.rental : catalog.listings.bnb;
}

export async function fetchListingsNearby(
  lat: number,
  lng: number,
  radiusKm = 5,
  type?: 'rental' | 'bnb',
  county?: string,
): Promise<PublicListing[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radiusKm: String(radiusKm),
  });
  if (county) params.set('county', county);
  if (type) params.set('type', type);
  const data = await api<{ listings: PublicListing[] }>(
    `/api/v1/listings/nearby?${params.toString()}`,
    { auth: false },
  );
  return data.listings ?? (data as unknown as PublicListing[]);
}

export async function fetchListingDetail(id: string): Promise<PublicListing> {
  return api(`/api/v1/listings/${id}`, { auth: true });
}

// ── Laundry ─────────────────────────────────────────────────────────

export async function fetchLaundryStations(): Promise<LaundryStation[]> {
  return api('/api/v1/laundry/stations', { auth: false });
}

export async function fetchMamaFuaTasks(): Promise<MamaFuaTasksResponse> {
  return api('/api/v1/laundry/mamafua/tasks', { auth: false });
}

export async function estimateLaundryOrder(body: Record<string, unknown>): Promise<LaundryEstimate> {
  return api('/api/v1/laundry/orders/estimate', { method: 'POST', body, auth: true });
}

export async function createLaundryOrder(
  body: Record<string, unknown>,
  opts?: MutationOpts,
): Promise<LaundryOrder> {
  return api('/api/v1/laundry/orders', {
    method: 'POST',
    body,
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
  });
}

export async function fetchLaundryOrders(): Promise<LaundryOrder[]> {
  return api('/api/v1/laundry/orders', { auth: true });
}

export async function confirmLaundryDelivery(orderId: string): Promise<{
  ok: boolean;
  order: LaundryOrder;
  message: string;
}> {
  return api(`/api/v1/laundry/orders/${orderId}/confirm`, { method: 'POST', auth: true });
}

// ── Subscriptions ───────────────────────────────────────────────────

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const data = await api<{ plans: SubscriptionPlan[] }>('/api/v1/subscriptions/plans', { auth: false });
  return data.plans;
}

export async function fetchActiveSubscription(): Promise<{
  active: boolean;
  subscription: import('./api-types').Subscription | null;
}> {
  return api('/api/v1/subscriptions/active', { auth: true });
}

export async function createSubscription(
  plan: string,
  opts?: MutationOpts,
): Promise<{
  subscription: import('./api-types').Subscription;
  message: string;
}> {
  return api('/api/v1/subscriptions', {
    method: 'POST',
    body: { plan },
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
  });
}

export async function confirmSubscriptionPayment(
  subscriptionId: string,
  mpesaReceipt?: string,
  opts?: MutationOpts,
): Promise<{ subscription: import('./api-types').Subscription; message: string }> {
  const body: Record<string, unknown> = {};
  if (mpesaReceipt) body.mpesaReceipt = mpesaReceipt;
  else if (__DEV__) body.mpesaReceipt = `DEV-MPESA-${Date.now()}`;
  return api(`/api/v1/subscriptions/${subscriptionId}/confirm`, {
    method: 'POST',
    body,
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
  });
}

// ── BnB bookings ────────────────────────────────────────────────────

export async function fetchBnbBookings(): Promise<import('./api-types').BnbBooking[]> {
  return api('/api/v1/bnb/bookings', { auth: true });
}

export async function createBnbBooking(
  body: {
    listingId: string;
    checkIn: string;
    checkOut: string;
    guests?: number;
  },
  opts?: MutationOpts,
): Promise<{ booking: import('./api-types').BnbBooking; message: string }> {
  return api('/api/v1/bnb/bookings', {
    method: 'POST',
    body,
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
  });
}

export async function confirmBnbBookingPayment(
  bookingId: string,
  mpesaReceipt?: string,
  opts?: MutationOpts,
): Promise<{ booking: import('./api-types').BnbBooking; message: string }> {
  const body: Record<string, unknown> = {};
  if (mpesaReceipt) body.mpesaReceipt = mpesaReceipt;
  else if (__DEV__) body.mpesaReceipt = `DEV-MPESA-${Date.now()}`;
  return api(`/api/v1/bnb/bookings/${bookingId}/confirm`, {
    method: 'POST',
    body,
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
  });
}

export async function updateProfile(
  body: {
    displayName?: string;
    email?: string | null;
    county?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
  },
  opts?: MutationOpts,
): Promise<{ user: UserProfile }> {
  return api('/api/v1/me/profile', {
    method: 'PATCH',
    body,
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
  });
}

export async function fetchMyFeedback(service?: string): Promise<{ feedback: ServiceFeedback[] }> {
  const q = service ? `?service=${encodeURIComponent(service)}` : '';
  return api(`/api/v1/me/feedback${q}`, { auth: true });
}

// ── Feedback / listing requests ─────────────────────────────────────

export async function submitFeedback(
  body: {
    service: 'fua' | 'mamafua' | 'bnb' | 'rental' | 'general' | 'app';
    category?: 'rating' | 'complaint' | 'suggestion' | 'praise';
    rating?: number;
    title?: string;
    body: string;
    orderId?: string;
    listingId?: string;
  },
  opts?: MutationOpts,
): Promise<{ feedback: ServiceFeedback }> {
  return api('/api/v1/feedback', {
    method: 'POST',
    body,
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
  });
}

export async function createListingRequest(
  body: {
    listingId: string;
    kind: 'viewing' | 'tour' | 'stay';
    userNote?: string;
    pickupMode?: 'taxi' | 'rider';
  },
  opts?: MutationOpts,
): Promise<{ request: import('./api-types').ListingRequest }> {
  return api('/api/v1/me/listing-requests', {
    method: 'POST',
    body,
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
  });
}

export async function fetchMyListingRequests(): Promise<{ requests: import('./api-types').ListingRequest[] }> {
  return api('/api/v1/me/listing-requests', { auth: true });
}

export async function fetchListingRequest(id: string): Promise<{ request: import('./api-types').ListingRequest }> {
  return api(`/api/v1/me/listing-requests/${id}`, { auth: true });
}

export async function replyToListingRequest(
  id: string,
  body: string,
  opts?: MutationOpts,
): Promise<{ request: import('./api-types').ListingRequest; message: import('./api-types').ListingRequestMessage }> {
  return api(`/api/v1/me/listing-requests/${id}/messages`, {
    method: 'POST',
    body: { body },
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
  });
}

// ── Activity / realtime helpers ─────────────────────────────────────

export async function fetchActivitySnapshot(): Promise<unknown> {
  return api('/api/v1/activity/snapshot', { auth: true, noDedupe: true });
}

// ── Device token / push ─────────────────────────────────────────────

export async function registerDeviceToken(
  body: { token: string; platform: string },
  opts?: MutationOpts,
): Promise<{ ok: boolean }> {
  return api('/api/v1/me/device-token', {
    method: 'POST',
    body,
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
  });
}

// ── Media upload (server → Dropbox when configured) ─────────────────

export async function uploadMedia(
  body: { uri: string; purpose: string; fileName?: string; mimeType?: string },
  opts?: MutationOpts,
): Promise<{ url: string; id?: string }> {
  return api('/api/v1/media/upload', {
    method: 'POST',
    body,
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
    timeoutMs: 60_000,
  });
}

// ── M-Pesa (client never holds Daraja secrets) ──────────────────────

export type MpesaIntentResponse = {
  ok: boolean;
  intentId?: string;
  checkoutRequestId?: string;
  status?: string;
  message?: string;
  devMode?: boolean;
};

export async function initiateMpesaPayment(
  body: {
    purpose: string;
    amountKes: number;
    phone?: string;
    referenceId?: string;
  },
  opts?: MutationOpts,
): Promise<MpesaIntentResponse> {
  return api('/api/v1/payments/mpesa/stk', {
    method: 'POST',
    body,
    auth: true,
    idempotencyKey: opts?.idempotencyKey,
  });
}

export async function fetchMpesaPaymentStatus(intentId: string): Promise<MpesaIntentResponse> {
  return api(`/api/v1/payments/mpesa/status?intentId=${encodeURIComponent(intentId)}`, {
    auth: true,
    noDedupe: true,
  });
}

/** Probe API; used by OfflineProvider. */
export async function ensureApiHealth(force = false) {
  return checkApiHealth({ force });
}
