import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  fetchAppCatalog,
  fetchListingsNearby,
} from '../lib/api';
import type { MamaFuaConvenienceBand, MamaFuaTask, SubscriptionPlan } from '../lib/api-types';
import {
  adaptBnbListing,
  adaptRentalListing,
  adaptStation,
  type AdaptedBnbListing,
  type AdaptedHouseListing,
  type AdaptedPlaceStation,
} from '../lib/listings-adapter';
import { cacheCatalog, loadCachedCatalog } from '../lib/offline/cache';
import { checkApiHealth } from '../lib/offline/health';

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function formatListingsLoadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'network_error' || err.code === 'timeout') {
      return 'Listings could not load — check your internet connection and try again.';
    }
    if (err.message.includes('EXPO_PUBLIC_API_BASE_URL') || err.code === 'api_unconfigured') {
      return 'Listings could not load — the app is not connected to the server (missing API URL).';
    }
    if (err.status === 404) {
      return 'Listings could not load — the server endpoint was not found. The backend may need a redeploy.';
    }
    if (err.status === 500) {
      return 'Listings could not load — server is busy. Wait a moment and try again.';
    }
    return `Listings could not load — ${err.message}`;
  }
  if (err instanceof Error && err.message) {
    return `Listings could not load — ${err.message}`;
  }
  return 'Listings could not load — please try again in a moment.';
}

function applyCatalogListings(
  catalog: Awaited<ReturnType<typeof fetchAppCatalog>>,
): { rentals: AdaptedHouseListing[]; bnbs: AdaptedBnbListing[] } {
  return {
    rentals: dedupeById(catalog.listings.rental.map(adaptRentalListing)),
    bnbs: dedupeById(catalog.listings.bnb.map(adaptBnbListing)),
  };
}

