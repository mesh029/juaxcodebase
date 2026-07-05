import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IntroHeroCarousel, type IntroHeroSlide } from '../IntroHeroCarousel';
import { CarouselZone } from '../chrome/CarouselZone';
import type { SwipeableService } from '../../hooks/useServiceSwipe';
import { AppIcon, serviceIconName } from '../ui/AppIcon';

export type PopularStay = {
  id: string;
  title: string;
  meta: string;
  image: { uri: string };
};

export type PopularListing = {
  id: string;
  kind: 'bnb' | 'rental';
  title: string;
  subtitle: string;
  image: { uri: string };
};

type ThemeSlice = {
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  border: string;
  sheet: string;
  mutedSurface: string;
};

type Props = {
  slides: IntroHeroSlide[];
  carouselHint: string;
  cardWidth: number;
  locationLabel: string;
  county: string;
  darkMode?: boolean;
  activeTripCount?: number;
  popularStays: PopularStay[];
  popularListings: PopularListing[];
  nearbyRadiusKm?: number;
  hasLocation?: boolean;
  locationLoading?: boolean;
  onBrowseListings?: () => void;
  listingsLoading?: boolean;
  listingsLoaded?: boolean;
  listingsError?: string | null;
  onRetryListings?: () => void;
  onQuickService: (service: SwipeableService) => void;
  onComingSoonService?: (service: SwipeableService) => void;
  onOpenStay: (id: string) => void;
  onOpenListing: (id: string, kind: 'bnb' | 'rental') => void;
  onOpenTrips: () => void;
  theme: ThemeSlice;
};

const QUICK_SERVICES: { key: SwipeableService; label: string; comingSoon?: boolean }[] = [
  { key: 'laundry', label: 'Fua' },
  { key: 'bnbs', label: 'Keja' },
  { key: 'rides', label: 'Rides', comingSoon: true },
];

