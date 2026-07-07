export type ApiUser = {
  id: string;
  phone: string;
  displayName: string | null;
  email?: string | null;
  county?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  role: 'user' | 'agent' | 'admin';
  signedUpAt?: string;
  lastLoginAt?: string | null;
};

export type PublicListing = {
  id: string;
  type: 'bnb' | 'rental';
  title: string;
  description: string | null;
  neighborhood: string;
  locationName: string;
  county: string;
  beds: number;
  baths: number;
  sqm?: number | null;
  furnished?: boolean;
  priceKes: number;
  priceUnit: string;
  approxPin: { lat: number; lng: number };
  locationLocked: boolean;
  vacant: boolean;
  distanceKm?: number;
  amenities: string[];
  coverImageUrl?: string | null;
  imageUrls?: string[];
  exactAddress?: string;
  exactPin?: { lat: number; lng: number };
  hostName?: string;
  hostPhone?: string;
};

export type LaundryStation = {
  id: string;
  code: string;
  name: string;
  address: string;
  county: string;
  pin: { lat: number; lng: number };
};

export type MamaFuaTask = {
  id: string;
  label: string;
  description: string;
  priceKes: number;
  acceptsLoadKg: boolean;
};

export type MamaFuaTasksResponse = {
  dispatchFeeKes: number;
  description: string;
  tasks: MamaFuaTask[];
  convenienceTimes?: MamaFuaConvenienceBand[];
};

export type MamaFuaConvenienceBand = {
  id: 'asap' | 'morning' | 'afternoon' | 'evening';
  label: string;
  shortLabel: string;
  description: string;
  timeWindow: string | null;
};

export type AppCatalogBootstrap = {
  county: string;
  kisumuOnly: boolean;
  listings: {
    rental: PublicListing[];
    bnb: PublicListing[];
  };
  laundryStations: LaundryStation[];
  mamaFua: MamaFuaTasksResponse;
  subscriptionPlans: SubscriptionPlan[];
};

export type SubscriptionPlan = {
  plan: string;
  priceKes: number;
  durationHours: number;
  label: string;
};

export type Subscription = {
  id: string;
  plan: string;
  priceKes: number;
  startsAt: string;
  expiresAt: string;
  paymentStatus: string;
  mpesaReceipt?: string | null;
  createdAt: string;
  active: boolean;
};

export type BnbBooking = {
  id: string;
  listingId: string;
  listing?: { id: string; title: string; neighborhood: string; county: string };
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  nightlyRate: number;
  cleaningFee: number;
  totalKes: number;
  status: string;
  paymentStatus: string;
  mpesaReceipt?: string | null;
  createdAt: string;
  updatedAt: string;
  confirmed: boolean;
};

export type LaundryOrder = {
  id: string;
  pickupMode: string;
  serviceType?: 'laundry' | 'mamafua';
  pickupLabel: string;
  loadLabel: string;
  loadKg: number;
  tasks?: string[];
  taskLabels?: string[];
  tasksFeeKes?: number;
  dispatchFeeKes?: number;
  totalKes: number;
  estimateKes?: number;
  status: string;
  scheduleDate: string;
  scheduleBand: string;
  steps: string[];
  currentStep: number;
  etaMinutes?: number;
  createdAt: string;
  paymentStatus?: string;
  customerConfirmedAt?: string | null;
};

export type ServiceFeedback = {
  id: string;
  service: string;
  category: string;
  rating: number | null;
  title: string | null;
  body: string;
  orderId: string | null;
  listingId: string | null;
  status: string;
  createdAt: string;
};

export type ListingRequestKind = 'viewing' | 'tour' | 'stay';

export type ViewingPickupMode = 'taxi' | 'rider';

export type ListingRequestStatus =
  | 'requested'
  | 'agent_contacted'
  | 'rider_assigned'
  | 'rider_en_route'
  | 'viewing_completed'
  | 'cancelled';

export type ListingRequestMessage = {
  id: string;
  senderRole: 'user' | 'admin' | 'system';
  body: string;
  createdAt: string;
};

export type ListingRequest = {
  id: string;
  listingId: string;
  listingTitle: string;
  kind: ListingRequestKind;
  service: 'rental' | 'bnb';
  status: ListingRequestStatus | string;
  statusLabel?: string;
  stepIndex?: number;
  userNote?: string | null;
  pickupMode?: ViewingPickupMode | null;
  pickupModeLabel?: string | null;
  riderName?: string | null;
  riderPhone?: string | null;
  scheduledAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  messages?: ListingRequestMessage[];
};

export type LaundryEstimate = {
  estimateKes: number;
  pickupFeeKes?: number;
  loadFeeKes?: number;
  tasksFeeKes?: number;
  dispatchFeeKes?: number;
  breakdown?: Record<string, number>;
};

export type UserProfile = ApiUser & {
  stats?: { laundryOrders: number; bnbBookings: number; feedback: number };
};

export type OtpSendResponse = {
  ok: boolean;
  devMode?: boolean;
  devCode?: string;
  message?: string;
  flow?: string;
};

export type AuthResponse = {
  token: string;
  user: ApiUser;
  isNewUser?: boolean;
  flow?: string;
};

export type ApiErrorBody = {
  error?: string;
  message?: string;
};
