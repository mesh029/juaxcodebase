import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IntroHeroCarousel, type IntroHeroSlide } from '../IntroHeroCarousel';
import { HomeHubSkeleton } from './HomeHubSkeleton';
import { CarouselZone } from '../chrome/CarouselZone';
import type { SwipeableService } from '../../hooks/useServiceSwipe';
import { AppIcon, homeQuickIconName } from '../ui/AppIcon';
import { EmptyState } from '../ui/EmptyState';
import { PressableScale } from '../ui/PressableScale';
import { A11y, ComponentSize, FontFamily, HapticMap, Motion, Radius, Spacing, TextRole, Touch, cardChrome, chipLabel, nestedChrome } from '../../theme';
import { AccessibleText } from '../ui/AccessibleText';

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

type HomeQuickService = SwipeableService | 'movers' | 'more';

type Props = {
  slides: IntroHeroSlide[];
  carouselHint: string;
  cardWidth: number;
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
  onComingSoonService?: (service: HomeQuickService) => void;
  onOpenMore?: () => void;
  onOpenStay: (id: string) => void;
  onOpenListing: (id: string, kind: 'bnb' | 'rental') => void;
  onOpenTrips: () => void;
  onPopularCarouselTouchStart?: () => void;
  onPopularCarouselTouchEnd?: () => void;
  theme: ThemeSlice;
};

const QUICK_SERVICES: {
  key: HomeQuickService;
  label: string;
  comingSoon?: boolean;
  iconColor: string;
}[] = [
  { key: 'laundry', label: 'Fua', iconColor: '#E85A1C' },
  { key: 'bnbs', label: 'Keja', iconColor: '#2F9E6A' },
  { key: 'movers', label: 'Movers', comingSoon: true, iconColor: '#3B82F6' },
  { key: 'rides', label: 'Rides', comingSoon: true, iconColor: '#8B5CF6' },
  { key: 'more', label: 'More', iconColor: '#6B7280' },
];

