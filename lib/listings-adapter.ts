import type { PublicListing, LaundryStation } from './api-types';

type Coordinates = { latitude: number; longitude: number };
type CountyKey = 'nairobi' | 'mombasa' | 'kisumu' | 'nyamira';

const DEFAULT_IMAGE = {
  uri: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80',
};

function toCounty(raw: string): CountyKey {
  const c = raw.toLowerCase() as CountyKey;
  if (c === 'nairobi' || c === 'mombasa' || c === 'kisumu' || c === 'nyamira') return c;
  return 'kisumu';
}

function toCoords(pin: { lat: number; lng: number }): Coordinates {
  return { latitude: pin.lat, longitude: pin.lng };
}

function toImageSource(url?: string | null) {
  if (url) return { uri: url };
  return DEFAULT_IMAGE;
}

export type AdaptedHouseListing = {
  id: string;
  title: string;
  county: CountyKey;
  coords: Coordinates;
  distanceKm: number;
  price: string;
  image: { uri: string };
  gallery: { uri: string }[];
  detailHighlights: string[];
  beds: number;
  baths: number;
  amenities: string[];
  has3dTour: boolean;
  locationLocked: boolean;
  description?: string | null;
  exactAddress?: string;
  hostName?: string;
  hostPhone?: string;
  exactCoords?: Coordinates;
};

export type AdaptedBnbListing = {
  id: string;
  title: string;
  county: CountyKey;
  distanceKm: number;
  rating: string;
  price: string;
  image: { uri: string };
  gallery: { uri: string }[];
  detailHighlights: string[];
  coords: Coordinates;
  exploreReason: string;
  exploreTip?: string;
  beds: number;
  guests: number;
  amenities: string[];
  has3dTour: boolean;
  locationLocked: boolean;
  description?: string | null;
  exactAddress?: string;
  hostName?: string;
  hostPhone?: string;
  exactCoords?: Coordinates;
};

export type AdaptedPlaceStation = {
  id: string;
  name: string;
  subtitle: string;
  county: CountyKey;
  coords: Coordinates;
};

export function adaptRentalListing(l: PublicListing): AdaptedHouseListing {
  const images = (l.imageUrls?.length ? l.imageUrls : l.coverImageUrl ? [l.coverImageUrl] : []).map((u) => ({ uri: u }));
  const highlights = l.description
    ? l.description.split(/[.!]\s+/).slice(0, 3)
    : [`${l.neighborhood} · ${l.beds} bed`, l.vacant ? 'Vacant now' : 'Occupied'];
  return {
    id: l.id,
    title: l.title,
    county: toCounty(l.county),
    coords: toCoords(l.approxPin),
    distanceKm: l.distanceKm ?? 0,
    price: `KES ${l.priceKes.toLocaleString()} / ${l.priceUnit}`,
    image: toImageSource(l.coverImageUrl),
    gallery: images.length ? images : [toImageSource(l.coverImageUrl)],
    detailHighlights: highlights,
    beds: l.beds,
    baths: l.baths,
    amenities: l.amenities ?? [],
    has3dTour: false,
    locationLocked: l.locationLocked,
    description: l.description,
    exactAddress: l.exactAddress,
    hostName: l.hostName,
    hostPhone: l.hostPhone,
    exactCoords: l.exactPin && !l.locationLocked ? toCoords(l.exactPin) : undefined,
  };
}

export function adaptBnbListing(l: PublicListing): AdaptedBnbListing {
  const images = (l.imageUrls?.length ? l.imageUrls : l.coverImageUrl ? [l.coverImageUrl] : []).map((u) => ({ uri: u }));
  return {
    id: l.id,
    title: l.title,
    county: toCounty(l.county),
    distanceKm: l.distanceKm ?? 0,
    rating: '4.8',
    price: `KES ${l.priceKes.toLocaleString()} / ${l.priceUnit}`,
    image: toImageSource(l.coverImageUrl),
    gallery: images.length ? images : [toImageSource(l.coverImageUrl)],
    detailHighlights: l.description ? [l.description.slice(0, 80)] : [`${l.neighborhood} stay`],
    coords: toCoords(l.approxPin),
    exploreReason: l.description ?? `Stay in ${l.neighborhood}, ${l.locationName}`,
    beds: l.beds,
    guests: Math.max(l.beds * 2, 2),
    amenities: l.amenities ?? [],
    has3dTour: false,
    locationLocked: l.locationLocked,
    description: l.description,
    exactAddress: l.exactAddress,
    hostName: l.hostName,
    hostPhone: l.hostPhone,
    exactCoords: l.exactPin && !l.locationLocked ? toCoords(l.exactPin) : undefined,
  };
}

export function mergeListingUnlockFields<T extends AdaptedHouseListing | AdaptedBnbListing>(
  base: T,
  live: import('./api-types').PublicListing | null,
): T {
  if (!live) return base;
  const unlocked = !live.locationLocked;
  return {
    ...base,
    locationLocked: live.locationLocked,
    exactAddress: live.exactAddress ?? base.exactAddress,
    hostName: live.hostName ?? base.hostName,
    hostPhone: live.hostPhone ?? base.hostPhone,
    coords: unlocked && live.exactPin ? toCoords(live.exactPin) : base.coords,
    exactCoords: unlocked && live.exactPin ? toCoords(live.exactPin) : base.exactCoords,
  };
}

export function adaptStation(s: LaundryStation): AdaptedPlaceStation {
  return {
    id: s.id,
    name: s.name,
    subtitle: s.address,
    county: toCounty(s.county),
    coords: toCoords(s.pin),
  };
}