export function useAppData() {
  const queryClient = useQueryClient();
  const [houseListings, setHouseListings] = useState<AdaptedHouseListing[]>([]);
  const [bnbListings, setBnbListings] = useState<AdaptedBnbListing[]>([]);
  const [pickupStations, setPickupStations] = useState<AdaptedPlaceStation[]>([]);
  const [mamaFuaTasks, setMamaFuaTasks] = useState<MamaFuaTask[]>([]);
  const [mamaFuaDispatchFee, setMamaFuaDispatchFee] = useState(600);
  const [mamaFuaConvenienceTimes, setMamaFuaConvenienceTimes] = useState<MamaFuaConvenienceBand[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [listingsFetching, setListingsFetching] = useState(false);
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const listingsRequestGenRef = useRef(0);
  const catalogLoadedRef = useRef(false);
  const listingsLoadedRef = useRef(false);
  const hydratedRef = useRef(false);

  const applyCatalogToState = useCallback((catalog: Awaited<ReturnType<typeof fetchAppCatalog>>) => {
    const { rentals, bnbs } = applyCatalogListings(catalog);
    setHouseListings(rentals);
    setBnbListings(bnbs);
    setPickupStations(catalog.laundryStations.map(adaptStation));
    setMamaFuaTasks(catalog.mamaFua.tasks);
    setMamaFuaDispatchFee(catalog.mamaFua.dispatchFeeKes);
    setMamaFuaConvenienceTimes(catalog.mamaFua.convenienceTimes ?? []);
    setSubscriptionPlans(catalog.subscriptionPlans);
    catalogLoadedRef.current = true;
    listingsLoadedRef.current = true;
    setListingsLoaded(true);
    setListingsError(null);
  }, []);

  // Instant Home from durable cache
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadCachedCatalog();
      if (cancelled || !cached) return;
      applyCatalogToState(cached);
      hydratedRef.current = true;
      setDataLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCatalogToState]);

  const catalogQuery = useQuery({
    queryKey: ['catalog', 'pilot'],
    queryFn: async () => {
      const health = await checkApiHealth();
      if (health !== 'up') {
        const cached = await loadCachedCatalog();
        if (cached) return cached;
        throw new ApiError('API unavailable', 'network_error');
      }
      const catalog = await fetchAppCatalog('pilot');
      await cacheCatalog(catalog);
      return catalog;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (catalogQuery.data) {
      applyCatalogToState(catalogQuery.data);
      setDataLoading(false);
      setDataError(null);
    } else if (catalogQuery.error && !listingsLoadedRef.current) {
      setDataError(
        catalogQuery.error instanceof Error ? catalogQuery.error.message : 'Could not load app data',
      );
      setListingsError(formatListingsLoadError(catalogQuery.error));
      setDataLoading(false);
    } else if (catalogQuery.isFetched) {
      setDataLoading(false);
    }
  }, [catalogQuery.data, catalogQuery.error, catalogQuery.isFetched, applyCatalogToState]);

  /** One bootstrap request — listings + stations + plans (never fan-out per county). */
  const refreshAppData = useCallback(async (county: string = 'pilot') => {
    const isInitial = !catalogLoadedRef.current;
    if (isInitial) setDataLoading(true);
    setDataError(null);
    try {
      const health = await checkApiHealth();
      if (health !== 'up') {
        const cached = await loadCachedCatalog();
        if (cached) {
          applyCatalogToState(cached);
          return;
        }
        throw new ApiError('API unavailable', 'network_error');
      }
      const catalog = await fetchAppCatalog(county);
      await cacheCatalog(catalog);
      applyCatalogToState(catalog);
      await queryClient.invalidateQueries({ queryKey: ['catalog'] });
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Could not load app data');
      if (!listingsLoadedRef.current) {
        setListingsError(formatListingsLoadError(err));
      }
    } finally {
      setDataLoading(false);
      setListingsFetching(false);
    }
  }, [applyCatalogToState, queryClient]);

  const applyListingsResult = useCallback(
    (
      gen: number,
      ok: boolean,
      rentals: AdaptedHouseListing[],
      bnbs: AdaptedBnbListing[],
      err?: unknown,
    ) => {
      if (gen !== listingsRequestGenRef.current) return;
      if (ok) {
        setHouseListings(rentals);
        setBnbListings(bnbs);
        listingsLoadedRef.current = true;
        setListingsLoaded(true);
        setListingsError(null);
      } else if (!listingsLoadedRef.current) {
        setHouseListings([]);
        setBnbListings([]);
        setListingsLoaded(false);
        setListingsError(formatListingsLoadError(err));
      } else {
        setListingsError(formatListingsLoadError(err));
      }
      setListingsFetching(false);
    },
    [],
  );

  const refreshListingsCatalog = useCallback(async (county: string) => {
    const gen = ++listingsRequestGenRef.current;
    const isInitial = !listingsLoadedRef.current;
    if (isInitial) setListingsFetching(true);
    setListingsError(null);
    try {
      const catalog = await fetchAppCatalog(county);
      if (gen !== listingsRequestGenRef.current) return;
      await cacheCatalog(catalog);
      const { rentals, bnbs } = applyCatalogListings(catalog);
      applyListingsResult(gen, true, rentals, bnbs);
    } catch (err) {
      if (!listingsLoadedRef.current) {
        const cached = await loadCachedCatalog();
        if (cached) {
          const { rentals, bnbs } = applyCatalogListings(cached);
          applyListingsResult(gen, true, rentals, bnbs);
          return;
        }
      }
      applyListingsResult(gen, false, [], [], err);
    }
  }, [applyListingsResult]);

  const refreshAllListingsCatalog = useCallback(async () => {
    const gen = ++listingsRequestGenRef.current;
    const isInitial = !listingsLoadedRef.current;
    if (isInitial) setListingsFetching(true);
    setListingsError(null);
    try {
      const catalog = await fetchAppCatalog('pilot');
      if (gen !== listingsRequestGenRef.current) return;
      await cacheCatalog(catalog);
      const { rentals, bnbs } = applyCatalogListings(catalog);
      applyListingsResult(gen, true, rentals, bnbs);
    } catch (err) {
      if (!listingsLoadedRef.current) {
        const cached = await loadCachedCatalog();
        if (cached) {
          const { rentals, bnbs } = applyCatalogListings(cached);
          applyListingsResult(gen, true, rentals, bnbs);
          return;
        }
      }
      applyListingsResult(gen, false, [], [], err);
    }
  }, [applyListingsResult]);

  const refreshNearbyListings = useCallback(
    async (lat: number, lng: number, radiusKm: number, county?: string) => {
      const gen = ++listingsRequestGenRef.current;
      const isInitial = !listingsLoadedRef.current;
      if (isInitial) setListingsFetching(true);
      setListingsError(null);
      try {
        const [rentals, bnbs] = await Promise.all([
          fetchListingsNearby(lat, lng, radiusKm, 'rental', county),
          fetchListingsNearby(lat, lng, radiusKm, 'bnb', county),
        ]);
        applyListingsResult(
          gen,
          true,
          dedupeById(rentals.map(adaptRentalListing)),
          dedupeById(bnbs.map(adaptBnbListing)),
        );
      } catch (err) {
        applyListingsResult(gen, false, [], [], err);
      }
    },
    [applyListingsResult],
  );

  return {
    houseListings,
    bnbListings,
    pickupStations,
    mamaFuaTasks,
    mamaFuaDispatchFee,
    mamaFuaConvenienceTimes,
    subscriptionPlans,
    dataLoading,
    listingsFetching: listingsFetching || catalogQuery.isFetching,
    listingsLoaded,
    dataError,
    listingsError,
    refreshAppData,
    refreshListingsCatalog,
    refreshAllListingsCatalog,
    refreshNearbyListings,
  };
}