export function HomeHub({
  slides,
  carouselHint,
  cardWidth,
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
  onOpenMore,
  onOpenStay,
  onOpenListing,
  onOpenTrips,
  onPopularCarouselTouchStart,
  onPopularCarouselTouchEnd,
  theme,
}: Props) {
  const stayCardW = Math.min(228, Math.max(176, Math.round(cardWidth * 0.62)));
  const quickGap = Spacing[1.5];
  const quickTileW = Math.max(64, Math.floor((cardWidth - quickGap * 4) / 5));
  const cardSurface = cardChrome(darkMode);
  const nestSurface = nestedChrome(darkMode);
  const rowDivider = darkMode ? undefined : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border };

  return (
    <View style={styles.root}>
      <CarouselZone>
        <IntroHeroCarousel
          slides={slides}
          cardWidth={cardWidth}
          cardHeight={196}
          darkMode={darkMode}
          hint={carouselHint}
        />
      </CarouselZone>

      <View style={styles.quickRow}>
        {QUICK_SERVICES.map((svc) => (
          <PressableScale
            key={svc.key}
            accessibilityRole="button"
            accessibilityLabel={chipLabel(svc.label, false, svc.comingSoon)}
            hitSlop={A11y.compactHitSlop}
            style={[
              styles.quickPill,
              { width: quickTileW },
              darkMode ? nestSurface : { borderColor: theme.border, backgroundColor: theme.sheet },
              svc.comingSoon && styles.quickPillSoon,
            ]}
            android_ripple={{ color: `${theme.primary}22` }}
            onPress={() => {
              HapticMap.light();
              if (svc.key === 'more') {
                onOpenMore?.();
                return;
              }
              if (svc.comingSoon) {
                onComingSoonService?.(svc.key);
                return;
              }
              if (svc.key === 'laundry' || svc.key === 'bnbs' || svc.key === 'rides') {
                onQuickService(svc.key);
              }
            }}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: `${svc.iconColor}18` }]}>
              <AppIcon name={homeQuickIconName(svc.key)} size={ComponentSize.icon.xl} color={svc.iconColor} />
            </View>
            <AccessibleText style={[styles.quickLabel, { color: theme.textPrimary }]} numberOfLines={1}>
              {svc.label}
            </AccessibleText>
            {svc.comingSoon ? (
              <View style={[styles.quickSoonBadge, { backgroundColor: theme.mutedSurface }]} accessibilityElementsHidden>
                <AccessibleText style={[styles.quickSoonText, { color: theme.textMuted }]}>Soon</AccessibleText>
              </View>
            ) : null}
          </PressableScale>
        ))}
      </View>

      {listingsLoading && !listingsLoaded ? (
        <HomeHubSkeleton cardWidth={cardWidth} darkMode={darkMode} />
      ) : listingsLoading ? (
        <View style={styles.loadingBlock} accessibilityRole="progressbar" accessibilityLabel="Refreshing listings">
          <ActivityIndicator size="small" color={theme.primary} />
          <AccessibleText style={[styles.loadingText, { color: theme.textSecondary }]}>Refreshing listings…</AccessibleText>
        </View>
      ) : listingsError ? (
        <View style={styles.loadingBlock}>
          <Text style={[styles.loadingText, { color: theme.textSecondary, flex: 1 }]}>{listingsError}</Text>
          {onRetryListings ? (
            <Pressable
              onPress={onRetryListings}
              hitSlop={A11y.hitSlop}
              accessibilityRole="button"
              accessibilityLabel="Retry loading listings"
            >
              <AccessibleText style={{ color: theme.primary, fontWeight: '600' }}>Retry</AccessibleText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {listingsLoaded ? (
        <>
          {popularStays.length > 0 ? (
            <>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionLabel, styles.sectionLabelInRow, { color: theme.textMuted }]}>
                  Popular stays nearby{hasLocation ? ` · ${nearbyRadiusKm} km` : ''}
                </Text>
                {onBrowseListings ? (
                  <Pressable
                    onPress={onBrowseListings}
                    hitSlop={A11y.hitSlop}
                    accessibilityRole="link"
                    accessibilityLabel="Browse all listings catalog"
                  >
                    <AccessibleText style={[styles.browseLink, { color: theme.primary }]}>Browse catalog</AccessibleText>
                  </Pressable>
                ) : null}
              </View>
              <CarouselZone>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.popularScroll}
                  decelerationRate="fast"
                  onScrollBeginDrag={onPopularCarouselTouchStart}
                  onScrollEndDrag={onPopularCarouselTouchEnd}
                  onMomentumScrollBegin={onPopularCarouselTouchStart}
                  onMomentumScrollEnd={onPopularCarouselTouchEnd}
                  onTouchStart={onPopularCarouselTouchStart}
                  onTouchEnd={onPopularCarouselTouchEnd}
                  onTouchCancel={onPopularCarouselTouchEnd}
                >
                  {popularStays.map((stay) => (
                    <PressableScale
                      key={stay.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${stay.title}, ${stay.meta}`}
                      style={[styles.stayCard, { width: stayCardW }, cardSurface]}
                      android_ripple={{ color: `${theme.primary}18` }}
                      onPress={() => {
                        HapticMap.light();
                        onOpenStay(stay.id);
                      }}
                    >
                      <Image source={stay.image} style={styles.stayThumb} resizeMode="cover" />
                      <Text style={[styles.stayTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                        {stay.title}
                      </Text>
                      <Text style={[styles.stayMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                        {stay.meta}
                      </Text>
                    </PressableScale>
                  ))}
                </ScrollView>
              </CarouselZone>
            </>
          ) : null}

          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, styles.sectionLabelInRow, { color: theme.textMuted }]}>
              Popular listings{hasLocation ? ` · ${nearbyRadiusKm} km` : ''}
            </Text>
            {onBrowseListings ? (
              <Pressable onPress={onBrowseListings} hitSlop={8}>
                <Text style={[styles.browseLink, { color: theme.primary }]}>Browse catalog</Text>
              </Pressable>
            ) : null}
          </View>
          {popularListings.length > 0 ? (
            <View style={[styles.placesList, cardSurface]}>
              {popularListings.map((listing, i) => (
                <Pressable
                  key={`${listing.kind}-${listing.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${listing.title}, ${listing.subtitle}`}
                  style={({ pressed }) => [
                    styles.placeRow,
                    i < popularListings.length - 1 && rowDivider,
                    pressed && styles.rowPressed,
                  ]}
                  android_ripple={{ color: `${theme.primary}14` }}
                  onPress={() => {
                    HapticMap.light();
                    onOpenListing(listing.id, listing.kind);
                  }}
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
              {onBrowseListings ? (
                <Pressable
                  style={[styles.browseCatalogFooter, { borderTopColor: theme.border }]}
                  onPress={onBrowseListings}
                >
                  <Text style={[styles.browseCatalogFooterText, { color: theme.primary }]}>
                    View all listings · BnB & rentals
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <EmptyState
              icon="📍"
              title="No listings nearby"
              description={
                locationLoading
                  ? 'Finding listings near you…'
                  : !hasLocation
                    ? 'Turn on location to see popular listings near you.'
                    : `Nothing popular within ${nearbyRadiusKm} km yet.`
              }
              actionLabel={hasLocation && !locationLoading && onBrowseListings ? 'Browse all listings' : undefined}
              onAction={hasLocation && !locationLoading ? onBrowseListings : undefined}
              darkMode={darkMode}
              mutedSurface={theme.mutedSurface}
              textPrimary={theme.textPrimary}
              textSecondary={theme.textSecondary}
              primary={theme.primary}
              border={theme.border}
            />
          )}
        </>
      ) : null}

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Trips and orders, ${activeTripCount > 0 ? `${activeTripCount} active` : 'track bookings'}`}
        style={[styles.tripsRow, darkMode ? cardSurface : { borderColor: theme.border, backgroundColor: theme.mutedSurface }]}
        onPress={() => {
          HapticMap.light();
          onOpenTrips();
        }}
      >
        <Text style={[styles.tripsRowLabel, { color: theme.textPrimary }]}>Trips & orders</Text>
        <Text style={[styles.tripsRowMeta, { color: theme.textSecondary }]}>
          {activeTripCount > 0 ? `${activeTripCount} active` : 'Track bookings'}
        </Text>
        <Text style={[styles.tripsChev, { color: theme.primary }]}>›</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingBottom: Spacing[2],
  },
  quickRow: {
    flexDirection: 'row',
    gap: Spacing[1.5],
    marginTop: Spacing[1.5],
    marginBottom: Spacing[1],
  },
  quickPill: {
    minHeight: 88,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
    paddingVertical: Spacing[1.5],
    paddingHorizontal: Spacing[0.5],
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  quickIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPillSoon: {
    opacity: 0.92,
  },
  quickSoonBadge: {
    position: 'absolute',
    top: -6,
    right: 2,
    paddingHorizontal: Spacing[0.5],
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  quickSoonText: {
    fontSize: 9,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.3,
  },
  quickLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
    width: '100%',
  },
  sectionLabel: {
    marginTop: Spacing[3],
    marginBottom: Spacing[1],
    fontSize: TextRole.overline.fontSize,
    lineHeight: TextRole.overline.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionLabelInRow: {
    marginTop: 0,
    marginBottom: 0,
    flex: 1,
  },
  sectionHeaderRow: {
    marginTop: Spacing[3],
    marginBottom: Spacing[1],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[1],
  },
  browseLink: {
    fontSize: TextRole.label.fontSize,
    lineHeight: TextRole.label.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  browseCatalogFooter: {
    paddingVertical: Spacing[1.5],
    paddingHorizontal: Spacing[1.5],
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  browseCatalogFooterText: {
    fontSize: TextRole.label.fontSize,
    lineHeight: TextRole.label.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  popularScroll: {
    gap: Spacing[1.5],
    paddingRight: Spacing[0.5],
  },
  stayCard: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  stayThumb: {
    width: '100%',
    height: 108,
  },
  stayTitle: {
    fontSize: TextRole.cardTitle.fontSize,
    lineHeight: TextRole.cardTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    paddingHorizontal: Spacing[1.5],
    paddingTop: Spacing[1.5],
  },
  stayMeta: {
    fontSize: TextRole.cardMeta.fontSize,
    lineHeight: TextRole.cardMeta.lineHeight,
    fontFamily: FontFamily.medium,
    paddingHorizontal: Spacing[1.5],
    paddingBottom: Spacing[1.5],
    paddingTop: 2,
  },
  placesList: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
    paddingVertical: Spacing[1.5],
    paddingHorizontal: Spacing[1.5],
  },
  rowPressed: {
    opacity: Motion.press.opacity,
  },
  listingThumb: {
    width: 52,
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: '#E4E4E7',
  },
  placeName: {
    fontSize: TextRole.bodyStrong.fontSize,
    lineHeight: TextRole.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  placeSub: {
    marginTop: Spacing[0.5],
    fontSize: TextRole.cardMeta.fontSize,
    lineHeight: TextRole.cardMeta.lineHeight,
    fontFamily: FontFamily.medium,
  },
  placeChev: {
    fontSize: 20,
    fontFamily: FontFamily.semibold,
  },
  tripsRow: {
    marginTop: Spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Touch.comfortSize,
    paddingVertical: Spacing[1.5],
    paddingHorizontal: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing[1],
  },
  tripsRowLabel: {
    flex: 1,
    fontSize: TextRole.bodyStrong.fontSize,
    lineHeight: TextRole.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  tripsRowMeta: {
    fontSize: TextRole.label.fontSize,
    lineHeight: TextRole.label.lineHeight,
    fontFamily: FontFamily.medium,
  },
  tripsChev: {
    fontSize: 20,
    fontFamily: FontFamily.semibold,
  },
  loadingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1.5],
    paddingVertical: Spacing[4],
  },
  loadingText: {
    fontSize: TextRole.label.fontSize,
    lineHeight: TextRole.label.lineHeight,
    fontFamily: FontFamily.medium,
  },
});
