type Coordinates = { latitude: number; longitude: number };
type CountyKey = 'nairobi' | 'mombasa' | 'kisumu' | 'nyamira';

export const COUNTY_CENTER_COORDS: Record<CountyKey, Coordinates> = {
  nairobi: { latitude: -1.2864, longitude: 36.8172 },
  mombasa: { latitude: -4.0435, longitude: 39.6682 },
  kisumu: { latitude: -0.0917, longitude: 34.768 },
  nyamira: { latitude: -0.5669, longitude: 34.9341 },
};

export type ListingDistanceReference = {
  coords: Coordinates;
  isApproximate: boolean;
};

/** Placeholder when GPS and county are unknown — distances stay hidden. */
export const NO_DISTANCE_REFERENCE: ListingDistanceReference = {
  coords: { latitude: 91, longitude: 181 },
  isApproximate: true,
};

function getDistanceKm(from: Coordinates, to: Coordinates): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function hasValidMapCoords(coords: Coordinates): boolean {
  return (
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude) &&
    Math.abs(coords.latitude) <= 90 &&
    Math.abs(coords.longitude) <= 180 &&
    !(coords.latitude === 0 && coords.longitude === 0)
  );
}

export function formatListingDistance(km: number): string {
  if (km < 0.15) return 'Very close';
  if (km < 1) return `${(Math.round(km * 10) / 10).toFixed(1)} km away`;
  if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

export function getListingDistanceReference(
  userCoords: Coordinates | null,
  county: CountyKey | null,
): ListingDistanceReference | null {
  if (userCoords) return { coords: userCoords, isApproximate: false };
  if (county) return { coords: COUNTY_CENTER_COORDS[county], isApproximate: true };
  return null;
}

export function listingDistanceKm(
  listingCoords: Coordinates,
  reference: Coordinates | null,
): number | null {
  if (!reference || !hasValidMapCoords(listingCoords)) return null;
  return getDistanceKm(reference, listingCoords);
}

export function formatListingDistanceLabel(
  listingCoords: Coordinates,
  reference: ListingDistanceReference,
): string | null {
  const km = listingDistanceKm(listingCoords, reference.coords);
  if (km == null) return null;
  return `${reference.isApproximate ? '~' : ''}${formatListingDistance(km)}`;
}

export function formatListingMetaLine(
  listingCoords: Coordinates,
  price: string,
  reference: ListingDistanceReference,
  fallbackCounty?: string,
): string {
  const distLabel = formatListingDistanceLabel(listingCoords, reference);
  if (distLabel) return `${distLabel} · ${price}`;
  if (fallbackCounty) return `${fallbackCounty} · ${price}`;
  return price;
}
