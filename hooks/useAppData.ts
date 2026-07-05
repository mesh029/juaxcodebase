import { useCallback, useEffect, useState } from 'react';
import { fetchAppCatalog } from '../lib/api';
import type { MamaFuaConvenienceBand, MamaFuaTask, SubscriptionPlan } from '../lib/api-types';
import {
  adaptBnbListing,
  adaptRentalListing,
  adaptStation,
  type AdaptedBnbListing,
  type AdaptedHouseListing,
  type AdaptedPlaceStation,
} from '../lib/listings-adapter';

/** Matches backend pilot default (`kisumu_only_listings`). */
const PILOT_LISTINGS_COUNTY = 'kisumu';

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
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
  /** True after a successful catalog fetch — listings are from the API, not placeholders. */
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const refreshAppData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const catalog = await fetchAppCatalog(PILOT_LISTINGS_COUNTY);
      setHouseListings(dedupeById(catalog.listings.rental.map(adaptRentalListing)));
      setBnbListings(dedupeById(catalog.listings.bnb.map(adaptBnbListing)));
      setPickupStations(catalog.laundryStations.map(adaptStation));
      setMamaFuaTasks(catalog.mamaFua.tasks);
      setMamaFuaDispatchFee(catalog.mamaFua.dispatchFeeKes);
      setMamaFuaConvenienceTimes(catalog.mamaFua.convenienceTimes ?? []);
      setSubscriptionPlans(catalog.subscriptionPlans);
      setListingsLoaded(true);
    } catch (err) {
      setHouseListings([]);
      setBnbListings([]);
      setListingsLoaded(false);
      setDataError(err instanceof Error ? err.message : 'Could not load listings');
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAppData();
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
    listingsLoaded,
    dataError,
    refreshAppData,
  };
}
