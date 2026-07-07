import { useCallback, useEffect, useRef, useState } from 'react';
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
    if (err.code === 'network_error') {
      return 'Listings could not load — check your internet connection and try again.';
    }
    if (err.message.includes('EXPO_PUBLIC_API_BASE_URL')) {
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

  /** One bootstrap request — listings + stations + plans (never fan-out per county). */
  const refreshAppData = useCallback(async (county: string = 'pilot') => {
    const isInitial = !catalogLoadedRef.current;
    if (isInitial) setDataLoading(true);
    setDataError(null);
    try {
      const catalog = await fetchAppCatalog(county);
      applyCatalogToState(catalog);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Could not load app data');
      if (!listingsLoadedRef.current) {
        setListingsError(formatListingsLoadError(err));
      }
    } finally {
      setDataLoading(false);
      setListingsFetching(false);
    }
  }, [applyCatalogToState]);

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

  /** Single-county refresh via bootstrap (1 HTTP request). */
  const refreshListingsCatalog = useCallback(async (county: string) => {
    const gen = ++listingsRequestGenRef.current;
    const isInitial = !listingsLoadedRef.current;
    if (isInitial) setListingsFetching(true);
    setListingsError(null);
    try {
      const catalog = await fetchAppCatalog(county);
      if (gen !== listingsRequestGenRef.current) return;
      const { rentals, bnbs } = applyCatalogListings(catalog);
      applyListingsResult(gen, true, rentals, bnbs);
    } catch (err) {
      applyListingsResult(gen, false, [], [], err);
    }
  }, [applyListingsResult]);

  /** All pilot counties — one bootstrap call (`county=pilot`), not 8 parallel listing requests. */
  const refreshAllListingsCatalog = useCallback(async () => {
    const gen = ++listingsRequestGenRef.current;
    const isInitial = !listingsLoadedRef.current;
    if (isInitial) setListingsFetching(true);
    setListingsError(null);
    try {
      const catalog = await fetchAppCatalog('pilot');
      if (gen !== listingsRequestGenRef.current) return;
      const { rentals, bnbs } = applyCatalogListings(catalog);
      applyListingsResult(gen, true, rentals, bnbs);
    } catch (err) {
      applyListingsResult(gen, false, [], [], err);
    }
  }, [applyListingsResult]);

  const refreshNearbyListings = useCallback(
    async (lat: number, lng: number, radiusKm: number, county = 'kisumu') => {
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

  useEffect(() => {
    void refreshAppData('pilot');
  }, [refreshAppData]);

  return {
    houseListings,
    bnbListings,
    pickupStations,
    mamaFuaTasks,
    mamaFuaDispatchFee,
    mamaFuaConvenienceTimes,
    subscriptionPlans,
    dataLoading,
    listingsFetching,
    listingsLoaded,
    dataError,
    listingsError,
    refreshAppData,
    refreshListingsCatalog,
    refreshAllListingsCatalog,
    refreshNearbyListings,
  };
};