export function HomeHub({
  slides,
  carouselHint,
  cardWidth,
  locationLabel,
  county,
  darkMode = false,
  activeTripCount = 0,
  popularStays,
  popularListings,
  nearbyRadiusKm = 5,
  hasLocation = false,
  locationLoading = false,
  onBrowseListings,
  listingsLoading = false,
  listingsLoaded = false,
  listingsError = null,
  onRetryListings,
  onQuickService,
  onComingSoonService,
  onOpenStay,
  onOpenListing,
  onOpenTrips,
  theme,
}: Props) {
  const stayCardW = Math.min(200, Math.max(160, Math.round(cardWidth * 0.58)));

  return (
    <View style={styles.root}>
      <View style={styles.logoRow}>
        <Text style={[styles.logoMark, { color: theme.primary }]}>Jua</Text>
        <Text style={[styles.logoMarkX, { color: theme.textPrimary }]}>X</Text>
      </View>
      <Text style={[styles.locationLine, { color: theme.textSecondary }]} numberOfLines={1}>
        {locationLabel} · {county}
      </Text>

      <CarouselZone>
        <IntroHeroCarousel
          slides={slides}
          cardWidth={cardWidth}
          cardHeight={156}
          darkMode={darkMode}
          hint={carouselHint}
        />
      </CarouselZone>

      <View style={styles.quickRow}>
        {QUICK_SERVICES.map((svc) => (
          <Pressable
            key={svc.key}
            style={[
              styles.quickPill,
              { borderColor: theme.border, backgroundColor: theme.sheet },
              svc.comingSoon && styles.quickPillSoon,
            ]}
            onPress={() => {
              if (svc.comingSoon) {
                onComingSoonService?.(svc.key);
                return;
              }
              onQuickService(svc.key);
            }}
          >
            <AppIcon name={serviceIconName(svc.key)} size={18} color={theme.textSecondary} />
            <Text style={[styles.quickLabel, { color: theme.textPrimary }]}>{svc.label}</Text>
            {svc.comingSoon ? (
              <View style={[styles.quickSoonBadge, { backgroundColor: theme.mutedSurface }]}>
                <Text style={[styles.quickSoonText, { color: theme.textMuted }]}>Soon</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      {listingsLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading listings from server…</Text>
        </View>
      ) : listingsError ? (
        <View style={styles.loadingBlock}>
          <Text style={[styles.loadingText, { color: theme.textSecondary, flex: 1 }]}>{listingsError}</Text>
          {onRetryListings ? (
            <Pressable onPress={onRetryListings} hitSlop={8}>
              <Text style={{ color: theme.primary, fontWeight: '600' }}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {listingsLoaded ? (
        <>
          {popularStays.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                Popular stays nearby{hasLocation ? ` · ${nearbyRadiusKm} km` : ''}
              </Text>
              <CarouselZone>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.popularScroll}
                  decelerationRate="fast"
                >
                  {popularStays.map((stay) => (
                    <Pressable
                      key={stay.id}
                      style={[styles.stayCard, { width: stayCardW, borderColor: theme.border, backgroundColor: theme.sheet }]}
                      onPress={() => onOpenStay(stay.id)}
                    >
                      <Image source={stay.image} style={styles.stayThumb} resizeMode="cover" />
                      <Text style={[styles.stayTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                        {stay.title}
                      </Text>
                      <Text style={[styles.stayMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                        {stay.meta}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </CarouselZone>
            </>
          ) : null}

          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
            Popular listings{hasLocation ? ` · ${nearbyRadiusKm} km` : ''}
          </Text>
          {popularListings.length > 0 ? (
            <View style={[styles.placesList, { borderColor: theme.border, backgroundColor: theme.sheet }]}>
              {popularListings.map((listing, i) => (
                <Pressable
                  key={`${listing.kind}-${listing.id}`}
                  style={[
                    styles.placeRow,
                    i < popularListings.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.border,
                    },
                  ]}
                  onPress={() => onOpenListing(listing.id, listing.kind)}
                >
                  <Image source={listing.image} style={[styles.listingThumb, { backgroundColor: theme.mutedSurface }]} resizeMode="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.placeName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {listing.title}
                    </Text>
                    <Text style={[styles.placeSub, { color: theme.textSecondary }]} numberOfLines={1}>
                      {listing.subtitle}
                    </Text>
                  </View>
                  <Text style={[styles.placeChev, { color: theme.primary }]}>›</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={[styles.placesList, styles.placesListEmpty, { borderColor: theme.border, backgroundColor: theme.sheet }]}>
              <Text style={[styles.placeSub, styles.placesEmptyText, { color: theme.textSecondary }]}>
                {locationLoading
                  ? 'Finding listings near you…'
                  : !hasLocation
                    ? 'Turn on location to see popular listings near you.'
                    : `No popular listings within ${nearbyRadiusKm} km of you.`}
              </Text>
              {hasLocation && !locationLoading && onBrowseListings ? (
                <Pressable onPress={onBrowseListings} hitSlop={8} style={styles.placesEmptyAction}>
                  <Text style={[styles.placesEmptyLink, { color: theme.primary }]}>Browse all listings</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </>
      ) : null}

      <Pressable
        style={[styles.tripsRow, { borderColor: theme.border, backgroundColor: theme.mutedSurface }]}
        onPress={onOpenTrips}
      >
        <Text style={[styles.tripsRowLabel, { color: theme.textPrimary }]}>Trips & orders</Text>
        <Text style={[styles.tripsRowMeta, { color: theme.textSecondary }]}>
          {activeTripCount > 0 ? `${activeTripCount} active` : 'Track bookings'}
        </Text>
        <Text style={[styles.tripsChev, { color: theme.primary }]}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingBottom: 12,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  logoMark: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.8,
  },
  logoMarkX: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.8,
  },
  locationLine: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginBottom: 12,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  quickPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    position: 'relative',
  },
  quickPillSoon: {
    opacity: 0.92,
  },
  quickSoonBadge: {
    position: 'absolute',
    top: -6,
    right: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  quickSoonText: {
    fontSize: 8,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
  },
  quickLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  sectionLabel: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  popularScroll: {
    gap: 10,
    paddingRight: 4,
  },
  stayCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stayThumb: {
    width: '100%',
    height: 88,
  },
  stayTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  stayMeta: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 2,
  },
  placesList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  placesListEmpty: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  placesEmptyText: {
    lineHeight: 17,
  },
  placesEmptyAction: {
    alignSelf: 'flex-start',
  },
  placesEmptyLink: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  listingThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#E4E4E7',
  },
  placeName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  placeSub: {
    marginTop: 1,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  placeChev: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  tripsRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  tripsRowLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  tripsRowMeta: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  tripsChev: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  loadingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 28,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
});
