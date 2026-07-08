import { getDistanceKm, type Coordinates } from './listings-distance';

export type CountyKey = 'nairobi' | 'mombasa' | 'kisumu' | 'nyamira';

export const SUPPORTED_COUNTIES: CountyKey[] = ['nairobi', 'mombasa', 'kisumu', 'nyamira'];

const COUNTY_ALIASES: Record<CountyKey, string[]> = {
  nairobi: ['nairobi'],
  mombasa: ['mombasa'],
  kisumu: ['kisumu'],
  nyamira: ['nyamira', 'nyamira county', 'keroka', 'manga'],
};

/** Tighter radii — Kisumu/Nyamira must not overlap (they are ~55 km apart). */
const COUNTY_DETECTION: { county: CountyKey; coords: Coordinates; maxKm: number }[] = [
  { county: 'nairobi', coords: { latitude: -1.2864, longitude: 36.8172 }, maxKm: 55 },
  { county: 'mombasa', coords: { latitude: -4.0435, longitude: 39.6682 }, maxKm: 65 },
  { county: 'kisumu', coords: { latitude: -0.0917, longitude: 34.768 }, maxKm: 45 },
  { county: 'nyamira', coords: { latitude: -0.5669, longitude: 34.9341 }, maxKm: 40 },
];

export function normalizeCountyKey(raw: string | null | undefined): CountyKey | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  for (const county of SUPPORTED_COUNTIES) {
    if (COUNTY_ALIASES[county].some((alias) => normalized.includes(alias))) {
      return county;
    }
    if (normalized === county) return county;
  }
  return null;
}

export function detectCountyFromCoords(coords: Coordinates): CountyKey | null {
  const ranked = COUNTY_DETECTION.map((c) => ({
    county: c.county,
    distance: getDistanceKm(coords, c.coords),
    maxKm: c.maxKm,
  })).sort((a, b) => a.distance - b.distance);

  const nearest = ranked[0];
  if (!nearest || nearest.distance > nearest.maxKm) return null;
  return nearest.county;
}

/** GPS / geocode first; profile county is only a fallback when location is unavailable. */
export function resolveListingsCounty(
  userCoords: Coordinates | null,
  profileCountyText: string | null | undefined,
  gpsCountyHint?: CountyKey | null,
): CountyKey | null {
  if (gpsCountyHint) return gpsCountyHint;
  if (userCoords) {
    const fromGps = detectCountyFromCoords(userCoords);
    if (fromGps) return fromGps;
  }
  return normalizeCountyKey(profileCountyText);
}

export function listingCountyMatches(listingCounty: string | undefined, userCounty: CountyKey | null): boolean {
  if (!userCounty) return true;
  if (!listingCounty) return false;
  const normalized = normalizeCountyKey(listingCounty);
  if (!normalized) return false;
  return normalized === userCounty;
}

/**
 * Listing county: pin beats label when they disagree (bad backend tags are common).
 * Never invent Kisumu — unknown stays unknown so county filters stay honest.
 */
export function resolveListingCounty(
  rawLabel: string | null | undefined,
  coords?: Coordinates | null,
): CountyKey | null {
  const fromLabel = normalizeCountyKey(rawLabel);
  const fromPin = coords ? detectCountyFromCoords(coords) : null;
  if (fromLabel && fromPin && fromLabel !== fromPin) return fromPin;
  return fromLabel ?? fromPin ?? null;
}
