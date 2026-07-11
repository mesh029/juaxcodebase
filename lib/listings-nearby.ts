import type { Coordinates } from './listings-distance';
import { getDistanceKm, hasValidMapCoords } from './listings-distance';
import { detectCountyFromCoords, listingCountyMatches, resolveListingCounty, type CountyKey } from './county';

export type ProximityMode = 'gps' | 'approximate' | 'unavailable';

export type ProximityContext = {
  mode: ProximityMode;
  /** User GPS, or county center when approximating. */
  reference: Coordinates | null;
  radiusKm: number;
  /** When approximating without GPS — optional county name match. */
  county?: string | null;
};

export type ProximityRow<T extends { coords: Coordinates; county?: string }> = T & {
  distanceKm: number | null;
};

export function buildProximityContext(
  userCoords: Coordinates | null,
  referenceCoords: Coordinates | null,
  isApproximate: boolean,
  radiusKm: number,
  county: string | null,
): ProximityContext {
  if (userCoords) {
    return { mode: 'gps', reference: userCoords, radiusKm, county };
  }
  if (referenceCoords && isApproximate) {
    return { mode: 'approximate', reference: referenceCoords, radiusKm, county };
  }
  return { mode: 'unavailable', reference: null, radiusKm, county };
}

/**
 * Single source of truth for “Near me” filtering.
 * - GPS: strict radius from user — never widen to whole county.
 * - Approximate (no GPS): radius from county center + county label match.
 * - Pinned ids (booked / requested) are only re-included when they are still
 *   within the search radius. They must never be force-injected into a strict
 *   proximity surface once the user has moved out of range — otherwise reserved
 *   or contacted listings linger in "Near me" from a previous location.
 */
export function filterListingsByProximity<T extends { id: string; coords: Coordinates; county?: string }>(
  rows: T[],
  ctx: ProximityContext,
  pinnedIds?: Set<string>,
): ProximityRow<T>[] {
  const withDistance: ProximityRow<T>[] = rows.map((row) => ({
    ...row,
    distanceKm:
      ctx.reference && hasValidMapCoords(row.coords)
        ? getDistanceKm(ctx.reference, row.coords)
        : null,
  }));

  let filtered: ProximityRow<T>[];
  const effectiveCounty =
    (ctx.county as CountyKey | null | undefined) ??
    (ctx.reference ? detectCountyFromCoords(ctx.reference) : null);

  if (ctx.mode === 'gps') {
    filtered = withDistance.filter((row) => {
      if (row.distanceKm == null || row.distanceKm > ctx.radiusKm) return false;
      return listingCountyMatches(row.county, effectiveCounty);
    });
  } else if (ctx.mode === 'approximate' && ctx.reference) {
    filtered = withDistance.filter((row) => {
      if (row.distanceKm == null) return false;
      if (row.distanceKm > ctx.radiusKm) return false;
      return listingCountyMatches(row.county, effectiveCounty);
    });
  } else if (effectiveCounty) {
    filtered = withDistance.filter((row) => listingCountyMatches(row.county, effectiveCounty));
  } else {
    filtered = [];
  }

  if (!pinnedIds || pinnedIds.size === 0) {
    return sortByProximity(filtered);
  }

  const seen = new Set(filtered.map((row) => row.id));
  for (const row of withDistance) {
    if (!pinnedIds.has(row.id) || seen.has(row.id)) continue;
    // Only re-include a pinned listing when it is genuinely within range of the
    // current reference. This lets a reserved/contacted place survive a county
    // label mismatch while still in radius, but keeps it out of "Near me" once
    // the user has moved away (or the pin has no resolvable distance).
    if (ctx.reference) {
      if (row.distanceKm == null || row.distanceKm > ctx.radiusKm) continue;
    }
    filtered.push(row);
    seen.add(row.id);
  }

  return sortByProximity(filtered);
}

export function sortByProximity<T extends { distanceKm: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aPinned = a.distanceKm == null;
    const bPinned = b.distanceKm == null;
    if (aPinned !== bPinned) return aPinned ? 1 : -1;
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    return 0;
  });
}

export function filterByCounty<T extends { county?: string }>(rows: T[], county: CountyKey): T[] {
  return rows.filter((row) => listingCountyMatches(row.county, county));
}

/** Server already filtered by proximity — only merge booked/requested pins + sort. */
export function mergePinnedProximityRows<
  T extends { id: string; coords: Coordinates; distanceKm?: number | null },
>(
  rows: T[],
  pinnedIds: Set<string> | undefined,
  reference: Coordinates | null,
): (T & { distanceKm: number | null })[] {
  const withDistance = rows.map((row) => ({
    ...row,
    distanceKm:
      row.distanceKm ??
      (reference && hasValidMapCoords(row.coords) ? getDistanceKm(reference, row.coords) : null),
  }));
  if (!pinnedIds?.size) return sortByProximity(withDistance);

  const seen = new Set(withDistance.map((r) => r.id));
  const merged = [...withDistance];
  for (const row of rows) {
    if (!pinnedIds.has(row.id) || seen.has(row.id)) continue;
    merged.push({
      ...row,
      distanceKm:
        reference && hasValidMapCoords(row.coords) ? getDistanceKm(reference, row.coords) : null,
    });
    seen.add(row.id);
  }
  return sortByProximity(merged);
}
