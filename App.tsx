import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AppIcon, type AppIconName } from './components/ui/AppIcon';
import { Fragment, ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  LayoutAnimation,
  Modal,
  Pressable,
  Platform,
  PanResponder,
  RefreshControl,
  StatusBar as RNStatusBar,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  useColorScheme,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { useChromeInsets } from './hooks/useChromeInsets';
import { toSwipeableSegment, useServiceSwipePan, type SwipeableSegment } from './hooks/useServiceSwipe';
import { ServiceSwipeProvider } from './context/ServiceSwipeContext';
import { AnimatedNotice } from './components/ui/AnimatedNotice';
import { EmptyState } from './components/ui/EmptyState';
import { AccessibleText } from './components/ui/AccessibleText';
import { PressableScale } from './components/ui/PressableScale';
import { HomeHub } from './components/home/HomeHub';
import { buildUnifiedHomeServicesMapHtml, type HomeUnifiedBanks, type HomeUnifiedPin } from './homeUnifiedMapHtml';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { BRAND } from './theme/brand';
import { Colors } from './theme/colors';
import { DarkElevation } from './theme/shadows';
import { HapticMap, configureLayoutAnimation, nestedChrome, chipLabel } from './theme';
import { CarouselZone } from './components/chrome/CarouselZone';
import { ERServiceSegment, type ServiceSegmentItem } from './components/easyride/ERServiceSegment';
import { ERTabBar } from './components/easyride/ERTabBar';
import { ERSearchField } from './components/easyride/ERSearchField';
import { IntroHeroCarousel, type IntroHeroSlide } from './components/IntroHeroCarousel';
import { SheetStickyFooter } from './components/make/SheetStickyFooter';
import {
  MakeDivider,
  MakeLabel,
  MakeStatusStepper,
  MAKE_TRIPS,
  SERVICE_DOT_COLORS,
} from './components/make/shared';
import { MAP_INTERACTION_HTML, MAP_INTERACTION_JS, MAP_INTERACTION_STYLES } from './mapInteractionScript';
import { useAuth } from './context/AuthContext';
import { useAppData } from './hooks/useAppData';
import { createLaundryOrder, estimateLaundryOrder, fetchLaundryOrders, submitFeedback, fetchListingDetail, fetchActiveSubscription, createSubscription, confirmSubscriptionPayment, createBnbBooking, confirmBnbBookingPayment, fetchBnbBookings, createListingRequest, fetchMyListingRequests, fetchListingRequest, replyToListingRequest, getApiBaseUrl, getStoredToken } from './lib/api';
import {
  isActiveListingRequest,
  LISTING_REQUEST_STATUS_LABELS,
  LISTING_REQUEST_STEPS,
  listingRequestStepIndex,
} from './lib/listing-requests';
import { PRODUCTION_TODO } from './lib/production-todos';
import type {
  LaundryOrder,
  ListingRequest,
  ListingRequestKind,
  ListingRequestMessage,
  PublicListing,
  BnbBooking,
} from './lib/api-types';
import {
  mergeListingUnlockFields,
  adaptBnbListing,
  adaptBnbListingStubFromBooking,
  type AdaptedBnbListing,
  type AdaptedHouseListing,
} from './lib/listings-adapter';
import { FuaFeedbackCard } from './components/feedback/FuaFeedbackCard';
import { SubscriptionSheet } from './components/subscription/SubscriptionSheet';
import { BnbBookingSheet } from './components/booking/BnbBookingSheet';
import { BookedStaySheet } from './components/booking/BookedStaySheet';
import { GuidedNavigationModal } from './components/navigation/GuidedNavigationModal';
import { ListingRequestSheet } from './components/listings/ListingRequestSheet';
import { ViewingRequestSheet } from './components/listings/ViewingRequestSheet';
import { ListingLocationActions } from './components/listings/ListingLocationActions';
import { ListingDistanceBadge, ListingMetaText } from './components/listings/ListingMetaText';
import { ListingsExplorePanel } from './components/listings/ListingsExplorePanel';
import {
  COUNTY_CENTER_COORDS,
  formatListingDistance,
  formatListingDistanceLabel,
  formatListingMetaLine,
  getDistanceKm,
  getListingDistanceReference,
  hasValidMapCoords,
  NO_DISTANCE_REFERENCE,
} from './lib/listings-distance';
import {
  buildProximityContext,
  filterByCounty,
  filterListingsByProximity,
  mergePinnedProximityRows,
} from './lib/listings-nearby';
import {
  detectCountyFromCoords,
  normalizeCountyKey,
  resolveListingsCounty,
  type CountyKey,
} from './lib/county';
import { ProfileEditor } from './components/profile/ProfileEditor';

type HomeSheetStage = 'collapsed' | 'mid' | 'full';
/** When the map should dominate the screen (Uber/Bolt-style emphasis). */
type MapEmphasis = 'default' | 'route' | 'pickup' | 'navigation' | 'active_trip';

type ActiveTripInfo = {
  service: ServiceType;
  title: string;
  subtitle: string;
  eta: string;
};
/** Full-screen flows from Home (minimal chrome, no card stacks). */
type HomeDeepPage = null | 'listings' | 'listing-detail' | 'valet-studio' | 'rides-planner' | 'service-map';
type ListingCatalog = 'bnb' | 'house';
type StaySpaceFilter = 'any' | 'entire' | 'room';

type MainTab = 'home' | 'activity' | 'profile';
type StaysSubTab = 'bnb' | 'rental';

const FEATURED_STAYS_HOME = 5;
const PULL_REFRESH_THRESHOLD = 64;

const MAIN_TAB_CONFIG: { key: MainTab; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'activity', label: 'Activity', icon: '◇' },
  { key: 'profile', label: 'Me', icon: '○' },
];
type ThemeMode = 'light' | 'dark';
type ThemePreference = 'system' | 'light' | 'dark';
type Coordinates = { latitude: number; longitude: number };

function enrichWithDistanceFromUser<T extends { coords: Coordinates }>(
  rows: T[],
  from: Coordinates | null,
): (T & { distanceFromUser: number | null })[] {
  return rows.map((row) => ({
    ...row,
    distanceFromUser: from && hasValidMapCoords(row.coords) ? getDistanceKm(from, row.coords) : null,
  }));
}

const ACTIVE_BNB_BOOKING_STATUSES = new Set(['pending_payment', 'confirmed']);

function findActiveBnbBookingForListing(bookings: BnbBooking[], listingId: string): BnbBooking | undefined {
  return bookings.find((b) => b.listingId === listingId && ACTIVE_BNB_BOOKING_STATUSES.has(b.status));
}

function mergeRequestMessages(
  existing: ListingRequestMessage[] | undefined,
  incoming: ListingRequestMessage[] | undefined,
): ListingRequestMessage[] {
  const rows = [...(existing ?? []), ...(incoming ?? [])];
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (!row?.id || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function mergeListingRequestWithLocalMessages(
  previous: ListingRequest | null | undefined,
  incoming: ListingRequest,
): ListingRequest {
  if (!previous) return incoming;
  return {
    ...previous,
    ...incoming,
    messages: mergeRequestMessages(previous.messages, incoming.messages),
  };
}

type ActivityFeedKind = 'chat' | 'status';
type ActivityFeedEntity = 'listing_request' | 'laundry' | 'stay';

type ActivityFeedItem = {
  id: string;
  kind: ActivityFeedKind;
  entity: ActivityFeedEntity;
  entityId: string;
  title: string;
  body: string;
  timeLabel: string;
  sortMs: number;
};

type ActivityViewedSnapshot = {
  requestMessages: Map<string, string>;
  requestStatus: Map<string, string>;
  laundryStatus: Map<string, string>;
  stayStatus: Map<string, string>;
};

function emptyActivityViewed(): ActivityViewedSnapshot {
  return {
    requestMessages: new Map(),
    requestStatus: new Map(),
    laundryStatus: new Map(),
    stayStatus: new Map(),
  };
}

function listingRequestMessageKey(req: ListingRequest): string {
  const latest = req.messages?.[req.messages.length - 1];
  return latest ? `${latest.senderRole}:${latest.createdAt}` : '';
}

function listingRequestActivityTitle(req: ListingRequest): string {
  if (req.kind === 'tour') return `BnB tour · ${req.listingTitle}`;
  if (req.kind === 'viewing') return `House viewing · ${req.listingTitle}`;
  return `Stay · ${req.listingTitle}`;
}

const LISTING_STUB_IMAGE = {
  uri: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80',
};

function adaptHouseListingStubFromRequest(req: ListingRequest, county: CountyKey): HouseListing {
  return {
    id: req.listingId,
    title: req.listingTitle,
    county,
    coords: COUNTY_CENTER_COORDS[county],
    distanceKm: 0,
    price: 'Viewing requested',
    image: LISTING_STUB_IMAGE,
    gallery: [LISTING_STUB_IMAGE],
    detailHighlights: [LISTING_REQUEST_STATUS_LABELS[req.status] ?? 'Requested'],
    beds: 1,
    baths: 1,
    amenities: [],
    has3dTour: false,
    locationLocked: true,
    isStub: true,
  };
}

const LISTING_RADIUS_DEFAULT_KM = 5;
const STAYS_RADIUS_OPTIONS = [2, 5, 10] as const;
const LISTING_RADIUS_OPTIONS = STAYS_RADIUS_OPTIONS;
type Destination = {
  id: string;
  name: string;
  subtitle: string;
  coords: Coordinates;
  county?: CountyKey;
  image: any;
  exploreReason: string;
  exploreTip?: string;
};
type Suggestion = { id: string; name: string; subtitle: string; coords: Coordinates };
type RideOption = { id: string; label: string; minutes: number; multiplier: number; icon: AppIconName; seats: number; blurb: string };
type ServiceType = 'rides' | 'bnbs' | 'laundry' | 'houses';
type TripPhase = 'idle' | 'selecting' | 'route_preview' | 'confirmed' | 'active_trip';
/** Catalog “Area on the map”: counties, everywhere, or pin-radius (distance cap only applies for `near_me`). */
type ListingCatalogArea = CountyKey | 'any' | 'near_me';
type PlaceStation = { id: string; name: string; subtitle: string; county: CountyKey; coords: Coordinates };
type MapPointKind = 'station' | 'bnb' | 'house' | 'ride';
type MapPointPayload = {
  id: string;
  title: string;
  subtitle: string;
  coords: Coordinates;
  kind: MapPointKind;
};
type MapViewportPad = { top: number; bottom: number; left: number; right: number };
type InteractiveMapOptions = {
  /** When true, station pins show a button that posts { type: 'laundryStation', id } to React Native */
  laundryStationPick?: boolean;
  /** Soft ring at selected station coordinates (laundry map) */
  selectedHighlight?: Coordinates | null;
  /** Inset from WebView edges so fitBounds centers in the visible “map slot” (under header, above sheet/nav) */
  mapViewportPad?: MapViewportPad | null;
};
/** In-app live route session (WebView preview; swap for Mapbox Navigation SDK in production). */
type GuidedJourneyKind = 'station' | 'bnb' | 'house' | 'ride' | 'place' | 'destination';
type GuidedJourney = {
  origin: Coordinates;
  end: Coordinates;
  title: string;
  subtitle: string;
  kind: GuidedJourneyKind;
};
type HouseListing = {
  id: string;
  title: string;
  county: CountyKey;
  coords: Coordinates;
  distanceKm: number;
  price: string;
  image: any;
  gallery: any[];
  detailHighlights: string[];
  beds: number;
  baths: number;
  amenities: string[];
  has3dTour: boolean;
  locationLocked?: boolean;
  exactAddress?: string;
  hostName?: string;
  hostPhone?: string;
  exactCoords?: Coordinates;
  /** True when synthesized from a booking/request because the real listing is
   * not in the current nearby payload. Such rows use fallback (county-center)
   * coords and must be kept out of strict proximity/"near me" surfaces. */
  isStub?: boolean;
};
type BnbListing = {
  id: string;
  title: string;
  county: CountyKey;
  distanceKm?: number;
  rating: string;
  price: string;
  image: any;
  gallery: any[];
  detailHighlights: string[];
  coords: Coordinates;
  exploreReason: string;
  exploreTip?: string;
  beds: number;
  guests: number;
  amenities: string[];
  has3dTour: boolean;
  locationLocked?: boolean;
  exactAddress?: string;
  hostName?: string;
  hostPhone?: string;
  exactCoords?: Coordinates;
  isStub?: boolean;
};
/** Curated city spots on Explore (hotels, meetups, retail — demo insight numbers). */
type ExploreVenueCategory = 'hotel' | 'meetup' | 'fashion' | 'market' | 'culture';

/** Primary Explore mode — Nearby / Everywhere still filter distance & lists. */
type ExploreLens = 'discover' | 'hotels' | 'markets' | 'meetups' | 'fashion' | 'journal';

type ExploreVenue = {
  id: string;
  category: ExploreVenueCategory;
  title: string;
  subtitle: string;
  coords: Coordinates;
  county: CountyKey;
  image: any;
  exploreReason: string;
  exploreTip?: string;
  /** Sheet scope chips (e.g. boutique, mega) — must include key when scope ≠ all. */
  scopes: string[];
  /** Illustrative “live” touring signal for the map card (not a census). */
  touringNow: number;
  visitedToday: number;
};

/** Pick shown in Explore sheet detail (map picks or journal). */
type ExplorePick =
  | {
      kind: 'destination' | 'bnb';
      title: string;
      subtitle: string;
      reason: string;
      tip?: string;
      coords: Coordinates;
    }
  | {
      kind: 'spot';
      spotId: string;
      category: ExploreVenueCategory;
      title: string;
      subtitle: string;
      reason: string;
      tip?: string;
      coords: Coordinates;
      touringNow: number;
      visitedToday: number;
    }
  | {
      kind: 'article';
      id: string;
      title: string;
      subtitle: string;
      reason: string;
      readMin: number;
      tag: string;
      author: string;
    };
type ExploreArticle = {
  id: string;
  title: string;
  subtitle: string;
  reason: string;
  readMin: number;
  tag: string;
  image: any;
  author: string;
  /** When set, article is emphasised in Nearby scope for this county. */
  anchorCounty?: CountyKey;
  /** Map flies here when the piece is opened — “read it where it lives”. */
  readHere?: Coordinates;
};
type Theme = {
  background: string;
  canvas: string;
  surface: string;
  sheet: string;
  elevated: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentText: string;
  primary: string;
  primaryLight: string;
  accentBlue: string;
  mutedSurface: string;
  tabIdle: string;
  grabber: string;
  statusBar: 'light' | 'dark';
  mapStyleId: string;
  isDark: boolean;
};

/** Resolve a usable Mapbox token — treat the .env.example placeholder (and any
 * non-`pk.` value) as absent so the UI shows the "add token" fallback instead of
 * silently rendering a blank map with an unauthenticated token. */
function resolveMapboxToken(): string {
  const raw = (
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    ''
  ).trim();
  if (!raw.startsWith('pk.')) return '';
  if (raw.includes('your_mapbox_public_token') || raw.includes('YOUR_MAPBOX')) return '';
  return raw;
}

const MAPBOX_ACCESS_TOKEN = resolveMapboxToken();

/**
 * Wraps a card and gently pulses (scale) while `active` is true — used to draw
 * the eye to follow-up cards that have a new, unread admin message. The pulse
 * stops the moment the card is viewed/opened (active flips to false).
 */
function PulsingCard({ active, children }: { active: boolean; children: ReactNode }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      pulse.stopAnimation(() => pulse.setValue(0));
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 720, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 720, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, active ? 1.02 : 1] });
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

/** Android: WebView must receive touches; nested scroll + hardware layer helps Mapbox GL in WebView. */
const ANDROID_MAP_WEBVIEW_PROPS: Partial<
  Pick<WebViewProps, 'overScrollMode' | 'nestedScrollEnabled' | 'androidLayerType'>
> =
  Platform.OS === 'android'
    ? { overScrollMode: 'never', nestedScrollEnabled: true, androidLayerType: 'hardware' }
    : {};
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;
const FULL_SECTION_MAP_HEIGHT = Math.max(420, Math.round(SCREEN_HEIGHT * 0.74));
const HOME_SERVICE_MAP_HEIGHT = Math.max(460, Math.round(SCREEN_HEIGHT * 0.68));

const toReadableLocationName = (placeName: string): string => {
  const parts = placeName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return placeName;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]}, ${parts[1]}`;
  return `${parts[0]}, ${parts[1]}`;
};

const summarizeLocationFromCoords = (coords: Coordinates, county: CountyKey): string => {
  const countyCenters: Record<CountyKey, { label: string; coords: Coordinates }> = {
    nairobi: { label: 'Nairobi CBD, Nairobi', coords: { latitude: -1.2864, longitude: 36.8172 } },
    mombasa: { label: 'Mombasa Island, Mombasa', coords: { latitude: -4.0435, longitude: 39.6682 } },
    kisumu: { label: 'Kisumu CBD, Kisumu', coords: { latitude: -0.0917, longitude: 34.768 } },
    nyamira: { label: 'Nyamira Town, Nyamira', coords: { latitude: -0.5669, longitude: 34.9341 } },
  };
  const target = countyCenters[county];
  const distanceKm = getDistanceKm(coords, target.coords);
  if (distanceKm <= 3) return target.label;
  if (distanceKm <= 15) return `Near ${target.label}`;
  return `${target.label.split(',')[1]?.trim() || county} area`;
};

const LAUNDRY_KES_PER_KG = 180;
const LAUNDRY_KES_PER_ITEM = 95;

const buildInteractivePointsMapHtml = (
  token: string,
  styleId: string,
  points: MapPointPayload[],
  current: Coordinates | null,
  options?: InteractiveMapOptions,
) => {
  if (!token) return null;
  const laundryPick = !!options?.laundryStationPick;
  const highlight =
    options?.selectedHighlight &&
    typeof options.selectedHighlight.longitude === 'number' &&
    typeof options.selectedHighlight.latitude === 'number'
      ? {
          lng: options.selectedHighlight.longitude,
          lat: options.selectedHighlight.latitude,
        }
      : null;
  const defaultPad = { top: 56, bottom: 112, left: 16, right: 16 };
  const viewportPad = options?.mapViewportPad
    ? {
        top: Math.max(48, Math.round(options.mapViewportPad.top)),
        bottom: Math.max(96, Math.round(options.mapViewportPad.bottom)),
        left: Math.max(8, Math.round(options.mapViewportPad.left)),
        right: Math.max(8, Math.round(options.mapViewportPad.right)),
      }
    : defaultPad;
  const payload = {
    current,
    laundryStationPick: laundryPick,
    selectedHighlight: highlight,
    viewportPad,
    points: points.slice(0, 14).map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle,
      kind: p.kind,
      coords: [p.coords.longitude, p.coords.latitude] as [number, number],
    })),
  };
  const payloadJson = JSON.stringify(payload);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"/>
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
    <style>
      html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #0b0b0b; }
      .mapboxgl-popup-content { border-radius: 12px !important; padding: 10px 12px !important; }
      .dir-btn {
        margin-top: 8px; border: 0; border-radius: 8px; padding: 7px 10px; font-size: 12px;
        font-weight: 600; background: #111827; color: #fff;
      }
      .valet-pick-btn {
        margin-top: 8px; border: 0; border-radius: 8px; padding: 7px 10px; font-size: 12px;
        font-weight: 600; background: #FFF7ED; color: #9A3412; border: 1px solid #FDBA74;
      }
      .user-marker-wrap { width: 48px; height: 48px; position: relative; pointer-events: none; }
      .user-pulse-ring {
        position: absolute; left: 50%; top: 50%;
        width: 40px; height: 40px; margin-left: -20px; margin-top: -20px;
        border-radius: 50%; border: 2px solid rgba(34,197,94,0.65);
        animation: juxPulse 2s ease-out infinite;
      }
      .user-dot {
        position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; margin-left: -7px; margin-top: -7px;
        border-radius: 50%; background: #22c55e; border: 2px solid #fff;
        box-shadow: 0 1px 6px rgba(0,0,0,0.35);
      }
      @keyframes juxPulse {
        0% { transform: scale(0.55); opacity: 0.95; }
        70% { transform: scale(1.45); opacity: 0; }
        100% { opacity: 0; }
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
    <script>
      window.onerror = function () { return true; };
      const DATA = ${payloadJson};
      mapboxgl.accessToken = '${token}';
      const fallbackCenter = [36.8172, -1.2864];
      const startCenter = DATA.current
        ? [DATA.current.longitude, DATA.current.latitude]
        : (DATA.points[0] ? DATA.points[0].coords : fallbackCenter);
      const startZoom = DATA.current ? 12.6 : (DATA.points.length ? 11.2 : 10.2);
      const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/${styleId}',
        center: startCenter,
        zoom: startZoom,
        touchPitch: false,
        dragRotate: false,
      });
      map.touchZoomRotate.enable();
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new mapboxgl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
      function addPulsingUser() {
        if (!DATA.current) return;
        const el = document.createElement('div');
        el.className = 'user-marker-wrap';
        el.innerHTML = '<div class="user-pulse-ring"></div><div class="user-dot"></div>';
        new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([DATA.current.longitude, DATA.current.latitude])
          .addTo(map);
      }
      function fitProximityNice() {
        const pad = DATA.viewportPad || { top: 56, bottom: 112, left: 16, right: 16 };
        const features = (DATA.points || []).map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: p.coords },
          properties: { id: p.id, title: p.title, subtitle: p.subtitle, kind: p.kind || 'ride' }
        }));
        if (!DATA.current && features.length === 0) return;
        if (DATA.current && features.length === 0) {
          map.easeTo({
            center: [DATA.current.longitude, DATA.current.latitude],
            zoom: 13.5,
            padding: pad,
            duration: 800,
            essential: true,
          });
          return;
        }
        const b = new mapboxgl.LngLatBounds();
        if (DATA.current) b.extend([DATA.current.longitude, DATA.current.latitude]);
        features.forEach((f) => b.extend(f.geometry.coordinates));
        map.fitBounds(b, {
          padding: pad,
          maxZoom: 14.2,
          duration: 900,
          essential: true,
        });
      }
      map.on('load', function () {
        const features = DATA.points.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: p.coords },
          properties: { id: p.id, title: p.title, subtitle: p.subtitle, kind: p.kind || 'ride' }
        }));
        map.addSource('pins', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.addLayer({
          id: 'pins-circle',
          type: 'circle',
          source: 'pins',
          paint: {
            'circle-radius': ['match', ['get', 'kind'], 'station', 11, 'bnb', 10, 'house', 10, 'ride', 9, 9],
            'circle-color': [
              'match', ['get', 'kind'],
              'station', '#F59E0B',
              'bnb', '#EC4899',
              'house', '#8B5CF6',
              'ride', '#2563EB',
              '#2563EB'
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });
        if (DATA.selectedHighlight) {
          map.addSource('pick-highlight', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [DATA.selectedHighlight.lng, DATA.selectedHighlight.lat] },
                properties: {},
              }],
            },
          });
          map.addLayer({
            id: 'pick-highlight-ring',
            type: 'circle',
            source: 'pick-highlight',
            paint: {
              'circle-radius': 22,
              'circle-color': '#F59E0B',
              'circle-opacity': 0.22,
              'circle-stroke-width': 3,
              'circle-stroke-color': '#EA580C',
            },
          });
        }
        addPulsingUser();
        fitProximityNice();
        map.on('click', 'pins-circle', async function (e) {
          const f = e.features[0];
          const c = f.geometry.coordinates.slice();
          const props = f.properties || {};
          const pop = new mapboxgl.Popup({ offset: 12 }).setLngLat(c);
          const wrap = document.createElement('div');
          const h = document.createElement('div');
          h.textContent = String(props.title || 'Selected');
          h.style.cssText = 'font-size:13px;font-weight:700;';
          const s = document.createElement('div');
          s.textContent = String(props.subtitle || '');
          s.style.cssText = 'font-size:11px;color:#6B7280;margin-top:2px;';
          wrap.appendChild(h); wrap.appendChild(s);
          const btn = document.createElement('button');
          btn.className = 'dir-btn';
          btn.textContent = DATA.current ? 'Start journey' : 'Enable location to navigate';
          btn.disabled = !DATA.current;
          btn.onclick = function () {
            if (!DATA.current) return;
            try {
              if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'startJourney',
                  destLng: c[0],
                  destLat: c[1],
                  title: String(props.title || 'Destination'),
                  subtitle: String(props.subtitle || ''),
                  kind: String(props.kind || 'place'),
                }));
              }
            } catch (_) {}
          };
          wrap.appendChild(btn);
          const preview = document.createElement('button');
          preview.className = 'dir-btn';
          preview.style.cssText = 'margin-top:6px;background:#374151;font-size:11px;padding:6px 8px;';
          preview.textContent = 'Preview route on map';
          preview.disabled = !DATA.current;
          preview.onclick = async function () {
            if (!DATA.current) return;
            const from = DATA.current;
            const url = 'https://api.mapbox.com/directions/v5/mapbox/driving/' +
              from.longitude + ',' + from.latitude + ';' + c[0] + ',' + c[1] +
              '?overview=full&geometries=geojson&access_token=' + mapboxgl.accessToken;
            try {
              const res = await fetch(url);
              const json = await res.json();
              const route = json && json.routes && json.routes[0];
              if (!route || !route.geometry) return;
              const data = { type: 'Feature', geometry: route.geometry, properties: {} };
              if (map.getSource('route')) {
                map.getSource('route').setData(data);
              } else {
                map.addSource('route', { type: 'geojson', data });
                map.addLayer({
                  id: 'route-line',
                  type: 'line',
                  source: 'route',
                  paint: { 'line-color': '#2563EB', 'line-width': 4.5, 'line-opacity': 0.92 }
                });
              }
            } catch (_) {}
          };
          wrap.appendChild(preview);
          if (DATA.laundryStationPick && String(props.kind) === 'station' && props.id) {
            const pick = document.createElement('button');
            pick.className = 'valet-pick-btn';
            pick.textContent = 'Use this pickup station';
            pick.onclick = function () {
              try {
                if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'laundryStation', id: String(props.id) }));
                }
              } catch (_) {}
            };
            wrap.appendChild(pick);
          }
          pop.setDOMContent(wrap).addTo(map);
        });
        map.on('mouseenter', 'pins-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'pins-circle', () => { map.getCanvas().style.cursor = ''; });
      });
    </script>
  </body>
</html>`;
};

/** WebView preview: live GPS on map + route progress; step text is context only (Navigation SDK for production). */
type GuidanceUiTheme = {
  canvas: string;
  surface: string;
  text: string;
  textMuted: string;
  gold: string;
  isDark: boolean;
};

const buildGuidanceMapHtml = (
  token: string,
  styleId: string,
  origin: Coordinates,
  destination: Coordinates,
  title: string,
  subtitle: string,
  ui: GuidanceUiTheme,
) => {
  const nav = JSON.stringify({
    token,
    styleId,
    origin,
    destination,
    title,
    subtitle,
    ui,
  });
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"/>
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: ${ui.canvas}; }
      #map { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
      #navPanel {
        position: absolute; left: 0; right: 0; bottom: 0; max-height: 46vh;
        background: linear-gradient(180deg, transparent, ${ui.isDark ? 'rgba(10,10,10,0.12)' : 'rgba(245,240,230,0.15)'} 12%, ${ui.surface} 28%);
        color: ${ui.text}; font-family: system-ui, -apple-system, sans-serif;
        padding: 14px 16px 24px; pointer-events: auto; overflow-y: auto;
        border-top: 1px solid ${ui.isDark ? 'rgba(201,162,39,0.28)' : 'rgba(201,162,39,0.35)'};
      }
      .nav-eyebrow { font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase; color: ${ui.gold}; font-weight: 700; }
      .nav-title { font-size: 17px; font-weight: 700; margin-top: 4px; color: ${ui.text}; letter-spacing: -0.02em; }
      .nav-sub { font-size: 12px; color: ${ui.textMuted}; margin-top: 3px; line-height: 1.4; }
      .nav-live {
        margin-top: 14px; padding: 14px 14px 12px; border-radius: 14px;
        background: ${ui.isDark ? 'rgba(28,28,28,0.92)' : 'rgba(255,255,255,0.96)'};
        border: 1px solid ${ui.isDark ? 'rgba(201,162,39,0.35)' : 'rgba(201,162,39,0.45)'};
      }
      .nav-live-label { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${ui.gold}; }
      .nav-live-main { font-size: 22px; font-weight: 800; margin-top: 6px; letter-spacing: -0.02em; line-height: 1.15; color: ${ui.text}; }
      .nav-live-caption { font-size: 11px; line-height: 1.45; color: ${ui.textMuted}; margin-top: 8px; }
      .nav-live-badge {
        display: inline-block; margin-top: 10px; font-size: 11px; font-weight: 600;
        padding: 5px 10px; border-radius: 999px;
        background: ${ui.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
        color: ${ui.textMuted};
      }
      .nav-live-badge.on { background: rgba(34,197,94,0.2); color: #16a34a; border: 1px solid rgba(34,197,94,0.4); }
      .nav-sdk-note { font-size: 10px; line-height: 1.4; color: ${ui.textMuted}; margin-top: 10px; opacity: 0.85; }
      .nav-upcoming-label {
        font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
        color: ${ui.textMuted}; margin-top: 16px; margin-bottom: 6px;
      }
      .nav-step {
        font-size: 11px; line-height: 1.4; padding: 7px 0;
        border-top: 1px solid ${ui.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};
        color: ${ui.textMuted};
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <div id="navPanel"></div>
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
    <script>
      window.onerror = function () { return true; };
      const NAV = ${nav};
      mapboxgl.accessToken = NAV.token;
      const panel = document.getElementById('navPanel');
      function setLiveBadge(text, on) {
        var el = document.getElementById('liveBadge');
        if (!el) return;
        el.textContent = text;
        if (on) el.classList.add('on'); else el.classList.remove('on');
      }
      function renderHeader() {
        panel.innerHTML =
          '<div class="nav-eyebrow">Jua navigate</div>' +
          '<div class="nav-title">' + (NAV.title || 'Destination') + '</div>' +
          '<div class="nav-sub">' + (NAV.subtitle || '') + '</div>' +
          '<div id="navBody"></div>';
      }
      renderHeader();
      const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/' + NAV.styleId,
        center: [NAV.origin.longitude, NAV.origin.latitude],
        zoom: 13.2,
        pitch: 0,
        bearing: 0,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
      const geo = new mapboxgl.GeolocateControl({
        trackUserLocation: true,
        showUserHeading: true,
        showAccuracyCircle: true,
        positionOptions: { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      });
      map.addControl(geo, 'top-left');
      geo.on('trackuserlocationstart', function () {
        setLiveBadge('Live · following your position', true);
      });
      geo.on('trackuserlocationend', function () {
        setLiveBadge('Paused — tap the arrow on the map to resume', false);
      });
      geo.on('error', function () {
        setLiveBadge('Could not read GPS — check permissions', false);
      });
      map.on('load', function () {
        const o = NAV.origin;
        const d = NAV.destination;
        const url = 'https://api.mapbox.com/directions/v5/mapbox/driving/' +
          o.longitude + ',' + o.latitude + ';' + d.longitude + ',' + d.latitude +
          '?steps=true&geometries=geojson&overview=full&access_token=' + NAV.token;
        fetch(url)
          .then(function (r) { return r.json(); })
          .then(function (json) {
            var route = json && json.routes && json.routes[0];
            var body = document.getElementById('navBody');
            if (!route || !route.geometry) {
              if (body) body.innerHTML = '<div class="nav-step">Could not load route.</div>';
              return;
            }
            var durMin = route.duration ? Math.round(route.duration / 60) : null;
            var distKm = route.distance ? (route.distance / 1000).toFixed(1) : null;
            map.addSource('nav-route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry, properties: {} } });
            map.addLayer({
              id: 'nav-route-line',
              type: 'line',
              source: 'nav-route',
              paint: { 'line-color': '${ui.gold}', 'line-width': 5.5, 'line-opacity': 0.94 },
            });
            var destEl = document.createElement('div');
            destEl.style.cssText = 'width:14px;height:14px;border-radius:50%;background:${ui.gold};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);';
            new mapboxgl.Marker({ element: destEl, anchor: 'center' })
              .setLngLat([d.longitude, d.latitude])
              .addTo(map);
            var coords = route.geometry.coordinates;
            var b = new mapboxgl.LngLatBounds();
            coords.forEach(function (pt) { b.extend(pt); });
            map.fitBounds(b, { padding: { top: 88, bottom: 260, left: 16, right: 16 }, duration: 800, maxZoom: 16, essential: true });
            var steps = (route.legs && route.legs[0] && route.legs[0].steps) ? route.legs[0].steps : [];
            var progressLine = (distKm != null && durMin != null)
              ? (distKm + ' km · about ' + durMin + ' min')
              : 'Route ready';
            var stepsHtml = '';
            for (var i = 0; i < Math.min(steps.length, 12); i++) {
              var st = steps[i];
              var t = (st.maneuver && st.maneuver.instruction) ? st.maneuver.instruction : '';
              stepsHtml += '<div class="nav-step">' + (i + 1) + '. ' + t + '</div>';
            }
            if (body) {
              body.innerHTML =
                '<div class="nav-live">' +
                '<div class="nav-live-label">On route</div>' +
                '<div id="liveEtaMain" class="nav-live-main">' + progressLine + '</div>' +
                '<div id="liveEtaCaption" class="nav-live-caption">Gold line is your path. Your dot updates as you move — ETA refreshes along the way.</div>' +
                '<div id="liveBadge" class="nav-live-badge">Starting location…</div>' +
                '<div class="nav-sdk-note">Voice and lane guidance ship with Mapbox Navigation SDK in production. Turn list below is preview only.</div>' +
                '</div>' +
                (stepsHtml ? '<div class="nav-upcoming-label">Along the route</div>' + stepsHtml : '');
            }
            function setLiveEta(main, caption) {
              var mainEl = document.getElementById('liveEtaMain');
              var capEl = document.getElementById('liveEtaCaption');
              if (mainEl && main) mainEl.textContent = main;
              if (capEl && caption) capEl.textContent = caption;
            }
            var lastEtaFetch = 0;
            var lastEtaLat = null;
            var lastEtaLng = null;
            function haversineKm(lat1, lon1, lat2, lon2) {
              var R = 6371;
              var dLat = (lat2 - lat1) * Math.PI / 180;
              var dLon = (lon2 - lon1) * Math.PI / 180;
              var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
              return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            }
            function refreshEtaFromPosition(lat, lng) {
              var now = Date.now();
              var moved = lastEtaLat == null || haversineKm(lastEtaLat, lastEtaLng, lat, lng) > 0.12;
              if (!moved && now - lastEtaFetch < 25000) return;
              lastEtaFetch = now;
              lastEtaLat = lat;
              lastEtaLng = lng;
              var etaUrl = 'https://api.mapbox.com/directions/v5/mapbox/driving/' +
                lng + ',' + lat + ';' + d.longitude + ',' + d.latitude +
                '?overview=false&access_token=' + NAV.token;
              fetch(etaUrl)
                .then(function (r) { return r.json(); })
                .then(function (json) {
                  var leg = json && json.routes && json.routes[0];
                  if (!leg) return;
                  var remKm = leg.distance ? (leg.distance / 1000).toFixed(1) : null;
                  var remMin = leg.duration ? Math.max(1, Math.round(leg.duration / 60)) : null;
                  if (remKm != null && remMin != null) {
                    setLiveEta(remKm + ' km · about ' + remMin + ' min remaining',
                      'Updated from your live position · map follows you as you move');
                    setLiveBadge('Live · ' + remMin + ' min to destination', true);
                  }
                })
                .catch(function () {});
            }
            if (navigator.geolocation && navigator.geolocation.watchPosition) {
              navigator.geolocation.watchPosition(function (pos) {
                refreshEtaFromPosition(pos.coords.latitude, pos.coords.longitude);
              }, function () {}, { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 });
            }
            setTimeout(function () {
              try { if (typeof geo.trigger === 'function') geo.trigger(); } catch (_) {}
            }, 500);
          })
          .catch(function () {
            var body = document.getElementById('navBody');
            if (body) body.innerHTML = '<div class="nav-step">Network error loading route.</div>';
          });
      });
    </script>
  </body>
</html>`;
};

const LIGHT_THEME: Theme = {
  background: Colors.light.canvas,
  canvas: Colors.light.canvas,
  surface: Colors.light.surface,
  sheet: Colors.light.sheet,
  elevated: Colors.light.sheet,
  border: Colors.light.border,
  textPrimary: Colors.light.text,
  textSecondary: Colors.light.textSecondary,
  textMuted: Colors.light.textMuted,
  accent: Colors.light.text,
  accentText: Colors.light.ctaText,
  primary: Colors.light.primary,
  primaryLight: Colors.light.primaryLight,
  accentBlue: Colors.light.accent,
  mutedSurface: Colors.light.primaryFaint,
  tabIdle: Colors.light.tabIdle,
  grabber: Colors.light.grabber,
  statusBar: Colors.light.statusBar,
  mapStyleId: Colors.light.mapStyleId,
  isDark: false,
};

const DARK_THEME: Theme = {
  background: Colors.dark.canvas,
  canvas: Colors.dark.canvas,
  surface: Colors.dark.surface,
  sheet: Colors.dark.sheet,
  elevated: Colors.dark.elevated,
  border: Colors.dark.border,
  textPrimary: Colors.dark.text,
  textSecondary: Colors.dark.textSecondary,
  textMuted: Colors.dark.textMuted,
  accent: Colors.dark.text,
  accentText: Colors.dark.ctaText,
  primary: Colors.dark.primary,
  primaryLight: Colors.dark.primaryLight,
  accentBlue: Colors.dark.accent,
  mutedSurface: Colors.dark.primaryFaint,
  tabIdle: Colors.dark.tabIdle,
  grabber: Colors.dark.grabber,
  statusBar: Colors.dark.statusBar,
  mapStyleId: Colors.dark.mapStyleId,
  isDark: true,
};

/** Remote hero shots — section-relevant, cacheable Unsplash URLs. */
const U = (path: string) => ({ uri: `https://images.unsplash.com/${path}` });
const IMG = {
  nairobiCity: U('photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=960&q=80'),
  coast: U('photo-1573843981267-be1999ff37cd?auto=format&fit=crop&w=960&q=80'),
  lake: U('photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=960&q=80'),
  teaHills: U('photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=960&q=80'),
  marketRoad: U('photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=960&q=80'),
  ridge: U('photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=960&q=80'),
  paris: U('photo-1502602898657-711cf3e2c1a9?auto=format&fit=crop&w=960&q=80'),
  dubai: U('photo-1512453979798-662a9b56d263?auto=format&fit=crop&w=960&q=80'),
  accra: U('photo-1523803302740-5e2a55ebe1b6?auto=format&fit=crop&w=960&q=80'),
  interiorLoft: U('photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=960&q=80'),
  interiorLiving: U('photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=960&q=80'),
  interiorSea: U('photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=960&q=80'),
  interiorLake: U('photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=960&q=80'),
  interiorHighland: U('photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=960&q=80'),
  interiorTransit: U('photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=960&q=80'),
  rentalModern: U('photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=960&q=80'),
  rentalSuburb: U('photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=960&q=80'),
  rentalCoast: U('photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=960&q=80'),
  rentalLake: U('photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=960&q=80'),
  rentalTown: U('photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=960&q=80'),
  rentalVillage: U('photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=960&q=80'),
  mapPin: U('photo-1524661135-423995f22d0b?auto=format&fit=crop&w=640&q=80'),
  laundry: U('photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=960&q=80'),
  /** FUA hero — verified Unsplash laundry shots */
  fuaHero: U('photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=85'),
  fuaHeroBasket: U('photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=1200&q=85'),
  ridesHero: U('photo-1502877338535-766e1452684a?auto=format&fit=crop&w=960&q=80'),
  staysHero: U('photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=960&q=80'),
  clothHero: U('photo-1489987707024-afc025f1b735?auto=format&fit=crop&w=960&q=80'),
  groceryHero: U('photo-1542838132-92c53300491e?auto=format&fit=crop&w=960&q=80'),
  toursHero: U('photo-1528183429752-a97fa0afff39?auto=format&fit=crop&w=960&q=80'),
  spotsHero: U('photo-1566073771259-6a8506099945?auto=format&fit=crop&w=960&q=80'),
  eventsHero: U('photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=960&q=80'),
  moversHero: U('photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=960&q=80'),
  milimani: U('photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=960&q=80'),
  riatHills: U('photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=960&q=80'),
};

const DESTINATIONS: Destination[] = [
  {
    id: 'nairobi',
    name: 'Nairobi',
    subtitle: 'Nairobi CBD, Kenya',
    coords: { latitude: -1.2864, longitude: 36.8172 },
    county: 'nairobi',
    image: IMG.nairobiCity,
    exploreReason: 'East Africa’s business and culture hub — galleries, food, and Karura Forest escapes.',
    exploreTip: 'Best for city breaks, meetings, and safari stopovers.',
  },
  {
    id: 'mombasa',
    name: 'Mombasa',
    subtitle: 'Mombasa, Kenya',
    coords: { latitude: -4.0435, longitude: 39.6682 },
    county: 'mombasa',
    image: IMG.coast,
    exploreReason: 'Swahili coast history plus Indian Ocean beaches and island day trips.',
    exploreTip: 'Ideal for sun, seafood, and Old Town architecture.',
  },
  {
    id: 'kisumu',
    name: 'Kisumu',
    subtitle: 'Kisumu, Kenya',
    coords: { latitude: -0.0917, longitude: 34.768 },
    county: 'kisumu',
    image: IMG.lake,
    exploreReason: 'Lakeside sunsets on Lake Victoria and a relaxed Nyanza vibe.',
    exploreTip: 'Great for weekend resets and fish dishes by the water.',
  },
  {
    id: 'nyamira-town',
    name: 'Nyamira Town',
    subtitle: 'Nyamira County HQ, Kenya',
    coords: { latitude: -0.5669, longitude: 34.9341 },
    county: 'nyamira',
    image: IMG.teaHills,
    exploreReason: 'County center with markets, tea highlands, and easy links to Kisii and Keroka.',
    exploreTip: 'Great base for short county trips and local food stops.',
  },
  {
    id: 'keroka',
    name: 'Keroka',
    subtitle: 'Keroka, Nyamira County',
    coords: { latitude: -0.7758, longitude: 34.9453 },
    county: 'nyamira',
    image: IMG.marketRoad,
    exploreReason: 'Busy transit town with produce markets and highway-side eateries.',
    exploreTip: 'Best for stopovers and local market shopping.',
  },
  {
    id: 'manga-hills',
    name: 'Manga Hills',
    subtitle: 'Manga Ridge, Nyamira/Kisii',
    coords: { latitude: -0.6805, longitude: 34.8712 },
    county: 'nyamira',
    image: IMG.ridge,
    exploreReason: 'High-altitude viewpoints over Gusii highlands and scenic ridge walks.',
    exploreTip: 'Morning visits give the clearest valley views.',
  },
  {
    id: 'paris',
    name: 'Paris',
    subtitle: 'Charles de Gaulle Airport',
    coords: { latitude: 48.8566, longitude: 2.3522 },
    image: IMG.paris,
    exploreReason: 'Art, cafés, and iconic boulevards — a classic city break.',
    exploreTip: 'Pair museums with evening walks along the Seine.',
  },
  {
    id: 'dubai',
    name: 'Dubai',
    subtitle: 'Downtown / Burj Area',
    coords: { latitude: 25.2048, longitude: 55.2708 },
    image: IMG.dubai,
    exploreReason: 'Desert modernity: skyline views, malls, and beach clubs.',
    exploreTip: 'Mix a desert safari with waterfront dining.',
  },
  {
    id: 'accra',
    name: 'Accra',
    subtitle: 'Kotoka International',
    coords: { latitude: 5.6037, longitude: -0.187 },
    image: IMG.accra,
    exploreReason: 'West African energy — markets, music, and Atlantic beaches.',
    exploreTip: 'Try Jamestown walks and fresh grilled tilapia by the coast.',
  },
];

const EXPLORE_ARTICLES: ExploreArticle[] = [
  {
    id: 'ex-j-1',
    title: 'Bypass Sundays',
    subtitle: 'Nairobi without the crawl',
    reason:
      'Karura edges, early coffee on Limuru Road, and a late train of light on the escarpment — a soft city loop when you want green without leaving town.',
    readMin: 5,
    tag: 'City',
    image: IMG.nairobiCity,
    author: 'Amina K.',
    anchorCounty: 'nairobi',
    readHere: { latitude: -1.2842, longitude: 36.8198 },
  },
  {
    id: 'ex-j-2',
    title: 'Coast light, low tide',
    subtitle: 'Mombasa mornings',
    reason:
      'Old Town alleys before heat, chai at dhow harbours, and a swim window when the reef breathes out — a tide-aware half day.',
    readMin: 7,
    tag: 'Coast',
    image: IMG.coast,
    author: 'Rashid O.',
    anchorCounty: 'mombasa',
    readHere: { latitude: -4.0445, longitude: 39.6685 },
  },
  {
    id: 'ex-j-3',
    title: 'Victoria wind',
    subtitle: 'Kisumu late light',
    reason:
      'Lake walks after work, tilapia on charcoal, and the hum of evening ferries — Nyanza pace for a reset weekend.',
    readMin: 6,
    tag: 'Lakes',
    image: IMG.lake,
    author: 'Mesh Traveler',
    anchorCounty: 'kisumu',
    readHere: { latitude: -0.0925, longitude: 34.7678 },
  },
  {
    id: 'ex-j-4',
    title: 'Tea ridges',
    subtitle: 'Nyamira · Kisii line',
    reason:
      'Ridge roads, market greens, and cool air after rain — a short highland circuit when Nairobi feels too loud.',
    readMin: 8,
    tag: 'Hills',
    image: IMG.teaHills,
    author: 'Bosibori M.',
    anchorCounty: 'nyamira',
    readHere: { latitude: -0.5675, longitude: 34.935 },
  },
  {
    id: 'ex-j-5',
    title: 'Desert glass nights',
    subtitle: 'Dubai layover lens',
    reason:
      'Water taxis at blue hour, quiet souks, and skyline hush from a high floor — a polished stop between long hauls.',
    readMin: 4,
    tag: 'Layover',
    image: IMG.dubai,
    author: 'Mesh Traveler',
    readHere: { latitude: 25.1972, longitude: 55.2744 },
  },
  {
    id: 'ex-j-street-1',
    title: 'CBD drip map',
    subtitle: 'Denim, kitenge, and quick tailors',
    reason:
      'Start at Biashara Street for basics, cut across to late-day sample sales on Mfangano, then end at a basement tailor for hems — Nairobi street fashion in three moves.',
    readMin: 6,
    tag: 'Street',
    image: IMG.marketRoad,
    author: 'Leo W.',
    anchorCounty: 'nairobi',
    readHere: { latitude: -1.2795, longitude: 36.8385 },
  },
  {
    id: 'ex-j-street-2',
    title: 'Two Rivers runway',
    subtitle: 'Mall rails + parking-lot fits',
    reason:
      'Weekend crowds skew loud colour and clean sneakers; upper floors hide quieter ateliers — good for one statement piece without the CBD squeeze.',
    readMin: 5,
    tag: 'Fashion',
    image: IMG.paris,
    author: 'Nia T.',
    anchorCounty: 'nairobi',
    readHere: { latitude: -1.212, longitude: 36.783 },
  },
  {
    id: 'ex-j-nbo-night',
    title: 'Westlands after dark',
    subtitle: 'Sound, neon, and late bites',
    reason:
      'Woodvale groove then a rooftop mocktail — the strip rewards slow walks: listen for live bands on Thursdays and skip the first overpriced snack tray.',
    readMin: 7,
    tag: 'Night',
    image: IMG.interiorLoft,
    author: 'Nia T.',
    anchorCounty: 'nairobi',
    readHere: { latitude: -1.2685, longitude: 36.8095 },
  },
  {
    id: 'ex-j-ksm-market',
    title: 'Dunga fish hour',
    subtitle: 'Kisumu before the smoke rises',
    reason:
      'Hit the beach-side grills before ten when boats land — ask for “kende” size, watch the scales, and carry small notes; afternoons are for haggling crafts, not protein.',
    readMin: 6,
    tag: 'Food',
    image: IMG.lake,
    author: 'Mesh Traveler',
    anchorCounty: 'kisumu',
    readHere: { latitude: -0.095, longitude: 34.745 },
  },
];

const EXPLORE_VENUES: ExploreVenue[] = [
  {
    id: 'ex-v-sarova',
    category: 'hotel',
    title: 'Sarova Stanley',
    subtitle: 'Heritage hotel · CBD',
    coords: { latitude: -1.2831, longitude: 36.8169 },
    county: 'nairobi',
    image: IMG.interiorLoft,
    exploreReason: 'Afternoon tea lounge and quiet courtyards — a classic base before safari legs.',
    exploreTip: 'Ask for upper floors for less street hum.',
    scopes: ['boutique', 'business'],
    touringNow: 42,
    visitedToday: 1860,
  },
  {
    id: 'ex-v-kemp',
    category: 'hotel',
    title: 'Kempinski rooftop',
    subtitle: 'Westlands skyline',
    coords: { latitude: -1.2674, longitude: 36.8088 },
    county: 'nairobi',
    image: IMG.interiorSea,
    exploreReason: 'Sunset pool deck and skyline glass — short hops to gigs and galleries.',
    scopes: ['rooftop', 'business'],
    touringNow: 28,
    visitedToday: 940,
  },
  {
    id: 'ex-v-ihub',
    category: 'meetup',
    title: 'iHub dev nights',
    subtitle: 'Sprint demos & Kotlin',
    coords: { latitude: -1.2891, longitude: 36.782 },
    county: 'nairobi',
    image: IMG.mapPin,
    exploreReason: 'Bi-weekly meetups: mobile, ML, and infra — bring a laptop and a one-liner pitch.',
    exploreTip: 'RSVP opens Mondays; arrive early for power strips.',
    scopes: ['dev', 'week'],
    touringNow: 64,
    visitedToday: 320,
  },
  {
    id: 'ex-v-lambda',
    category: 'meetup',
    title: 'Lambda lounge',
    subtitle: 'Design × frontend',
    coords: { latitude: -1.2926, longitude: 36.8214 },
    county: 'nairobi',
    image: IMG.interiorLiving,
    exploreReason: 'Sofas, figma walls, and lightning talks — friendly for juniors.',
    scopes: ['design', 'week'],
    touringNow: 31,
    visitedToday: 210,
  },
  {
    id: 'ex-v-two',
    category: 'fashion',
    title: 'Two Rivers Atelier row',
    subtitle: 'Limited runs & tailoring',
    coords: { latitude: -1.2112, longitude: 36.7825 },
    county: 'nairobi',
    image: IMG.paris,
    exploreReason: 'Boutique rails, on-site alterations, and weekend trunk shows.',
    scopes: ['mall', 'tailor'],
    touringNow: 19,
    visitedToday: 1520,
  },
  {
    id: 'ex-v-gikomba',
    category: 'fashion',
    title: 'Gikomba fashion lane',
    subtitle: 'Vintage & rework',
    coords: { latitude: -1.2788, longitude: 36.8398 },
    county: 'nairobi',
    image: IMG.marketRoad,
    exploreReason: 'Stacks of denim, kitenge offcuts, and fast alterations — come with cash and patience.',
    scopes: ['street', 'tailor'],
    touringNow: 120,
    visitedToday: 4800,
  },
  {
    id: 'ex-v-carrefour',
    category: 'market',
    title: 'Carrefour Two Rivers',
    subtitle: 'Hypermarket run',
    coords: { latitude: -1.2108, longitude: 36.7818 },
    county: 'nairobi',
    image: IMG.rentalModern,
    exploreReason: 'Full basket stop before hosting — parking decks link to the mall.',
    scopes: ['mega', 'weekend'],
    touringNow: 210,
    visitedToday: 6200,
  },
  {
    id: 'ex-v-naivas-msa',
    category: 'market',
    title: 'Naivas Nyali',
    subtitle: 'Coast groceries',
    coords: { latitude: -4.0352, longitude: 39.7144 },
    county: 'mombasa',
    image: IMG.coast,
    exploreReason: 'Stock up before dhow evenings — chilled aisles and local produce wall.',
    scopes: ['weekend', 'late'],
    touringNow: 88,
    visitedToday: 4100,
  },
  {
    id: 'ex-v-tuskys-ksm',
    category: 'market',
    title: 'Tuskys Mega',
    subtitle: 'Kisumu CBD',
    coords: { latitude: -0.0932, longitude: 34.7695 },
    county: 'kisumu',
    image: IMG.lake,
    exploreReason: 'Lake-city pantry stop — fish counter busy before lunch.',
    scopes: ['mega', 'weekend'],
    touringNow: 56,
    visitedToday: 2900,
  },
  {
    id: 'ex-v-circle',
    category: 'culture',
    title: 'Nairobi Gallery Circle',
    subtitle: 'Contemporary rotation',
    coords: { latitude: -1.2745, longitude: 36.8119 },
    county: 'nairobi',
    image: IMG.nairobiCity,
    exploreReason: 'Three small rooms, big names — good for a one-hour culture hit.',
    scopes: ['mall'],
    touringNow: 14,
    visitedToday: 480,
  },
  {
    id: 'ex-v-fort',
    category: 'culture',
    title: 'Fort Jesus sound series',
    subtitle: 'Mombasa Old Town',
    coords: { latitude: -4.0628, longitude: 39.6798 },
    county: 'mombasa',
    image: IMG.coast,
    exploreReason: 'Evening acoustic sets on the ramparts — breeze off the channel.',
    scopes: ['weekend'],
    touringNow: 36,
    visitedToday: 1200,
  },
  {
    id: 'ex-v-keroka',
    category: 'meetup',
    title: 'Keroka dev tea',
    subtitle: 'Highway-side café',
    coords: { latitude: -0.7765, longitude: 34.9448 },
    county: 'nyamira',
    image: IMG.teaHills,
    exploreReason: 'Informal Saturday builds — Flutter and POS plugins on sticky notes.',
    scopes: ['dev', 'week'],
    touringNow: 12,
    visitedToday: 85,
  },
  {
    id: 'ex-v-nyamira-hotel',
    category: 'hotel',
    title: 'Nyamira County Lodge',
    subtitle: 'Tea-belt stopover',
    coords: { latitude: -0.5655, longitude: 36.9315 },
    county: 'nyamira',
    image: IMG.interiorHighland,
    exploreReason: 'Quiet nights after ridge drives — early breakfast for market runs.',
    scopes: ['boutique', 'weekend'],
    touringNow: 9,
    visitedToday: 140,
  },
];

const EXPLORE_SHEET_SCOPES: Record<ExploreLens, { key: string; label: string }[]> = {
  discover: [
    { key: 'all', label: 'All' },
    { key: 'trending', label: 'Trending' },
    { key: 'quiet', label: 'Slow days' },
  ],
  hotels: [
    { key: 'all', label: 'All' },
    { key: 'boutique', label: 'Boutique' },
    { key: 'rooftop', label: 'Rooftops' },
    { key: 'business', label: 'Business' },
  ],
  markets: [
    { key: 'all', label: 'All' },
    { key: 'mega', label: 'Hyper' },
    { key: 'weekend', label: 'Weekend' },
    { key: 'late', label: 'Late night' },
  ],
  meetups: [
    { key: 'all', label: 'All' },
    { key: 'dev', label: 'Dev' },
    { key: 'design', label: 'Design' },
    { key: 'week', label: 'This week' },
  ],
  fashion: [
    { key: 'all', label: 'All' },
    { key: 'street', label: 'Street' },
    { key: 'mall', label: 'Malls' },
    { key: 'tailor', label: 'Tailors' },
  ],
  journal: [
    { key: 'all', label: 'All' },
    { key: 'editors', label: "Editors'" },
    { key: 'onmap', label: 'On map' },
  ],
};

const explorePinHeat = (seed: string, min: number, max: number) => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h + seed.charCodeAt(i) * (i + 3)) % 997;
  return min + (h % (max - min + 1));
};

const RIDE_OPTIONS: RideOption[] = [
  { id: 'economy', label: 'Jua Ride', minutes: 3, multiplier: 1, icon: 'rides', seats: 4, blurb: 'Everyday trips · best value' },
  { id: 'comfort', label: 'Jua Comfort', minutes: 5, multiplier: 1.35, icon: 'rides-comfort', seats: 4, blurb: 'Extra legroom · quiet AC' },
  { id: 'premium', label: 'Jua XL', minutes: 7, multiplier: 1.85, icon: 'rides-xl', seats: 6, blurb: 'Groups · luggage · airport runs' },
];

const RIDE_WIZARD_BOOKING = [
  { key: 'pickup', title: 'Pickup point', subtitle: 'Start from your pin or a ride hub nearby', icon: '📍' },
  { key: 'destination', title: 'Destination', subtitle: 'Where are you headed?', icon: '🏁' },
  { key: 'ride_type', title: 'Choose your ride', subtitle: 'Pick the tier that fits your trip', icon: '🚗' },
  { key: 'review', title: 'Review & request', subtitle: 'Confirm everything looks right', icon: '✓' },
] as const;

const RIDE_WIZARD_BOOKING_ORDER = RIDE_WIZARD_BOOKING.map((s) => s.key);

type RideWizardBookingStep = (typeof RIDE_WIZARD_BOOKING)[number]['key'];
type RideWizardPostStep = 'matching' | 'driver_eta' | 'payment' | 'on_trip';
type RideWizardStep = RideWizardBookingStep | RideWizardPostStep;

const nextRideWizardStep = (step: RideWizardStep): RideWizardStep => {
  const i = RIDE_WIZARD_BOOKING_ORDER.indexOf(step as RideWizardBookingStep);
  if (i >= 0 && i < RIDE_WIZARD_BOOKING_ORDER.length - 1) {
    return RIDE_WIZARD_BOOKING_ORDER[i + 1];
  }
  if (step === 'review') return 'matching';
  if (step === 'matching') return 'driver_eta';
  if (step === 'driver_eta') return 'payment';
  if (step === 'payment') return 'on_trip';
  return step;
};

const prevRideWizardStep = (step: RideWizardStep): RideWizardStep | null => {
  const i = RIDE_WIZARD_BOOKING_ORDER.indexOf(step as RideWizardBookingStep);
  if (i > 0) return RIDE_WIZARD_BOOKING_ORDER[i - 1];
  if (step === 'matching') return 'review';
  if (step === 'driver_eta') return 'matching';
  if (step === 'payment') return 'driver_eta';
  return null;
};

const isRideBookingWizardStep = (step: RideWizardStep): step is RideWizardBookingStep =>
  (RIDE_WIZARD_BOOKING_ORDER as readonly string[]).includes(step);

const FUA_WIZARD_BOOKING = [
  { key: 'pickup', title: 'Wash & fold', subtitle: 'Door pickup or drop at a verified hub', icon: 'location' as const },
  { key: 'load', title: 'Your load', subtitle: 'How much laundry are we collecting?', icon: 'laundry' as const },
  { key: 'review', title: 'Review & confirm', subtitle: 'Check details before we dispatch', icon: 'checkmark' as const },
] as const;

const FUA_WIZARD_BOOKING_ORDER = FUA_WIZARD_BOOKING.map((s) => s.key);

type FuaWizardStep = (typeof FUA_WIZARD_BOOKING)[number]['key'];
type LaundryPickupMode = 'door' | 'station' | 'mamafua';

const nextFuaWizardStep = (step: FuaWizardStep): FuaWizardStep => {
  const i = FUA_WIZARD_BOOKING_ORDER.indexOf(step);
  if (i >= 0 && i < FUA_WIZARD_BOOKING_ORDER.length - 1) {
    return FUA_WIZARD_BOOKING_ORDER[i + 1];
  }
  return step;
};

const prevFuaWizardStep = (step: FuaWizardStep): FuaWizardStep | null => {
  const i = FUA_WIZARD_BOOKING_ORDER.indexOf(step);
  return i > 0 ? FUA_WIZARD_BOOKING_ORDER[i - 1] : null;
};

function fuaStepCopy(mode: LaundryPickupMode, step: FuaWizardStep): { title: string; subtitle: string } {
  if (mode === 'mamafua') {
    if (step === 'pickup') return { title: 'Mama Fua', subtitle: 'Cleaner comes to you' };
    if (step === 'load') return { title: 'What do you need?', subtitle: 'Tap the jobs you want' };
    return { title: 'Ready to book', subtitle: 'Confirm and we’ll send Mama Fua' };
  }
  if (step === 'pickup') return { title: 'Laundry', subtitle: 'We pick up from your door' };
  if (step === 'load') return { title: 'How much?', subtitle: 'Guess is fine — we confirm later' };
  return { title: 'Almost done', subtitle: 'Check and send your request' };
}

function scheduleBandLabel(
  band: string,
  options: { id: string; shortLabel: string }[],
): string {
  return options.find((b) => b.id === band)?.shortLabel ?? band;
}

const DEFAULT_MAMAFUA_WHEN: { id: 'asap' | 'morning' | 'afternoon' | 'evening'; label: string; shortLabel: string }[] = [
  { id: 'asap', label: 'Flexible', shortLabel: 'Flexible · today' },
  { id: 'morning', label: 'Morning', shortLabel: 'Morning (8–12)' },
  { id: 'evening', label: 'Evening', shortLabel: 'Evening (4–8)' },
];

function fuaWhenLabel(when: string, options = DEFAULT_MAMAFUA_WHEN): string {
  return scheduleBandLabel(when, options);
}

const FALLBACK_PICKUP_STATIONS: PlaceStation[] = [
  {
    id: 'nbo-1',
    name: 'Westlands Hub',
    subtitle: 'Westlands Mall',
    county: 'nairobi',
    coords: { latitude: -1.2676, longitude: 36.8101 },
  },
  {
    id: 'nbo-2',
    name: 'CBD Station',
    subtitle: 'Moi Avenue',
    county: 'nairobi',
    coords: { latitude: -1.2864, longitude: 36.8172 },
  },
  {
    id: 'msa-1',
    name: 'Nyali Station',
    subtitle: 'Nyali Centre',
    county: 'mombasa',
    coords: { latitude: -4.0435, longitude: 39.6682 },
  },
  {
    id: 'ksm-1',
    name: 'Mega Plaza',
    subtitle: 'Kisumu CBD',
    county: 'kisumu',
    coords: { latitude: -0.0917, longitude: 34.768 },
  },
  {
    id: 'nym-1',
    name: 'Nyamira Central Hub',
    subtitle: 'Near Nyamira Stage',
    county: 'nyamira',
    coords: { latitude: -0.5667, longitude: 34.9344 },
  },
  {
    id: 'nym-2',
    name: 'Keroka Pickup Point',
    subtitle: 'Kisii-Sotik Road',
    county: 'nyamira',
    coords: { latitude: -0.776, longitude: 34.9451 },
  },
];

const PICKUP_RADIUS_KM = 28;

type ComingSoonServiceId = 'rides' | 'cloth_shop' | 'groceries' | 'tours' | 'spots' | 'events' | 'movers';

type HomeSegmentId = 'home';

type ServiceSegmentId = ServiceType | ComingSoonServiceId | HomeSegmentId;

const COMING_SOON_SEGMENT_IDS: ComingSoonServiceId[] = [
  'rides',
  'movers',
  'cloth_shop',
  'groceries',
  'tours',
  'spots',
  'events',
];

const isComingSoonService = (seg: ServiceSegmentId): seg is ComingSoonServiceId =>
  (COMING_SOON_SEGMENT_IDS as readonly string[]).includes(seg);

const SERVICE_SEGMENTS: ServiceSegmentItem<ServiceSegmentId>[] = [
  { key: 'home', label: 'HOME' },
  { key: 'laundry', label: 'FUA' },
  { key: 'bnbs', label: 'SAKA KEJA' },
  { key: 'rides', label: 'RIDES', comingSoon: true },
  { key: 'movers', label: 'MOVERS', comingSoon: true },
  { key: 'tours', label: 'TOURS', comingSoon: true },
  { key: 'spots', label: 'SPOTS', comingSoon: true },
  { key: 'events', label: 'EVENTS', comingSoon: true },
  { key: 'cloth_shop', label: 'CLOTH', comingSoon: true },
  { key: 'groceries', label: 'GROCERY', comingSoon: true },
];

type HomeHeaderSegmentKey = 'home' | 'laundry' | 'bnbs' | 'rides' | 'more';

const HOME_MORE_SEGMENT_IDS: ServiceSegmentId[] = [
  'movers',
  'tours',
  'spots',
  'events',
  'cloth_shop',
  'groceries',
];

const HOME_HEADER_SEGMENTS: ServiceSegmentItem<HomeHeaderSegmentKey>[] = [
  { key: 'home', label: 'Home' },
  { key: 'laundry', label: 'Fua' },
  { key: 'bnbs', label: 'Keja' },
  { key: 'rides', label: 'Rides', comingSoon: true },
  { key: 'more', label: 'More', suffixIcon: 'chevron-down' },
];

const MORE_SERVICE_MENU_SEGMENTS = SERVICE_SEGMENTS.filter((seg) =>
  (HOME_MORE_SEGMENT_IDS as readonly string[]).includes(seg.key),
);

const COMING_SOON_SERVICE_INFO: Record<
  ComingSoonServiceId,
  {
    eyebrow: string;
    title: string;
    lead: string;
    features: string[];
    hero: keyof typeof IMG;
    icon: AppIconName;
    tint: string;
  }
> = {
  rides: {
    eyebrow: 'RIDES',
    title: 'Jua Rides',
    lead: 'Upfront KES fares, pickup at your pin or a hub, M-Pesa when we launch.',
    features: [
      'Economy, comfort, and XL tiers',
      'Pickup at your pin or a hub',
      'M-Pesa · trip history in Activity',
    ],
    hero: 'ridesHero',
    icon: 'rides',
    tint: '#8B5CF6',
  },
  movers: {
    eyebrow: 'MOVERS',
    title: 'Jua Movers',
    lead: 'Pack, move, and settle in — local or inter-county without the chaos.',
    features: [
      'Packing & labelling for fragile items',
      'Van or truck crew for local moves',
      'Unpacking & handover at your new place',
    ],
    hero: 'moversHero',
    icon: 'movers',
    tint: '#3B82F6',
  },
  cloth_shop: {
    eyebrow: 'CLOTH',
    title: 'Jua Cloth',
    lead: 'Mitumba finds, market stalls, and trusted tailors — near you.',
    features: [
      'Curated sellers near your pin',
      'Mitumba, new arrivals, custom orders',
      'M-Pesa · pickup or doorstep delivery',
    ],
    hero: 'clothHero',
    icon: 'cloth',
    tint: '#EC4899',
  },
  groceries: {
    eyebrow: 'GROCERY',
    title: 'Jua Grocery',
    lead: 'Dukas, greens, and staples to your door — skip the queue.',
    features: [
      'Fresh produce from nearby shops',
      'Build a list or reorder your usuals',
      'Bundle with Fua or a ride home',
    ],
    hero: 'groceryHero',
    icon: 'grocery',
    tint: '#22C55E',
  },
  tours: {
    eyebrow: 'TOURS',
    title: 'Jua Tours',
    lead: 'Guided city tours — culture, food, nightlife, and hidden gems.',
    features: [
      'Half-day & full-day itineraries',
      'Fixed routes or custom requests',
      'Pay per person · M-Pesa · groups OK',
    ],
    hero: 'toursHero',
    icon: 'tours',
    tint: '#F59E0B',
  },
  spots: {
    eyebrow: 'SPOTS',
    title: 'Jua Spots',
    lead: 'Hotels, rooftops, cafés, and photo corners — picked for you.',
    features: [
      'Editor picks by neighbourhood',
      'Brunch, date night, family-friendly',
      'Save · share · book a ride there',
    ],
    hero: 'spotsHero',
    icon: 'spots',
    tint: '#14B8A6',
  },
  events: {
    eyebrow: 'EVENTS',
    title: 'Jua Events',
    lead: 'Concerts, markets, meetups, and showcases near your pin.',
    features: [
      'What’s on this week near you',
      'Free & ticketed · sell-out reminders',
      'Get there with Jua Rides in one tap',
    ],
    hero: 'eventsHero',
    icon: 'events',
    tint: '#EF4444',
  },
};

/** Per-service hero carousels — swipe within a section to learn how it works. */
const FUA_HERO_SLIDES: IntroHeroSlide[] = [
  {
    id: 'fua-intro',
    eyebrow: 'JUA FUA',
    title: 'Laundry, picked up fresh',
    description: 'Mama fua collects from your door or a nearby hub — washed, folded, and returned.',
    image: IMG.fuaHero,
    workAreas: ['Door or station', 'Verified partners', 'M-Pesa pay'],
  },
  {
    id: 'fua-pickup',
    eyebrow: 'STEP 1 · PICKUP',
    title: 'Choose where we collect',
    description: 'Use your door for valet pickup, or tap a station on the map and save it to the wizard.',
    image: IMG.laundry,
    workAreas: ['Door pickup', 'Hub chips', 'Map view'],
  },
  {
    id: 'fua-load',
    eyebrow: 'STEP 2 · LOAD',
    title: 'Tell us the size',
    description: 'Pay by kilogram or item count — typical load is 3–6 kg for one person.',
    image: IMG.fuaHeroBasket,
    workAreas: ['By kg', 'By items', 'Estimate upfront'],
  },
  {
    id: 'fua-trip',
    eyebrow: 'STEP 3 · TRACK',
    title: 'Follow on Trips',
    description: 'After you confirm, your pickup shows on Trips with ETA until laundry is back.',
    image: IMG.interiorLoft,
    workAreas: ['30–45 min ETA', 'Trips tab', 'Cancel anytime'],
  },
];

const RIDES_HERO_SLIDES: IntroHeroSlide[] = [
  {
    id: 'rides-intro',
    eyebrow: 'JUA RIDES',
    title: 'Move through the city',
    description: 'Set pickup, destination, and ride type — one wizard, one fare, one tap to go.',
    image: IMG.ridesHero,
    workAreas: ['Step-by-step', 'Live route', 'M-Pesa'],
  },
  {
    id: 'rides-pickup',
    eyebrow: 'PICKUP',
    title: 'Your pin or a hub',
    description: 'Use GPS at your door, or open the map for hubs and top destinations near you.',
    image: IMG.marketRoad,
    workAreas: ['My location', 'Pickup hubs', 'Gold destinations'],
  },
  {
    id: 'rides-dest',
    eyebrow: 'DESTINATION',
    title: 'Where to, Jua?',
    description: 'Search, pick a recent place, or tap a gold pin on the map — your choice saves to the wizard.',
    image: IMG.nairobiCity,
    workAreas: ['Search', 'Recents', 'Map pins'],
  },
  {
    id: 'rides-pay',
    eyebrow: 'RIDE & PAY',
    title: 'Preview, match, go',
    description: 'See the route on the map, choose Economy or Comfort, then pay when your driver arrives.',
    image: IMG.coast,
    workAreas: ['Route preview', 'Ride types', 'Live trip'],
  },
];

const STAYS_BNB_HERO_SLIDES: IntroHeroSlide[] = [
  {
    id: 'bnb-intro',
    eyebrow: 'SAKA KEJA',
    title: 'Stays for every visit',
    description: 'Short BnBs from trusted hosts — book with M-Pesa and get the full address on confirmation.',
    image: IMG.staysHero,
    workAreas: ['Near your pin', 'Book to reveal', 'M-Pesa'],
  },
  {
    id: 'bnb-browse',
    eyebrow: 'BROWSE',
    title: 'List or map view',
    description: 'Swipe the carousel, open the catalog, or switch to map — tap a pin for details.',
    image: IMG.interiorLake,
    workAreas: ['List | Map toggle', 'Radius chips', 'See all'],
  },
  {
    id: 'bnb-book',
    eyebrow: 'BOOK',
    title: 'Reserve in the sheet',
    description: 'Tap a stay card to preview photos and highlights, then reserve from the sticky footer.',
    image: IMG.interiorSea,
    workAreas: ['Gallery swipe', 'Amenities', 'Trips receipt'],
  },
];

const STAYS_RENTAL_HERO_SLIDES: IntroHeroSlide[] = [
  {
    id: 'rent-intro',
    eyebrow: 'SAKA KEJA',
    title: 'Rentals for longer stays',
    description: 'Vacant apartments near you — subscribe weekly to unlock exact pins and landlord contact.',
    image: IMG.rentalModern,
    workAreas: ['Vacant nearby', 'Weekly unlock', 'Viewings'],
  },
  {
    id: 'rent-map',
    eyebrow: 'MAP',
    title: 'Pins in your radius',
    description: 'Toggle List or Map on the main sheet — purple pins are rentals within your distance cap.',
    image: IMG.rentalSuburb,
    workAreas: ['Map toggle', 'Radius km', 'Tap for details'],
  },
  {
    id: 'rent-view',
    eyebrow: 'VIEWING',
    title: 'Request after unlock',
    description: 'Subscribe once, then request a viewing — we log it on Trips for follow-up.',
    image: IMG.rentalCoast,
    workAreas: ['KES 499 / week', 'Exact location', 'Landlord contact'],
  },
];

/** Home hub carousel — highlights across services (carousels live on Home only). */
const HOME_HERO_SLIDES: IntroHeroSlide[] = [
  {
    id: 'home-welcome',
    eyebrow: 'JUA X',
    title: 'Everything around you, one app.',
    description: 'Laundry, homes, transport, and marketplace — all in one place.',
    image: IMG.lake,
    workAreas: ['Fua', 'Keja', 'Rides'],
  },
  FUA_HERO_SLIDES[0],
  STAYS_BNB_HERO_SLIDES[0],
  RIDES_HERO_SLIDES[0],
];

const comingSoonHeroSlides = (seg: ComingSoonServiceId): IntroHeroSlide[] => {
  const info = COMING_SOON_SERVICE_INFO[seg];
  return [
    {
      id: `${seg}-overview`,
      eyebrow: info.eyebrow,
      title: info.title,
      description: info.lead,
      image: IMG[info.hero],
      workAreas: info.features.slice(0, 2).map((f) => f.split(' · ')[0].slice(0, 22)),
      comingSoon: true,
    },
    {
      id: `${seg}-soon`,
      eyebrow: 'ON THE WAY',
      title: 'Launching on Jua X',
      description: 'Fua and Keja first — more services join the same app and wallet.',
      image: IMG.nairobiCity,
      workAreas: ['Same account', 'M-Pesa ready'],
      comingSoon: true,
    },
  ];
};


const HOUSE_RADIUS_OPTIONS = [2, 5, 10, 15, 25] as const;

const FALLBACK_HOUSE_LISTINGS: HouseListing[] = [
  {
    id: 'h1',
    title: '2BR Apartment - Kilimani',
    county: 'nairobi',
    coords: { latitude: -1.2921, longitude: 36.7834 },
    distanceKm: 3,
    price: 'KES 55,000 / mo',
    image: IMG.rentalModern,
    gallery: [IMG.rentalModern, IMG.interiorLiving, IMG.rentalSuburb],
    detailHighlights: ['Gated compound · borehole backup', 'Walking distance to Junction mall', 'Viewings: weekday evenings'],
    beds: 2,
    baths: 2,
    amenities: ['Wi‑Fi', 'Parking', 'Balcony', 'Generator'],
    has3dTour: true,
  },
  {
    id: 'h2',
    title: 'Bedsitter - Kasarani',
    county: 'nairobi',
    coords: { latitude: -1.2219, longitude: 36.9001 },
    distanceKm: 8,
    price: 'KES 14,000 / mo',
    image: IMG.rentalSuburb,
    gallery: [IMG.rentalSuburb, IMG.ridge, IMG.rentalTown],
    detailHighlights: ['Ideal starter unit', 'Shared laundry yard', 'Deposit: 1+1 months'],
    beds: 1,
    baths: 1,
    amenities: ['Wi‑Fi', 'Water 24/7', 'Shared yard'],
    has3dTour: false,
  },
  {
    id: 'h3',
    title: '1BR Flat - Nyali',
    county: 'mombasa',
    coords: { latitude: -4.035, longitude: 39.7087 },
    distanceKm: 5,
    price: 'KES 28,000 / mo',
    image: IMG.rentalCoast,
    gallery: [IMG.rentalCoast, IMG.coast, IMG.interiorSea],
    detailHighlights: ['Sea-facing balcony', 'Pool & gym in compound', 'Agent-led weekend tours'],
    beds: 1,
    baths: 1,
    amenities: ['Sea breeze', 'AC', 'Parking', 'Pool'],
    has3dTour: true,
  },
  {
    id: 'h4',
    title: '2BR Maisonette - Milimani',
    county: 'kisumu',
    coords: { latitude: -0.0929, longitude: 34.7617 },
    distanceKm: 6,
    price: 'KES 33,000 / mo',
    image: IMG.rentalLake,
    gallery: [IMG.rentalLake, IMG.lake, IMG.interiorLake],
    detailHighlights: ['Lake breeze most evenings', 'Garden ideal for small pets', 'Lease from 6 months'],
    beds: 2,
    baths: 2,
    amenities: ['Lake view', 'Wi‑Fi', 'DSTV', 'Garden'],
    has3dTour: true,
  },
  {
    id: 'h5',
    title: '2BR Unit - Nyamira Town',
    county: 'nyamira',
    coords: { latitude: -0.5631, longitude: 34.9352 },
    distanceKm: 4,
    price: 'KES 22,000 / mo',
    image: IMG.rentalTown,
    gallery: [IMG.rentalTown, IMG.teaHills, IMG.rentalModern],
    detailHighlights: ['Solar + mains hybrid', 'Quiet residential court', 'Schools within 1 km'],
    beds: 2,
    baths: 1,
    amenities: ['Wi‑Fi', 'Parking', 'Solar backup'],
    has3dTour: false,
  },
  {
    id: 'h6',
    title: 'Bedsitter - Keroka',
    county: 'nyamira',
    coords: { latitude: -0.7769, longitude: 34.9439 },
    distanceKm: 9,
    price: 'KES 11,500 / mo',
    image: IMG.rentalVillage,
    gallery: [IMG.rentalVillage, IMG.marketRoad, IMG.rentalSuburb],
    detailHighlights: ['Transit-friendly to Kisii', 'Fresh market walkable', 'Flexible viewing slots'],
    beds: 1,
    baths: 1,
    amenities: ['Quiet block', 'Water tank', 'Road access'],
    has3dTour: false,
  },
  {
    id: 'h7',
    title: '3BR Riat Apartment',
    county: 'kisumu',
    coords: { latitude: -0.1082, longitude: 34.7428 },
    distanceKm: 4,
    price: 'KES 48,000 / mo',
    image: IMG.riatHills,
    gallery: [IMG.riatHills, IMG.rentalLake, IMG.interiorLake],
    detailHighlights: ['Lake-view master bedroom', 'Vacant · ready now', 'Subscription unlocks exact pin'],
    beds: 3,
    baths: 2,
    amenities: ['Lake view', 'Parking', 'Wi‑Fi', 'Generator'],
    has3dTour: true,
  },
  {
    id: 'h8',
    title: 'Studio - Milimani',
    county: 'kisumu',
    coords: { latitude: -0.0935, longitude: 34.7601 },
    distanceKm: 2,
    price: 'KES 18,000 / mo',
    image: IMG.milimani,
    gallery: [IMG.milimani, IMG.rentalTown, IMG.interiorLake],
    detailHighlights: ['Kisumu pilot zone', 'Walking distance to cafes', 'Ideal for solo relocators'],
    beds: 1,
    baths: 1,
    amenities: ['Wi‑Fi', 'Security', 'Borehole'],
    has3dTour: true,
  },
  {
    id: 'h9',
    title: '1BR - Westlands',
    county: 'nairobi',
    coords: { latitude: -1.2651, longitude: 36.8023 },
    distanceKm: 5,
    price: 'KES 42,000 / mo',
    image: IMG.rentalModern,
    gallery: [IMG.rentalModern, IMG.interiorLoft, IMG.nairobiCity],
    detailHighlights: ['High-rise with gym', 'Weekend viewings available', '12-month lease preferred'],
    beds: 1,
    baths: 1,
    amenities: ['Gym', 'Wi‑Fi', 'Parking', 'Elevator'],
    has3dTour: true,
  },
  {
    id: 'h10',
    title: '2BR - Nyali',
    county: 'mombasa',
    coords: { latitude: -4.0321, longitude: 39.7124 },
    distanceKm: 6,
    price: 'KES 38,000 / mo',
    image: IMG.rentalCoast,
    gallery: [IMG.rentalCoast, IMG.interiorSea, IMG.coast],
    detailHighlights: ['Sea breeze balcony', 'Pool in compound', 'Agent-led tours Sat AM'],
    beds: 2,
    baths: 2,
    amenities: ['Pool', 'AC', 'Parking', 'Sea breeze'],
    has3dTour: true,
  },
  {
    id: 'h11',
    title: '2BR - Riat Estate',
    county: 'kisumu',
    coords: { latitude: -0.1018, longitude: 34.7389 },
    distanceKm: 5,
    price: 'KES 35,000 / mo',
    image: IMG.rentalLake,
    gallery: [IMG.rentalLake, IMG.riatHills, IMG.lake],
    detailHighlights: ['Family-friendly court', 'Quiet evenings', 'Vacant · viewing this week'],
    beds: 2,
    baths: 1,
    amenities: ['Garden', 'Wi‑Fi', 'Parking'],
    has3dTour: false,
  },
  {
    id: 'h12',
    title: 'Bedsitter - Kondele',
    county: 'kisumu',
    coords: { latitude: -0.0876, longitude: 34.7712 },
    distanceKm: 3,
    price: 'KES 12,500 / mo',
    image: IMG.rentalTown,
    gallery: [IMG.rentalTown, IMG.marketRoad, IMG.rentalSuburb],
    detailHighlights: ['Near stage & market', 'Starter unit for students', 'Flexible deposit'],
    beds: 1,
    baths: 1,
    amenities: ['Road access', 'Water tank', 'Wi‑Fi'],
    has3dTour: false,
  },
];

const FALLBACK_BNB_LISTINGS: BnbListing[] = [
  {
    id: 'b1',
    title: 'Westlands Studio Loft',
    county: 'nairobi',
    rating: '4.8',
    price: 'KES 8,400 / night',
    image: IMG.interiorLoft,
    gallery: [IMG.interiorLoft, IMG.interiorLiving, IMG.nairobiCity],
    detailHighlights: ['Self check-in lockbox', 'Dedicated workspace nook', 'Host responds within ~15 min'],
    coords: { latitude: -1.2674, longitude: 36.8068 },
    exploreReason: 'Walkable to cafés and nightlife; quiet building for remote work.',
    exploreTip: 'Ask hosts about rooftop access and parking.',
    beds: 1,
    guests: 2,
    amenities: ['Wi‑Fi', 'Kitchenette', 'Workspace', 'Elevator'],
    has3dTour: true,
  },
  {
    id: 'b2',
    title: 'Lavington Cozy Stay',
    county: 'nairobi',
    rating: '4.7',
    price: 'KES 7,100 / night',
    image: IMG.interiorLiving,
    gallery: [IMG.interiorLiving, IMG.rentalSuburb, IMG.interiorLoft],
    detailHighlights: ['Full kitchen for longer stays', 'Backup inverter on lights', 'Street parking on request'],
    coords: { latitude: -1.282, longitude: 36.778 },
    exploreReason: 'Leafy suburb feel with easy runs to Ngong Road eateries.',
    exploreTip: 'Good for longer stays — grocery shops nearby.',
    beds: 2,
    guests: 4,
    amenities: ['Wi‑Fi', 'Full kitchen', 'Garden', 'Parking'],
    has3dTour: true,
  },
  {
    id: 'b3',
    title: 'Mombasa Beach Apartment',
    county: 'mombasa',
    rating: '4.7',
    price: 'KES 10,200 / night',
    image: IMG.interiorSea,
    gallery: [IMG.interiorSea, IMG.coast, IMG.rentalCoast],
    detailHighlights: ['Cross-ventilated sea breeze', 'Rooftop drying lines', 'Beach path under 400 m'],
    coords: { latitude: -4.028, longitude: 39.716 },
    exploreReason: 'Sea breeze and quick beach access without resort prices.',
    exploreTip: 'Check tide times for swimming.',
    beds: 2,
    guests: 4,
    amenities: ['Ocean view', 'AC', 'Pool', 'Parking'],
    has3dTour: true,
  },
  {
    id: 'b4',
    title: 'Kisumu Lakeview Suite',
    county: 'kisumu',
    rating: '4.6',
    price: 'KES 6,500 / night',
    image: IMG.interiorLake,
    gallery: [IMG.interiorLake, IMG.lake, IMG.rentalLake],
    detailHighlights: ['Sunset-facing balcony', 'DSTV + fast Wi‑Fi', 'Host offers airport pickup add-on'],
    coords: { latitude: -0.098, longitude: 34.762 },
    exploreReason: 'Lake-facing rooms and calmer evenings away from CBD noise.',
    exploreTip: 'Sunset on the balcony is the highlight.',
    beds: 1,
    guests: 2,
    amenities: ['Lake view', 'Balcony', 'Wi‑Fi', 'DSTV'],
    has3dTour: false,
  },
  {
    id: 'b5',
    title: 'Nyamira Highland Stay',
    county: 'nyamira',
    rating: '4.5',
    price: 'KES 5,900 / night',
    image: IMG.interiorHighland,
    gallery: [IMG.interiorHighland, IMG.teaHills, IMG.ridge],
    detailHighlights: ['Cooler highland nights', 'Tea-farm drives nearby', 'Flexible checkout on request'],
    coords: { latitude: -0.5609, longitude: 34.9371 },
    exploreReason: 'Quiet hill-town stay close to Nyamira CBD and tea-growing areas.',
    exploreTip: 'Useful base if you plan to explore both Nyamira and Kisii.',
    beds: 2,
    guests: 3,
    amenities: ['Wi‑Fi', 'Parking', 'Self check-in'],
    has3dTour: true,
  },
  {
    id: 'b6',
    title: 'Keroka Transit Suites',
    county: 'nyamira',
    rating: '4.4',
    price: 'KES 5,200 / night',
    image: IMG.interiorTransit,
    gallery: [IMG.interiorTransit, IMG.marketRoad, IMG.rentalVillage],
    detailHighlights: ['Upper floors quieter at night', 'Market & matatu stage close', 'Ideal 1–3 night hops'],
    coords: { latitude: -0.7744, longitude: 34.9472 },
    exploreReason: 'Convenient for road-trippers and local market visits.',
    exploreTip: 'Pick upper-floor rooms for a quieter night.',
    beds: 1,
    guests: 2,
    amenities: ['Wi‑Fi', 'Hot shower', 'Desk'],
    has3dTour: false,
  },
  {
    id: 'b7',
    title: 'Milimani Garden Studio',
    county: 'kisumu',
    rating: '4.9',
    price: 'KES 5,800 / night',
    image: IMG.milimani,
    gallery: [IMG.milimani, IMG.interiorLake, IMG.lake],
    detailHighlights: ['Pilot listing · book-to-reveal address', 'Garden seating & fast Wi‑Fi', '5 min to CBD'],
    coords: { latitude: -0.0912, longitude: 34.7589 },
    exploreReason: 'Kisumu pilot favourite — leafy Milimani calm with lake breezes.',
    exploreTip: 'Perfect weekend base before viewing long-term rentals.',
    beds: 1,
    guests: 2,
    amenities: ['Wi‑Fi', 'Garden', 'Kitchenette', 'Parking'],
    has3dTour: true,
  },
  {
    id: 'b8',
    title: 'Riat Hills Guest House',
    county: 'kisumu',
    rating: '4.7',
    price: 'KES 6,200 / night',
    image: IMG.riatHills,
    gallery: [IMG.riatHills, IMG.rentalLake, IMG.interiorHighland],
    detailHighlights: ['Elevated views over the lake', 'Quiet neighbourhood', 'Host arranges airport runs'],
    coords: { latitude: -0.1055, longitude: 34.7451 },
    exploreReason: 'Hilltop stay with sunset views — popular with relocating professionals.',
    exploreTip: 'Ask about weekly discounts for longer stays.',
    beds: 2,
    guests: 3,
    amenities: ['Lake view', 'Wi‑Fi', 'Parking', 'Balcony'],
    has3dTour: true,
  },
  {
    id: 'b9',
    title: 'Karen Green Cottage',
    county: 'nairobi',
    rating: '4.8',
    price: 'KES 9,400 / night',
    image: IMG.rentalSuburb,
    gallery: [IMG.rentalSuburb, IMG.interiorLiving, IMG.teaHills],
    detailHighlights: ['Private garden & braai area', 'Backup solar on essentials', 'Gated community'],
    coords: { latitude: -1.3198, longitude: 36.7089 },
    exploreReason: 'Leafy Karen escape with room to breathe — great for families.',
    exploreTip: 'Ideal if you need parking for two cars.',
    beds: 3,
    guests: 5,
    amenities: ['Garden', 'Wi‑Fi', 'Parking', 'Kitchen'],
    has3dTour: true,
  },
  {
    id: 'b10',
    title: 'Nyali Beach Loft',
    county: 'mombasa',
    rating: '4.8',
    price: 'KES 11,500 / night',
    image: IMG.rentalCoast,
    gallery: [IMG.rentalCoast, IMG.interiorSea, IMG.coast],
    detailHighlights: ['Rooftop terrace', 'Beach club access', 'AC in all rooms'],
    coords: { latitude: -4.0218, longitude: 39.7195 },
    exploreReason: 'Premium coast loft steps from Nyali beach — sunrise coffee on the terrace.',
    exploreTip: 'Book early in peak season (Dec–Jan).',
    beds: 2,
    guests: 4,
    amenities: ['Ocean view', 'AC', 'Pool', 'Terrace'],
    has3dTour: true,
  },
  {
    id: 'b11',
    title: 'CBD Executive Room',
    county: 'nairobi',
    rating: '4.5',
    price: 'KES 6,900 / night',
    image: IMG.nairobiCity,
    gallery: [IMG.nairobiCity, IMG.interiorLoft, IMG.interiorTransit],
    detailHighlights: ['Walk to meetings in Westlands', '24h security', 'Express checkout'],
    coords: { latitude: -1.2634, longitude: 36.8045 },
    exploreReason: 'No-fuss business stay with reliable Wi‑Fi and late check-in.',
    beds: 1,
    guests: 2,
    amenities: ['Wi‑Fi', 'Workspace', 'Elevator', 'Security'],
    has3dTour: false,
  },
  {
    id: 'b12',
    title: 'Kibos Riverside Cabin',
    county: 'kisumu',
    rating: '4.6',
    price: 'KES 5,400 / night',
    image: IMG.lake,
    gallery: [IMG.lake, IMG.interiorLake, IMG.rentalLake],
    detailHighlights: ['Riverside deck', 'Bird-watching mornings', 'Ideal for couples'],
    coords: { latitude: -0.0788, longitude: 34.7512 },
    exploreReason: 'Quiet riverside reset — popular with weekend visitors from Nairobi.',
    beds: 1,
    guests: 2,
    amenities: ['Lake view', 'Deck', 'Wi‑Fi', 'Parking'],
    has3dTour: false,
  },
];

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const { isAuthed, user, profile, loading: authLoading, signOut, refreshProfile } = useAuth();
  const {
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
    refreshAllListingsCatalog,
    refreshListingsCatalog,
    refreshNearbyListings,
  } = useAppData();
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [activeService, setActiveService] = useState<ServiceType>('laundry');
  const [homeHubCarouselActive, setHomeHubCarouselActive] = useState(false);
  const [activeSegment, setActiveSegment] = useState<ServiceSegmentId>('home');
  const [moreServicesOpen, setMoreServicesOpen] = useState(false);
  const [staysSubTab, setStaysSubTab] = useState<StaysSubTab>('bnb');
  const [staysRadiusKm, setStaysRadiusKm] = useState<(typeof STAYS_RADIUS_OPTIONS)[number]>(5);
  const [rentalSubscriptionActive, setRentalSubscriptionActive] = useState(false);
  const [activeSubscriptionPlan, setActiveSubscriptionPlan] = useState<string | null>(null);
  const [activeSubscriptionExpiresAt, setActiveSubscriptionExpiresAt] = useState<string | null>(null);
  const [subscriptionSheetOpen, setSubscriptionSheetOpen] = useState(false);
  const [bnbBookingSheetOpen, setBnbBookingSheetOpen] = useState(false);
  const [bnbBookingTarget, setBnbBookingTarget] = useState<{ id: string; title: string; price: string } | null>(
    null,
  );
  const [bookedStaySheetBooking, setBookedStaySheetBooking] = useState<BnbBooking | null>(null);
  const [bookedStayListing, setBookedStayListing] = useState<PublicListing | null>(null);
  const [bookedStayLoading, setBookedStayLoading] = useState(false);
  const [selectedSubscriptionPlan, setSelectedSubscriptionPlan] = useState<string>('weekly');
  const listingsInitialLoading = !listingsLoaded && (dataLoading || listingsFetching);
  const listingsPageLoading = listingsInitialLoading;
  const [listingDetailLive, setListingDetailLive] = useState<PublicListing | null>(null);
  const [bnbBookings, setBnbBookings] = useState<BnbBooking[]>([]);
  const [bookedListingSnapshots, setBookedListingSnapshots] = useState<Record<string, AdaptedBnbListing>>({});
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const systemColorScheme = useColorScheme();
  const themeMode: ThemeMode =
    themePreference === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : themePreference;
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(null);
  const [currentLocationLabel, setCurrentLocationLabel] = useState('Locating you...');
  const [currentPickupLocation, setCurrentPickupLocation] = useState('Locating you...');
  const [currentCounty, setCurrentCounty] = useState<CountyKey | null>(null);
  const [locationError, setLocationError] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<Destination>(DESTINATIONS[0]);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [destinationSuggestions, setDestinationSuggestions] = useState<Suggestion[]>([]);
  const [recentSearches, setRecentSearches] = useState<Suggestion[]>([]);
  const [destinationSearchLoading, setDestinationSearchLoading] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState(RIDE_OPTIONS[0].id);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMin, setRouteDurationMin] = useState<number | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<number[][]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapZoomOffset, setMapZoomOffset] = useState(0);
  const [bookingMessage, setBookingMessage] = useState('');
  const bookingToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [tripStarted, setTripStarted] = useState(false);
  const homeMainMapRef = useRef<WebView>(null);
  const serviceMapWebViewRef = useRef<WebView>(null);
  const listingsMapWebViewRef = useRef<WebView>(null);
  const staysHomeMapWebViewRef = useRef<WebView>(null);
  const listingDetailScrollRef = useRef<ScrollView | null>(null);
  const [tripFeed, setTripFeed] = useState<string[]>([]);
  const [laundryQuantity, setLaundryQuantity] = useState(4);
  /** null = door-to-door at your address; otherwise pickup & return at that station */
  const [laundryStationId, setLaundryStationId] = useState<string | null>(null);
  const [laundryPickupMode, setLaundryPickupMode] = useState<LaundryPickupMode>('door');
  const [fuaShowHubs, setFuaShowHubs] = useState(false);
  const [activitySection, setActivitySection] = useState<'active' | 'updates' | 'history'>('active');
  const [selectedMamaFuaTasks, setSelectedMamaFuaTasks] = useState<string[]>([]);
  const [serverLaundryEstimate, setServerLaundryEstimate] = useState<number | null>(null);
  const [laundryOrders, setLaundryOrders] = useState<LaundryOrder[]>([]);
  const [listingRequests, setListingRequests] = useState<ListingRequest[]>([]);
  const [listingRequestSheetId, setListingRequestSheetId] = useState<string | null>(null);
  const [listingRequestDetail, setListingRequestDetail] = useState<ListingRequest | null>(null);
  const [listingRequestSheetLoading, setListingRequestSheetLoading] = useState(false);
  const [listingRequestReplySubmitting, setListingRequestReplySubmitting] = useState(false);
  const [viewingRequestTarget, setViewingRequestTarget] = useState<{
    listingId: string;
    listingTitle: string;
    catalog: 'bnb' | 'house';
    priceLabel?: string;
    closeDeepPage?: boolean;
  } | null>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [sheetHasMoreBelow, setSheetHasMoreBelow] = useState(false);
  const sheetViewportH = useRef(0);
  const sheetContentH = useRef(0);
  const sheetScrollY = useRef(0);
  const [laundryMeasureMode, setLaundryMeasureMode] = useState<'kg' | 'items'>('kg');
  const [laundryItemCount, setLaundryItemCount] = useState(10);
  const [exploreScope, setExploreScope] = useState<'nearby' | 'everywhere'>('nearby');
  const [exploreLens, setExploreLens] = useState<ExploreLens>('discover');
  const [exploreRouteTarget, setExploreRouteTarget] = useState<Coordinates | null>(null);
  const [exploreSheetStage, setExploreSheetStage] = useState<HomeSheetStage>('collapsed');
  const [selectedExploreCard, setSelectedExploreCard] = useState<ExplorePick | null>(null);
  const [exploreMapKeyVisible, setExploreMapKeyVisible] = useState(false);
  const [exploreSheetScope, setExploreSheetScope] = useState('all');
  const [exploreReadHereTarget, setExploreReadHereTarget] = useState<Coordinates | null>(null);
  const [homeListingPreview, setHomeListingPreview] = useState<{ catalog: ListingCatalog; id: string } | null>(null);
  const [selectedHomeDetail, setSelectedHomeDetail] = useState<{
    kind: 'destination' | 'bnb';
    title: string;
    subtitle: string;
    reason: string;
    tip?: string;
    coords: Coordinates;
  } | null>(null);
  const [servicePhase, setServicePhase] = useState<Record<ServiceType, TripPhase>>({
    rides: 'idle',
    laundry: 'idle',
    bnbs: 'idle',
    houses: 'idle',
  });
  const [selectedBnbId, setSelectedBnbId] = useState<string | null>(null);
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(null);
  const [tourSheetTarget, setTourSheetTarget] = useState<{ kind: 'bnb' | 'house'; id: string } | null>(null);
  /** Full-screen live route WebView (GPS + path); production → Mapbox Navigation SDK. */
  const [guidedJourney, setGuidedJourney] = useState<GuidedJourney | null>(null);
  const [destinationSearchOpen, setDestinationSearchOpen] = useState(false);
  const [mapNeedsRecenter, setMapNeedsRecenter] = useState(false);
  const [draftPickupCoords, setDraftPickupCoords] = useState<Coordinates | null>(null);
  const [activeTripInfo, setActiveTripInfo] = useState<ActiveTripInfo | null>(null);
  const [homeSheetStage, setHomeSheetStage] = useState<HomeSheetStage>('mid');
  const [homeDeepPage, setHomeDeepPage] = useState<HomeDeepPage>(null);
  /** When `homeDeepPage === 'listing-detail'`, which catalog row is open. */
  const [listingDetail, setListingDetail] = useState<{ kind: ListingCatalog; id: string } | null>(null);
  const [listingCatalog, setListingCatalog] = useState<ListingCatalog>('bnb');
  const [listingsViewMode, setListingsViewMode] = useState<'list' | 'map'>('list');
  const [listingsFiltersCollapsed, setListingsFiltersCollapsed] = useState(false);
  const listingsFiltersCollapsedRef = useRef(false);
  const setListingsFiltersCollapsedAnimated = useCallback((collapsed: boolean) => {
    if (collapsed !== listingsFiltersCollapsedRef.current) {
      configureLayoutAnimation('filter');
      listingsFiltersCollapsedRef.current = collapsed;
    }
    setListingsFiltersCollapsed(collapsed);
  }, []);
  const [listingsMapSelectedId, setListingsMapSelectedId] = useState<string | null>(null);
  const [staysSheetViewMode, setStaysSheetViewMode] = useState<'list' | 'map'>('list');
  const [listingCounty, setListingCounty] = useState<ListingCatalogArea>('near_me');
  const [listingRadiusKm, setListingRadiusKm] = useState<(typeof STAYS_RADIUS_OPTIONS)[number]>(5);
  const [valetMamaFuaHome, setValetMamaFuaHome] = useState(false);
  const [valetStudioNotes, setValetStudioNotes] = useState('');
  const [valetStudioWhen, setValetStudioWhen] = useState<'asap' | 'morning' | 'afternoon' | 'evening'>('asap');
  const [ridePlannerStop, setRidePlannerStop] = useState('');
  const [ridePlannerLuggage, setRidePlannerLuggage] = useState(false);
  const [ridePlannerMeetAssist, setRidePlannerMeetAssist] = useState(false);
  const [ridePickupMode, setRidePickupMode] = useState<'current' | 'station'>('current');
  const [ridePickupStationId, setRidePickupStationId] = useState<string | null>(null);
  const [activityBellCount, setActivityBellCount] = useState(0);
  const [activityChatCount, setActivityChatCount] = useState(0);
  const [activitySocketConnected, setActivitySocketConnected] = useState(false);
  /** Which rides pin type was last tapped on the service map (pickup step). */
  const [serviceMapRidePinFocus, setServiceMapRidePinFocus] = useState<'hub' | 'destination' | null>(null);
  const [rideWizardStep, setRideWizardStep] = useState<RideWizardStep>('pickup');
  const [laundryWizardStep, setLaundryWizardStep] = useState<FuaWizardStep>('pickup');
  const activeListingRequestsByListingId = useMemo(() => {
    const sorted = [...listingRequests].sort(
      (a, b) =>
        new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime(),
    );
    const map = new Map<string, ListingRequest>();
    for (const req of sorted) {
      if (!isActiveListingRequest(req.status)) continue;
      if (!map.has(req.listingId)) map.set(req.listingId, req);
    }
    return map;
  }, [listingRequests]);
  const pinnedBnbListingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const booking of bnbBookings) {
      if (ACTIVE_BNB_BOOKING_STATUSES.has(booking.status)) ids.add(booking.listingId);
    }
    for (const request of listingRequests) {
      if (request.service === 'bnb' && isActiveListingRequest(request.status)) ids.add(request.listingId);
    }
    return ids;
  }, [bnbBookings, listingRequests]);
  const pinnedHouseListingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const request of listingRequests) {
      if (request.service === 'rental' && isActiveListingRequest(request.status)) ids.add(request.listingId);
    }
    return ids;
  }, [listingRequests]);
  const activityTabBadgeCount = useMemo(
    () => Math.max(0, activityBellCount + activityChatCount),
    [activityBellCount, activityChatCount],
  );
  const mainTabConfig = useMemo(
    () =>
      MAIN_TAB_CONFIG.map((tab) =>
        tab.key === 'activity' ? { ...tab, badgeCount: activityTabBadgeCount } : tab,
      ),
    [activityTabBadgeCount],
  );
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const theme = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;
  const { insets, bottomInset } = useChromeInsets({
    backgroundColor: theme.canvas,
    isDark: themeMode === 'dark',
  });

  /** County from GPS or profile — never defaults to Kisumu for display/filtering. */
  const listingsCounty = useMemo(
    (): CountyKey | null => resolveListingsCounty(currentCoords, profile?.county, currentCounty),
    [currentCoords, profile?.county, currentCounty],
  );

  const countyDisplayLabel = listingsCounty
    ? `${listingsCounty.charAt(0).toUpperCase()}${listingsCounty.slice(1)}`
    : locationLoading
      ? 'Locating…'
      : 'Your area';

  /** Prefer a short place name from GPS reverse-geocode when it matches the county. */
  const listingCountyChipLabel = useMemo(() => {
    if (!listingsCounty) return undefined;
    const countyNice = `${listingsCounty.charAt(0).toUpperCase()}${listingsCounty.slice(1)}`;
    const raw = currentLocationLabel.trim();
    if (!raw || /locating/i.test(raw)) return countyNice;
    const firstPart = raw.split(',')[0]?.trim() ?? raw;
    if (firstPart.length > 2 && firstPart.length <= 28) return firstPart;
    return countyNice;
  }, [listingsCounty, currentLocationLabel]);

  const listingAreaChips = useMemo((): ListingCatalogArea[] => {
    if (!listingsCounty) return ['near_me', 'any'];
    return ['near_me', listingsCounty, 'any'];
  }, [listingsCounty]);

  const prevGpsCountyRef = useRef<CountyKey | null>(listingsCounty);

  /** GPS when available; otherwise county center; hidden until we know either. */
  const listingDistanceRef = useMemo(
    () => getListingDistanceReference(currentCoords, listingsCounty) ?? NO_DISTANCE_REFERENCE,
    [currentCoords, listingsCounty],
  );

  const staysProximityCtx = useMemo(
    () =>
      buildProximityContext(
        currentCoords,
        listingDistanceRef.coords,
        listingDistanceRef.isApproximate,
        staysRadiusKm,
        listingsCounty,
      ),
    [currentCoords, listingDistanceRef, staysRadiusKm, listingsCounty],
  );

  const catalogProximityCtx = useMemo(
    () =>
      buildProximityContext(
        currentCoords,
        listingDistanceRef.coords,
        listingDistanceRef.isApproximate,
        listingRadiusKm,
        listingsCounty,
      ),
    [currentCoords, listingDistanceRef, listingRadiusKm, listingsCounty],
  );

  const effectiveBnbListings = useMemo((): BnbListing[] => {
    const merged = new Map<string, BnbListing>(
      bnbListings.map((listing) => [listing.id, listing as BnbListing]),
    );
    for (const booking of bnbBookings) {
      if (!ACTIVE_BNB_BOOKING_STATUSES.has(booking.status)) continue;
      if (merged.has(booking.listingId)) continue;
      merged.set(
        booking.listingId,
        (bookedListingSnapshots[booking.listingId] ??
          adaptBnbListingStubFromBooking(booking)) as BnbListing,
      );
    }
    for (const req of listingRequests) {
      if (req.service !== 'bnb' || !isActiveListingRequest(req.status)) continue;
      if (merged.has(req.listingId)) continue;
      const county = listingsCounty;
      if (!county) continue;
      merged.set(req.listingId, {
        id: req.listingId,
        title: req.listingTitle,
        county,
        coords: COUNTY_CENTER_COORDS[county],
        rating: '4.8',
        price: 'Requested',
        image: LISTING_STUB_IMAGE,
        gallery: [LISTING_STUB_IMAGE],
        detailHighlights: [LISTING_REQUEST_STATUS_LABELS[req.status] ?? 'Requested'],
        exploreReason: 'Listing request in progress',
        beds: 2,
        guests: 2,
        amenities: [],
        has3dTour: false,
        locationLocked: true,
        isStub: true,
      });
    }
    return Array.from(merged.values());
  }, [bnbListings, bnbBookings, bookedListingSnapshots, listingRequests, listingsCounty]);

  const effectiveHouseListings = useMemo((): HouseListing[] => {
    const merged = new Map<string, HouseListing>(
      houseListings.map((listing) => [listing.id, listing as HouseListing]),
    );
    for (const req of listingRequests) {
      if (req.service !== 'rental' || !isActiveListingRequest(req.status)) continue;
      if (merged.has(req.listingId)) continue;
      if (!listingsCounty) continue;
      merged.set(req.listingId, adaptHouseListingStubFromRequest(req, listingsCounty));
    }
    return Array.from(merged.values());
  }, [houseListings, listingRequests, listingsCounty]);

  const pickupDisplayLabel = useMemo(() => {
    if (!draftPickupCoords) return currentLocationLabel;
    const county =
      detectCountyFromCoords(draftPickupCoords) ?? currentCounty ?? listingsCounty ?? 'kisumu';
    return summarizeLocationFromCoords(draftPickupCoords, county);
  }, [draftPickupCoords, currentLocationLabel, currentCounty, listingsCounty]);

  const ridePickupDisplayLabel = useMemo(() => {
    if (ridePickupMode === 'station' && ridePickupStationId) {
      const hub = pickupStations.find((s) => s.id === ridePickupStationId);
      if (hub) return `${hub.name} · ${hub.subtitle}`;
    }
    return pickupDisplayLabel;
  }, [ridePickupMode, ridePickupStationId, pickupDisplayLabel]);

  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    // Edge-to-edge: StatusBar background APIs are unsupported — style only.
    RNStatusBar.setBarStyle(themeMode === 'dark' ? 'light-content' : 'dark-content');
  }, [themeMode]);
  const gutter = Math.min(24, Math.max(14, Math.round(windowWidth * 0.042)));
  const tabBarInnerHeight = 56;
  const tabBarBottomPad = bottomInset;
  const tabBarTotalHeight = tabBarInnerHeight + tabBarBottomPad;
  const floatingNavHeight = tabBarTotalHeight;
  const onHomeTab = activeTab === 'home';
  const isComingSoonSegment = isComingSoonService(activeSegment);
  const sheetSnap: HomeSheetStage = destinationSearchOpen ? 'full' : homeSheetStage;

  const isActiveTripMode = useMemo(() => {
    if (activeTab !== 'home' || homeDeepPage) return false;
    if (activeService === 'rides' && ['confirmed', 'active_trip'].includes(servicePhase.rides)) return true;
    if (activeService === 'laundry' && ['confirmed', 'active_trip'].includes(servicePhase.laundry)) return true;
    return false;
  }, [activeTab, homeDeepPage, activeService, servicePhase.rides, servicePhase.laundry]);

  /** Map band — only during live trip / active navigation (not while browsing services). */
  const mapBandHeight = useMemo(() => {
    if (!onHomeTab) return 0;
    if (destinationSearchOpen || sheetSnap === 'full') return 0;
    if (!isActiveTripMode) return 0;
    if (sheetSnap === 'mid') return Math.round(windowHeight * 0.28);
    return Math.round(windowHeight * 0.44);
  }, [onHomeTab, sheetSnap, destinationSearchOpen, windowHeight, isActiveTripMode]);

  const showServiceSegment = onHomeTab && sheetSnap !== 'full' && !destinationSearchOpen;
  const headerSegmentActive = useMemo((): HomeHeaderSegmentKey => {
    if ((HOME_MORE_SEGMENT_IDS as readonly string[]).includes(activeSegment)) return 'more';
    if (activeSegment === 'laundry' || activeSegment === 'bnbs' || activeSegment === 'rides') return activeSegment;
    return 'home';
  }, [activeSegment]);
  const homeLocationLine = locationLoading
    ? 'Locating…'
    : countyDisplayLabel && countyDisplayLabel !== 'Area unknown' && countyDisplayLabel !== 'Locating your area…'
      ? `${currentLocationLabel}, ${countyDisplayLabel}`
      : currentLocationLabel;
  const showDragHandle = onHomeTab && !destinationSearchOpen;
  const showMapBand = mapBandHeight > 0;
  const showMapSheetRadius = showMapBand;

  const pickupAdjustMode = useMemo(() => {
    if (homeDeepPage !== 'service-map' || destinationSearchOpen) return false;
    if (activeService === 'laundry' && laundryStationId === null) return true;
    return false;
  }, [homeDeepPage, destinationSearchOpen, activeService, laundryStationId]);

  const mapEmphasis: MapEmphasis = useMemo(() => {
    if (guidedJourney) return 'navigation';
    if (isActiveTripMode) return 'active_trip';
    if (activeService === 'rides' && routeCoordinates.length > 0) return 'route';
    if (pickupAdjustMode) return 'pickup';
    return 'default';
  }, [guidedJourney, isActiveTripMode, activeService, routeCoordinates.length, pickupAdjustMode]);

  const sheetHeight = useMemo(() => {
    // Legacy estimate for map camera padding / recenter chip only — not used to clip the sheet.
    const chromeBelowMap = (showServiceSegment ? 88 : 0) + tabBarTotalHeight;
    return Math.max(200, windowHeight - mapBandHeight - chromeBelowMap);
  }, [mapBandHeight, showServiceSegment, tabBarTotalHeight, windowHeight]);
  const serviceSegmentHeight = showServiceSegment ? 88 : 0;
  const bottomChromeHeight = sheetHeight + tabBarTotalHeight + serviceSegmentHeight;
  const showMainTabBar = isAuthed && guidedJourney === null && homeDeepPage === null;

  /** Mapbox padding so framing centers in the visible map band (below header/search, above sheet or dock+nav). */
  const homeMapCameraPad = useMemo((): MapViewportPad => {
    const topChrome = insets.top + (showServiceSegment ? 96 : 56);
    const top = Math.round(Math.min(windowHeight * 0.22, Math.max(88, topChrome)));
    const bottom = Math.round(Math.min(windowHeight * 0.72, Math.max(120, bottomChromeHeight + 12)));
    const side = Math.round(Math.max(10, Math.min(28, gutter + 4)));
    return { top, bottom, left: side, right: side };
  }, [insets.top, gutter, bottomChromeHeight, windowHeight, showServiceSegment]);

  const setHomeSheetStageAnimated = useCallback((next: HomeSheetStage) => {
    configureLayoutAnimation('sheet');
    setHomeSheetStage(next);
  }, []);

  const flashBookingNotice = useCallback(
    (message: string, opts?: { goTrips?: boolean; autoDismissMs?: number }) => {
      if (bookingToastTimerRef.current) clearTimeout(bookingToastTimerRef.current);
      setBookingMessage(message);
      if (opts?.goTrips) {
        setActiveTab('activity');
        setHomeDeepPage(null);
        setListingDetail(null);
      }
      const ms = opts?.autoDismissMs ?? 4000;
      if (ms > 0) {
        bookingToastTimerRef.current = setTimeout(() => setBookingMessage(''), ms);
      }
    },
    [],
  );

  const cycleSheetSnap = useCallback(
    (direction: 'up' | 'down') => {
      if (!onHomeTab || destinationSearchOpen) return;
      setHomeSheetStageAnimated(
        direction === 'up'
          ? homeSheetStage === 'collapsed'
            ? 'mid'
            : 'full'
          : homeSheetStage === 'full'
            ? 'mid'
            : 'collapsed',
      );
    },
    [onHomeTab, destinationSearchOpen, homeSheetStage, setHomeSheetStageAnimated],
  );

  const sheetDragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => showDragHandle,
        onMoveShouldSetPanResponder: (_, g) => showDragHandle && Math.abs(g.dy) > 6,
        onPanResponderRelease: (_, g) => {
          if (g.dy < -45) cycleSheetSnap('up');
          else if (g.dy > 45) cycleSheetSnap('down');
        },
      }),
    [showDragHandle, cycleSheetSnap],
  );

  const changeServiceBySwipe = useCallback(
    (segment: SwipeableSegment) => {
      configureLayoutAnimation('segment');
      setActiveSegment(segment);
      if (segment !== 'home') {
        setActiveService(segment);
      }
      setHomeSheetStageAnimated('mid');
    },
    [setHomeSheetStageAnimated],
  );

  const serviceSwipePan = useServiceSwipePan({
    enabled: activeTab === 'home' && !destinationSearchOpen && homeDeepPage === null && !homeHubCarouselActive,
    active: toSwipeableSegment(activeSegment),
    onChange: changeServiceBySwipe,
  });

  const setExploreSheetStageAnimated = useCallback((next: HomeSheetStage) => {
    configureLayoutAnimation('sheet');
    setExploreSheetStage(next);
  }, []);

  const onHomeMapWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        id?: string;
        catalog?: string;
        destLng?: number;
        destLat?: number;
        lng?: number;
        lat?: number;
        needsRecenter?: boolean;
        title?: string;
        subtitle?: string;
        kind?: string;
      };
      if (data.type === 'mapCenterChanged' && typeof data.lng === 'number' && typeof data.lat === 'number') {
        setDraftPickupCoords({ latitude: data.lat, longitude: data.lng });
        setMapNeedsRecenter(!!data.needsRecenter);
        return;
      }
      if (data.type === 'mapMoved') {
        setMapNeedsRecenter(!!data.needsRecenter);
        return;
      }
      if (data.type === 'previewListing' && data.id && (data.catalog === 'bnb' || data.catalog === 'house')) {
        setHomeListingPreview({ catalog: data.catalog, id: String(data.id) });
        return;
      }
      if (data.type === 'listingMapSelect' && data.id && (data.catalog === 'bnb' || data.catalog === 'house')) {
        if (data.catalog === 'bnb') {
          setSelectedBnbId(String(data.id));
          setSelectedHouseId(null);
          setStaysSubTab('bnb');
        } else {
          setSelectedHouseId(String(data.id));
          setSelectedBnbId(null);
          setStaysSubTab('rental');
        }
        if (homeDeepPage === 'listings') {
          setListingsMapSelectedId(String(data.id));
          setListingCatalog(data.catalog);
        } else {
          setHomeSheetStageAnimated('full');
        }
        return;
      }
      if (data.type === 'exploreSelectArticle' && data.id) {
        const art = EXPLORE_ARTICLES.find((a) => a.id === data.id);
        if (!art) return;
        setActiveTab('home');
        setActiveService('bnbs');
        setActiveSegment('bnbs');
        setExploreLens('journal');
        setSelectedExploreCard({
          kind: 'article',
          id: art.id,
          title: art.title,
          subtitle: art.subtitle,
          reason: art.reason,
          readMin: art.readMin,
          tag: art.tag,
          author: art.author,
        });
        setExploreReadHereTarget(art.readHere ?? null);
        setExploreSheetStageAnimated('mid');
        return;
      }
      if (data.type === 'openListingDetail' && data.id && (data.catalog === 'bnb' || data.catalog === 'house')) {
        setHomeListingPreview(null);
        setActiveTab('home');
        if (data.catalog === 'bnb') {
          setActiveService('bnbs');
        setActiveSegment('bnbs');
          setSelectedBnbId(data.id);
          setSelectedHouseId(null);
          setListingCatalog('bnb');
          setListingDetail({ kind: 'bnb', id: data.id });
        } else {
          setActiveService('bnbs');
        setActiveSegment('bnbs');
          setStaysSubTab('rental');
          setSelectedHouseId(data.id);
          setSelectedBnbId(null);
          setListingCatalog('house');
          setListingDetail({ kind: 'house', id: data.id });
        }
        setHomeDeepPage('listing-detail');
        setHomeSheetStageAnimated('mid');
        return;
      }
      if (data.type === 'startJourney') {
        const lng = Number(data.destLng);
        const lat = Number(data.destLat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
        const k = (data.kind || 'place') as GuidedJourneyKind;
        const allowed: GuidedJourneyKind[] = ['station', 'bnb', 'house', 'ride', 'place', 'destination'];
        const kind: GuidedJourneyKind = allowed.includes(k) ? k : 'place';
        if (!MAPBOX_ACCESS_TOKEN) {
          setBookingMessage('Add a Mapbox token (EXPO_PUBLIC_MAPBOX_TOKEN) for navigation.');
          return;
        }
        if (!currentCoords) {
          setBookingMessage('We need your current location — tap the location pill, then try again.');
          return;
        }
        setGuidedJourney({
          origin: currentCoords,
          end: { longitude: lng, latitude: lat },
          title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Destination',
          subtitle: typeof data.subtitle === 'string' ? data.subtitle : '',
          kind,
        });
        return;
      }
      if (data.type === 'ridePickupHub' && data.id) {
        if (!pickupStations.some((s) => s.id === data.id)) return;
        setRidePickupStationId(data.id);
        setRidePickupMode('station');
        setRideWizardStep('pickup');
        setPhaseForService('rides', 'selecting');
        setServiceMapRidePinFocus(null);
        setHomeDeepPage(null);
        setHomeSheetStageAnimated('mid');
        setBookingMessage('Pickup hub saved — continue in the ride wizard.');
        return;
      }
      if (data.type === 'ridePickupMapSelect' && data.id) {
        if (!pickupStations.some((s) => s.id === data.id)) return;
        setRidePickupStationId(data.id);
        setRidePickupMode('station');
        setServiceMapRidePinFocus('hub');
        return;
      }
      if (data.type === 'rideDestinationMapSelect' && data.id) {
        const dest = DESTINATIONS.find((d) => d.id === data.id);
        if (!dest) return;
        setSelectedDestination(dest);
        setDestinationQuery(dest.subtitle);
        setServiceMapRidePinFocus('destination');
        return;
      }
      if (data.type === 'rideDestination' && data.id) {
        const dest = DESTINATIONS.find((d) => d.id === data.id);
        if (!dest) return;
        setSelectedDestination(dest);
        setDestinationQuery(dest.subtitle);
        setRideWizardStep('destination');
        setPhaseForService('rides', 'selecting');
        setServiceMapRidePinFocus(null);
        setHomeDeepPage(null);
        setHomeSheetStageAnimated('mid');
        setBookingMessage(`Destination set · ${dest.name}`);
        return;
      }
      if (data.type === 'openValetFromStation' && data.id) {
        setLaundryStationId(data.id);
        setLaundryWizardStep('pickup');
        setActiveService('laundry');
        setActiveSegment('laundry');
        setActiveTab('home');
        setHomeDeepPage(null);
        setHomeSheetStageAnimated('mid');
        setServicePhase((prev) => ({ ...prev, laundry: 'selecting' }));
        return;
      }
      if (data.type === 'laundryStationPick' && data.id) {
        if (!pickupStations.some((s) => s.id === data.id)) return;
        setLaundryStationId(data.id);
        setLaundryWizardStep('pickup');
        setPhaseForService('laundry', 'selecting');
        setHomeDeepPage(null);
        setHomeSheetStageAnimated('mid');
        setBookingMessage('Pickup station saved — continue in the Fua wizard.');
        return;
      }
      if (data.type === 'laundryStationMapSelect' && data.id) {
        if (!pickupStations.some((s) => s.id === data.id)) return;
        setLaundryStationId(data.id);
        return;
      }
      if (data.type === 'laundryStation' && data.id) {
        setLaundryStationId(data.id);
        setLaundryWizardStep('pickup');
        setPhaseForService('laundry', 'selecting');
        setHomeDeepPage(null);
        setHomeSheetStageAnimated('mid');
      }
    } catch {
      /* ignore */
    }
  }, [
    currentCoords,
    MAPBOX_ACCESS_TOKEN,
    setHomeSheetStageAnimated,
    setActiveTab,
    setActiveService,
    setSelectedBnbId,
    setSelectedHouseId,
    setListingCatalog,
    setListingDetail,
    setHomeDeepPage,
    setExploreLens,
    setSelectedExploreCard,
    setExploreReadHereTarget,
    setExploreSheetStageAnimated,
    setHomeListingPreview,
    setDestinationQuery,
    setRideWizardStep,
    setLaundryWizardStep,
    setBookingMessage,
  ]);

  const homeDockCue = useMemo(() => {
    switch (activeService) {
      case 'rides':
        return 'Ride & route';
      case 'laundry':
        return 'Fua';
      case 'bnbs':
        return 'Stays';
      case 'houses':
        return 'Rentals';
      default:
        return 'Explore';
    }
  }, [activeService]);
  const mamafuaWhenOptions = useMemo(() => {
    if (mamaFuaConvenienceTimes.length) {
      return mamaFuaConvenienceTimes.map((b) => ({
        id: b.id,
        label: b.label,
        shortLabel: b.shortLabel,
      }));
    }
    return DEFAULT_MAMAFUA_WHEN;
  }, [mamaFuaConvenienceTimes]);

  useEffect(() => {
    if (!mamafuaWhenOptions.some((b) => b.id === valetStudioWhen)) {
      setValetStudioWhen(mamafuaWhenOptions[0]?.id ?? 'asap');
    }
  }, [mamafuaWhenOptions, valetStudioWhen]);

  const selectedRide = RIDE_OPTIONS.find((ride) => ride.id === selectedRideId) || RIDE_OPTIONS[0];

  const nearbyStations = useMemo(() => {
    if (!currentCoords) {
      if (!currentCounty) return pickupStations;
      return pickupStations.filter((station) => station.county === currentCounty);
    }
    return pickupStations.filter(
      (station) => getDistanceKm(currentCoords, station.coords) <= PICKUP_RADIUS_KM,
    );
  }, [currentCoords, currentCounty, pickupStations]);
  const mapBnbs = effectiveBnbListings;
  const mapHouses = effectiveHouseListings;
  // Booking/request stubs carry approximate (county-center) fallback coords, so
  // their distance is meaningless — exclude them from strict "near me" surfaces.
  // Match on the explicit stub flag (robust) and keep the legacy price checks as
  // a fallback for any older rows that predate the flag.
  const proximityBnbs = useMemo(
    () => mapBnbs.filter((row) => !row.isStub && row.price !== 'Requested' && row.price !== 'Booked'),
    [mapBnbs],
  );
  const proximityHouses = useMemo(
    () =>
      mapHouses.filter(
        (row) => !row.isStub && row.price !== 'Requested' && row.price !== 'Viewing requested',
      ),
    [mapHouses],
  );
  const nearbyHouses = useMemo(() => {
    return filterListingsByProximity(proximityHouses, staysProximityCtx).map((row) => ({
      ...row,
      distanceFromUser: row.distanceKm,
    }));
  }, [proximityHouses, staysProximityCtx]);
  const nearbyBnbs = useMemo(() => {
    return filterListingsByProximity(proximityBnbs, staysProximityCtx).map((row) => ({
      ...row,
      distanceFromUser: row.distanceKm,
    }));
  }, [proximityBnbs, staysProximityCtx]);
  const featuredBnbs = useMemo(() => nearbyBnbs.slice(0, FEATURED_STAYS_HOME), [nearbyBnbs]);
  const featuredHouses = useMemo(() => nearbyHouses.slice(0, FEATURED_STAYS_HOME), [nearbyHouses]);
  /** Home hub — nearest listings from GPS or county center when location is off. */
  const hubListingPool = useMemo(() => {
    return {
      houses: filterListingsByProximity(proximityHouses, staysProximityCtx),
      bnbs: filterListingsByProximity(proximityBnbs, staysProximityCtx),
    };
  }, [proximityHouses, proximityBnbs, staysProximityCtx]);
  const hubPopularListings = useMemo(() => {
    const rows: { id: string; kind: 'bnb' | 'rental'; title: string; subtitle: string; image: { uri: string } }[] =
      [];
    for (const h of hubListingPool.houses) {
      const dist = formatListingDistanceLabel(h.coords, listingDistanceRef);
      rows.push({
        id: h.id,
        kind: 'rental',
        title: h.title,
        subtitle: dist ? `${dist} · ${h.price}` : `Rental · ${h.beds} bed · ${h.price}`,
        image: h.image,
      });
      if (rows.length >= 4) break;
    }
    if (rows.length < 4) {
      for (const b of hubListingPool.bnbs) {
        const dist = formatListingDistanceLabel(b.coords, listingDistanceRef);
        rows.push({
          id: b.id,
          kind: 'bnb',
          title: b.title,
          subtitle: dist ? `${dist} · ${b.price}` : `BnB · ${b.rating} · ${b.price}`,
          image: b.image,
        });
        if (rows.length >= 4) break;
      }
    }
    return rows;
  }, [hubListingPool, listingDistanceRef]);
  const catalogBnbs = useMemo(() => {
    if (listingCounty === 'near_me' && currentCoords) {
      return filterListingsByProximity(proximityBnbs, catalogProximityCtx, pinnedBnbListingIds).map(
        (row) => ({
          ...row,
          distanceFromUser: row.distanceKm ?? getDistanceKm(currentCoords, row.coords),
        }),
      );
    }
    if (listingCounty === 'near_me') {
      return filterListingsByProximity(mapBnbs, catalogProximityCtx, pinnedBnbListingIds).map((row) => ({
        ...row,
        distanceFromUser: row.distanceKm,
      }));
    }
    const base =
      listingCounty === 'any' ? mapBnbs : filterByCounty(mapBnbs, listingCounty as CountyKey);
    return enrichWithDistanceFromUser(base, listingDistanceRef.coords);
  }, [
    listingCounty,
    currentCoords,
    mapBnbs,
    proximityBnbs,
    catalogProximityCtx,
    pinnedBnbListingIds,
    listingDistanceRef.coords,
  ]);
  const catalogHouses = useMemo(() => {
    if (listingCounty === 'near_me' && currentCoords) {
      return filterListingsByProximity(
        proximityHouses,
        catalogProximityCtx,
        pinnedHouseListingIds,
      ).map((row) => ({
        ...row,
        distanceFromUser: row.distanceKm ?? getDistanceKm(currentCoords, row.coords),
      }));
    }
    if (listingCounty === 'near_me') {
      return filterListingsByProximity(mapHouses, catalogProximityCtx, pinnedHouseListingIds).map((row) => ({
        ...row,
        distanceFromUser: row.distanceKm,
      }));
    }
    const base =
      listingCounty === 'any' ? mapHouses : filterByCounty(mapHouses, listingCounty as CountyKey);
    return enrichWithDistanceFromUser(base, listingDistanceRef.coords);
  }, [
    listingCounty,
    currentCoords,
    mapHouses,
    proximityHouses,
    catalogProximityCtx,
    pinnedHouseListingIds,
    listingDistanceRef.coords,
  ]);
  const listingsMapHighlight = useMemo(() => {
    if (!listingsMapSelectedId) return null;
    if (listingCatalog === 'bnb') {
      const b = catalogBnbs.find((x) => x.id === listingsMapSelectedId);
      return b ? b.coords : null;
    }
    const h = catalogHouses.find((x) => x.id === listingsMapSelectedId);
    return h ? h.coords : null;
  }, [listingsMapSelectedId, listingCatalog, catalogBnbs, catalogHouses]);
  const listingDetailEntity = useMemo((): BnbListing | HouseListing | null => {
    if (!listingDetail) return null;
    let base: BnbListing | HouseListing | null = null;
    if (listingDetail.kind === 'bnb') {
      base =
        mapBnbs.find((b) => b.id === listingDetail.id) ??
        bookedListingSnapshots[listingDetail.id] ??
        null;
    } else {
      base = mapHouses.find((h) => h.id === listingDetail.id) ?? null;
    }
    if (!base) return null;
    return mergeListingUnlockFields(
      base as AdaptedHouseListing | AdaptedBnbListing,
      listingDetailLive,
    ) as BnbListing | HouseListing;
  }, [listingDetail, mapBnbs, mapHouses, bookedListingSnapshots, listingDetailLive]);
  const listingDetailMoreRows = useMemo(() => {
    if (!listingDetail) return [];
    const pool = listingDetail.kind === 'bnb' ? catalogBnbs : catalogHouses;
    return pool.filter((r) => r.id !== listingDetail.id).slice(0, 6);
  }, [listingDetail, catalogBnbs, catalogHouses]);
  const focusedBnb = selectedBnbId ? nearbyBnbs.find((b) => b.id === selectedBnbId) ?? null : null;
  const focusedHouse = selectedHouseId ? nearbyHouses.find((h) => h.id === selectedHouseId) ?? null : null;
  const staysHomeMapHighlight = useMemo(() => {
    if (staysSubTab === 'rental') return focusedHouse?.coords ?? null;
    return focusedBnb?.coords ?? null;
  }, [staysSubTab, focusedHouse, focusedBnb]);
  const tourListing =
    tourSheetTarget?.kind === 'bnb'
      ? bnbListings.find((b) => b.id === tourSheetTarget.id) ?? null
      : tourSheetTarget?.kind === 'house'
        ? houseListings.find((h) => h.id === tourSheetTarget.id) ?? null
        : null;
  const countyDestinations = currentCounty
    ? DESTINATIONS.filter((destination) => destination.county === currentCounty)
    : DESTINATIONS;
  const popularNearbyDestinations = useMemo(() => {
    if (countyDestinations.length > 0) return countyDestinations;
    if (!currentCoords) return DESTINATIONS.filter((d) => !!d.county).slice(0, 4);
    return DESTINATIONS.filter((d) => !!d.county)
      .map((destination) => ({
        destination,
        distance: getDistanceKm(currentCoords, destination.coords),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4)
      .map((item) => item.destination);
  }, [countyDestinations, currentCoords]);
  const exploreDestinations = exploreScope === 'everywhere' ? DESTINATIONS : popularNearbyDestinations;
  const exploreBnbs = useMemo(() => {
    if (exploreScope === 'everywhere') return bnbListings;
    if (currentCoords) {
      return bnbListings.filter((b) => getDistanceKm(currentCoords, b.coords) <= listingRadiusKm);
    }
    return nearbyBnbs;
  }, [exploreScope, currentCoords, listingRadiusKm, nearbyBnbs]);
  const exploreVenues = useMemo(() => {
    if (exploreScope === 'everywhere') return EXPLORE_VENUES;
    if (currentCoords) {
      return EXPLORE_VENUES.filter((v) => getDistanceKm(currentCoords, v.coords) <= listingRadiusKm);
    }
    if (!currentCounty) return EXPLORE_VENUES;
    return EXPLORE_VENUES.filter((v) => v.county === currentCounty);
  }, [exploreScope, currentCoords, listingRadiusKm, currentCounty]);
  const exploreJournalArticles = useMemo(() => {
    let rows = [...EXPLORE_ARTICLES];
    if (exploreScope === 'nearby') {
      rows = rows.filter((a) => !a.anchorCounty || a.anchorCounty === currentCounty);
    }
    return rows;
  }, [exploreScope, currentCounty]);
  const exploreVenuesDisplayed = useMemo(() => {
    if (exploreSheetScope === 'all') return exploreVenues;
    return exploreVenues.filter((v) => v.scopes.includes(exploreSheetScope));
  }, [exploreVenues, exploreSheetScope]);
  const exploreDestinationsDisplayed = useMemo(() => {
    if (exploreLens === 'discover' && exploreSheetScope === 'trending') {
      return exploreDestinations.slice(0, Math.min(4, exploreDestinations.length));
    }
    if (exploreLens === 'discover' && exploreSheetScope === 'quiet') {
      return exploreDestinations.filter((d) =>
        ['kisumu', 'nyamira-town', 'manga-hills', 'keroka'].includes(d.id),
      );
    }
    return exploreDestinations;
  }, [exploreDestinations, exploreLens, exploreSheetScope]);
  const exploreBnbsDisplayed = useMemo(() => {
    if (exploreLens === 'discover' && exploreSheetScope === 'trending') {
      return exploreBnbs.slice(0, Math.min(4, exploreBnbs.length));
    }
    return exploreBnbs;
  }, [exploreBnbs, exploreLens, exploreSheetScope]);
  const exploreJournalDisplayed = useMemo(() => {
    let rows = exploreJournalArticles;
    if (exploreLens === 'journal') {
      if (exploreSheetScope === 'editors') {
        rows = rows.filter((a) => ['Nia T.', 'Leo W.', 'Amina K.', 'Mesh Traveler'].includes(a.author));
      } else if (exploreSheetScope === 'onmap') {
        rows = rows.filter((a) => !!a.readHere);
      }
    }
    return rows;
  }, [exploreJournalArticles, exploreLens, exploreSheetScope]);
  const exploreArticlePinFeatures = useMemo(() => {
    const articles =
      exploreLens === 'journal'
        ? exploreJournalDisplayed.filter((a) => a.readHere)
        : exploreJournalArticles.filter((a) => a.readHere);
    return articles.map((a) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [a.readHere!.longitude, a.readHere!.latitude] as [number, number],
      },
      properties: {
        id: a.id,
        pinKind: 'journal',
        name: a.title,
        subtitle: `By ${a.author}`,
        reason: a.subtitle,
        detail: `${a.readMin} min read`,
        heat: 7,
        touringNow: 24,
        visitedToday: 420,
      },
    }));
  }, [exploreJournalArticles, exploreJournalDisplayed, exploreLens]);
  const estimatedFare =
    routeDistanceKm !== null
      ? Math.max(8, Math.round((3.2 + routeDistanceKm * 1.1) * selectedRide.multiplier))
      : null;
  const laundryMapHighlight = useMemo(() => {
    if (!laundryStationId) return null;
    const s = pickupStations.find((x) => x.id === laundryStationId);
    return s ? s.coords : null;
  }, [laundryStationId]);
  const rideMapHighlight = useMemo(() => {
    if (ridePickupMode !== 'station' || !ridePickupStationId) return null;
    const s = pickupStations.find((x) => x.id === ridePickupStationId);
    return s ? s.coords : null;
  }, [ridePickupMode, ridePickupStationId]);
  const homeMapPinBanks = useMemo(() => {
    const laundryPins: HomeUnifiedPin[] = nearbyStations.map((s) => ({
      id: s.id,
      title: s.name,
      subtitle:
        currentCoords != null
          ? `${s.subtitle} · ${Math.max(1, Math.round(getDistanceKm(currentCoords, s.coords) * 10) / 10)} km away`
          : s.subtitle,
      coords: s.coords,
      kind: 'station',
    }));
    const bnbPins: HomeUnifiedPin[] = mapBnbs.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: `${b.county} · ${b.rating} · ${b.price}`,
      coords: b.coords,
      kind: 'bnb',
    }));
    const housePins: HomeUnifiedPin[] = mapHouses.map((h) => ({
      id: h.id,
      title: h.title,
      subtitle: `${h.price}${currentCoords ? ` · ${Math.max(1, Math.round(getDistanceKm(currentCoords, h.coords) * 10) / 10)} km` : ''}`,
      coords: h.coords,
      kind: 'house',
    }));
    const ridePins: HomeUnifiedPin[] = nearbyStations.map((s) => ({
      id: s.id,
      title: s.name,
      subtitle:
        currentCoords != null
          ? `${s.subtitle} · ${Math.max(1, Math.round(getDistanceKm(currentCoords, s.coords) * 10) / 10)} km`
          : s.subtitle,
      coords: s.coords,
      kind: 'ride',
    }));
    const destinationPins: HomeUnifiedPin[] = popularNearbyDestinations.slice(0, 8).map((d) => ({
      id: d.id,
      title: d.name,
      subtitle: d.subtitle,
      coords: d.coords,
      kind: 'destination',
    }));
    return { laundry: laundryPins, bnbs: bnbPins, houses: housePins, rides: ridePins, destinations: destinationPins };
  }, [nearbyStations, mapBnbs, mapHouses, currentCoords, popularNearbyDestinations]);

  const serviceMapViewportPad = useMemo(
    (): MapViewportPad => ({
      top: Math.round(insets.top + 56),
      bottom: Math.round(insets.bottom + 108),
      left: Math.round(Math.max(10, Math.min(28, gutter + 4))),
      right: Math.round(Math.max(10, Math.min(28, gutter + 4))),
    }),
    [insets.top, insets.bottom, gutter],
  );

  const unifiedHomeMapHtml = useMemo(() => {
    if (!MAPBOX_ACCESS_TOKEN) return null;
    return buildUnifiedHomeServicesMapHtml(
      MAPBOX_ACCESS_TOKEN,
      theme.mapStyleId,
      homeMapPinBanks,
      currentCoords,
      theme.canvas,
      {
        top: Math.round(homeMapCameraPad.top),
        bottom: Math.round(homeMapCameraPad.bottom),
        left: Math.round(homeMapCameraPad.left),
        right: Math.round(homeMapCameraPad.right),
      },
    );
  }, [
    MAPBOX_ACCESS_TOKEN,
    theme.mapStyleId,
    theme.canvas,
    homeMapPinBanks,
    currentCoords,
  ]);

  const serviceMapHtml = useMemo(() => {
    if (!MAPBOX_ACCESS_TOKEN) return null;
    return buildUnifiedHomeServicesMapHtml(
      MAPBOX_ACCESS_TOKEN,
      theme.mapStyleId,
      homeMapPinBanks,
      currentCoords,
      theme.canvas,
      {
        top: Math.round(serviceMapViewportPad.top),
        bottom: Math.round(serviceMapViewportPad.bottom),
        left: Math.round(serviceMapViewportPad.left),
        right: Math.round(serviceMapViewportPad.right),
      },
    );
  }, [
    MAPBOX_ACCESS_TOKEN,
    theme.mapStyleId,
    theme.canvas,
    homeMapPinBanks,
    currentCoords,
    serviceMapViewportPad,
  ]);

  const staysHomeMapHtml = useMemo(() => {
    if (!MAPBOX_ACCESS_TOKEN) return null;
    const isRental = staysSubTab === 'rental';
    const rows = isRental ? mapHouses : mapBnbs;
    const pins: HomeUnifiedPin[] = rows.map((row) =>
      isRental
        ? {
            id: (row as HouseListing).id,
            title: (row as HouseListing).title,
            subtitle: `${(row as HouseListing).distanceKm} km · ${(row as HouseListing).price}`,
            coords: (row as HouseListing).coords,
            kind: 'house' as const,
          }
        : {
            id: (row as BnbListing).id,
            title: (row as BnbListing).title,
            subtitle: `${(row as BnbListing).county} · ${(row as BnbListing).rating} ★ · ${(row as BnbListing).price}`,
            coords: (row as BnbListing).coords,
            kind: 'bnb' as const,
          },
    );
    const banks: HomeUnifiedBanks = {
      laundry: [],
      bnbs: isRental ? [] : pins,
      houses: isRental ? pins : [],
      rides: [],
      destinations: [],
    };
    return buildUnifiedHomeServicesMapHtml(
      MAPBOX_ACCESS_TOKEN,
      theme.mapStyleId,
      banks,
      currentCoords,
      theme.canvas,
      { top: 40, bottom: 40, left: 12, right: 12 },
    );
  }, [MAPBOX_ACCESS_TOKEN, theme.mapStyleId, theme.canvas, staysSubTab, nearbyBnbs, nearbyHouses, currentCoords]);

  const listingsMapHtml = useMemo(() => {
    if (!MAPBOX_ACCESS_TOKEN) return null;
    const rows = (listingCatalog === 'bnb' ? catalogBnbs : catalogHouses).filter((row) =>
      hasValidMapCoords(row.coords),
    );
    const pins: HomeUnifiedPin[] = rows.map((row) => {
      const dist =
        'distanceFromUser' in row && row.distanceFromUser != null
          ? formatListingDistance(row.distanceFromUser)
          : null;
      return listingCatalog === 'bnb'
        ? {
            id: (row as BnbListing & { distanceFromUser: number | null }).id,
            title: (row as BnbListing).title,
            subtitle: dist
              ? `${dist} · ${(row as BnbListing).price}`
              : `${(row as BnbListing).county} · ${(row as BnbListing).rating} ★ · ${(row as BnbListing).price}`,
            coords: (row as BnbListing).coords,
            kind: 'bnb' as const,
          }
        : {
            id: (row as HouseListing & { distanceFromUser: number | null }).id,
            title: (row as HouseListing).title,
            subtitle: dist
              ? `${dist} · ${(row as HouseListing).price}`
              : `${(row as HouseListing).price}`,
            coords: (row as HouseListing).coords,
            kind: 'house' as const,
          };
    });
    const banks: HomeUnifiedBanks = {
      laundry: [],
      bnbs: listingCatalog === 'bnb' ? pins : [],
      houses: listingCatalog === 'house' ? pins : [],
      rides: [],
      destinations: [],
    };
    return buildUnifiedHomeServicesMapHtml(
      MAPBOX_ACCESS_TOKEN,
      theme.mapStyleId,
      banks,
      currentCoords,
      theme.canvas,
      {
        top: Math.round(serviceMapViewportPad.top),
        bottom: Math.round(serviceMapViewportPad.bottom + 72),
        left: Math.round(serviceMapViewportPad.left),
        right: Math.round(serviceMapViewportPad.right),
      },
    );
  }, [
    MAPBOX_ACCESS_TOKEN,
    theme.mapStyleId,
    theme.canvas,
    listingCatalog,
    catalogBnbs,
    catalogHouses,
    currentCoords,
    serviceMapViewportPad,
  ]);

  const injectMapHighlight = useCallback(
    (ref: React.RefObject<WebView | null>, highlight: Coordinates | null) => {
      const wv = ref.current;
      if (!wv || !MAPBOX_ACCESS_TOKEN) return;
      const hlJs =
        highlight != null
          ? `if(window.juaSetHighlight)window.juaSetHighlight(${highlight.longitude},${highlight.latitude});`
          : 'if(window.juaSetHighlight)window.juaSetHighlight(null,null);';
      wv.injectJavaScript(`setTimeout(function(){try{${hlJs}}catch(e){}},40);true;`);
    },
    [MAPBOX_ACCESS_TOKEN],
  );

  const injectMapViewportPad = useCallback(
    (ref: React.RefObject<WebView | null>, pad: MapViewportPad) => {
      const wv = ref.current;
      if (!wv) return;
      wv.injectJavaScript(
        `setTimeout(function(){try{if(window.juaSetViewportPad)window.juaSetViewportPad(${JSON.stringify(pad)});}catch(e){}},40);true;`,
      );
    },
    [],
  );

  const listingsMapPinKey = useMemo(() => {
    const rows = listingCatalog === 'bnb' ? catalogBnbs : catalogHouses;
    return `${listingCatalog}:${rows.map((row) => row.id).join('|')}`;
  }, [listingCatalog, catalogBnbs, catalogHouses]);

  const injectListingsMapSync = useCallback(() => {
    const wv = listingsMapWebViewRef.current;
    if (!wv || !MAPBOX_ACCESS_TOKEN || !listingsMapHtml) return;
    const mode = listingCatalog === 'bnb' ? 'bnbs' : 'houses';
    const rows = (listingCatalog === 'bnb' ? catalogBnbs : catalogHouses).filter((row) =>
      hasValidMapCoords(row.coords),
    );
    const banksJson = JSON.stringify({
      laundry: [],
      bnbs:
        listingCatalog === 'bnb'
          ? rows.map((row) => {
              const dist =
                'distanceFromUser' in row && row.distanceFromUser != null
                  ? formatListingDistance(row.distanceFromUser)
                  : null;
              return {
                id: row.id,
                title: row.title,
                subtitle: dist
                  ? `${dist} · ${(row as BnbListing).price}`
                  : `${(row as BnbListing).county} · ${(row as BnbListing).rating} ★ · ${(row as BnbListing).price}`,
                kind: 'bnb',
                coords: [row.coords.longitude, row.coords.latitude],
              };
            })
          : [],
      houses:
        listingCatalog === 'house'
          ? rows.map((row) => {
              const dist =
                'distanceFromUser' in row && row.distanceFromUser != null
                  ? formatListingDistance(row.distanceFromUser)
                  : null;
              return {
                id: row.id,
                title: row.title,
                subtitle: dist
                  ? `${dist} · ${(row as HouseListing).price}`
                  : `${(row as HouseListing).price}`,
                kind: 'house',
                coords: [row.coords.longitude, row.coords.latitude],
              };
            })
          : [],
      rides: [],
      destinations: [],
    });
    const hl = listingsMapHighlight;
    const hlJs =
      hl != null
        ? `if(window.juaSetHighlight)window.juaSetHighlight(${hl.longitude},${hl.latitude});`
        : 'if(window.juaSetHighlight)window.juaSetHighlight(null,null);';
    const userJs = currentCoords
      ? `if(window.juaSetUserCoords)window.juaSetUserCoords({longitude:${currentCoords.longitude},latitude:${currentCoords.latitude}});`
      : '';
    wv.injectJavaScript(
      `setTimeout(function(){try{if(window.juaUpdatePinBanks)window.juaUpdatePinBanks(${banksJson});if(window.juaApplyHomeMode)window.juaApplyHomeMode(${JSON.stringify(
        mode,
      )}, true);${hlJs}${userJs}}catch(e){}},80);true;`,
    );
  }, [
    MAPBOX_ACCESS_TOKEN,
    listingsMapHtml,
    listingCatalog,
    catalogBnbs,
    catalogHouses,
    listingsMapHighlight,
    currentCoords,
  ]);

  const injectStaysHomeMapSync = useCallback(() => {
    const wv = staysHomeMapWebViewRef.current;
    if (!wv || !MAPBOX_ACCESS_TOKEN || !staysHomeMapHtml) return;
    const mode = staysSubTab === 'rental' ? 'houses' : 'bnbs';
    const hl = staysHomeMapHighlight;
    const hlJs =
      hl != null
        ? `if(window.juaSetHighlight)window.juaSetHighlight(${hl.longitude},${hl.latitude});`
        : 'if(window.juaSetHighlight)window.juaSetHighlight(null,null);';
    const userJs = currentCoords
      ? `if(window.juaSetUserCoords)window.juaSetUserCoords({longitude:${currentCoords.longitude},latitude:${currentCoords.latitude}});`
      : '';
    wv.injectJavaScript(
      `setTimeout(function(){try{if(window.juaApplyHomeMode)window.juaApplyHomeMode(${JSON.stringify(
        mode,
      )}, false);${hlJs}${userJs}}catch(e){}},80);true;`,
    );
  }, [MAPBOX_ACCESS_TOKEN, staysHomeMapHtml, staysSubTab, staysHomeMapHighlight, currentCoords]);

  const injectHomeMapSync = useCallback(() => {
    const wv = homeMainMapRef.current;
    if (!wv || activeService === 'rides' || !MAPBOX_ACCESS_TOKEN || !unifiedHomeMapHtml) return;
    const mode = activeService === 'laundry' ? 'laundry' : activeService === 'bnbs' ? (staysSubTab === 'rental' ? 'houses' : 'bnbs') : 'bnbs';
    const hl = laundryMapHighlight;
    const hlJs =
      hl != null
        ? `if(window.juaSetHighlight)window.juaSetHighlight(${hl.longitude},${hl.latitude});`
        : 'if(window.juaSetHighlight)window.juaSetHighlight(null,null);';
    const userJs = currentCoords
      ? `if(window.juaSetUserCoords)window.juaSetUserCoords({longitude:${currentCoords.longitude},latitude:${currentCoords.latitude}});`
      : '';
    const pickupJs = `if(window.juaSetPickupMode)window.juaSetPickupMode(false);`;
    wv.injectJavaScript(
      `setTimeout(function(){try{if(window.juaApplyHomeMode)window.juaApplyHomeMode(${JSON.stringify(
        mode,
      )}, false);${hlJs}${userJs}${pickupJs}}catch(e){}},80);true;`,
    );
  }, [activeService, staysSubTab, MAPBOX_ACCESS_TOKEN, unifiedHomeMapHtml, laundryMapHighlight, currentCoords]);

  const injectServiceMapSync = useCallback(() => {
    const wv = serviceMapWebViewRef.current;
    if (!wv || !MAPBOX_ACCESS_TOKEN || !serviceMapHtml) return;
    const mode =
      activeService === 'laundry'
        ? 'laundry'
        : activeService === 'bnbs'
          ? staysSubTab === 'rental'
            ? 'houses'
            : 'bnbs'
          : activeService === 'rides'
            ? 'rides'
            : 'bnbs';
    const ridesFocus = activeService === 'rides' && rideWizardStep === 'destination' ? 'destination' : 'pickup';
    const hl =
      activeService === 'rides'
        ? rideWizardStep === 'destination' || serviceMapRidePinFocus === 'destination'
          ? selectedDestination.coords
          : rideMapHighlight
        : activeService === 'laundry'
          ? laundryMapHighlight
          : null;
    const hlJs =
      hl != null
        ? `if(window.juaSetHighlight)window.juaSetHighlight(${hl.longitude},${hl.latitude});`
        : 'if(window.juaSetHighlight)window.juaSetHighlight(null,null);';
    const userJs = currentCoords
      ? `if(window.juaSetUserCoords)window.juaSetUserCoords({longitude:${currentCoords.longitude},latitude:${currentCoords.latitude}});`
      : '';
    const pickupJs = `if(window.juaSetPickupMode)window.juaSetPickupMode(${pickupAdjustMode ? 'true' : 'false'});`;
    const ridesFocusJs =
      activeService === 'rides'
        ? `if(window.juaSetRidesMapFocus)window.juaSetRidesMapFocus(${JSON.stringify(ridesFocus)});`
        : '';
    wv.injectJavaScript(
      `setTimeout(function(){try{if(window.juaApplyHomeMode)window.juaApplyHomeMode(${JSON.stringify(
        mode,
      )}, false);${ridesFocusJs}${hlJs}${userJs}${pickupJs}}catch(e){}},80);true;`,
    );
  }, [
    activeService,
    staysSubTab,
    MAPBOX_ACCESS_TOKEN,
    serviceMapHtml,
    laundryMapHighlight,
    rideMapHighlight,
    rideWizardStep,
    serviceMapRidePinFocus,
    selectedDestination.coords,
    currentCoords,
    pickupAdjustMode,
  ]);

  const recenterMapOnUser = useCallback(() => {
    if (!currentCoords) {
      void fetchCurrentLocation();
      return;
    }
    setMapNeedsRecenter(false);
    setDraftPickupCoords(null);
    const wv = homeDeepPage === 'service-map' ? serviceMapWebViewRef.current : homeMainMapRef.current;
    if (!wv) return;
    wv.injectJavaScript(
      `setTimeout(function(){try{if(window.juaRecenterMap)window.juaRecenterMap(${currentCoords.longitude},${currentCoords.latitude});}catch(e){}},60);true;`,
    );
  }, [currentCoords, homeDeepPage]);

  const injectRidesMapSync = useCallback(() => {
    const wv = homeMainMapRef.current;
    if (!wv || activeService !== 'rides' || !MAPBOX_ACCESS_TOKEN || !currentCoords) return;
    const userJs = `if(window.juaSetUserCoords)window.juaSetUserCoords({longitude:${currentCoords.longitude},latitude:${currentCoords.latitude}});`;
    const pickupJs = `if(window.juaSetPickupMode)window.juaSetPickupMode(${pickupAdjustMode ? 'true' : 'false'});`;
    wv.injectJavaScript(`setTimeout(function(){try{${userJs}${pickupJs}}catch(e){}},80);true;`);
  }, [activeService, MAPBOX_ACCESS_TOKEN, currentCoords, pickupAdjustMode]);

  const injectMapSync = useCallback(() => {
    injectHomeMapSync();
    injectRidesMapSync();
  }, [injectHomeMapSync, injectRidesMapSync]);

  useEffect(() => {
    injectMapSync();
  }, [injectMapSync]);

  useEffect(() => {
    if (!MAPBOX_ACCESS_TOKEN) return;
    const pad = homeMapCameraPad;
    injectMapViewportPad(homeMainMapRef, pad);
    injectMapViewportPad(staysHomeMapWebViewRef, pad);
    injectMapViewportPad(serviceMapWebViewRef, serviceMapViewportPad);
    injectMapViewportPad(listingsMapWebViewRef, serviceMapViewportPad);
  }, [MAPBOX_ACCESS_TOKEN, homeMapCameraPad, serviceMapViewportPad, injectMapViewportPad]);

  useEffect(() => {
    if (!MAPBOX_ACCESS_TOKEN) return;
    const banksJson = JSON.stringify({
      laundry: homeMapPinBanks.laundry.slice(0, 14).map((p) => ({
        id: p.id,
        title: p.title,
        subtitle: p.subtitle,
        kind: p.kind,
        coords: [p.coords.longitude, p.coords.latitude],
      })),
      bnbs: homeMapPinBanks.bnbs.slice(0, 50).map((p) => ({
        id: p.id,
        title: p.title,
        subtitle: p.subtitle,
        kind: p.kind,
        coords: [p.coords.longitude, p.coords.latitude],
      })),
      houses: homeMapPinBanks.houses.slice(0, 50).map((p) => ({
        id: p.id,
        title: p.title,
        subtitle: p.subtitle,
        kind: p.kind,
        coords: [p.coords.longitude, p.coords.latitude],
      })),
      rides: homeMapPinBanks.rides.slice(0, 14).map((p) => ({
        id: p.id,
        title: p.title,
        subtitle: p.subtitle,
        kind: p.kind,
        coords: [p.coords.longitude, p.coords.latitude],
      })),
      destinations: homeMapPinBanks.destinations.slice(0, 8).map((p) => ({
        id: p.id,
        title: p.title,
        subtitle: p.subtitle,
        kind: p.kind,
        coords: [p.coords.longitude, p.coords.latitude],
      })),
    });
    const js = `setTimeout(function(){try{if(window.juaUpdatePinBanks)window.juaUpdatePinBanks(${banksJson});}catch(e){}},60);true;`;
    homeMainMapRef.current?.injectJavaScript(js);
    serviceMapWebViewRef.current?.injectJavaScript(js);
  }, [MAPBOX_ACCESS_TOKEN, homeMapPinBanks]);

  useEffect(() => {
    if (activeService !== 'bnbs' && activeService !== 'houses') {
      setStaysSheetViewMode('list');
    }
  }, [activeService]);

  useEffect(() => {
    if (
      (activeService === 'bnbs' || activeService === 'houses') &&
      staysSheetViewMode === 'map' &&
      homeDeepPage === null
    ) {
      injectStaysHomeMapSync();
      if (!currentCoords) void fetchCurrentLocation();
    }
  }, [
    activeService,
    staysSheetViewMode,
    homeDeepPage,
    injectStaysHomeMapSync,
    staysSubTab,
    mapBnbs,
    mapHouses,
    staysRadiusKm,
    currentCoords,
  ]);

  const refreshListingsForArea = useCallback(() => {
    if (listingCounty === 'any') {
      void refreshAllListingsCatalog();
      return;
    }
    if (listingCounty !== 'near_me') {
      void refreshListingsCatalog(listingCounty);
      return;
    }
    if (currentCoords) {
      void refreshNearbyListings(
        currentCoords.latitude,
        currentCoords.longitude,
        Math.max(staysRadiusKm, listingRadiusKm),
      );
      return;
    }
    void refreshAllListingsCatalog();
  }, [
    currentCoords,
    listingCounty,
    staysRadiusKm,
    listingRadiusKm,
    refreshNearbyListings,
    refreshAllListingsCatalog,
    refreshListingsCatalog,
  ]);

  useEffect(() => {
    if (listingCounty === 'any') {
      void refreshAllListingsCatalog();
      return;
    }
    if (listingCounty !== 'near_me') {
      void refreshListingsCatalog(listingCounty);
      return;
    }
    if (!currentCoords) return;
    void refreshNearbyListings(
      currentCoords.latitude,
      currentCoords.longitude,
      Math.max(staysRadiusKm, listingRadiusKm),
    );
  }, [
    currentCoords?.latitude,
    currentCoords?.longitude,
    listingCounty,
    staysRadiusKm,
    listingRadiusKm,
    refreshNearbyListings,
    refreshAllListingsCatalog,
    refreshListingsCatalog,
  ]);

  const handleListingCountyChange = useCallback((key: string) => {
    setListingCounty(key as ListingCatalogArea);
  }, []);

  useEffect(() => {
    if (staysSheetViewMode !== 'map' || homeDeepPage !== null) return;
    injectMapHighlight(staysHomeMapWebViewRef, staysHomeMapHighlight);
  }, [staysSheetViewMode, homeDeepPage, staysHomeMapHighlight, injectMapHighlight, selectedBnbId, selectedHouseId]);

  useEffect(() => {
    const prev = prevGpsCountyRef.current;
    if (prev !== listingsCounty) {
      if (listingCounty === prev && listingsCounty) {
        setListingCounty(listingsCounty);
      }
      prevGpsCountyRef.current = listingsCounty;
    }
  }, [listingsCounty, listingCounty]);

  /** Full pilot catalog loads once on mount in useAppData — no duplicate retries here. */

  useEffect(() => {
    if (currentCoords) return;
    const fromProfile = profile?.county ? normalizeCountyKey(profile.county) : null;
    if (fromProfile) setCurrentCounty(fromProfile);
  }, [profile?.county, currentCoords]);

  useEffect(() => {
    if (homeDeepPage === 'listings') {
      if (!currentCoords) void fetchCurrentLocation();
    }
  }, [homeDeepPage, listingCounty, currentCoords]);

  useEffect(() => {
    if (homeDeepPage === 'service-map') {
      setServiceMapRidePinFocus(null);
      injectServiceMapSync();
      if (!currentCoords) void fetchCurrentLocation();
    }
    if (homeDeepPage !== 'listings') {
      setListingsViewMode('list');
      setListingsMapSelectedId(null);
    }
  }, [homeDeepPage, injectServiceMapSync, rideWizardStep, laundryWizardStep, activeService, currentCoords]);

  useEffect(() => {
    setListingsMapSelectedId(null);
  }, [listingCatalog, listingCounty, listingRadiusKm]);

  useEffect(() => {
    if (activeSegment !== 'home') setHomeHubCarouselActive(false);
  }, [activeSegment]);

  useEffect(() => {
    if (homeDeepPage === 'listings' && listingsViewMode === 'map') {
      injectListingsMapSync();
      if (!currentCoords) void fetchCurrentLocation();
    }
  }, [
    homeDeepPage,
    listingsViewMode,
    injectListingsMapSync,
    listingCatalog,
    listingCounty,
    listingRadiusKm,
    catalogBnbs,
    catalogHouses,
    currentCoords,
  ]);

  useEffect(() => {
    if (homeDeepPage !== 'listings' || listingsViewMode !== 'map') return;
    injectMapHighlight(listingsMapWebViewRef, listingsMapHighlight);
  }, [homeDeepPage, listingsViewMode, listingsMapHighlight, injectMapHighlight, listingsMapSelectedId]);

  useEffect(() => {
    if (isActiveTripMode && activeService === 'rides' && servicePhase.rides === 'active_trip') {
      setHomeSheetStageAnimated('collapsed');
    }
  }, [isActiveTripMode, activeService, servicePhase.rides, setHomeSheetStageAnimated]);

  useEffect(() => {
    return () => {
      if (bookingToastTimerRef.current) clearTimeout(bookingToastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (destinationSearchOpen) {
      setHomeSheetStageAnimated('full');
    }
  }, [destinationSearchOpen, setHomeSheetStageAnimated]);

  useEffect(() => {
    if (servicePhase.rides === 'route_preview' && homeSheetStage === 'collapsed') {
      setHomeSheetStageAnimated('mid');
    }
  }, [servicePhase.rides, homeSheetStage, setHomeSheetStageAnimated]);

  const guidanceMapHtml = useMemo(() => {
    if (!MAPBOX_ACCESS_TOKEN || !guidedJourney) return null;
    const ui: GuidanceUiTheme = {
      canvas: theme.canvas,
      surface: theme.sheet,
      text: theme.textPrimary,
      textMuted: theme.textMuted,
      gold: BRAND.gold,
      isDark: themeMode === 'dark',
    };
    return buildGuidanceMapHtml(
      MAPBOX_ACCESS_TOKEN,
      theme.mapStyleId,
      guidedJourney.origin,
      guidedJourney.end,
      guidedJourney.title,
      guidedJourney.subtitle,
      ui,
    );
  }, [
    MAPBOX_ACCESS_TOKEN,
    theme.mapStyleId,
    theme.canvas,
    theme.sheet,
    theme.textPrimary,
    theme.textMuted,
    themeMode,
    guidedJourney,
  ]);

  const isInKenya = (coords: Coordinates) =>
    coords.latitude >= -5.2 &&
    coords.latitude <= 5.3 &&
    coords.longitude >= 33.4 &&
    coords.longitude <= 42.1;

  const getMapZoom = (distanceKm: number, destinationIsKenya: boolean) => {
    if (destinationIsKenya && distanceKm > 150) return 6.5;
    if (distanceKm < 5) return 13.8;
    if (distanceKm < 20) return 11.8;
    if (distanceKm < 80) return 10.2;
    if (distanceKm < 250) return 8.8;
    if (distanceKm < 700) return 7.2;
    return destinationIsKenya ? 6.2 : 5.5;
  };

  const rememberRecentSearch = (entry: Suggestion) => {
    setRecentSearches((previous) => {
      const deduped = previous.filter(
        (item) =>
          item.subtitle.toLowerCase() !== entry.subtitle.toLowerCase() ||
          item.coords.latitude !== entry.coords.latitude ||
          item.coords.longitude !== entry.coords.longitude,
      );
      return [entry, ...deduped].slice(0, 5);
    });
  };

  const applyLocationCoords = useCallback((coords: Coordinates, countyHint?: CountyKey | null) => {
    setCurrentCoords(coords);
    const countyFromCoords = countyHint ?? detectCountyFromCoords(coords);
    if (countyFromCoords) setCurrentCounty(countyFromCoords);
    const displayName = summarizeLocationFromCoords(
      coords,
      countyFromCoords || currentCounty || listingsCounty || 'kisumu',
    );
    const preciseCoords = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
    setCurrentLocationLabel(displayName);
    setCurrentPickupLocation(preciseCoords);
    setLocationError('');
  }, [currentCounty, listingsCounty]);

  const geocodeLocationLabel = useCallback(
    async (coords: Coordinates) => {
      if (!MAPBOX_ACCESS_TOKEN) return;
      try {
        const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.longitude},${coords.latitude}.json?types=address,locality,place,district,region&limit=5&access_token=${MAPBOX_ACCESS_TOKEN}`;
        const geocodeResponse = await fetch(geocodeUrl);
        if (!geocodeResponse.ok) return;
        const geocodeData = await geocodeResponse.json();
        const feature = geocodeData?.features?.[0];
        const placeName = feature?.place_name;
        const textCandidates: string[] = [];
        const features = Array.isArray(geocodeData?.features) ? geocodeData.features : [];
        for (const item of features) {
          if (item?.text) textCandidates.push(String(item.text));
          if (item?.place_name) textCandidates.push(String(item.place_name));
          const context = Array.isArray(item?.context) ? item.context : [];
          for (const entry of context) {
            if (entry?.text) textCandidates.push(String(entry.text));
            if (entry?.short_code) textCandidates.push(String(entry.short_code));
          }
        }
        const detectedFromText = textCandidates.map(normalizeCountyKey).find(Boolean) || null;
        if (detectedFromText) setCurrentCounty(detectedFromText);
        const preciseCoords = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
        if (placeName) {
          setCurrentLocationLabel(toReadableLocationName(placeName));
          setCurrentPickupLocation(`${placeName} (${preciseCoords})`);
        }
      } catch {
        // Coordinate fallback from applyLocationCoords is sufficient.
      }
    },
    [],
  );

  const fetchCurrentLocation = async () => {
    setLocationLoading(true);
    setLocationError('');
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setLocationError('Turn on location services in your phone settings, then tap ◎ again.');
        setCurrentLocationLabel('Location services off');
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied. Enable it in Settings to book from your exact position.');
        setCurrentLocationLabel('Location unavailable');
        setCurrentPickupLocation('Location unavailable');
        return;
      }

      let position: Location.LocationObject | null = null;
      const positionOptions: Location.LocationOptions[] = [
        { accuracy: Location.Accuracy.Low },
        { accuracy: Location.Accuracy.Balanced },
        { accuracy: Location.Accuracy.High },
      ];
      for (const options of positionOptions) {
        try {
          position = await Location.getCurrentPositionAsync(options);
          if (position) break;
        } catch {
          // Try the next accuracy preset.
        }
      }
      if (!position) {
        position = await Location.getLastKnownPositionAsync();
      }
      if (!position) {
        setLocationError('GPS fix unavailable. Step outside or tap ◎ to retry.');
        setCurrentLocationLabel('Locating…');
        return;
      }

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      applyLocationCoords(coords);
      void geocodeLocationLabel(coords);
    } catch {
      setLocationError('Unable to retrieve your location right now. Tap ◎ to retry.');
      setCurrentLocationLabel('Location unavailable');
      setCurrentPickupLocation('Location unavailable');
    } finally {
      setLocationLoading(false);
    }
  };

  const fetchRouteEstimate = async () => {
    if (!currentCoords || !MAPBOX_ACCESS_TOKEN) {
      setRouteDistanceKm(null);
      setRouteDurationMin(null);
      setRouteCoordinates([]);
      return;
    }

    setRouteLoading(true);
    try {
      const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${currentCoords.longitude},${currentCoords.latitude};${selectedDestination.coords.longitude},${selectedDestination.coords.latitude}?overview=full&geometries=geojson&alternatives=true&access_token=${MAPBOX_ACCESS_TOKEN}`;
      const response = await fetch(directionsUrl);
      const data = await response.json();
      const routes = data?.routes;
      if (!routes?.length) {
        setRouteDistanceKm(null);
        setRouteDurationMin(null);
        setRouteCoordinates([]);
        return;
      }
      const bestRoute = routes.reduce((best: any, candidate: any) =>
        candidate.duration < best.duration ? candidate : best,
      );
      setRouteDistanceKm(Number((bestRoute.distance / 1000).toFixed(1)));
      setRouteDurationMin(Math.max(1, Math.round(bestRoute.duration / 60)));
      setRouteCoordinates(bestRoute.geometry?.coordinates || []);
    } catch {
      setRouteDistanceKm(null);
      setRouteDurationMin(null);
      setRouteCoordinates([]);
    } finally {
      setRouteLoading(false);
    }
  };

  const searchDestination = async () => {
    const query = destinationQuery.trim();
    if (!query) {
      return;
    }
    if (!MAPBOX_ACCESS_TOKEN) {
      setLocationError('Mapbox token is required for destination search.');
      return;
    }

    setDestinationSearchLoading(true);
    setLocationError('');
    try {
      const proximity = currentCoords
        ? `&proximity=${currentCoords.longitude},${currentCoords.latitude}`
        : '';
      const focusKenya = /kenya|nairobi|mombasa|kisumu|nakuru|eldoret/i.test(query);
      const countryFilter = focusKenya ? '&country=ke' : '';
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?autocomplete=true&limit=1${proximity}${countryFilter}&access_token=${MAPBOX_ACCESS_TOKEN}`;
      const response = await fetch(url);
      const data = await response.json();
      const feature = data?.features?.[0];
      if (!feature?.center) {
        setLocationError('No destination found. Try another search term.');
        return;
      }
      const searchedDestination: Destination = {
        id: `search-${Date.now()}`,
        name: feature.text || query,
        subtitle: feature.place_name || 'Selected destination',
        coords: { latitude: feature.center[1], longitude: feature.center[0] },
        image: IMG.mapPin,
        exploreReason: 'Your searched spot — open Explore to compare nearby pins on the map.',
      };
      setSelectedDestination(searchedDestination);
      setDestinationSuggestions([]);
      setDestinationQuery(searchedDestination.subtitle);
      setDestinationSearchOpen(false);
      rememberRecentSearch({
        id: searchedDestination.id,
        name: searchedDestination.name,
        subtitle: searchedDestination.subtitle,
        coords: searchedDestination.coords,
      });
      setBookingMessage('');
    } catch {
      setLocationError('Destination search failed. Please try again.');
      setDestinationSuggestions([]);
    } finally {
      setDestinationSearchLoading(false);
    }
  };

  const fetchDestinationSuggestions = async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || !MAPBOX_ACCESS_TOKEN) {
      setDestinationSuggestions([]);
      return;
    }
    try {
      const proximity = currentCoords
        ? `&proximity=${currentCoords.longitude},${currentCoords.latitude}`
        : '';
      const focusKenya = /kenya|nairobi|mombasa|kisumu|nakuru|eldoret|westlands/i.test(trimmed);
      const countryFilter = focusKenya ? '&country=ke' : '';
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?autocomplete=true&limit=5${proximity}${countryFilter}&access_token=${MAPBOX_ACCESS_TOKEN}`;
      const response = await fetch(url);
      const data = await response.json();
      const suggestions: Suggestion[] = (data?.features || [])
        .filter((feature: any) => Array.isArray(feature?.center) && feature.center.length === 2)
        .map((feature: any, index: number) => ({
          id: `${feature.id || feature.place_name || 'suggestion'}-${index}`,
          name: feature.text || trimmed,
          subtitle: feature.place_name || 'Selected destination',
          coords: { latitude: feature.center[1], longitude: feature.center[0] },
        }));
      setDestinationSuggestions(suggestions);
    } catch {
      setDestinationSuggestions([]);
    }
  };

  const selectSuggestion = (suggestion: Suggestion) => {
    setSelectedDestination({
      id: `search-${Date.now()}`,
      name: suggestion.name,
      subtitle: suggestion.subtitle,
      coords: suggestion.coords,
      image: IMG.mapPin,
      exploreReason: 'Saved from search — see Explore for curated picks on the map.',
    });
    setDestinationQuery(suggestion.subtitle);
    setDestinationSuggestions([]);
    setDestinationSearchOpen(false);
    rememberRecentSearch(suggestion);
    Keyboard.dismiss();
    setBookingMessage('');
  };

  useEffect(() => {
    fetchCurrentLocation();
  }, []);

  const reloadListingRequests = useCallback(async () => {
    if (!isAuthed) {
      setListingRequests([]);
      return;
    }
    let baseRequests: ListingRequest[];
    try {
      const { requests } = await fetchMyListingRequests();
      baseRequests = requests;
    } catch {
      // Keep existing in-memory requests; legacy feedback fallback is deprecated.
      return;
    }

    // The list endpoint omits message threads, so a plain list reload can never
    // detect a new admin/system reply. Hydrate messages for active requests via
    // the detail endpoint so notifications track in real time even when no chat
    // sheet is open. Bounded to keep the poll light.
    const activeIds = baseRequests
      .filter((r) => isActiveListingRequest(r.status))
      .slice(0, 20)
      .map((r) => r.id);
    const messagesById = new Map<string, ListingRequestMessage[]>();
    if (activeIds.length > 0) {
      const details = await Promise.allSettled(activeIds.map((id) => fetchListingRequest(id)));
      details.forEach((res, i) => {
        if (res.status === 'fulfilled' && res.value?.request) {
          messagesById.set(activeIds[i], res.value.request.messages ?? []);
        }
      });
    }

    setListingRequests((previous) =>
      baseRequests.map((incoming) => {
        const hydrated = messagesById.has(incoming.id)
          ? { ...incoming, messages: messagesById.get(incoming.id) }
          : incoming;
        return mergeListingRequestWithLocalMessages(
          previous.find((row) => row.id === incoming.id),
          hydrated,
        );
      }),
    );
  }, [isAuthed]);

  const lastSeenReqStatusRef = useRef(new Map<string, string>());
  const lastSeenLaundryStatusRef = useRef(new Map<string, string>());
  const lastSeenReqMessageRef = useRef(new Map<string, string>());
  const activityRealtimePrimedRef = useRef(false);
  const activityRealtimeBusyRef = useRef(false);
  const activityViewedRef = useRef<ActivityViewedSnapshot>(emptyActivityViewed());
  const activityViewPrimedRef = useRef(false);
  const [activityViewedTick, setActivityViewedTick] = useState(0);

  const bumpActivityViewed = useCallback(() => {
    setActivityViewedTick((v) => v + 1);
  }, []);

  const markListingRequestViewed = useCallback(
    (requestId: string) => {
      const req = listingRequests.find((r) => r.id === requestId);
      if (!req) return;
      activityViewedRef.current.requestStatus.set(requestId, req.status);
      activityViewedRef.current.requestMessages.set(requestId, listingRequestMessageKey(req));
      bumpActivityViewed();
    },
    [listingRequests, bumpActivityViewed],
  );

  const markStayBookingViewed = useCallback(
    (bookingId: string) => {
      const booking = bnbBookings.find((b) => b.id === bookingId);
      if (!booking) return;
      activityViewedRef.current.stayStatus.set(bookingId, booking.status);
      bumpActivityViewed();
    },
    [bnbBookings, bumpActivityViewed],
  );

  const markLaundryOrderViewed = useCallback(
    (orderId: string) => {
      const order = laundryOrders.find((o) => o.id === orderId);
      if (!order) return;
      activityViewedRef.current.laundryStatus.set(orderId, `${order.status}:${order.currentStep}`);
      bumpActivityViewed();
    },
    [laundryOrders, bumpActivityViewed],
  );

  /** Mark every current request/order/stay as seen — used to clear the unread
   * section badge once the user has actually viewed the notifications. */
  const markAllActivityViewed = useCallback(() => {
    const viewed = activityViewedRef.current;
    for (const req of listingRequests) {
      viewed.requestStatus.set(req.id, req.status);
      viewed.requestMessages.set(req.id, listingRequestMessageKey(req));
    }
    for (const order of laundryOrders) {
      viewed.laundryStatus.set(order.id, `${order.status}:${order.currentStep}`);
    }
    for (const booking of bnbBookings) {
      viewed.stayStatus.set(booking.id, booking.status);
    }
    bumpActivityViewed();
  }, [listingRequests, laundryOrders, bnbBookings, bumpActivityViewed]);

  const activityFeedItems = useMemo((): ActivityFeedItem[] => {
    if (!activityViewPrimedRef.current) return [];
    const viewed = activityViewedRef.current;
    const items: ActivityFeedItem[] = [];

    for (const req of listingRequests) {
      if (!isActiveListingRequest(req.status)) continue;
      const title = listingRequestActivityTitle(req);
      const latest = req.messages?.[req.messages.length - 1];
      const msgKey = listingRequestMessageKey(req);
      const viewedMsg = viewed.requestMessages.get(req.id);
      if (
        latest &&
        (latest.senderRole === 'admin' || latest.senderRole === 'system') &&
        msgKey !== viewedMsg
      ) {
        items.push({
          id: `chat:req:${req.id}:${latest.createdAt}`,
          kind: 'chat',
          entity: 'listing_request',
          entityId: req.id,
          title,
          body: latest.body,
          timeLabel: new Date(latest.createdAt).toLocaleString('en-KE', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
          sortMs: Date.parse(latest.createdAt) || 0,
        });
      }
      const viewedStatus = viewed.requestStatus.get(req.id);
      if (viewedStatus !== undefined && req.status !== viewedStatus) {
        const statusLabel =
          req.statusLabel ?? LISTING_REQUEST_STATUS_LABELS[req.status] ?? req.status;
        items.push({
          id: `status:req:${req.id}:${req.status}`,
          kind: 'status',
          entity: 'listing_request',
          entityId: req.id,
          title,
          body: `Progress update · now ${statusLabel}`,
          timeLabel: new Date(req.updatedAt ?? req.createdAt).toLocaleString('en-KE', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
          sortMs: Date.parse(String(req.updatedAt ?? req.createdAt)) || 0,
        });
      }
    }

    for (const order of laundryOrders) {
      if (['delivered', 'cancelled'].includes(order.status)) continue;
      const statusKey = `${order.status}:${order.currentStep}`;
      const viewedKey = viewed.laundryStatus.get(order.id);
      if (viewedKey !== undefined && statusKey !== viewedKey) {
        items.push({
          id: `status:laundry:${order.id}:${statusKey}`,
          kind: 'status',
          entity: 'laundry',
          entityId: order.id,
          title: order.pickupLabel,
          body: `Order update · ${order.status.replace(/_/g, ' ')}`,
          timeLabel: new Date(order.createdAt).toLocaleString('en-KE', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
          sortMs: Date.now(),
        });
      }
    }

    for (const booking of bnbBookings) {
      if (!ACTIVE_BNB_BOOKING_STATUSES.has(booking.status)) continue;
      const viewedStatus = viewed.stayStatus.get(booking.id);
      if (viewedStatus !== undefined && booking.status !== viewedStatus) {
        items.push({
          id: `status:stay:${booking.id}:${booking.status}`,
          kind: 'status',
          entity: 'stay',
          entityId: booking.id,
          title: booking.listing?.title ?? 'BnB stay',
          body: `Stay update · ${String(booking.status).replace(/_/g, ' ')}`,
          timeLabel: new Date(booking.updatedAt ?? booking.createdAt).toLocaleString('en-KE', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
          sortMs: Date.parse(String(booking.updatedAt ?? booking.createdAt)) || 0,
        });
      }
    }

    return items.sort((a, b) => b.sortMs - a.sortMs);
  }, [listingRequests, laundryOrders, bnbBookings, activityViewedTick]);

  const activityUnreadByRequestId = useMemo(() => {
    const map = new Map<string, { chat: boolean; status: boolean }>();
    for (const item of activityFeedItems) {
      if (item.entity !== 'listing_request') continue;
      const prev = map.get(item.entityId) ?? { chat: false, status: false };
      if (item.kind === 'chat') prev.chat = true;
      if (item.kind === 'status') prev.status = true;
      map.set(item.entityId, prev);
    }
    return map;
  }, [activityFeedItems]);

  /** Latest message + unread state per listing request, so a follow-up card can
   * surface *which* request has an admin message (not just a bare badge count). */
  const listingRequestChatInfo = useMemo(() => {
    const map = new Map<
      string,
      { preview: string; fromAdmin: boolean; unread: boolean; timeLabel: string }
    >();
    const viewed = activityViewedRef.current;
    for (const req of listingRequests) {
      const latest = req.messages?.[req.messages.length - 1];
      if (!latest) continue;
      const fromAdmin = latest.senderRole === 'admin' || latest.senderRole === 'system';
      const unread =
        fromAdmin && listingRequestMessageKey(req) !== viewed.requestMessages.get(req.id);
      map.set(req.id, {
        preview: latest.body,
        fromAdmin,
        unread,
        timeLabel: new Date(latest.createdAt).toLocaleString('en-KE', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
      });
    }
    return map;
  }, [listingRequests, activityViewedTick]);

  const reloadLaundryOrders = useCallback(async () => {
    if (!isAuthed) return;
    try {
      const orders = await fetchLaundryOrders();
      setLaundryOrders(orders);
    } catch {
      /* keep existing */
    }
  }, [isAuthed]);

  const reloadSubscription = useCallback(async () => {
    if (!isAuthed) {
      setRentalSubscriptionActive(false);
      setActiveSubscriptionPlan(null);
      setActiveSubscriptionExpiresAt(null);
      return;
    }
    try {
      const { active, subscription } = await fetchActiveSubscription();
      setRentalSubscriptionActive(active);
      setActiveSubscriptionPlan(subscription?.plan ?? null);
      setActiveSubscriptionExpiresAt(subscription?.expiresAt ?? null);
    } catch {
      setRentalSubscriptionActive(false);
      setActiveSubscriptionPlan(null);
      setActiveSubscriptionExpiresAt(null);
    }
  }, [isAuthed]);

  const reloadBnbBookings = useCallback(async () => {
    if (!isAuthed) return;
    try {
      const bookings = await fetchBnbBookings();
      setBnbBookings(bookings);
    } catch {
      /* keep existing */
    }
  }, [isAuthed]);

  useEffect(() => {
    if (!isAuthed) {
      activityRealtimePrimedRef.current = false;
      activityViewPrimedRef.current = false;
      lastSeenReqStatusRef.current.clear();
      lastSeenLaundryStatusRef.current.clear();
      lastSeenReqMessageRef.current.clear();
      activityViewedRef.current = emptyActivityViewed();
      setActivityBellCount(0);
      setActivityChatCount(0);
      return;
    }

    const nextReqStatuses = new Map<string, string>();
    for (const req of listingRequests) {
      nextReqStatuses.set(req.id, req.status);
    }
    const nextLaundryStatuses = new Map<string, string>();
    for (const order of laundryOrders) {
      nextLaundryStatuses.set(order.id, `${order.status}:${order.currentStep}`);
    }
    const nextReqMessages = new Map<string, string>();
    for (const req of listingRequests) {
      const latest = req.messages?.[req.messages.length - 1];
      if (latest) nextReqMessages.set(req.id, `${latest.senderRole}:${latest.createdAt}`);
    }

    if (!activityRealtimePrimedRef.current) {
      lastSeenReqStatusRef.current = nextReqStatuses;
      lastSeenLaundryStatusRef.current = nextLaundryStatuses;
      lastSeenReqMessageRef.current = nextReqMessages;
      activityRealtimePrimedRef.current = true;
      return;
    }

    let bellDelta = 0;
    let chatDelta = 0;

    for (const [id, statusKey] of nextReqStatuses.entries()) {
      const prev = lastSeenReqStatusRef.current.get(id);
      if (prev && prev !== statusKey) bellDelta += 1;
    }
    for (const [id, statusKey] of nextLaundryStatuses.entries()) {
      const prev = lastSeenLaundryStatusRef.current.get(id);
      if (prev && prev !== statusKey) bellDelta += 1;
    }
    for (const [id, messageKey] of nextReqMessages.entries()) {
      const prev = lastSeenReqMessageRef.current.get(id);
      if (!prev || prev === messageKey) continue;
      const [senderRole] = messageKey.split(':');
      if (senderRole === 'admin' || senderRole === 'system') chatDelta += 1;
    }

    if (bellDelta > 0) setActivityBellCount((v) => v + bellDelta);
    if (chatDelta > 0) setActivityChatCount((v) => v + chatDelta);

    lastSeenReqStatusRef.current = nextReqStatuses;
    lastSeenLaundryStatusRef.current = nextLaundryStatuses;
    lastSeenReqMessageRef.current = nextReqMessages;
  }, [isAuthed, listingRequests, laundryOrders]);

  /** Seed viewed snapshot on first load so only new updates appear in the feed. */
  useEffect(() => {
    if (!isAuthed || activityViewPrimedRef.current) return;
    if (!activityRealtimePrimedRef.current) return;
    const viewed = activityViewedRef.current;
    for (const req of listingRequests) {
      viewed.requestStatus.set(req.id, req.status);
      viewed.requestMessages.set(req.id, listingRequestMessageKey(req));
    }
    for (const order of laundryOrders) {
      viewed.laundryStatus.set(order.id, `${order.status}:${order.currentStep}`);
    }
    for (const booking of bnbBookings) {
      viewed.stayStatus.set(booking.id, booking.status);
    }
    activityViewPrimedRef.current = true;
    bumpActivityViewed();
  }, [isAuthed, listingRequests, laundryOrders, bnbBookings, bumpActivityViewed]);

  useEffect(() => {
    if (!isAuthed) return;
    if (activeTab !== 'activity') return;
    setActivityBellCount(0);
    setActivityChatCount(0);
  }, [isAuthed, activeTab]);

  // Once the user is actually looking at the Follow-up section (where new
  // notifications surface), give them a moment to see the highlighted items,
  // then mark everything seen so the unread numbers clear and don't linger.
  useEffect(() => {
    if (!isAuthed) return;
    if (activeTab !== 'activity' || activitySection !== 'active') return;
    if (activityFeedItems.length === 0) return;
    const t = setTimeout(() => markAllActivityViewed(), 1600);
    return () => clearTimeout(t);
  }, [isAuthed, activeTab, activitySection, activityFeedItems, markAllActivityViewed]);

  useEffect(() => {
    if (!isAuthed) return;
    void (async () => {
      await reloadLaundryOrders();
      await reloadSubscription();
      await reloadBnbBookings();
      await reloadListingRequests();
    })();
  }, [isAuthed, reloadLaundryOrders, reloadSubscription, reloadBnbBookings, reloadListingRequests]);

  useEffect(() => {
    if (!isAuthed) return;
    let mounted = true;
    const pollMs = activeTab === 'activity' ? 10000 : 20000;
    const tick = async () => {
      if (!mounted || activityRealtimeBusyRef.current) return;
      if (activitySocketConnected) return;
      if (AppState.currentState !== 'active') return;
      activityRealtimeBusyRef.current = true;
      try {
        await reloadLaundryOrders();
        await reloadBnbBookings();
        await reloadListingRequests();
      } finally {
        activityRealtimeBusyRef.current = false;
      }
    };
    const timer = setInterval(() => {
      void tick();
    }, pollMs);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [isAuthed, activeTab, activitySocketConnected, reloadLaundryOrders, reloadBnbBookings, reloadListingRequests]);

  useEffect(() => {
    if (!isAuthed) {
      setActivitySocketConnected(false);
      return;
    }
    let mounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelayMs = 1500;
    let abortController: AbortController | null = null;

    const reloadActivity = () => {
      if (!mounted || activityRealtimeBusyRef.current) return;
      activityRealtimeBusyRef.current = true;
      void (async () => {
        try {
          await reloadLaundryOrders();
          await reloadBnbBookings();
          await reloadListingRequests();
        } finally {
          activityRealtimeBusyRef.current = false;
        }
      })();
    };

    const scheduleReconnect = () => {
      if (!mounted) return;
      setActivitySocketConnected(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 15000);
        void connect();
      }, reconnectDelayMs);
    };

    const connect = async () => {
      try {
        const base = getApiBaseUrl();
        const token = await getStoredToken();
        if (!mounted || !base || !token) return;

        abortController?.abort();
        abortController = new AbortController();

        const streamUrl = `${base.replace(/\/$/, '')}/api/v1/activity/stream?token=${encodeURIComponent(token)}`;
        const response = await fetch(streamUrl, {
          headers: { Accept: 'text/event-stream' },
          signal: abortController.signal,
        });
        if (!response.ok || !response.body || typeof response.body.getReader !== 'function') {
          scheduleReconnect();
          return;
        }

        reconnectDelayMs = 1500;
        setActivitySocketConnected(true);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (mounted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';
          for (const chunk of chunks) {
            const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
            if (!dataLine) continue;
            try {
              const payload = JSON.parse(dataLine.slice(6)) as { type?: string };
              if (payload.type !== 'activity_update') continue;
              reloadActivity();
            } catch {
              // ignore malformed SSE payloads
            }
          }
        }

        if (mounted) scheduleReconnect();
      } catch (err) {
        if (!mounted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        scheduleReconnect();
      }
    };

    void connect();
    return () => {
      mounted = false;
      setActivitySocketConnected(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      abortController?.abort();
    };
  }, [isAuthed, reloadLaundryOrders, reloadBnbBookings, reloadListingRequests]);

  /** Chat fallback: while request sheet is open, poll fast for near-live messages. */
  useEffect(() => {
    if (!isAuthed || !listingRequestSheetId) return;
    let mounted = true;
    const tick = async () => {
      if (!mounted || activityRealtimeBusyRef.current) return;
      activityRealtimeBusyRef.current = true;
      try {
        await reloadListingRequests();
        const { request } = await fetchListingRequest(listingRequestSheetId);
        if (!mounted) return;
        setListingRequestDetail((prev) => mergeListingRequestWithLocalMessages(prev, request));
        setListingRequests((prev) =>
          prev.map((r) => (r.id === request.id ? mergeListingRequestWithLocalMessages(r, request) : r)),
        );
      } finally {
        activityRealtimeBusyRef.current = false;
      }
    };
    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 3500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [isAuthed, listingRequestSheetId, reloadListingRequests]);

  useEffect(() => {
    if (!isAuthed) return;
    const catalogIds = new Set(bnbListings.map((listing) => listing.id));
    const toFetch = [
      ...new Set(
        bnbBookings
          .filter((booking) => ACTIVE_BNB_BOOKING_STATUSES.has(booking.status))
          .map((booking) => booking.listingId)
          .filter((listingId) => !catalogIds.has(listingId)),
      ),
    ];
    if (toFetch.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const listingId of toFetch) {
        try {
          const detail = await fetchListingDetail(listingId);
          if (cancelled) return;
          setBookedListingSnapshots((prev) =>
            prev[listingId] ? prev : { ...prev, [listingId]: adaptBnbListing(detail) },
          );
        } catch {
          /* stub row is enough until catalog reload */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthed, bnbBookings, bnbListings]);

  useEffect(() => {
    if (!listingDetail) {
      setListingDetailLive(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchListingDetail(listingDetail.id);
        if (!cancelled) setListingDetailLive(detail);
      } catch {
        if (!cancelled) setListingDetailLive(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingDetail?.id, isAuthed, rentalSubscriptionActive, bnbBookings.length]);

  const handlePullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    setPullProgress(1);
    try {
      // Sequential — parallel requests exhaust Vercel/Aiven DB connection budget.
      await refreshAppData('pilot');
      if (isAuthed) {
        await reloadLaundryOrders();
        await reloadSubscription();
        await reloadBnbBookings();
        await reloadListingRequests();
        await refreshProfile();
      }
    } finally {
      setPullRefreshing(false);
      setPullProgress(0);
    }
  }, [
    refreshAppData,
    isAuthed,
    reloadLaundryOrders,
    reloadSubscription,
    reloadBnbBookings,
    reloadListingRequests,
    refreshProfile,
  ]);

  const onSheetScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      sheetScrollY.current = y;
      const hasMore = sheetContentH.current > sheetViewportH.current + 12;
      const atBottom = y + sheetViewportH.current >= sheetContentH.current - 28;
      setSheetHasMoreBelow(hasMore && !atBottom);

      if (pullRefreshing) return;
      if (homeDeepPage === 'listings' && listingsViewMode === 'list') {
        setListingsFiltersCollapsedAnimated(y > 52);
      }
      if (Platform.OS === 'ios' && y < 0) {
        setPullProgress(Math.min(1, Math.abs(y) / PULL_REFRESH_THRESHOLD));
        return;
      }
      setPullProgress((p) => (p === 0 ? p : 0));
    },
    [pullRefreshing, homeDeepPage, listingsViewMode, setListingsFiltersCollapsedAnimated],
  );

  useEffect(() => {
    if (homeDeepPage !== 'listings' || listingsViewMode !== 'list') {
      listingsFiltersCollapsedRef.current = false;
      setListingsFiltersCollapsed(false);
    }
  }, [homeDeepPage, listingsViewMode]);

  const onSheetContentSizeChange = useCallback((_w: number, h: number) => {
    sheetContentH.current = h;
    const hasMore = h > sheetViewportH.current + 12;
    const atBottom = sheetScrollY.current + sheetViewportH.current >= h - 28;
    setSheetHasMoreBelow(hasMore && !atBottom);
  }, []);

  const onSheetLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    sheetViewportH.current = e.nativeEvent.layout.height;
    const hasMore = sheetContentH.current > sheetViewportH.current + 12;
    const atBottom = sheetScrollY.current + sheetViewportH.current >= sheetContentH.current - 28;
    setSheetHasMoreBelow(hasMore && !atBottom);
  }, []);

  const onSheetScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pullRefreshing) return;
      if (e.nativeEvent.contentOffset.y >= 0) {
        setPullProgress(0);
      }
    },
    [pullRefreshing],
  );

  const showPullRefreshStrip = pullRefreshing || pullProgress > 0.08;
  const pullRefreshLabel = pullRefreshing
    ? 'Refreshing…'
    : pullProgress >= 1
      ? 'Release to refresh'
      : 'Pull to refresh';

  const submitListingRequest = useCallback(
    async (
      kind: ListingRequestKind,
      listingId: string,
      listingTitle: string,
      catalog: 'bnb' | 'house',
      opts?: { closeDeepPage?: boolean; pickupMode?: 'taxi' | 'rider'; userNote?: string },
    ) => {
      if (!isAuthed) {
        setBookingMessage('Sign in to request tours, viewings, and stays');
        return;
      }
      setRequestSubmitting(true);
      const service = catalog === 'bnb' ? 'bnb' : 'rental';
      const title =
        kind === 'tour' ? '3D tour request' : kind === 'viewing' ? 'Viewing request' : 'Stay reservation';
      const trimmedNote = opts?.userNote?.trim();
      try {
        const { request } = await createListingRequest({
          listingId,
          kind,
          pickupMode: kind === 'viewing' ? opts?.pickupMode : undefined,
          userNote: trimmedNote || undefined,
        });
        const optimisticUserMessage: ListingRequestMessage | null = trimmedNote
          ? {
              id: `local-note-${Date.now()}`,
              senderRole: 'user',
              body: trimmedNote,
              createdAt: new Date().toISOString(),
            }
          : null;
        setListingRequests((prev) => {
          const existing = prev.find((r) => r.id === request.id);
          const incoming: ListingRequest = {
            ...request,
            statusLabel: request.statusLabel ?? LISTING_REQUEST_STATUS_LABELS[request.status] ?? 'Requested',
            messages: mergeRequestMessages(
              request.messages,
              optimisticUserMessage ? [optimisticUserMessage] : [],
            ),
          };
          if (existing) {
            return prev.map((r) => (r.id === request.id ? mergeListingRequestWithLocalMessages(r, incoming) : r));
          }
          return [incoming, ...prev];
        });
        setViewingRequestTarget(null);
        flashBookingNotice(`${title} submitted — track updates in Activity`, { goTrips: true });
        setPhaseForService('bnbs', 'confirmed');
        if (opts?.closeDeepPage) {
          setHomeDeepPage(null);
          setListingDetail(null);
        }
      } catch (primaryErr) {
        try {
          const pickupLine =
            kind === 'viewing' && opts?.pickupMode
              ? ` Pickup preference: ${opts.pickupMode === 'taxi' ? 'car/taxi' : 'motorbike rider'}.`
              : '';
          const noteLine = trimmedNote ? ` Note: ${trimmedNote}` : '';
          const body = `I would like to request a ${kind} for "${listingTitle}".${pickupLine}${noteLine} Please follow up via the app.`;
          const { feedback } = await submitFeedback({
            service,
            category: 'suggestion',
            title,
            body,
            listingId,
          });
          setListingRequests((prev) => {
            if (prev.some((r) => r.id === feedback.id)) return prev;
            return [
              {
                id: feedback.id,
                listingId,
                listingTitle,
                kind,
                service,
                status: feedback.status === 'new' ? 'requested' : feedback.status,
                statusLabel: LISTING_REQUEST_STATUS_LABELS.requested,
                pickupMode: opts?.pickupMode ?? null,
                pickupModeLabel: opts?.pickupMode
                  ? opts.pickupMode === 'taxi'
                    ? 'Car / taxi pickup'
                    : 'Motorbike rider'
                  : null,
                createdAt: feedback.createdAt,
                messages: trimmedNote
                  ? [
                      {
                        id: `local-note-${Date.now()}`,
                        senderRole: 'user',
                        body: trimmedNote,
                        createdAt: new Date().toISOString(),
                      },
                    ]
                  : [],
              },
              ...prev,
            ];
          });
          setViewingRequestTarget(null);
          flashBookingNotice(`${title} submitted — check Activity`, { goTrips: true });
          setPhaseForService('bnbs', 'confirmed');
          if (opts?.closeDeepPage) {
            setHomeDeepPage(null);
            setListingDetail(null);
          }
        } catch (fallbackErr) {
          setBookingMessage(
            fallbackErr instanceof Error ? fallbackErr.message : 'Could not submit request — try again',
          );
        }
      } finally {
        setRequestSubmitting(false);
      }
    },
    [flashBookingNotice, isAuthed],
  );

  const openViewingRequestSheet = useCallback(
    (
      listingId: string,
      listingTitle: string,
      catalog: 'bnb' | 'house',
      opts?: { closeDeepPage?: boolean; priceLabel?: string },
    ) => {
      if (!isAuthed) {
        setBookingMessage('Sign in to request viewings');
        return;
      }
      if (catalog === 'house' && !rentalSubscriptionActive) {
        setSubscriptionSheetOpen(true);
        return;
      }
      setViewingRequestTarget({ listingId, listingTitle, catalog, ...opts });
    },
    [isAuthed, rentalSubscriptionActive],
  );

  const requestRideToListing = useCallback(
    async (listingId: string, listingTitle: string, catalog: 'bnb' | 'house') => {
      if (!isAuthed) {
        setBookingMessage('Sign in to request a ride');
        return;
      }
      setRequestSubmitting(true);
      try {
        await submitFeedback({
          service: catalog === 'bnb' ? 'bnb' : 'rental',
          category: 'suggestion',
          title: 'Ride to listing',
          body: `Please arrange a Jua ride to "${listingTitle}" for my viewing/stay.`,
          listingId,
        });
        flashBookingNotice('Ride request submitted — check Activity', { goTrips: true });
      } catch (err) {
        setBookingMessage(err instanceof Error ? err.message : 'Could not request ride');
      } finally {
        setRequestSubmitting(false);
      }
    },
    [isAuthed, flashBookingNotice],
  );

  const beginGuidedJourney = useCallback(
    (opts: { end: Coordinates; title: string; subtitle: string; kind: GuidedJourneyKind }) => {
      if (!MAPBOX_ACCESS_TOKEN) {
        setBookingMessage('Add EXPO_PUBLIC_MAPBOX_TOKEN for navigation.');
        return false;
      }
      if (!currentCoords) {
        setBookingMessage('We need your location — tap the location pill first.');
        void fetchCurrentLocation();
        return false;
      }
      setGuidedJourney({ ...opts, origin: currentCoords });
      return true;
    },
    [MAPBOX_ACCESS_TOKEN, currentCoords],
  );

  const startGuidedToListing = useCallback(
    (entity: HouseListing | BnbListing, kind: 'house' | 'bnb') => {
      const end = entity.exactCoords ?? entity.coords;
      beginGuidedJourney({
        end,
        title: entity.title,
        subtitle:
          kind === 'bnb'
            ? `${entity.county} · ${(entity as BnbListing).price}`
            : `${(entity as HouseListing).distanceKm} km · ${entity.price}`,
        kind,
      });
    },
    [beginGuidedJourney],
  );

  const openBookedStayDetail = useCallback(
    async (bookingId: string) => {
      markStayBookingViewed(bookingId);
      const booking = bnbBookings.find((b) => b.id === bookingId);
      if (!booking) return;
      setBookedStaySheetBooking(booking);
      setBookedStayListing(null);
      setBookedStayLoading(true);
      try {
        const detail = await fetchListingDetail(booking.listingId);
        setBookedStayListing(detail);
      } catch (err) {
        setBookingMessage(err instanceof Error ? err.message : 'Could not load stay details');
        setBookedStaySheetBooking(null);
      } finally {
        setBookedStayLoading(false);
      }
    },
    [bnbBookings, markStayBookingViewed],
  );

  const openListingRequestDetail = useCallback(
    async (requestId: string) => {
      markListingRequestViewed(requestId);
      setListingRequestSheetId(requestId);
      const cached = listingRequests.find((r) => r.id === requestId) ?? null;
      setListingRequestDetail(cached);
      setListingRequestSheetLoading(true);
      try {
        const { request } = await fetchListingRequest(requestId);
        setListingRequestDetail((prev) => mergeListingRequestWithLocalMessages(prev, request));
        setListingRequests((prev) =>
          prev.map((r) => (r.id === request.id ? mergeListingRequestWithLocalMessages(r, request) : r)),
        );
      } catch {
        if (!cached) {
          setListingRequestSheetId(null);
          setListingRequestDetail(null);
          setBookingMessage('Could not load request details');
        }
      } finally {
        setListingRequestSheetLoading(false);
      }
    },
    [listingRequests, markListingRequestViewed],
  );

  const handleListingRequestReply = useCallback(
    async (body: string) => {
      if (!listingRequestSheetId) return;
      setListingRequestReplySubmitting(true);
      try {
        const { request } = await replyToListingRequest(listingRequestSheetId, body);
        setListingRequestDetail((prev) => mergeListingRequestWithLocalMessages(prev, request));
        setListingRequests((prev) =>
          prev.map((r) => (r.id === request.id ? mergeListingRequestWithLocalMessages(r, request) : r)),
        );
      } catch (err) {
        setBookingMessage(err instanceof Error ? err.message : 'Could not send reply');
        throw err;
      } finally {
        setListingRequestReplySubmitting(false);
      }
    },
    [listingRequestSheetId],
  );

  const startTripToBookedStay = useCallback(() => {
    if (!bookedStayListing || !bookedStaySheetBooking) return;
    const entity = adaptBnbListing(bookedStayListing);
    const end = entity.exactCoords ?? entity.coords;
    const started = beginGuidedJourney({
      end,
      title: entity.title,
      subtitle: `${bookedStaySheetBooking.checkIn} → ${bookedStaySheetBooking.checkOut} · check-in`,
      kind: 'bnb',
    });
    if (started) {
      setBookedStaySheetBooking(null);
      setBookedStayListing(null);
    }
  }, [bookedStayListing, bookedStaySheetBooking, beginGuidedJourney]);

  const openBnbBooking = useCallback((id: string, title: string, price: string) => {
    if (!isAuthed) {
      setBookingMessage('Sign in to reserve a stay');
      return;
    }
    const existing = findActiveBnbBookingForListing(bnbBookings, id);
    if (existing) {
      void openBookedStayDetail(existing.id);
      return;
    }
    setBnbBookingTarget({ id, title, price });
    setBnbBookingSheetOpen(true);
  }, [isAuthed, bnbBookings, openBookedStayDetail]);

  const subscribeToKeja = useCallback(async (planId?: string) => {
    if (!isAuthed) {
      throw new Error('Sign in to unlock rentals and request viewings');
    }
    const planKey = planId ?? selectedSubscriptionPlan;
    const plan = subscriptionPlans.find((p) => p.plan === planKey) ?? subscriptionPlans[0];
    if (!plan) {
      throw new Error('Subscription plans unavailable');
    }
    setRequestSubmitting(true);
    try {
      const { subscription } = await createSubscription(plan.plan);
      // PRODUCTION_TODO: real M-Pesa STK — lib/production-todos.ts MPESA_SUBSCRIPTION
      const dummyReceipt = `DUMMY-MPESA-${Date.now()}`;
      const { subscription: paid } = await confirmSubscriptionPayment(subscription.id, dummyReceipt);
      setRentalSubscriptionActive(paid.active);
      setActiveSubscriptionPlan(paid.plan);
      setActiveSubscriptionExpiresAt(paid.expiresAt ?? null);
      setSubscriptionSheetOpen(false);
      flashBookingNotice('Subscription active — rental locations unlocked');
      if (listingDetail?.kind === 'house') {
        const detail = await fetchListingDetail(listingDetail.id);
        setListingDetailLive(detail);
      }
      await refreshProfile();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not subscribe';
      setBookingMessage(msg);
      throw err;
    } finally {
      setRequestSubmitting(false);
    }
  }, [isAuthed, subscriptionPlans, selectedSubscriptionPlan, flashBookingNotice, listingDetail, refreshProfile]);

  const bookBnbStay = useCallback(
    async (listingId: string, listingTitle: string, opts?: { stayOnListing?: boolean }) => {
      if (!isAuthed) {
        throw new Error('Sign in to reserve a stay');
      }
      const checkIn = new Date();
      checkIn.setDate(checkIn.getDate() + 1);
      const checkOut = new Date(checkIn);
      checkOut.setDate(checkOut.getDate() + 2);
      setRequestSubmitting(true);
      try {
        const { booking } = await createBnbBooking({
          listingId,
          checkIn: checkIn.toISOString().slice(0, 10),
          checkOut: checkOut.toISOString().slice(0, 10),
          guests: 2,
        });
        const dummyReceipt = `DUMMY-MPESA-${Date.now()}`;
        const { booking: confirmed } = await confirmBnbBookingPayment(booking.id, dummyReceipt);
        setBnbBookings((prev) => [confirmed, ...prev.filter((b) => b.id !== confirmed.id)]);
        setBnbBookingSheetOpen(false);
        setBnbBookingTarget(null);
        const detail = await fetchListingDetail(listingId);
        setListingDetailLive(detail);
        setBookedListingSnapshots((prev) => ({ ...prev, [listingId]: adaptBnbListing(detail) }));
        flashBookingNotice(
          opts?.stayOnListing
            ? 'Stay booked — exact address unlocked below'
            : `Stay booked — ${listingTitle}`,
          { goTrips: !opts?.stayOnListing },
        );
        await refreshProfile();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not book stay';
        setBookingMessage(msg);
        throw err;
      } finally {
        setRequestSubmitting(false);
      }
    },
    [isAuthed, flashBookingNotice, refreshProfile],
  );

  const buildLaundryOrderBody = useCallback(() => {
    const scheduleDate = new Date().toISOString().slice(0, 10);
    const scheduleBand = valetStudioWhen;
    const base = {
      pickupCounty: currentCounty ?? listingsCounty ?? 'kisumu',
      scheduleDate,
      scheduleBand,
      notes: valetStudioNotes.trim() || undefined,
    };
    if (laundryPickupMode === 'mamafua') {
      return {
        ...base,
        pickupMode: 'mamafua',
        pickupAddress: currentPickupLocation,
        pickupLat: currentCoords?.latitude,
        pickupLng: currentCoords?.longitude,
        tasks: selectedMamaFuaTasks,
        loadKg: selectedMamaFuaTasks.includes('laundry') ? laundryQuantity : 0,
      };
    }
    if (laundryPickupMode !== 'mamafua' && laundryStationId) {
      return {
        ...base,
        pickupMode: 'station',
        stationId: laundryStationId,
        loadKg: laundryMeasureMode === 'kg' ? laundryQuantity : 0,
        loadItems: laundryMeasureMode === 'items' ? laundryItemCount : undefined,
      };
    }
    return {
      ...base,
      pickupMode: 'door',
      pickupAddress: currentPickupLocation,
      pickupLat: currentCoords?.latitude,
      pickupLng: currentCoords?.longitude,
      loadKg: laundryMeasureMode === 'kg' ? laundryQuantity : 0,
      loadItems: laundryMeasureMode === 'items' ? laundryItemCount : undefined,
    };
  }, [
    currentCounty,
    currentCoords,
    currentPickupLocation,
    laundryItemCount,
    laundryMeasureMode,
    laundryPickupMode,
    laundryQuantity,
    laundryStationId,
    selectedMamaFuaTasks,
    valetStudioNotes,
    valetStudioWhen,
  ]);

  useEffect(() => {
    if (!isAuthed || activeService !== 'laundry' || laundryWizardStep !== 'review') return;
    let cancelled = false;
    (async () => {
      try {
        const est = await estimateLaundryOrder(buildLaundryOrderBody());
        if (!cancelled) setServerLaundryEstimate(est.estimateKes);
      } catch {
        if (!cancelled) setServerLaundryEstimate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthed, activeService, laundryWizardStep, buildLaundryOrderBody]);

  const lastBackPressRef = useRef(0);

  const handleHardwareBack = useCallback((): boolean => {
    if (tourSheetTarget) {
      setTourSheetTarget(null);
      return true;
    }
    if (guidedJourney) {
      setGuidedJourney(null);
      return true;
    }
    if (!isAuthed) {
      return false;
    }
    if (homeDeepPage === 'listing-detail') {
      setHomeDeepPage('listings');
      setListingDetail(null);
      return true;
    }
    if (homeDeepPage !== null) {
      setHomeDeepPage(null);
      setListingDetail(null);
      return true;
    }
    if (homeSheetStage === 'full') {
      setHomeSheetStageAnimated('mid');
      return true;
    }
    if (homeSheetStage === 'mid') {
      setHomeSheetStageAnimated('collapsed');
      return true;
    }
    if (activeTab !== 'home') {
      setActiveTab('home');
      setHomeSheetStageAnimated('collapsed');
      return true;
    }
    const now = Date.now();
    if (now - lastBackPressRef.current < 2000) {
      return false;
    }
    lastBackPressRef.current = now;
    setBookingMessage('Press back again to leave Jua X');
    setTimeout(() => setBookingMessage(''), 2200);
    return true;
  }, [
    tourSheetTarget,
    guidedJourney,
    isAuthed,
    homeDeepPage,
    homeSheetStage,
    activeTab,
    setHomeSheetStageAnimated,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => sub.remove();
  }, [handleHardwareBack]);


  useEffect(() => {
    fetchRouteEstimate();
  }, [selectedDestination.id, currentCoords]);

  useEffect(() => {
    setMapZoomOffset(0);
    setTripStarted(false);
    setSelectedHomeDetail(null);
  }, [selectedDestination.id]);

  useEffect(() => {
    setServicePhase((prev) => ({
      ...prev,
      [activeService]: prev[activeService] === 'idle' ? 'selecting' : prev[activeService],
    }));
  }, [activeService]);

  useEffect(() => {
    setHomeSheetStage('mid');
  }, [activeService]);

  useEffect(() => {
    setTourSheetTarget(null);
  }, [activeService, activeTab]);

  useEffect(() => {
    if (activeTab !== 'home') {
      setHomeSheetStage('collapsed');
    }
  }, [activeTab]);

  useEffect(() => {
    setExploreSheetStage('collapsed');
    setSelectedExploreCard(null);
    setExploreLens('discover');
  }, [activeTab]);

  useEffect(() => {
    if (routeDistanceKm !== null && currentCoords && selectedDestination) {
      setPhaseForService('rides', 'route_preview');
    }
  }, [routeDistanceKm, currentCoords, selectedDestination.id]);

  useEffect(() => {
    if (tripStarted) {
      setPhaseForService('rides', 'active_trip');
    }
  }, [tripStarted]);

  useEffect(() => {
    setLaundryStationId((prev) => {
      if (!prev) return null;
      return nearbyStations.some((s) => s.id === prev) ? prev : null;
    });
  }, [nearbyStations]);

  useEffect(() => {
    if (staysSubTab === 'bnb') {
      setSelectedHouseId(null);
    } else {
      setSelectedBnbId(null);
    }
  }, [staysSubTab]);

  useEffect(() => {
    setSelectedBnbId((prev) => (prev && nearbyBnbs.some((b) => b.id === prev) ? prev : null));
  }, [nearbyBnbs]);

  useEffect(() => {
    setSelectedHouseId((prev) => (prev && nearbyHouses.some((h) => h.id === prev) ? prev : null));
  }, [nearbyHouses]);

  useEffect(() => {
    setExploreRouteTarget(null);
    setSelectedExploreCard(null);
    setExploreReadHereTarget(null);
  }, [exploreScope, exploreLens]);

  useEffect(() => {
    setExploreSheetScope('all');
  }, [exploreLens]);

  useEffect(() => {
    if (homeDeepPage !== 'listing-detail' || !listingDetail) return;
    const ok =
      listingDetail.kind === 'bnb'
        ? mapBnbs.some((b) => b.id === listingDetail.id)
        : mapHouses.some((h) => h.id === listingDetail.id);
    if (!ok) {
      setListingDetail(null);
      setHomeDeepPage('listings');
    }
  }, [homeDeepPage, listingDetail, mapBnbs, mapHouses]);

  useLayoutEffect(() => {
    if (homeDeepPage !== 'listing-detail' || !listingDetail) return;
    listingDetailScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [homeDeepPage, listingDetail?.kind, listingDetail?.id]);

  const mapPreviewUrl = (() => {
    if (!MAPBOX_ACCESS_TOKEN) return null;

    const destinationIsKenya =
      isInKenya(selectedDestination.coords) || /kenya/i.test(selectedDestination.subtitle);

    if (!currentCoords) {
      const fallbackZoom = destinationIsKenya ? 7.2 : 8.2;
      const adjustedFallbackZoom = Math.min(14, Math.max(4.8, fallbackZoom + mapZoomOffset));
      return `https://api.mapbox.com/styles/v1/mapbox/${theme.mapStyleId}/static/pin-s-airport+FFFFFF(${selectedDestination.coords.longitude},${selectedDestination.coords.latitude})/${selectedDestination.coords.longitude},${selectedDestination.coords.latitude},${adjustedFallbackZoom},0/900x450?access_token=${MAPBOX_ACCESS_TOKEN}`;
    }

    const distanceKm = getDistanceKm(currentCoords, selectedDestination.coords);
    const baseZoom = getMapZoom(distanceKm, destinationIsKenya);
    const zoom = Math.min(15, Math.max(4.8, baseZoom + mapZoomOffset));
    const centerLon =
      distanceKm > 1200 ? selectedDestination.coords.longitude : (currentCoords.longitude + selectedDestination.coords.longitude) / 2;
    const centerLat =
      distanceKm > 1200 ? selectedDestination.coords.latitude : (currentCoords.latitude + selectedDestination.coords.latitude) / 2;
    const pins =
      distanceKm > 1200
        ? `pin-s-airport+FFFFFF(${selectedDestination.coords.longitude},${selectedDestination.coords.latitude})`
        : `pin-s-home+FFFFFF(${currentCoords.longitude},${currentCoords.latitude}),pin-s-airport+FFFFFF(${selectedDestination.coords.longitude},${selectedDestination.coords.latitude})`;
    return `https://api.mapbox.com/styles/v1/mapbox/${theme.mapStyleId}/static/${pins}/${centerLon},${centerLat},${zoom},0/900x450?access_token=${MAPBOX_ACCESS_TOKEN}`;
  })();

  const setPhaseForService = (service: ServiceType, phase: TripPhase) => {
    setServicePhase((prev) => ({ ...prev, [service]: phase }));
  };

  const cancelLiveTrip = useCallback(() => {
    setServicePhase((prev) => ({ ...prev, [activeService]: 'idle' }));
    setActiveTripInfo(null);
    setTripStarted(false);
    setRideWizardStep('pickup');
    setLaundryWizardStep('pickup');
    setHomeSheetStageAnimated('mid');
    setBookingMessage('Trip cancelled — ready for a new booking.');
  }, [activeService, setHomeSheetStageAnimated]);

  useEffect(() => {
    if (rideWizardStep !== 'matching') return;
    const t = setTimeout(() => setRideWizardStep('driver_eta'), 2200);
    return () => clearTimeout(t);
  }, [rideWizardStep]);

  useEffect(() => {
    if (rideWizardStep !== 'driver_eta') return;
    const t = setTimeout(() => setRideWizardStep('payment'), 2200);
    return () => clearTimeout(t);
  }, [rideWizardStep]);

  useEffect(() => {
    if (isActiveTripMode && activeService === 'rides') {
      setRideWizardStep('on_trip');
    }
  }, [isActiveTripMode, activeService]);

  useEffect(() => {
    if (activeSegment !== 'rides' && !isActiveTripMode) {
      setRideWizardStep('pickup');
    }
  }, [activeSegment, isActiveTripMode]);

  useEffect(() => {
    if (activeSegment !== 'laundry' && !isActiveTripMode) {
      setLaundryWizardStep('pickup');
    }
  }, [activeSegment, isActiveTripMode]);

  useEffect(() => {
    if (activeService === 'rides' && rideWizardStep === 'on_trip' && !isActiveTripMode) {
      setRideWizardStep('pickup');
    }
  }, [activeService, rideWizardStep, isActiveTripMode]);

  const currentServicePhase = servicePhase[activeService];

  const renderMapScene = ({
    service,
    html,
    previewUri,
    fallbackText,
    topBar,
    bottomSheet,
    useMapCard = false,
    outerStyle,
    fabColumnStyle,
  }: {
    service: ServiceType;
    html: string | null;
    previewUri?: string | null;
    fallbackText: string;
    topBar?: ReactNode;
    bottomSheet: ReactNode | null;
    useMapCard?: boolean;
    outerStyle?: ViewStyle;
    fabColumnStyle?: ViewStyle;
  }) => (
    <View style={[useMapCard ? styles.mapCard : styles.serviceMapCard, outerStyle]}>
      {html ? (
        <WebView
          source={{ html }}
          style={styles.mapImage}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          setSupportMultipleWindows={false}
          mixedContentMode="always"
          {...ANDROID_MAP_WEBVIEW_PROPS}
        />
      ) : previewUri ? (
        <Image source={{ uri: previewUri }} style={styles.mapImage} resizeMode="cover" />
      ) : (
        <ImageBackground source={require('./template/Preview 4.png')} style={styles.mapImage} resizeMode="cover">
          <View style={styles.mapOverlay}>
            <Text style={styles.mapOverlayText}>{fallbackText}</Text>
          </View>
        </ImageBackground>
      )}
      <View style={[styles.mapFabColumn, fabColumnStyle]}>
        <TouchableOpacity style={styles.mapControlButton} onPress={fetchCurrentLocation} activeOpacity={0.86}>
          <Text style={styles.mapControlLabel}>◎</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapControlButton} onPress={() => setMapZoomOffset(0)} activeOpacity={0.86}>
          <Text style={styles.mapControlLabel}>⌖</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={() => setMapZoomOffset((prev) => Math.min(4, prev + 0.8))}
          activeOpacity={0.86}
        >
          <Text style={styles.mapControlLabel}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={() => setMapZoomOffset((prev) => Math.max(-2.6, prev - 0.8))}
          activeOpacity={0.86}
        >
          <Text style={styles.mapControlLabel}>-</Text>
        </TouchableOpacity>
      </View>
      {topBar ? <View style={styles.mapTopSlot}>{topBar}</View> : null}
      {bottomSheet != null ? (
        <View style={styles.mapActionSheet}>
          <View style={styles.mapFlowRow}>
            <Text style={styles.mapFlowLabel}>Flow: {servicePhase[service].replace('_', ' ')}</Text>
          </View>
          {bottomSheet}
        </View>
      ) : null}
    </View>
  );

  const interactiveMapHtml = useMemo(() => {
    if (!MAPBOX_ACCESS_TOKEN || !currentCoords) return null;

    const routeFeature = JSON.stringify({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: routeCoordinates.length > 1
          ? routeCoordinates
          : [
              [currentCoords.longitude, currentCoords.latitude],
              [selectedDestination.coords.longitude, selectedDestination.coords.latitude],
            ],
      },
      properties: {},
    });

    const rideDropPinsJson = JSON.stringify(
      popularNearbyDestinations.slice(0, 12).map((d) => ({
        title: d.name,
        subtitle: d.subtitle,
        lng: d.coords.longitude,
        lat: d.coords.latitude,
        selected: d.id === selectedDestination.id ? 1 : 0,
      })),
    );

    const rideStartZoom = Math.min(13.4, Math.max(5, 9 + mapZoomOffset));
    const rideViewportPadJson = JSON.stringify(homeMapCameraPad);

    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"/>
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
    <style>
      html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; }
      ${MAP_INTERACTION_STYLES}
      .user-marker-wrap { width: 48px; height: 48px; position: relative; pointer-events: none; }
      .user-pulse-ring {
        position: absolute; left: 50%; top: 50%;
        width: 40px; height: 40px; margin-left: -20px; margin-top: -20px;
        border-radius: 50%; border: 2px solid rgba(34,197,94,0.65);
        animation: juxRidePulse 2s ease-out infinite;
      }
      .user-dot {
        position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; margin-left: -7px; margin-top: -7px;
        border-radius: 50%; background: #22c55e; border: 2px solid #fff;
        box-shadow: 0 1px 6px rgba(0,0,0,0.35);
      }
      @keyframes juxRidePulse {
        0% { transform: scale(0.55); opacity: 0.95; }
        70% { transform: scale(1.45); opacity: 0; }
        100% { opacity: 0; }
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    ${MAP_INTERACTION_HTML}
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
    <script>
      ${MAP_INTERACTION_JS}
      window.onerror = function () { return true; };
      const RIDE_DROPS = ${rideDropPinsJson};
      const VIEWPORT_PAD = ${rideViewportPadJson};
      mapboxgl.accessToken = '${MAPBOX_ACCESS_TOKEN}';
      const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/${theme.mapStyleId}',
        center: [${currentCoords.longitude}, ${currentCoords.latitude}],
        zoom: ${rideStartZoom}
      });
      map.touchZoomRotate.enable();
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new mapboxgl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
      map.on('load', () => {
        if (window.juaInstallMapInteraction) {
          window.juaInstallMapInteraction(map, { longitude: ${currentCoords.longitude}, latitude: ${currentCoords.latitude} });
        }
        const dropFeatures = RIDE_DROPS.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { title: p.title, subtitle: p.subtitle, selected: p.selected }
        }));
        map.addSource('ride-drops', { type: 'geojson', data: { type: 'FeatureCollection', features: dropFeatures } });
        map.addLayer({
          id: 'ride-drops-circle',
          type: 'circle',
          source: 'ride-drops',
          paint: {
            'circle-radius': ['case', ['==', ['get', 'selected'], 1], 13, 8],
            'circle-color': ['case', ['==', ['get', 'selected'], 1], '#111827', '#60A5FA'],
            'circle-opacity': ['case', ['==', ['get', 'selected'], 1], 1, 0.88],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });
        const route = ${routeFeature};
        map.addSource('route', { type: 'geojson', data: route });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#2563EB', 'line-width': 5.5, 'line-opacity': 0.92 }
        });
        const el = document.createElement('div');
        el.className = 'user-marker-wrap';
        el.innerHTML = '<div class="user-pulse-ring"></div><div class="user-dot"></div>';
        new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([${currentCoords.longitude}, ${currentCoords.latitude}])
          .addTo(map);
        const bounds = new mapboxgl.LngLatBounds();
        route.geometry.coordinates.forEach((point) => bounds.extend(point));
        dropFeatures.forEach((f) => bounds.extend(f.geometry.coordinates));
        bounds.extend([${currentCoords.longitude}, ${currentCoords.latitude}]);
        map.fitBounds(bounds, {
          padding: VIEWPORT_PAD,
          duration: 920,
          maxZoom: 14.2,
          essential: true,
        });
        map.on('click', 'ride-drops-circle', (e) => {
          const f = e.features[0];
          const c = f.geometry.coordinates.slice();
          const p = f.properties || {};
          const wrap = document.createElement('div');
          wrap.style.fontFamily = 'system-ui,-apple-system,sans-serif';
          const t = document.createElement('div');
          t.textContent = p.title || '';
          t.style.cssText = 'font-weight:700;font-size:13px';
          const s = document.createElement('div');
          s.textContent = p.subtitle || '';
          s.style.cssText = 'font-size:11px;color:#6B7280;margin-top:2px';
          wrap.appendChild(t);
          wrap.appendChild(s);
          const navBtn = document.createElement('button');
          navBtn.textContent = 'Start journey';
          navBtn.style.cssText =
            'margin-top:10px;width:100%;border:0;border-radius:9px;padding:9px 10px;font-size:12px;font-weight:700;background:#111827;color:#fff';
          navBtn.onclick = function () {
            try {
              if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'startJourney',
                  destLng: c[0],
                  destLat: c[1],
                  title: String(p.title || 'Drop-off'),
                  subtitle: String(p.subtitle || ''),
                  kind: 'ride',
                }));
              }
            } catch (_) {}
          };
          wrap.appendChild(navBtn);
          new mapboxgl.Popup({ offset: 10 }).setLngLat(c).setDOMContent(wrap).addTo(map);
        });
        map.on('mouseenter', 'ride-drops-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'ride-drops-circle', () => { map.getCanvas().style.cursor = ''; });
      });
    </script>
  </body>
</html>`;
  }, [
    MAPBOX_ACCESS_TOKEN,
    currentCoords,
    selectedDestination,
    routeCoordinates,
    mapZoomOffset,
    theme.mapStyleId,
    popularNearbyDestinations,
    homeMapCameraPad,
  ]);

  const exploreMapGeoJson = useMemo(() => {
    const destFeatures = exploreDestinationsDisplayed.map((d) => {
      const touringNow = explorePinHeat(`${d.id}-t`, 12, 140);
      const visitedToday = explorePinHeat(`${d.id}-v`, 220, 5200);
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [d.coords.longitude, d.coords.latitude] as [number, number],
        },
        properties: {
          id: d.id,
          pinKind: 'destination',
          name: d.name,
          subtitle: d.subtitle,
          reason: d.exploreReason,
          detail: d.exploreTip ?? '',
          heat: explorePinHeat(d.id, 4, 9),
          touringNow,
          visitedToday,
        },
      };
    });
    const bnbFeatures = exploreBnbsDisplayed.map((b) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [b.coords.longitude, b.coords.latitude] as [number, number],
      },
      properties: {
        id: b.id,
        pinKind: 'bnb',
        name: b.title,
        subtitle: `${b.county} · ${b.rating} ★ · ${b.price}`,
        reason: b.exploreReason,
        detail: b.exploreTip ?? '',
        heat: explorePinHeat(b.id, 2, 7),
        touringNow: explorePinHeat(`${b.id}-t`, 3, 48),
        visitedToday: explorePinHeat(`${b.id}-v`, 40, 420),
      },
    }));
    const toVenueFeature = (v: ExploreVenue) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [v.coords.longitude, v.coords.latitude] as [number, number],
      },
      properties: {
        id: v.id,
        pinKind: v.category,
        name: v.title,
        subtitle: v.subtitle,
        reason: v.exploreReason,
        detail: v.exploreTip ?? '',
        heat: explorePinHeat(v.id, 5, 10),
        touringNow: v.touringNow,
        visitedToday: v.visitedToday,
      },
    });
    const venuesList = exploreVenuesDisplayed;
    const venuesOf = (cat: ExploreVenueCategory) => venuesList.filter((x) => x.category === cat).map(toVenueFeature);
    const pins = exploreArticlePinFeatures;

    let features: (typeof destFeatures)[number][] = [];
    switch (exploreLens) {
      case 'discover':
        features = [...destFeatures, ...bnbFeatures, ...venuesList.map(toVenueFeature), ...pins];
        break;
      case 'hotels':
        features = venuesOf('hotel');
        break;
      case 'markets':
        features = venuesOf('market');
        break;
      case 'meetups':
        features = [...destFeatures, ...venuesOf('meetup')];
        break;
      case 'fashion':
        features = [
          ...destFeatures,
          ...venuesOf('fashion'),
          ...venuesOf('market'),
          ...venuesOf('culture'),
        ];
        break;
      case 'journal':
        features = [...destFeatures, ...pins];
        break;
      default:
        features = [...destFeatures, ...bnbFeatures, ...venuesList.map(toVenueFeature), ...pins];
    }
    return { type: 'FeatureCollection' as const, features };
  }, [
    exploreDestinationsDisplayed,
    exploreBnbsDisplayed,
    exploreVenuesDisplayed,
    exploreArticlePinFeatures,
    exploreLens,
  ]);

  const exploreMapHtml = useMemo(() => {
    if (!MAPBOX_ACCESS_TOKEN) return null;
    const dataJson = JSON.stringify(exploreMapGeoJson);
    const currentCoordsJson = currentCoords ? JSON.stringify([currentCoords.longitude, currentCoords.latitude]) : 'null';
    const preselectedTargetJson = exploreRouteTarget
      ? JSON.stringify([exploreRouteTarget.longitude, exploreRouteTarget.latitude])
      : 'null';
    const flyToJson = exploreReadHereTarget
      ? JSON.stringify({
          latitude: exploreReadHereTarget.latitude,
          longitude: exploreReadHereTarget.longitude,
        })
      : 'null';
    const isDark = theme.mapStyleId === 'dark-v11';
    const popupBg = isDark ? '#1A1D24' : '#FFFFFF';
    const popupBorder = isDark ? '#2D3139' : '#E5E7EB';
    const popupTitle = isDark ? '#F7F7F8' : '#1F1F1F';
    const popupMuted = isDark ? '#AAB0BD' : '#666666';
    const popupAccent = isDark ? '#E8E8ED' : '#111111';
    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"/>
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
    <style>
      html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
      .mapboxgl-popup-content {
        background: ${popupBg} !important;
        border: 1px solid ${popupBorder} !important;
        border-radius: 2px !important;
        box-shadow: 0 2px 12px rgba(0,0,0,0.08) !important;
        padding: 8px 10px !important;
      }
      .mapboxgl-popup-close-button {
        color: ${popupMuted} !important;
        font-size: 16px !important;
        padding: 2px 6px !important;
      }
      .jua-pop-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 10px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid ${popupBorder};
        font-size: 11px;
        font-weight: 600;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .jua-pop-link {
        cursor: pointer;
        text-decoration: none;
        color: ${popupTitle};
        opacity: 0.92;
        font-weight: 600;
      }
      .jua-pop-link.jua-pop-off {
        opacity: 0.38;
        pointer-events: none;
        text-decoration: none;
      }
      .ex-legend-wrap {
        position: absolute;
        left: 8px;
        bottom: 36px;
        z-index: 6;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .ex-legend-btn {
        border: 1px solid ${popupBorder};
        background: ${popupBg};
        color: ${popupTitle};
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 7px 10px;
        border-radius: 2px;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,0.12);
      }
      .ex-legend-panel {
        display: none;
        margin-top: 6px;
        max-width: 220px;
        padding: 10px 10px 8px;
        border: 1px solid ${popupBorder};
        background: ${popupBg};
        border-radius: 2px;
        box-shadow: 0 4px 18px rgba(0,0,0,0.14);
        font-size: 10px;
        color: ${popupMuted};
        line-height: 1.45;
      }
      .ex-legend-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      .ex-legend-swatch {
        width: 11px;
        height: 11px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.12);
        flex-shrink: 0;
      }
      .ex-legend-heat {
        height: 8px;
        border-radius: 4px;
        margin: 8px 0 4px;
        background: linear-gradient(90deg, rgba(99,102,241,0.2), rgba(168,85,247,0.75), rgba(244,63,94,0.85), rgba(251,146,60,0.9), rgba(254,240,138,0.95));
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
    <script>
      window.onerror = function () { return true; };
      const DATA = ${dataJson};
      const CURRENT = ${currentCoordsJson};
      const PRESELECT_ROUTE_TARGET = ${preselectedTargetJson};
      const FLY_TO = ${flyToJson};
      mapboxgl.accessToken = '${MAPBOX_ACCESS_TOKEN}';
      const defaultCenter = CURRENT || [36.8172, -1.2864];
      const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/${theme.mapStyleId}',
        center: defaultCenter,
        zoom: 10,
        touchPitch: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new mapboxgl.ScaleControl({ maxWidth: 96, unit: 'metric' }), 'bottom-left');

      map.on('load', function () {
        map.addSource('explore-pins', { type: 'geojson', data: DATA });
        var PIN_COLORS = [
          'match',
          ['get', 'pinKind'],
          'bnb',
          '#C084FC',
          'destination',
          '#38BDF8',
          'hotel',
          '#FB923C',
          'meetup',
          '#4ADE80',
          'fashion',
          '#FB7185',
          'market',
          '#2DD4BF',
          'culture',
          '#A78BFA',
          'journal',
          '#E879F9',
          '#94A3B8',
        ];
        map.addLayer({
          id: 'explore-heat',
          type: 'heatmap',
          source: 'explore-pins',
          maxzoom: 16,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'heat'], 1, 0.15, 10, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.75, 12, 1.9, 16, 2.4],
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(14,165,233,0)',
              0.12,
              'rgba(99,102,241,0.28)',
              0.32,
              'rgba(232,121,249,0.45)',
              0.52,
              'rgba(244,63,94,0.55)',
              0.75,
              'rgba(251,191,36,0.62)',
              1,
              'rgba(254,240,138,0.52)',
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 14, 12, 32, 16, 48],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.58, 14, 0.32],
          },
        });
        map.addLayer({
          id: 'explore-glow',
          type: 'circle',
          source: 'explore-pins',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 18, 14, 26],
            'circle-color': PIN_COLORS,
            'circle-opacity': 0.26,
            'circle-blur': 0.85,
          },
        });
        map.addLayer({
          id: 'explore-twinkle',
          type: 'circle',
          source: 'explore-pins',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 13, 14, 21],
            'circle-color': PIN_COLORS,
            'circle-opacity': 0.2,
            'circle-blur': 0.42,
          },
        });
        map.addLayer({
          id: 'explore-dots',
          type: 'circle',
          source: 'explore-pins',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 7, 11, 10, 14, 13],
            'circle-color': PIN_COLORS,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1,
          },
        });

        var legHost = document.createElement('div');
        legHost.className = 'ex-legend-wrap';
        var legBtn = document.createElement('button');
        legBtn.className = 'ex-legend-btn';
        legBtn.type = 'button';
        legBtn.textContent = 'Map key';
        var legPanel = document.createElement('div');
        legPanel.className = 'ex-legend-panel';
        function row(hex, label) {
          var r = document.createElement('div');
          r.className = 'ex-legend-row';
          var s = document.createElement('div');
          s.className = 'ex-legend-swatch';
          s.style.background = hex;
          var t = document.createElement('div');
          t.textContent = label;
          t.style.color = '${popupTitle}';
          t.style.fontWeight = '600';
          t.style.fontSize = '10px';
          r.appendChild(s);
          r.appendChild(t);
          return r;
        }
        legPanel.appendChild(row('#38BDF8', 'Destinations'));
        legPanel.appendChild(row('#C084FC', 'Stays (BnB)'));
        legPanel.appendChild(row('#FB923C', 'Featured hotels'));
        legPanel.appendChild(row('#4ADE80', 'Meetups & dev'));
        legPanel.appendChild(row('#FB7185', 'Fashion & studios'));
        legPanel.appendChild(row('#2DD4BF', 'Markets & groceries'));
        legPanel.appendChild(row('#A78BFA', 'Culture & venues'));
        legPanel.appendChild(row('#E879F9', 'Journal reads'));
        var heatCap = document.createElement('div');
        heatCap.textContent = 'Heat glow';
        heatCap.style.fontWeight = '700';
        heatCap.style.fontSize = '9px';
        heatCap.style.letterSpacing = '0.1em';
        heatCap.style.textTransform = 'uppercase';
        heatCap.style.marginTop = '4px';
        heatCap.style.color = '${popupMuted}';
        legPanel.appendChild(heatCap);
        var heatBar = document.createElement('div');
        heatBar.className = 'ex-legend-heat';
        legPanel.appendChild(heatBar);
        var heatNote = document.createElement('div');
        heatNote.textContent = 'Warmer tones = higher modeled footfall from pins nearby (illustrative).';
        heatNote.style.fontSize = '9px';
        heatNote.style.lineHeight = '1.35';
        legPanel.appendChild(heatNote);
        var visNote = document.createElement('div');
        visNote.textContent = 'Pop-ups show demo touring / daily visit hints — not live census data.';
        visNote.style.fontSize = '9px';
        visNote.style.marginTop = '6px';
        visNote.style.paddingTop = '6px';
        visNote.style.borderTop = '1px solid ${popupBorder}';
        visNote.style.opacity = '0.95';
        legPanel.appendChild(visNote);
        legBtn.onclick = function () {
          legPanel.style.display = legPanel.style.display === 'block' ? 'none' : 'block';
        };
        legHost.appendChild(legBtn);
        legHost.appendChild(legPanel);
        map.getContainer().appendChild(legHost);

        if (CURRENT) {
          new mapboxgl.Marker({ color: '#16A34A' })
            .setLngLat(CURRENT)
            .setPopup(new mapboxgl.Popup({ offset: 10 }).setText('My current location'))
            .addTo(map);
        }

        if (!DATA.features.length) {
          map.setCenter(defaultCenter);
          map.setZoom(10);
        } else if (DATA.features.length === 1) {
          map.jumpTo({ center: DATA.features[0].geometry.coordinates, zoom: 12 });
        } else {
          const b = new mapboxgl.LngLatBounds();
          DATA.features.forEach(function (f) { b.extend(f.geometry.coordinates); });
          map.fitBounds(b, { padding: 64, maxZoom: 12, duration: 0 });
        }

        if (FLY_TO && FLY_TO.latitude != null && FLY_TO.longitude != null) {
          map.once('idle', function () {
            try {
              map.flyTo({
                center: [FLY_TO.longitude, FLY_TO.latitude],
                zoom: Math.max(map.getZoom(), 13.25),
                duration: 1150,
                essential: true,
              });
            } catch (_) {}
          });
        }

        var activePopup = null;
        function closePopup() {
          if (activePopup) {
            activePopup.remove();
            activePopup = null;
          }
        }
        function str(v) { return v == null ? '' : String(v); }
        async function drawRouteTo(toCoords) {
          if (!CURRENT) return;
          const directionsUrl = 'https://api.mapbox.com/directions/v5/mapbox/driving/' +
            CURRENT[0] + ',' + CURRENT[1] + ';' + toCoords[0] + ',' + toCoords[1] +
            '?overview=full&geometries=geojson&alternatives=true&access_token=' + mapboxgl.accessToken;
          try {
            const response = await fetch(directionsUrl);
            const json = await response.json();
            if (!json || !json.routes || !json.routes.length) return;
            const best = json.routes.reduce((a, b) => (b.duration < a.duration ? b : a));
            const routeData = { type: 'Feature', geometry: best.geometry, properties: {} };
            if (map.getSource('explore-route')) {
              map.getSource('explore-route').setData(routeData);
            } else {
              map.addSource('explore-route', { type: 'geojson', data: routeData });
              map.addLayer({
                id: 'explore-route-line',
                type: 'line',
                source: 'explore-route',
                paint: { 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 0.9 }
              });
            }
            const bounds = new mapboxgl.LngLatBounds();
            best.geometry.coordinates.forEach((p) => bounds.extend(p));
            map.fitBounds(bounds, { padding: 52, maxZoom: 14, duration: 550 });
          } catch (err) {}
        }

        function openPopup(rawProps, coords) {
          closePopup();
          var props = {};
          for (var k in rawProps) {
            props[k] = str(rawProps[k]);
          }
          var root = document.createElement('div');
          root.style.maxWidth = '216px';
          root.style.fontFamily = 'system-ui, -apple-system, sans-serif';

          var pk = props.pinKind || 'destination';
          var badgeLabels = {
            bnb: 'Stay',
            destination: 'Place',
            hotel: 'Hotel',
            meetup: 'Meetup',
            fashion: 'Fashion',
            market: 'Market',
            culture: 'Culture',
            journal: 'Journal',
          };
          var badge = document.createElement('div');
          badge.textContent = badgeLabels[pk] || 'Spot';
          badge.style.cssText = 'font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${popupMuted};margin-bottom:4px;';

          var title = document.createElement('div');
          title.textContent = props.name;
          title.style.cssText = 'font-size:13px;font-weight:600;color:${popupTitle};line-height:1.25;margin-bottom:2px;';

          var sub = document.createElement('div');
          sub.textContent = props.subtitle;
          sub.style.cssText = 'font-size:11px;color:${popupMuted};line-height:1.35;margin-bottom:6px;';

          var insight = document.createElement('div');
          var tn = parseInt(props.touringNow, 10) || 0;
          var vd = parseInt(props.visitedToday, 10) || 0;
          if (pk === 'journal') {
            insight.textContent = 'Story pin — open the sheet to read where this happens.';
          } else {
            insight.textContent =
              '~' + tn + ' exploring nearby now · ~' + vd.toLocaleString() + ' visits modeled today (demo)';
          }
          insight.style.cssText =
            'font-size:10px;color:${popupAccent};line-height:1.35;margin-bottom:6px;font-weight:600;opacity:0.92;';

          var why = document.createElement('div');
          why.textContent = props.reason;
          why.style.cssText = 'font-size:11px;color:${popupTitle};line-height:1.4;';

          root.appendChild(badge);
          root.appendChild(title);
          root.appendChild(sub);
          root.appendChild(insight);
          root.appendChild(why);
          if (props.detail) {
            var tip = document.createElement('div');
            tip.textContent = props.detail;
            tip.style.cssText = 'font-size:10px;color:${popupMuted};line-height:1.4;margin-top:6px;padding-top:6px;border-top:1px solid ${popupBorder};';
            root.appendChild(tip);
          }
          var actions = document.createElement('div');
          actions.className = 'jua-pop-actions';
          var nav = document.createElement('span');
          nav.className = 'jua-pop-link' + (CURRENT ? '' : ' jua-pop-off');
          nav.textContent = 'Navigate';
          nav.onclick = function () {
            if (!CURRENT) return;
            try {
              if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'startJourney',
                  destLng: coords[0],
                  destLat: coords[1],
                  title: props.name || 'Destination',
                  subtitle: props.subtitle || '',
                  kind: pk === 'bnb' ? 'bnb' : pk === 'destination' ? 'destination' : 'place',
                }));
              }
            } catch (_) {}
          };
          var dot = document.createElement('span');
          dot.textContent = '·';
          dot.style.cssText = 'color:${popupMuted};font-weight:500;';
          var prev = document.createElement('span');
          prev.className = 'jua-pop-link' + (CURRENT ? '' : ' jua-pop-off');
          prev.textContent = 'Route preview';
          prev.onclick = function () {
            if (!CURRENT) return;
            drawRouteTo(coords);
          };
          if (pk === 'journal' && props.id) {
            var sheetL = document.createElement('span');
            sheetL.className = 'jua-pop-link';
            sheetL.textContent = 'Open in sheet';
            sheetL.onclick = function () {
              try {
                if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'exploreSelectArticle',
                    id: String(props.id),
                  }));
                }
              } catch (_) {}
            };
            var dotS = document.createElement('span');
            dotS.textContent = '·';
            dotS.style.cssText = 'color:${popupMuted};font-weight:500;';
            actions.appendChild(sheetL);
            actions.appendChild(dotS);
          }
          actions.appendChild(nav);
          actions.appendChild(dot);
          actions.appendChild(prev);
          root.appendChild(actions);

          activePopup = new mapboxgl.Popup({
            maxWidth: '220px',
            closeButton: true,
            closeOnClick: true,
            offset: 14,
          })
            .setLngLat(coords)
            .setDOMContent(root)
            .addTo(map);
          activePopup.on('close', function () { activePopup = null; });
        }

        map.on('click', 'explore-dots', function (e) {
          var f = e.features[0];
          openPopup(f.properties, f.geometry.coordinates.slice());
        });

        map.on('mouseenter', 'explore-dots', function () {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'explore-dots', function () {
          map.getCanvas().style.cursor = '';
        });
        if (PRESELECT_ROUTE_TARGET && CURRENT) {
          drawRouteTo(PRESELECT_ROUTE_TARGET);
        }
      });
    </script>
  </body>
</html>`;
  }, [
    MAPBOX_ACCESS_TOKEN,
    exploreMapGeoJson,
    theme.mapStyleId,
    currentCoords,
    exploreRouteTarget,
    exploreReadHereTarget,
  ]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas }} />
    );
  }

  const themePreferenceLabel =
    themePreference === 'system'
      ? `System (${themeMode === 'dark' ? 'Dark' : 'Light'})`
      : themePreference === 'dark'
        ? 'Dark'
        : 'Light';

  const renderOnboarding = () => (
    <OnboardingFlow
      onComplete={() => {
        setActiveTab('home');
        setHomeSheetStage('mid');
        setActiveSegment('home');
      }}
    />
  );

  const renderHome = () => {
    const serviceMapTitle =
      activeService === 'laundry'
        ? laundryPickupMode === 'mamafua'
          ? 'Confirm your home location'
          : 'Pickup stations near you'
        : activeService === 'rides'
          ? rideWizardStep === 'destination'
            ? 'Top destinations near you'
            : 'Pickup hubs & destinations'
          : staysSubTab === 'rental'
            ? 'Rentals around you'
            : 'BnBs around you';

    const mapCfg =
      activeService === 'rides'
        ? {
            html: interactiveMapHtml,
            previewUri: mapPreviewUrl,
            fb: 'Enable Mapbox token to render your live route.',
          }
        : {
            html: unifiedHomeMapHtml,
            previewUri: null as string | null,
            fb: 'Enable Mapbox token to view the map.',
          };


    const stayCardW = Math.min(272, Math.max(220, Math.round(windowWidth * 0.72)));
    const listingCarouselW = Math.min(Math.max(280, windowWidth - 40), windowWidth - 24);
    const listingPreviewEntity =
      !homeListingPreview
        ? null
        : homeListingPreview.catalog === 'bnb'
          ? (mapBnbs.find((b) => b.id === homeListingPreview.id) ?? null)
          : (mapHouses.find((h) => h.id === homeListingPreview.id) ?? null);

    const heroCardWidth = windowWidth - gutter * 2;
    const renderSectionHero = (slides: IntroHeroSlide[], hint: string, height = 200) => (
      <IntroHeroCarousel
        slides={slides}
        cardWidth={heroCardWidth}
        cardHeight={height}
        darkMode={themeMode === 'dark'}
        hint={hint}
      />
    );

    const sheetInner = (() => {
      // Activity / Profile must win over coming-soon segments (Rides, Movers, etc.).
      // Otherwise switching tabs while on a coming-soon service leaves that page stuck.
      if (activeTab === 'activity') {
        const activeOrders = laundryOrders.filter(
          (o) => !['delivered', 'cancelled'].includes(o.status),
        );
        const completedOrders = laundryOrders.filter((o) =>
          ['delivered', 'cancelled'].includes(o.status),
        );
        const pendingPayments = laundryOrders.filter(
          (o) => o.paymentStatus === 'pending' || o.paymentStatus === 'unpaid',
        );
        const openRequests = listingRequests
          .filter((r) => isActiveListingRequest(r.status))
          // Cards with a new (unread) admin message float to the top so the
          // pulsing "new activity" cards are the first thing you see.
          .sort((a, b) => {
            const aUnread = listingRequestChatInfo.get(a.id)?.unread ? 1 : 0;
            const bUnread = listingRequestChatInfo.get(b.id)?.unread ? 1 : 0;
            return bUnread - aUnread;
          });
        const listingRequestStepLabels = LISTING_REQUEST_STEPS.map((s) => LISTING_REQUEST_STATUS_LABELS[s]);

        const handleActivityFeedPress = (item: ActivityFeedItem) => {
          if (item.entity === 'listing_request') {
            void openListingRequestDetail(item.entityId);
            return;
          }
          if (item.entity === 'stay') {
            void openBookedStayDetail(item.entityId);
            return;
          }
          if (item.entity === 'laundry') {
            markLaundryOrderViewed(item.entityId);
          }
        };

        const notifRed = theme.isDark ? '#F87171' : '#DC2626';

        /** Follow-up card for a listing request — surfaces the latest admin
         * message + an unread badge so you can see *which* service has a message. */
        const renderOpenRequestCard = (req: ListingRequest, keyPrefix: string) => {
          const statusLabel =
            req.statusLabel ?? LISTING_REQUEST_STATUS_LABELS[req.status] ?? req.status;
          const kindLabel =
            req.kind === 'tour' ? 'Tour' : req.kind === 'viewing' ? 'Viewing' : 'Stay';
          const chat = listingRequestChatInfo.get(req.id);
          const hasNewMessage = !!chat?.unread;
          return (
            <PulsingCard key={`${keyPrefix}-${req.id}`} active={hasNewMessage}>
            <PressableScale
              onPress={() => void openListingRequestDetail(req.id)}
              style={[
                styles.activityCardWrap,
                nestedChrome(themeMode === 'dark'),
                hasNewMessage ? { borderColor: notifRed, borderWidth: 1 } : null,
              ]}
            >
              {hasNewMessage ? (
                <View style={[styles.activityNewBanner, { backgroundColor: notifRed }]}>
                  <Ionicons name="chatbubble-ellipses" size={12} color="#FFFFFF" />
                  <AccessibleText style={styles.activityNewBannerText} numberOfLines={1}>
                    New message from admin — tap to reply
                  </AccessibleText>
                </View>
              ) : null}
              <View style={styles.activityCardRow}>
                <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.stay}22` }]}>
                  <AppIcon name="home" size={18} color={SERVICE_DOT_COLORS.stay} />
                </View>
                <View style={{ flex: 1 }}>
                  <AccessibleText
                    style={[styles.makeTripTitle, { color: theme.textPrimary }]}
                    numberOfLines={1}
                  >
                    {req.listingTitle}
                  </AccessibleText>
                  <AccessibleText
                    style={[styles.makeTripSub, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {kindLabel} · {statusLabel}
                  </AccessibleText>
                  {chat?.fromAdmin ? (
                    <View style={styles.activityMsgPreviewRow}>
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={13}
                        color={hasNewMessage ? notifRed : theme.textMuted}
                      />
                      <AccessibleText
                        style={[
                          styles.activityMsgPreviewText,
                          {
                            color: hasNewMessage ? theme.textPrimary : theme.textSecondary,
                            fontFamily: hasNewMessage ? 'Inter_600SemiBold' : 'Inter_400Regular',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {chat.preview}
                      </AccessibleText>
                    </View>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </View>
            </PressableScale>
            </PulsingCard>
          );
        };

        const activeItems = [
          ...activeOrders.map((order) => ({
            type: 'laundry' as const,
            id: order.id,
            title: order.pickupLabel,
            sub: `${order.loadLabel} · ${order.status.replace(/_/g, ' ')}`,
            payment: order.paymentStatus ?? 'pending',
            amount: `KES ${order.totalKes.toLocaleString()}`,
            step: order.currentStep,
            steps: order.steps,
          })),
          ...bnbBookings
            .filter((b) => b.status === 'confirmed' || b.status === 'pending_payment')
            .map((b) => ({
              type: 'stay' as const,
              id: b.id,
              listingId: b.listingId,
              title: b.listing?.title ?? 'BnB stay',
              sub: `${b.checkIn} → ${b.checkOut} · ${String(b.status ?? 'pending').replace(/_/g, ' ')}`,
              payment: b.paymentStatus ?? 'pending',
              amount: `KES ${Number(b.totalKes ?? 0).toLocaleString()}`,
              step: b.confirmed ? 2 : 0,
              steps: ['Booked', 'Paid', 'Check-in', 'Done'],
            })),
        ];

        const historyItems = [
          ...completedOrders.map((order) => ({
            id: order.id,
            title: order.pickupLabel,
            date: new Date(order.createdAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
            amount: `KES ${order.totalKes.toLocaleString()}`,
            payment: order.paymentStatus ?? 'pending',
          })),
          ...bnbBookings
            .filter((b) => b.status === 'completed' || b.status === 'cancelled')
            .map((b) => ({
              kind: 'stay' as const,
              id: b.id,
              listingId: b.listingId,
              status: b.status,
              title: b.listing?.title ?? 'BnB stay',
              date: new Date(b.createdAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
              amount: `KES ${Number(b.totalKes ?? 0).toLocaleString()}`,
              payment: b.paymentStatus ?? '—',
            })),
          ...listingRequests
            .filter((r) => !isActiveListingRequest(r.status))
            .map((r) => ({
              kind: 'listing_request' as const,
              id: r.id,
              title:
                r.kind === 'tour'
                  ? `BnB tour · ${r.listingTitle}`
                  : r.kind === 'viewing'
                    ? `House viewing · ${r.listingTitle}`
                    : `Stay · ${r.listingTitle}`,
              date: new Date(r.createdAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
              amount: '—',
              payment: r.statusLabel ?? LISTING_REQUEST_STATUS_LABELS[r.status] ?? r.status,
            })),
        ];

        const fuaActive = activeItems.filter((t) => t.type === 'laundry');
        const kejaActive = activeItems.filter((t) => t.type === 'stay');
        const fuaUpdates = activityFeedItems.filter((i) => i.entity === 'laundry');
        const kejaUpdates = [
          ...activityFeedItems.filter((i) => i.entity === 'stay'),
          ...openRequests,
        ];
        const followUpCount =
          fuaActive.length +
          kejaActive.length +
          pendingPayments.length +
          fuaUpdates.length +
          openRequests.length +
          activityFeedItems.filter((i) => i.entity === 'stay').length;
        const byServiceCount = fuaActive.length + kejaActive.length + openRequests.length;
        // Genuine unread notifications live in the Follow-up section.
        const followUpUnread = activityFeedItems.length;
        const sectionTabs: {
          key: typeof activitySection;
          label: string;
          count: number;
          unread: number;
        }[] = [
          { key: 'active', label: 'Follow-up', count: followUpCount, unread: followUpUnread },
          { key: 'updates', label: 'By service', count: byServiceCount, unread: 0 },
          { key: 'history', label: 'Past', count: historyItems.length, unread: 0 },
        ];

        const renderServiceHeader = (label: string, icon: AppIconName, color: string, count: number) => (
          <View style={styles.activityServiceHeader}>
            <View style={[styles.activityIconWell, { backgroundColor: `${color}22` }]}>
              <AppIcon name={icon} size={16} color={color} />
            </View>
            <AccessibleText style={[styles.activityServiceTitle, { color: theme.textPrimary }]}>
              {label}
            </AccessibleText>
            {count > 0 ? (
              <View style={[styles.activityServiceCount, { backgroundColor: theme.mutedSurface }]}>
                <AccessibleText style={[styles.activityServiceCountText, { color: theme.textSecondary }]}>
                  {count}
                </AccessibleText>
              </View>
            ) : null}
          </View>
        );

        return (
          <>
            <View style={styles.activityHero}>
              <View style={styles.activityHeroText}>
                <AccessibleText style={[styles.activityTitle, { color: theme.textPrimary }]}>Activity</AccessibleText>
                <AccessibleText style={[styles.activitySubtitle, { color: theme.textSecondary }]}>
                  {!isAuthed
                    ? 'Sign in to track orders'
                    : followUpCount > 0
                      ? `${followUpCount} needing attention`
                      : activitySocketConnected
                        ? 'All caught up · live on'
                        : 'Orders, stays & requests'}
                </AccessibleText>
              </View>
              <View style={styles.activityHeroIcons}>
                <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.laundry}22` }]}>
                  <AppIcon name="washer" size={16} color={SERVICE_DOT_COLORS.laundry} />
                </View>
                <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.stay}22` }]}>
                  <AppIcon name="home" size={16} color={SERVICE_DOT_COLORS.stay} />
                </View>
                {(activityBellCount > 0 || activityChatCount > 0) ? (
                  <View style={[styles.activityBadgePill, { backgroundColor: theme.primaryLight }]}>
                    <Ionicons name="notifications-outline" size={16} color={theme.primary} />
                    <AccessibleText style={[styles.activityBadgeText, { color: theme.primary }]}>
                      {activityTabBadgeCount > 99 ? '99+' : String(activityTabBadgeCount)}
                    </AccessibleText>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={[styles.activityTabs, { backgroundColor: theme.mutedSurface }]}>
              {sectionTabs.map((tab) => {
                const on = activitySection === tab.key;
                const hasUnread = tab.unread > 0;
                return (
                  <PressableScale
                    key={tab.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={hasUnread ? `${tab.label}, ${tab.unread} new` : tab.label}
                    style={[
                      styles.activityTab,
                      on && { backgroundColor: theme.primaryLight },
                      !on && hasUnread && { borderWidth: 1, borderColor: notifRed },
                    ]}
                    onPress={() => {
                      HapticMap.selection();
                      setActivitySection(tab.key);
                    }}
                  >
                    <AccessibleText
                      style={[
                        styles.activityTabLabel,
                        { color: hasUnread && !on ? notifRed : on ? theme.primary : theme.textSecondary },
                      ]}
                    >
                      {tab.label}
                      {!hasUnread && tab.count > 0 ? ` · ${tab.count}` : ''}
                    </AccessibleText>
                    {hasUnread ? (
                      <View style={[styles.activityTabUnread, { backgroundColor: notifRed }]}>
                        <AccessibleText style={styles.activityTabUnreadText}>
                          {tab.unread > 9 ? '9+' : String(tab.unread)}
                        </AccessibleText>
                      </View>
                    ) : null}
                  </PressableScale>
                );
              })}
            </View>

            {activitySection === 'active' ? (
              <>
                {followUpCount === 0 ? (
                  <EmptyState
                    icon="✨"
                    title="You're all set"
                    description="Payments, chats, and open requests will show here."
                    darkMode={theme.isDark}
                    mutedSurface={theme.mutedSurface}
                    textPrimary={theme.textPrimary}
                    textSecondary={theme.textSecondary}
                    primary={theme.primary}
                    border={theme.border}
                  />
                ) : (
                  <View style={styles.makeTripsActiveList}>
                    {pendingPayments.length > 0 ? (
                      <>
                        {renderServiceHeader('Payments', 'card', theme.primary, pendingPayments.length)}
                        {pendingPayments.map((order) => (
                          <View
                            key={`pay-${order.id}`}
                            style={[
                              styles.activityCard,
                              nestedChrome(themeMode === 'dark'),
                              { borderColor: theme.primary },
                            ]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${theme.primary}18` }]}>
                              <AppIcon name="card" size={18} color={theme.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]}>
                                Pay for Fua
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                                {order.pickupLabel}
                              </AccessibleText>
                            </View>
                            <AccessibleText style={[styles.makeHistoryAmount, { color: theme.primary }]}>
                              KES {order.totalKes.toLocaleString()}
                            </AccessibleText>
                          </View>
                        ))}
                      </>
                    ) : null}

                    {(fuaActive.length > 0 || fuaUpdates.length > 0) ? (
                      <>
                        {renderServiceHeader('Fua', 'washer', SERVICE_DOT_COLORS.laundry, fuaActive.length + fuaUpdates.length)}
                        {fuaUpdates.map((item) => (
                          <PressableScale
                            key={item.id}
                            onPress={() => handleActivityFeedPress(item)}
                            style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.laundry}22` }]}>
                              <AppIcon name="washer" size={18} color={SERVICE_DOT_COLORS.laundry} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]}>
                                {item.title}
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]} numberOfLines={2}>
                                {item.body}
                              </AccessibleText>
                            </View>
                          </PressableScale>
                        ))}
                        {fuaActive.map((trip) => (
                          <View
                            key={`fua-${trip.id}`}
                            style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.laundry}22` }]}>
                              <AppIcon name="washer" size={18} color={SERVICE_DOT_COLORS.laundry} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                                {trip.title}
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]} numberOfLines={1}>
                                {trip.sub}
                              </AccessibleText>
                              {trip.steps.length > 0 ? (
                                <View style={{ marginTop: 8 }}>
                                  <MakeStatusStepper
                                    steps={trip.steps}
                                    current={trip.step}
                                    darkMode={themeMode === 'dark'}
                                  />
                                </View>
                              ) : null}
                            </View>
                          </View>
                        ))}
                      </>
                    ) : null}

                    {(kejaActive.length > 0 || kejaUpdates.length > 0) ? (
                      <>
                        {renderServiceHeader(
                          'Keja',
                          'home',
                          SERVICE_DOT_COLORS.stay,
                          kejaActive.length + openRequests.length + activityFeedItems.filter((i) => i.entity === 'stay').length,
                        )}
                        {activityFeedItems
                          .filter((i) => i.entity === 'stay')
                          .map((item) => (
                            <PressableScale
                              key={item.id}
                              onPress={() => handleActivityFeedPress(item)}
                              style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                            >
                              <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.stay}22` }]}>
                                <AppIcon name="home" size={18} color={SERVICE_DOT_COLORS.stay} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]}>
                                  {item.title}
                                </AccessibleText>
                                <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]} numberOfLines={2}>
                                  {item.body}
                                </AccessibleText>
                              </View>
                            </PressableScale>
                          ))}
                        {openRequests.map((req) => renderOpenRequestCard(req, 'req'))}
                        {kejaActive.map((trip) => (
                          <PressableScale
                            key={`keja-${trip.id}`}
                            onPress={() => void openBookedStayDetail(trip.id)}
                            style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.stay}22` }]}>
                              <AppIcon name="stays" size={18} color={SERVICE_DOT_COLORS.stay} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                                {trip.title}
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]} numberOfLines={1}>
                                {trip.sub}
                              </AccessibleText>
                              {trip.steps.length > 0 ? (
                                <View style={{ marginTop: 8 }}>
                                  <MakeStatusStepper
                                    steps={trip.steps}
                                    current={trip.step}
                                    darkMode={themeMode === 'dark'}
                                  />
                                </View>
                              ) : null}
                            </View>
                          </PressableScale>
                        ))}
                      </>
                    ) : null}
                  </View>
                )}
                {completedOrders.filter((o) => o.status === 'delivered').length > 0 ? (
                  <View style={{ marginTop: 8 }}>
                    {completedOrders
                      .filter((o) => o.status === 'delivered')
                      .slice(0, 2)
                      .map((order) => (
                        <FuaFeedbackCard
                          key={`fb-${order.id}`}
                          order={order}
                          theme={theme}
                          onConfirmed={(updated) => {
                            setLaundryOrders((prev) =>
                              prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
                            );
                          }}
                        />
                      ))}
                  </View>
                ) : null}
              </>
            ) : null}

            {activitySection === 'updates' ? (
              <>
                {fuaActive.length === 0 && kejaActive.length === 0 && openRequests.length === 0 ? (
                  <EmptyState
                    icon="🏠"
                    title="No open services"
                    description="Active Fua and Keja items will group here by service."
                    darkMode={theme.isDark}
                    mutedSurface={theme.mutedSurface}
                    textPrimary={theme.textPrimary}
                    textSecondary={theme.textSecondary}
                    primary={theme.primary}
                    border={theme.border}
                  />
                ) : (
                  <View style={styles.makeTripsActiveList}>
                    {fuaActive.length > 0 ? (
                      <>
                        {renderServiceHeader('Fua', 'washer', SERVICE_DOT_COLORS.laundry, fuaActive.length)}
                        {fuaActive.map((trip) => (
                          <View
                            key={`svc-fua-${trip.id}`}
                            style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.laundry}22` }]}>
                              <AppIcon name="washer" size={18} color={SERVICE_DOT_COLORS.laundry} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                                {trip.title}
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                                {trip.sub}
                                {trip.amount !== '—' ? ` · ${trip.amount}` : ''}
                              </AccessibleText>
                            </View>
                          </View>
                        ))}
                      </>
                    ) : null}
                    {(kejaActive.length > 0 || openRequests.length > 0) ? (
                      <>
                        {renderServiceHeader(
                          'Keja',
                          'home',
                          SERVICE_DOT_COLORS.stay,
                          kejaActive.length + openRequests.length,
                        )}
                        {openRequests.map((req) => renderOpenRequestCard(req, 'svc-req'))}
                        {kejaActive.map((trip) => (
                          <PressableScale
                            key={`svc-keja-${trip.id}`}
                            onPress={() => void openBookedStayDetail(trip.id)}
                            style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.stay}22` }]}>
                              <AppIcon name="stays" size={18} color={SERVICE_DOT_COLORS.stay} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                                {trip.title}
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                                {trip.sub}
                              </AccessibleText>
                            </View>
                          </PressableScale>
                        ))}
                      </>
                    ) : null}
                  </View>
                )}
              </>
            ) : null}

            {activitySection === 'history' ? (
              <View style={[styles.makeHistoryCard, nestedChrome(themeMode === 'dark'), { borderColor: theme.border }]}>
                {historyItems.length === 0 ? (
                  <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary, padding: 16 }]}>
                    Completed orders appear here.
                  </AccessibleText>
                ) : (
                  historyItems.map((h, i) => {
                    const isStay = 'kind' in h && h.kind === 'stay';
                    const isReq = 'kind' in h && h.kind === 'listing_request';
                    const iconName: AppIconName = isStay || isReq ? 'home' : 'washer';
                    const iconColor = isStay || isReq ? SERVICE_DOT_COLORS.stay : SERVICE_DOT_COLORS.laundry;
                    return (
                      <Pressable
                        key={h.id}
                        onPress={
                          isStay
                            ? () => void openBookedStayDetail(h.id)
                            : isReq
                              ? () => void openListingRequestDetail(h.id)
                              : undefined
                        }
                        style={({ pressed }) => [
                          styles.makeHistoryRow,
                          i < historyItems.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.border,
                          },
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <View style={[styles.makeHistoryIcon, { backgroundColor: `${iconColor}22` }]}>
                          <AppIcon name={iconName} size={14} color={iconColor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                            {h.title}
                          </AccessibleText>
                          <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                            {h.date}
                          </AccessibleText>
                        </View>
                        <AccessibleText style={[styles.makeHistoryAmount, { color: theme.textSecondary }]}>
                          {h.amount}
                        </AccessibleText>
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : null}
          </>
        );
      }
      if (activeTab === 'profile') {
        const displayName = profile?.displayName ?? user?.displayName ?? 'Guest';
        const phone = profile?.phone ?? user?.phone ?? '';
        const email = profile?.email ?? user?.email ?? '';
        const initials = displayName
          .split(' ')
          .map((p) => p[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        const memberSince = profile?.signedUpAt
          ? new Date(profile.signedUpAt).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
          : '—';
        const laundryCount = profile?.stats?.laundryOrders ?? laundryOrders.length;
        const nestSurface = nestedChrome(themeMode === 'dark');
        return (
          <>
            <PressableScale
              onPress={() => profile && setProfileEditOpen(true)}
              style={[styles.profileHero, nestSurface]}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <View style={[styles.makeProfileAvatar, { backgroundColor: theme.primary }]}>
                <AccessibleText style={styles.makeProfileAvatarText}>{initials || 'JX'}</AccessibleText>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AccessibleText style={[styles.makeProfileName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {displayName}
                </AccessibleText>
                <AccessibleText style={[styles.makeProfilePhone, { color: theme.textSecondary }]} numberOfLines={1}>
                  {email || phone || 'Add contact details'}
                </AccessibleText>
                <AccessibleText style={[styles.makeTripSub, { color: theme.primary, marginTop: 4 }]}>
                  Edit profile
                </AccessibleText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </PressableScale>
            {profile ? (
              <ProfileEditor
                visible={profileEditOpen}
                profile={profile}
                onClose={() => setProfileEditOpen(false)}
                onSaved={() => void refreshProfile()}
                theme={theme}
              />
            ) : null}

            <View style={styles.profileStatsRow}>
              <View style={[styles.profileStatCard, nestSurface]}>
                <AccessibleText style={[styles.profileStatValue, { color: theme.textPrimary }]}>
                  {String(laundryCount)}
                </AccessibleText>
                <AccessibleText style={[styles.profileStatLabel, { color: theme.textMuted }]}>Fua orders</AccessibleText>
              </View>
              <View style={[styles.profileStatCard, nestSurface]}>
                <AccessibleText style={[styles.profileStatValue, { color: theme.textPrimary }]} numberOfLines={1}>
                  {memberSince}
                </AccessibleText>
                <AccessibleText style={[styles.profileStatLabel, { color: theme.textMuted }]}>Member</AccessibleText>
              </View>
              <View style={[styles.profileStatCard, nestSurface]}>
                <AccessibleText
                  style={[
                    styles.profileStatValue,
                    { color: rentalSubscriptionActive ? theme.primary : theme.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  {rentalSubscriptionActive ? '1' : '0'}
                </AccessibleText>
                <AccessibleText style={[styles.profileStatLabel, { color: theme.textMuted }]}>
                  Subscribed
                </AccessibleText>
              </View>
            </View>

            <AccessibleText style={[styles.profileSectionLabel, { color: theme.textMuted }]}>
              Subscriptions
            </AccessibleText>
            <View style={[styles.profileGroup, nestSurface, { marginBottom: 12 }]}>
              {(() => {
                const planMeta =
                  subscriptionPlans.find((p) => p.plan === activeSubscriptionPlan) ?? null;
                const planLabel =
                  planMeta?.label ??
                  (activeSubscriptionPlan
                    ? `${activeSubscriptionPlan.charAt(0).toUpperCase()}${activeSubscriptionPlan.slice(1)}`
                    : null);
                const expiresLabel = activeSubscriptionExpiresAt
                  ? new Date(activeSubscriptionExpiresAt).toLocaleDateString('en-KE', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : null;
                return (
                  <PressableScale
                    style={styles.profileRow}
                    onPress={() => {
                      HapticMap.light();
                      if (rentalSubscriptionActive) {
                        setActiveTab('home');
                        setActiveSegment('bnbs');
                        setActiveService('bnbs');
                        setStaysSubTab('rental');
                        setHomeSheetStageAnimated('mid');
                      } else {
                        setSubscriptionSheetOpen(true);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      rentalSubscriptionActive
                        ? `Keja rental plan active${planLabel ? `, ${planLabel}` : ''}`
                        : 'Subscribe to Keja rentals'
                    }
                  >
                    <View
                      style={[
                        styles.profileRowIcon,
                        {
                          backgroundColor: rentalSubscriptionActive
                            ? `${SERVICE_DOT_COLORS.stay}22`
                            : theme.mutedSurface,
                        },
                      ]}
                    >
                      <AppIcon
                        name="home"
                        size={18}
                        color={rentalSubscriptionActive ? SERVICE_DOT_COLORS.stay : theme.textSecondary}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AccessibleText style={[styles.makeProfileRowLabel, { color: theme.textPrimary }]}>
                        Keja rentals
                      </AccessibleText>
                      <AccessibleText
                        style={[styles.makeTripSub, { color: theme.textSecondary }]}
                        numberOfLines={1}
                      >
                        {rentalSubscriptionActive
                          ? `${planLabel ?? 'Plan'} · active${expiresLabel ? ` · until ${expiresLabel}` : ''}`
                          : 'Not subscribed · unlock viewing requests'}
                      </AccessibleText>
                    </View>
                    {rentalSubscriptionActive ? (
                      <View style={[styles.profileSubBadge, { backgroundColor: `${theme.primary}18` }]}>
                        <AccessibleText style={[styles.profileSubBadgeText, { color: theme.primary }]}>
                          Active
                        </AccessibleText>
                      </View>
                    ) : (
                      <AccessibleText style={[styles.makeTripSub, { color: theme.primary }]}>
                        Plans
                      </AccessibleText>
                    )}
                  </PressableScale>
                );
              })()}
            </View>

            <View style={[styles.profileGroup, nestSurface]}>
              <PressableScale
                style={styles.profileRow}
                onPress={() => {
                  HapticMap.light();
                  setActiveTab('activity');
                  setActivitySection('active');
                }}
              >
                <View style={[styles.profileRowIcon, { backgroundColor: theme.mutedSurface }]}>
                  <AppIcon name="bell" size={18} color={theme.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AccessibleText style={[styles.makeProfileRowLabel, { color: theme.textPrimary }]}>
                    Activity
                  </AccessibleText>
                  <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                    Orders & updates
                  </AccessibleText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </PressableScale>
              <View style={[styles.profileRowDivider, { backgroundColor: theme.border }]} />
              <View style={styles.profileRow}>
                <View style={[styles.profileRowIcon, { backgroundColor: theme.mutedSurface }]}>
                  <AppIcon name="card" size={18} color={theme.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AccessibleText style={[styles.makeProfileRowLabel, { color: theme.textPrimary }]}>
                    M-Pesa
                  </AccessibleText>
                  <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                    Default payment
                  </AccessibleText>
                </View>
              </View>
            </View>

            <AccessibleText style={[styles.profileSectionLabel, { color: theme.textMuted }]}>
              Appearance
            </AccessibleText>
            <View style={styles.themePreferenceRow}>
              {(
                [
                  { key: 'system' as const, label: 'System', icon: 'phone-portrait-outline' as const },
                  { key: 'light' as const, label: 'Light', icon: 'sunny-outline' as const },
                  { key: 'dark' as const, label: 'Dark', icon: 'moon-outline' as const },
                ] as const
              ).map((opt) => {
                const on = themePreference === opt.key;
                const tint = on ? theme.primary : theme.textSecondary;
                return (
                  <PressableScale
                    key={opt.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={chipLabel(opt.label, on)}
                    style={[
                      styles.themePreferenceChip,
                      nestSurface,
                      on && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
                    ]}
                    onPress={() => {
                      HapticMap.selection();
                      setThemePreference(opt.key);
                    }}
                  >
                    <View
                      style={[
                        styles.themePreferenceIconWell,
                        { backgroundColor: on ? `${theme.primary}22` : theme.mutedSurface },
                      ]}
                    >
                      <Ionicons name={opt.icon} size={18} color={tint} />
                    </View>
                    <AccessibleText
                      style={[styles.themePreferenceChipText, { color: tint }]}
                      numberOfLines={1}
                    >
                      {opt.label}
                    </AccessibleText>
                  </PressableScale>
                );
              })}
            </View>

            <View style={[styles.profileGroup, nestSurface, { marginTop: 16 }]}>
              <PressableScale style={styles.profileRow} onPress={() => {}}>
                <View style={[styles.profileRowIcon, { backgroundColor: theme.mutedSurface }]}>
                  <AppIcon name="help" size={18} color={theme.textSecondary} />
                </View>
                <AccessibleText style={[styles.makeProfileRowLabel, { color: theme.textPrimary, flex: 1 }]}>
                  Help & support
                </AccessibleText>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </PressableScale>
              <View style={[styles.profileRowDivider, { backgroundColor: theme.border }]} />
              <PressableScale
                style={styles.profileRow}
                onPress={() => {
                  HapticMap.light();
                  void signOut();
                }}
              >
                <View style={[styles.profileRowIcon, { backgroundColor: `${Colors.light.error}18` }]}>
                  <Ionicons name="log-out-outline" size={18} color={Colors.light.error} />
                </View>
                <AccessibleText style={[styles.makeProfileRowLabel, { color: Colors.light.error, flex: 1 }]}>
                  Sign out
                </AccessibleText>
              </PressableScale>
            </View>

            <AccessibleText style={[styles.makeVersion, { color: theme.textMuted, marginTop: 20 }]}>
              Jua X · v1.0.0
            </AccessibleText>
          </>
        );
      }

      if (isComingSoonSegment) {
        const info = COMING_SOON_SERVICE_INFO[activeSegment];
        const watermarkColor = themeMode === 'dark' ? 'rgba(255,255,255,0.05)' : `${info.tint}14`;
        return (
          <View style={styles.comingSoonSheetRoot}>
            <View style={styles.comingSoonWatermark} pointerEvents="none" accessibilityElementsHidden>
              <AppIcon name={info.icon} size={168} color={watermarkColor} />
            </View>

            <View style={styles.comingSoonHeaderBlock}>
              <AccessibleText style={[styles.comingSoonTitle, { color: theme.textPrimary }]}>
                {info.title}
              </AccessibleText>
              <AccessibleText style={[styles.comingSoonSubtitle, { color: theme.textSecondary }]}>
                {info.lead}
              </AccessibleText>
            </View>

            {renderSectionHero(comingSoonHeroSlides(activeSegment), `How ${info.title} will work`, 220)}
            <View style={[styles.comingSoonEmojiBanner, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
              <Text style={[styles.comingSoonEmojiBannerText, { color: theme.primary }]}>
                Coming soon
              </Text>
            </View>
            <Text style={[styles.juxSectionLabel, styles.valetSectionLabelSpaced]}>What to expect</Text>
            {info.features.map((line) => (
              <View key={line} style={styles.juxListingBulletRow}>
                <Text style={styles.juxListingBulletGlyph}>●</Text>
                <Text style={[styles.juxListingBulletText, { color: theme.textPrimary }]}>{line}</Text>
              </View>
            ))}
            <Text style={[styles.comingSoonMore, { color: theme.textMuted }]}>
              More services on the way — Jua X is building your everyday super-app.
            </Text>
          </View>
        );
      }

      const activeHubTripCount =
        laundryOrders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length +
        listingRequests.filter((r) => isActiveListingRequest(r.status)).length;

      if (activeSegment === 'home') {
        return (
          <HomeHub
            slides={HOME_HERO_SLIDES}
            carouselHint="Swipe to explore"
            cardWidth={heroCardWidth}
            darkMode={themeMode === 'dark'}
            activeTripCount={activeHubTripCount}
            listingsLoading={listingsInitialLoading}
            listingsLoaded={listingsLoaded}
            listingsError={listingsError ?? dataError}
            onRetryListings={() => void refreshAllListingsCatalog()}
            theme={theme}
            popularStays={hubListingPool.bnbs.slice(0, 5).map((b) => {
              const dist = formatListingDistanceLabel(b.coords, listingDistanceRef);
              return {
                id: b.id,
                title: b.title,
                meta: dist ? `${dist} · ${b.price}` : `${b.rating} · ${b.price}`,
                image: b.image,
              };
            })}
            popularListings={hubPopularListings}
            nearbyRadiusKm={staysRadiusKm}
            hasLocation={!!currentCoords || !!listingsCounty}
            locationLoading={locationLoading}
            onPopularCarouselTouchStart={() => setHomeHubCarouselActive(true)}
            onPopularCarouselTouchEnd={() => setHomeHubCarouselActive(false)}
            onBrowseListings={() => {
              setActiveSegment('bnbs');
              setActiveService('bnbs');
              setListingCounty('any');
              setHomeDeepPage('listings');
              setHomeSheetStageAnimated('full');
            }}
            onQuickService={(service) => {
              setActiveSegment(service);
              setActiveService(service);
              setHomeSheetStageAnimated('mid');
            }}
            onComingSoonService={(service) => {
              setActiveSegment(service === 'movers' ? 'movers' : 'rides');
              setHomeSheetStageAnimated('mid');
            }}
            onOpenMore={() => setMoreServicesOpen(true)}
            onOpenStay={(id) => {
              setSelectedBnbId(id);
              setSelectedHouseId(null);
              setActiveSegment('bnbs');
              setActiveService('bnbs');
              setStaysSubTab('bnb');
              setHomeSheetStageAnimated('mid');
            }}
            onOpenListing={(id, kind) => {
              if (kind === 'bnb') {
                setSelectedBnbId(id);
                setSelectedHouseId(null);
                setActiveSegment('bnbs');
                setActiveService('bnbs');
                setStaysSubTab('bnb');
              } else {
                setSelectedHouseId(id);
                setSelectedBnbId(null);
                setActiveSegment('bnbs');
                setActiveService('bnbs');
                setStaysSubTab('rental');
              }
              setHomeSheetStageAnimated('mid');
            }}
            onOpenTrips={() => setActiveTab('activity')}
          />
        );
      }

      switch (activeSegment) {
        case 'rides': {
          const hubMode = ridePickupMode === 'station';
          const visibleRideHubs = nearbyStations.slice(0, 4);
          const driverEtaMin = Math.max(2, selectedRide.minutes - 1);
          const bookingIndex = isRideBookingWizardStep(rideWizardStep)
            ? RIDE_WIZARD_BOOKING_ORDER.indexOf(rideWizardStep)
            : -1;
          const bookingMeta = bookingIndex >= 0 ? RIDE_WIZARD_BOOKING[bookingIndex] : null;
          const pickupLabel =
            ridePickupMode === 'station' && ridePickupStationId
              ? pickupStations.find((s) => s.id === ridePickupStationId)?.name ?? 'Pickup hub'
              : 'Your location';
          const renderWizardChrome = () =>
            bookingMeta ? (
              <>
                <Text style={[styles.rideWizardStepMeta, { color: theme.textMuted }]}>
                  Step {bookingIndex + 1} of {RIDE_WIZARD_BOOKING.length}
                </Text>
                <View style={styles.rideWizardProgress}>
                  {RIDE_WIZARD_BOOKING.map((step, i) => (
                    <View
                      key={step.key}
                      style={[
                        styles.rideWizardProgressSeg,
                        { backgroundColor: theme.border },
                        i <= bookingIndex && { backgroundColor: theme.primary },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.rideWizardTitle, { color: theme.textPrimary }]}>{bookingMeta.title}</Text>
                <Text style={[styles.rideWizardSubtitle, { color: theme.textSecondary }]}>{bookingMeta.subtitle}</Text>
              </>
            ) : null;
          return (
            <>
              {isRideBookingWizardStep(rideWizardStep) ? renderWizardChrome() : null}
              {rideWizardStep === 'pickup' ? (
                <>
                  <View style={styles.valetSegmentTrack}>
                    <Pressable
                      style={[styles.valetSegment, !hubMode && styles.valetSegmentActive]}
                      onPress={() => {
                        setRidePickupMode('current');
                        setRidePickupStationId(null);
                      }}
                    >
                      <Text style={[styles.valetSegmentText, !hubMode && styles.valetSegmentTextActive]}>
                        My location
                      </Text>
                    </Pressable>
                    <View style={styles.valetSegmentDivider} />
                    <Pressable
                      style={[styles.valetSegment, hubMode && styles.valetSegmentActive]}
                      disabled={nearbyStations.length === 0}
                      onPress={() => {
                        if (nearbyStations.length === 0) return;
                        setRidePickupMode('station');
                        setRidePickupStationId(
                          ridePickupStationId && nearbyStations.some((s) => s.id === ridePickupStationId)
                            ? ridePickupStationId
                            : nearbyStations[0].id,
                        );
                      }}
                    >
                      <Text
                        style={[
                          styles.valetSegmentText,
                          hubMode && styles.valetSegmentTextActive,
                          nearbyStations.length === 0 && styles.valetSegmentTextDisabled,
                        ]}
                      >
                        Pickup hub
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.valetAddressCompact, { color: theme.textPrimary }]} numberOfLines={2}>
                    {ridePickupDisplayLabel}
                  </Text>
                  {hubMode && visibleRideHubs.length > 0 ? (
                    <CarouselZone>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fuaStationScroll}>
                      {visibleRideHubs.map((hub) => {
                        const on = ridePickupStationId === hub.id;
                        return (
                          <Pressable
                            key={hub.id}
                            onPress={() => setRidePickupStationId(hub.id)}
                            style={[
                              styles.fuaStationChip,
                              { borderColor: theme.border },
                              on && styles.fuaStationChipOn,
                            ]}
                          >
                            <Text style={[styles.fuaStationChipText, on && styles.fuaStationChipTextOn]} numberOfLines={1}>
                              {hub.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    </CarouselZone>
                  ) : null}
                  <Pressable style={styles.homeDeepEntryRow} onPress={() => setHomeDeepPage('service-map')}>
                    <Text style={styles.homeDeepEntryTitle}>Hubs & destinations on map ›</Text>
                    <Text style={styles.homeDeepEntrySub}>
                      Blue = hub · gold = destination — tap, confirm, return to wizard
                    </Text>
                  </Pressable>
                </>
              ) : null}
              {rideWizardStep === 'destination' ? (
                <>
                  <ERSearchField
                    value={destinationQuery || selectedDestination.name}
                    placeholder="Where to, Jua?"
                    onPress={() => {
                      setDestinationSearchOpen(true);
                      setHomeSheetStageAnimated('full');
                    }}
                  />
                  <MakeLabel darkMode={themeMode === 'dark'}>Recent destinations</MakeLabel>
                  <CarouselZone>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.makeRecentsScroll}>
                    {popularNearbyDestinations.slice(0, 5).map((dest) => {
                      const on = dest.id === selectedDestination.id;
                      return (
                        <Pressable
                          key={dest.id}
                          style={[
                            styles.makeRecentChip,
                            { borderColor: theme.border },
                            on && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
                          ]}
                          onPress={() => {
                            setSelectedDestination(dest);
                            setPhaseForService('rides', 'selecting');
                          }}
                        >
                          <Text style={[styles.makeRecentChipTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                            {dest.name}
                          </Text>
                          <Text style={[styles.makeRecentChipSub, { color: theme.textSecondary }]} numberOfLines={1}>
                            {dest.subtitle}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  </CarouselZone>
                  <View style={[styles.rideWizardReviewRow, { borderColor: theme.border }]}>
                    <Text style={[styles.rideWizardReviewLabel, { color: theme.textMuted }]}>Selected</Text>
                    <Text style={[styles.rideWizardReviewValue, { color: theme.textPrimary }]}>{selectedDestination.name}</Text>
                    <Text style={[styles.rideWizardReviewSub, { color: theme.textSecondary }]} numberOfLines={2}>
                      {selectedDestination.subtitle}
                      {routeDurationMin != null ? ` · ~${routeDurationMin} min` : ''}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.homeDeepEntryRow}
                    onPress={() => {
                      setHomeSheetStageAnimated('collapsed');
                      setHomeDeepPage('service-map');
                    }}
                  >
                    <Text style={styles.homeDeepEntryTitle}>Destinations on map ›</Text>
                    <Text style={styles.homeDeepEntrySub}>
                      Top spots near you — tap a pin, then return to continue
                    </Text>
                  </Pressable>
                </>
              ) : null}
              {rideWizardStep === 'ride_type' ? (
                <>
                  {RIDE_OPTIONS.map((ride) => {
                    const active = ride.id === selectedRideId;
                    const fare =
                      routeDistanceKm !== null
                        ? Math.max(8, Math.round((3.2 + routeDistanceKm * 1.1) * ride.multiplier))
                        : null;
                    return (
                      <Pressable
                        key={ride.id}
                        style={[
                          styles.rideTierCardFull,
                          { borderColor: theme.border, backgroundColor: theme.sheet },
                          active && styles.rideTierCardOn,
                        ]}
                        onPress={() => {
                          setSelectedRideId(ride.id);
                          setPhaseForService('rides', 'selecting');
                        }}
                      >
                        <AppIcon name={ride.icon} size={28} color={theme.textPrimary} style={styles.rideTierIcon} />
                        <View style={styles.rideTierCardBody}>
                          <Text style={[styles.rideTierLabel, { color: theme.textPrimary }]}>{ride.label}</Text>
                          <Text style={[styles.rideTierBlurb, { color: theme.textSecondary }]} numberOfLines={2}>
                            {ride.blurb}
                          </Text>
                          <Text style={[styles.rideTierMeta, { color: theme.textMuted }]}>
                            {ride.seats} seats · ~{ride.minutes} min to pickup
                          </Text>
                        </View>
                        <Text style={[styles.rideTierFare, { color: theme.primary }]}>
                          {fare !== null ? `KES ${fare}` : '—'}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={styles.homeDeepEntryRow}
                    onPress={() => {
                      setHomeSheetStageAnimated('collapsed');
                      setHomeDeepPage('rides-planner');
                    }}
                  >
                    <Text style={styles.homeDeepEntryTitle}>Ride planner ›</Text>
                    <Text style={styles.homeDeepEntrySub}>Extra stop · luggage · meet & assist</Text>
                  </Pressable>
                </>
              ) : null}
              {rideWizardStep === 'review' ? (
                <>
                  <View style={[styles.rideWizardReviewRow, { borderColor: theme.border }]}>
                    <Text style={[styles.rideWizardReviewLabel, { color: theme.textMuted }]}>Pickup</Text>
                    <Text style={[styles.rideWizardReviewValue, { color: theme.textPrimary }]}>{pickupLabel}</Text>
                    <Text style={[styles.rideWizardReviewSub, { color: theme.textSecondary }]} numberOfLines={2}>
                      {ridePickupDisplayLabel}
                    </Text>
                  </View>
                  <View style={[styles.rideWizardReviewRow, { borderColor: theme.border }]}>
                    <Text style={[styles.rideWizardReviewLabel, { color: theme.textMuted }]}>Destination</Text>
                    <Text style={[styles.rideWizardReviewValue, { color: theme.textPrimary }]}>{selectedDestination.name}</Text>
                    <Text style={[styles.rideWizardReviewSub, { color: theme.textSecondary }]} numberOfLines={2}>
                      {selectedDestination.subtitle}
                      {routeDurationMin != null ? ` · ~${routeDurationMin} min trip` : ''}
                    </Text>
                  </View>
                  <View style={[styles.rideWizardReviewRow, { borderColor: theme.border }]}>
                    <Text style={[styles.rideWizardReviewLabel, { color: theme.textMuted }]}>Ride</Text>
                    <View style={styles.rideReviewRideRow}>
                      <AppIcon name={selectedRide.icon} size={18} color={theme.textPrimary} />
                      <Text style={[styles.rideWizardReviewValue, { color: theme.textPrimary }]}>
                        {selectedRide.label}
                      </Text>
                    </View>
                    <Text style={[styles.rideWizardReviewSub, { color: theme.textSecondary }]}>
                      {selectedRide.seats} seats · driver ~{selectedRide.minutes} min away
                    </Text>
                  </View>
                  {ridePlannerLuggage || ridePlannerMeetAssist || ridePlannerStop.trim() ? (
                    <View style={[styles.rideWizardReviewRow, { borderColor: theme.border }]}>
                      <Text style={[styles.rideWizardReviewLabel, { color: theme.textMuted }]}>Extras</Text>
                      <Text style={[styles.rideWizardReviewSub, { color: theme.textSecondary }]}>
                        {[
                          ridePlannerLuggage ? 'Luggage' : null,
                          ridePlannerMeetAssist ? 'Meet & assist' : null,
                          ridePlannerStop.trim() ? `Via ${ridePlannerStop.trim()}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  ) : null}
                  <View style={[styles.rideWizardFareCard, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
                    <Text style={[styles.rideWizardFareLabel, { color: theme.textSecondary }]}>Estimated fare</Text>
                    <Text style={[styles.rideWizardFareValue, { color: theme.textPrimary }]}>
                      {estimatedFare !== null ? `KES ${estimatedFare}` : '—'}
                    </Text>
                  </View>
                </>
              ) : null}
              {rideWizardStep === 'matching' ? (
                <View style={[styles.rideStatusCard, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
                  <ActivityIndicator color={theme.primary} />
                  <Text style={[styles.rideStatusTitle, { color: theme.textPrimary }]}>Matching a nearby driver</Text>
                  <Text style={[styles.rideStatusSub, { color: theme.textSecondary }]}>
                    Checking who is closest to {pickupLabel}…
                  </Text>
                </View>
              ) : null}
              {rideWizardStep === 'driver_eta' ? (
                <View style={[styles.rideStatusCard, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
                  <AppIcon name="car" size={22} color={theme.textPrimary} style={styles.rideStatusEmoji} />
                  <Text style={[styles.rideStatusTitle, { color: theme.textPrimary }]}>
                    Driver ~{driverEtaMin} min away
                  </Text>
                  <Text style={[styles.rideStatusSub, { color: theme.textSecondary }]}>
                    {selectedRide.label} · heading to {pickupLabel}
                  </Text>
                </View>
              ) : null}
              {rideWizardStep === 'payment' ? (
                <View style={[styles.rideStatusCard, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
                  <AppIcon name="card" size={22} color={theme.textPrimary} style={styles.rideStatusEmoji} />
                  <Text style={[styles.rideStatusTitle, { color: theme.textPrimary }]}>Pay with M-Pesa</Text>
                  <Text style={[styles.rideStatusSub, { color: theme.textSecondary }]}>
                    {estimatedFare !== null
                      ? `KES ${estimatedFare} · ${pickupLabel} → ${selectedDestination.name}`
                      : 'Confirm fare below'}
                  </Text>
                </View>
              ) : null}
            </>
          );
        }
        case 'laundry': {
          const laundryEstimateKes =
            serverLaundryEstimate ??
            (laundryPickupMode === 'mamafua'
              ? mamaFuaDispatchFee +
                selectedMamaFuaTasks.reduce((sum, id) => {
                  const t = mamaFuaTasks.find((x) => x.id === id);
                  return sum + (t?.priceKes ?? 0);
                }, 0) +
                (selectedMamaFuaTasks.includes('laundry') ? 400 + laundryQuantity * 80 : 0)
              : laundryMeasureMode === 'kg'
                ? laundryQuantity * LAUNDRY_KES_PER_KG
                : laundryItemCount * LAUNDRY_KES_PER_ITEM);
          const loadSummary =
            laundryPickupMode === 'mamafua'
              ? selectedMamaFuaTasks.length
                ? mamaFuaTasks
                    .filter((t) => selectedMamaFuaTasks.includes(t.id))
                    .map((t) => t.label)
                    .join(', ')
                : 'No tasks yet'
              : laundryMeasureMode === 'kg'
                ? `${laundryQuantity} kg`
                : `${laundryItemCount} items`;
          const mamafuaMode = laundryPickupMode === 'mamafua';
          const stationMode = !mamafuaMode && laundryStationId != null;
          const pickupLabel = mamafuaMode
            ? 'Mama Fua visit'
            : stationMode && laundryStationId
              ? pickupStations.find((s) => s.id === laundryStationId)?.name ?? 'Hub'
              : 'Your door';
          const pickupDetail = mamafuaMode
            ? pickupDisplayLabel
            : stationMode && laundryStationId
              ? pickupStations.find((s) => s.id === laundryStationId)?.subtitle ?? pickupDisplayLabel
              : pickupDisplayLabel;
          const bookingIndex = FUA_WIZARD_BOOKING_ORDER.indexOf(laundryWizardStep);
          const stepCopy = fuaStepCopy(laundryPickupMode, laundryWizardStep);
          const visibleFuaHubs = nearbyStations.slice(0, 4);
          const nestSurface = nestedChrome(themeMode === 'dark');
          const watermarkColor = themeMode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(232,90,28,0.07)';
          return (
            <View style={styles.fuaSheetRoot}>
              <View style={styles.fuaWatermark} pointerEvents="none" accessibilityElementsHidden>
                <AppIcon name="washer" size={168} color={watermarkColor} />
              </View>

              {FUA_WIZARD_BOOKING_ORDER.includes(laundryWizardStep) ? (
                <View style={styles.fuaHeaderBlock}>
                  <View style={styles.fuaDots} accessibilityRole="progressbar">
                    {FUA_WIZARD_BOOKING.map((step, i) => (
                      <View
                        key={step.key}
                        style={[
                          styles.fuaDot,
                          { backgroundColor: theme.border },
                          i <= bookingIndex && { backgroundColor: theme.primary },
                        ]}
                      />
                    ))}
                  </View>
                  <AccessibleText style={[styles.fuaTitle, { color: theme.textPrimary }]}>
                    {stepCopy.title}
                  </AccessibleText>
                  <AccessibleText style={[styles.fuaSubtitle, { color: theme.textSecondary }]}>
                    {stepCopy.subtitle}
                  </AccessibleText>
                </View>
              ) : null}

              {laundryWizardStep === 'pickup' ? (
                <>
                  <View style={styles.fuaServiceChoiceRow}>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={chipLabel('Laundry', !mamafuaMode)}
                      accessibilityState={{ selected: !mamafuaMode }}
                      style={[
                        styles.fuaServiceChoiceCard,
                        nestSurface,
                        !mamafuaMode && styles.fuaServiceChoiceCardOn,
                      ]}
                      onPress={() => {
                        HapticMap.selection();
                        setLaundryPickupMode('door');
                        setLaundryStationId(null);
                        setFuaShowHubs(false);
                      }}
                    >
                      <View
                        style={[
                          styles.fuaChoiceIconWell,
                          { backgroundColor: !mamafuaMode ? `${theme.primary}22` : theme.mutedSurface },
                        ]}
                      >
                        <AppIcon
                          name="washer"
                          size={26}
                          color={!mamafuaMode ? theme.primary : theme.textSecondary}
                        />
                      </View>
                      <AccessibleText
                        style={[
                          styles.fuaServiceChoiceTitle,
                          { color: !mamafuaMode ? theme.primary : theme.textPrimary },
                        ]}
                      >
                        Laundry
                      </AccessibleText>
                      <AccessibleText style={[styles.fuaServiceChoiceSub, { color: theme.textSecondary }]}>
                        Wash & fold
                      </AccessibleText>
                    </PressableScale>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={chipLabel('Mama Fua', mamafuaMode)}
                      accessibilityState={{ selected: mamafuaMode }}
                      style={[
                        styles.fuaServiceChoiceCard,
                        nestSurface,
                        mamafuaMode && styles.fuaServiceChoiceCardOn,
                      ]}
                      onPress={() => {
                        HapticMap.selection();
                        setLaundryPickupMode('mamafua');
                        setLaundryStationId(null);
                        setFuaShowHubs(false);
                      }}
                    >
                      <View
                        style={[
                          styles.fuaChoiceIconWell,
                          { backgroundColor: mamafuaMode ? `${theme.primary}22` : theme.mutedSurface },
                        ]}
                      >
                        <AppIcon
                          name="mamafua"
                          size={26}
                          color={mamafuaMode ? theme.primary : theme.textSecondary}
                        />
                      </View>
                      <AccessibleText
                        style={[
                          styles.fuaServiceChoiceTitle,
                          { color: mamafuaMode ? theme.primary : theme.textPrimary },
                        ]}
                      >
                        Mama Fua
                      </AccessibleText>
                      <AccessibleText style={[styles.fuaServiceChoiceSub, { color: theme.textSecondary }]}>
                        Home clean
                      </AccessibleText>
                    </PressableScale>
                  </View>

                  <PressableScale
                    style={[styles.fuaLocationCard, nestSurface]}
                    onPress={() => {
                      HapticMap.light();
                      void fetchCurrentLocation();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Update location"
                  >
                    <AppIcon name="location" size={18} color={theme.primary} />
                    <View style={styles.fuaLocationBody}>
                      <AccessibleText style={[styles.fuaLocationLabel, { color: theme.textMuted }]}>
                        {mamafuaMode ? 'Your home' : stationMode ? 'Drop-off hub' : 'We pick up here'}
                      </AccessibleText>
                      <AccessibleText
                        style={[styles.fuaLocationValue, { color: theme.textPrimary }]}
                        numberOfLines={2}
                      >
                        {stationMode
                          ? pickupStations.find((s) => s.id === laundryStationId)?.name ?? 'Hub'
                          : pickupDisplayLabel}
                      </AccessibleText>
                    </View>
                    <AccessibleText style={[styles.fuaLocationAction, { color: theme.primary }]}>
                      {locationLoading ? '…' : '↻'}
                    </AccessibleText>
                  </PressableScale>

                  {mamafuaMode ? (
                    <>
                      <View style={styles.fuaWhenRow}>
                        {mamafuaWhenOptions.map((band) => {
                          const on = valetStudioWhen === band.id;
                          return (
                            <PressableScale
                              key={band.id}
                              accessibilityRole="button"
                              accessibilityLabel={chipLabel(band.label, on)}
                              accessibilityState={{ selected: on }}
                              style={[
                                styles.fuaWhenChip,
                                nestSurface,
                                on && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
                              ]}
                              onPress={() => {
                                HapticMap.selection();
                                setValetStudioWhen(band.id);
                              }}
                            >
                              <AccessibleText
                                style={[
                                  styles.fuaWhenChipText,
                                  { color: on ? theme.primary : theme.textPrimary },
                                ]}
                              >
                                {band.label}
                              </AccessibleText>
                            </PressableScale>
                          );
                        })}
                      </View>
                      <TextInput
                        value={valetStudioNotes}
                        onChangeText={setValetStudioNotes}
                        placeholder="Optional notes (gate, floor…)"
                        placeholderTextColor={theme.textMuted}
                        multiline
                        accessibilityLabel="Optional notes"
                        style={[styles.fuaNotesInput, nestSurface, { color: theme.textPrimary, borderColor: theme.border }]}
                      />
                    </>
                  ) : (
                    <>
                      {stationMode ? (
                        <Pressable
                          onPress={() => {
                            HapticMap.selection();
                            setLaundryStationId(null);
                            setLaundryPickupMode('door');
                            setFuaShowHubs(false);
                          }}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Switch back to door pickup"
                        >
                          <AccessibleText style={[styles.fuaInlineLink, { color: theme.primary }]}>
                            Switch to door pickup
                          </AccessibleText>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => {
                            HapticMap.selection();
                            setFuaShowHubs((v) => !v);
                          }}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={fuaShowHubs ? 'Hide hubs' : 'Drop at a hub instead'}
                        >
                          <AccessibleText style={[styles.fuaInlineLink, { color: theme.primary }]}>
                            {fuaShowHubs ? 'Hide hubs' : 'Drop at a hub instead ›'}
                          </AccessibleText>
                        </Pressable>
                      )}

                      {(fuaShowHubs || stationMode) && visibleFuaHubs.length > 0 ? (
                        <CarouselZone>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.fuaStationScroll}
                            contentContainerStyle={{ paddingRight: 8 }}
                          >
                            {visibleFuaHubs.map((hub) => {
                              const on = laundryStationId === hub.id;
                              return (
                                <PressableScale
                                  key={hub.id}
                                  accessibilityRole="button"
                                  accessibilityLabel={chipLabel(hub.name, on)}
                                  accessibilityState={{ selected: on }}
                                  onPress={() => {
                                    HapticMap.selection();
                                    setLaundryPickupMode('station');
                                    setLaundryStationId(hub.id);
                                  }}
                                  style={[
                                    styles.fuaStationChip,
                                    nestSurface,
                                    { borderColor: theme.border },
                                    on && styles.fuaStationChipOn,
                                  ]}
                                >
                                  <AccessibleText
                                    style={[styles.fuaStationChipText, on && styles.fuaStationChipTextOn]}
                                    numberOfLines={1}
                                  >
                                    {hub.name}
                                  </AccessibleText>
                                </PressableScale>
                              );
                            })}
                            <PressableScale
                              style={[styles.fuaStationChip, nestSurface, { borderColor: theme.border }]}
                              onPress={() => {
                                HapticMap.light();
                                setHomeSheetStageAnimated('collapsed');
                                setHomeDeepPage('service-map');
                              }}
                              accessibilityRole="button"
                              accessibilityLabel="Open map for more hubs"
                            >
                              <AccessibleText style={[styles.fuaStationChipText, { color: theme.primary }]}>
                                Map ›
                              </AccessibleText>
                            </PressableScale>
                          </ScrollView>
                        </CarouselZone>
                      ) : null}
                    </>
                  )}
                </>
              ) : null}

              {laundryWizardStep === 'load' ? (
                <>
                  {mamafuaMode ? (
                    <>
                      {mamaFuaTasks.map((task) => {
                        const on = selectedMamaFuaTasks.includes(task.id);
                        return (
                          <PressableScale
                            key={task.id}
                            accessibilityRole="checkbox"
                            accessibilityLabel={chipLabel(`${task.label}, KES ${task.priceKes}`, on)}
                            accessibilityState={{ checked: on }}
                            style={[
                              styles.fuaTaskRow,
                              nestSurface,
                              on && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
                            ]}
                            onPress={() => {
                              HapticMap.selection();
                              setSelectedMamaFuaTasks((prev) =>
                                on ? prev.filter((id) => id !== task.id) : [...prev, task.id],
                              );
                            }}
                          >
                            <AccessibleText style={[styles.fuaTaskLabel, { color: theme.textPrimary }]}>
                              {task.label}
                            </AccessibleText>
                            <AccessibleText style={[styles.fuaTaskPrice, { color: theme.textSecondary }]}>
                              KES {task.priceKes}
                            </AccessibleText>
                            <AccessibleText
                              style={[styles.fuaTaskCheck, { color: on ? theme.primary : 'transparent' }]}
                            >
                              ✓
                            </AccessibleText>
                          </PressableScale>
                        );
                      })}
                      {selectedMamaFuaTasks.includes('laundry') ? (
                        <View style={[styles.valetStepperCompact, nestSurface, { marginTop: 8 }]}>
                          <Pressable
                            style={styles.valetStepperBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Decrease kilograms"
                            onPress={() => {
                              HapticMap.selection();
                              setLaundryQuantity((q) => Math.max(1, q - 1));
                            }}
                          >
                            <AccessibleText style={styles.valetStepperBtnText}>−</AccessibleText>
                          </Pressable>
                          <AccessibleText style={[styles.valetStepperValue, { color: theme.textPrimary }]}>
                            {laundryQuantity} kg
                          </AccessibleText>
                          <Pressable
                            style={styles.valetStepperBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Increase kilograms"
                            onPress={() => {
                              HapticMap.selection();
                              setLaundryQuantity((q) => Math.min(30, q + 1));
                            }}
                          >
                            <AccessibleText style={styles.valetStepperBtnText}>+</AccessibleText>
                          </Pressable>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <View style={[styles.fuaLoadCard, nestSurface]}>
                        <View style={styles.valetStepperCompact}>
                          <Pressable
                            style={styles.valetStepperBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Decrease load"
                            onPress={() => {
                              HapticMap.selection();
                              if (laundryMeasureMode === 'kg') {
                                setLaundryQuantity((q) => Math.max(1, q - 1));
                              } else {
                                setLaundryItemCount((n) => Math.max(1, n - 1));
                              }
                            }}
                          >
                            <AccessibleText style={styles.valetStepperBtnText}>−</AccessibleText>
                          </Pressable>
                          <View style={styles.fuaLoadCenter}>
                            <AccessibleText style={[styles.fuaLoadValue, { color: theme.textPrimary }]}>
                              {loadSummary}
                            </AccessibleText>
                            <AccessibleText style={[styles.fuaLoadHint, { color: theme.textMuted }]}>
                              {laundryMeasureMode === 'kg' ? 'About a bag or two' : 'Rough count is fine'}
                            </AccessibleText>
                          </View>
                          <Pressable
                            style={styles.valetStepperBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Increase load"
                            onPress={() => {
                              HapticMap.selection();
                              if (laundryMeasureMode === 'kg') {
                                setLaundryQuantity((q) => Math.min(30, q + 1));
                              } else {
                                setLaundryItemCount((n) => Math.min(45, n + 1));
                              }
                            }}
                          >
                            <AccessibleText style={styles.valetStepperBtnText}>+</AccessibleText>
                          </Pressable>
                        </View>
                        <Pressable
                          onPress={() => {
                            HapticMap.selection();
                            setLaundryMeasureMode((m) => (m === 'kg' ? 'items' : 'kg'));
                          }}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={
                            laundryMeasureMode === 'kg' ? 'Switch to item count' : 'Switch to kilograms'
                          }
                        >
                          <AccessibleText style={[styles.fuaInlineLink, { color: theme.primary, textAlign: 'center' }]}>
                            {laundryMeasureMode === 'kg' ? 'Count by items instead' : 'Switch to kg'}
                          </AccessibleText>
                        </Pressable>
                      </View>
                      <View
                        style={[
                          styles.rideWizardFareCard,
                          { backgroundColor: theme.primaryLight, borderColor: theme.primary },
                        ]}
                      >
                        <AccessibleText style={[styles.rideWizardFareLabel, { color: theme.textSecondary }]}>
                          Estimate
                        </AccessibleText>
                        <AccessibleText style={[styles.rideWizardFareValue, { color: theme.textPrimary }]}>
                          KES {laundryEstimateKes}
                        </AccessibleText>
                      </View>
                    </>
                  )}
                </>
              ) : null}

              {laundryWizardStep === 'review' ? (
                <View style={[styles.fuaReceipt, nestSurface, { borderColor: theme.border }]}>
                  <AccessibleText style={[styles.fuaReceiptLine, { color: theme.textPrimary }]}>
                    {pickupLabel}
                  </AccessibleText>
                  <AccessibleText style={[styles.fuaReceiptMeta, { color: theme.textSecondary }]} numberOfLines={2}>
                    {pickupDetail}
                  </AccessibleText>
                  {mamafuaMode ? (
                    <AccessibleText style={[styles.fuaReceiptMeta, { color: theme.textSecondary }]}>
                      {fuaWhenLabel(valetStudioWhen, mamafuaWhenOptions)}
                      {valetStudioNotes.trim() ? ` · ${valetStudioNotes.trim()}` : ''}
                    </AccessibleText>
                  ) : null}
                  <AccessibleText style={[styles.fuaReceiptMeta, { color: theme.textSecondary }]}>
                    {loadSummary}
                  </AccessibleText>
                  <View style={[styles.fuaReceiptTotal, { borderTopColor: theme.border }]}>
                    <AccessibleText style={[styles.fuaReceiptTotalLabel, { color: theme.textSecondary }]}>
                      Total
                    </AccessibleText>
                    <AccessibleText style={[styles.fuaReceiptTotalValue, { color: theme.textPrimary }]}>
                      KES {laundryEstimateKes}
                    </AccessibleText>
                  </View>
                </View>
              ) : null}
            </View>
          );
        }
        case 'bnbs':
        case 'houses': {
          const isRental = staysSubTab === 'rental' || activeService === 'houses';
          const stayRows = isRental ? featuredHouses : featuredBnbs;
          const stayCount = isRental ? nearbyHouses.length : nearbyBnbs.length;
          const compactDetail = homeSheetStage !== 'full';
          const staysMapHeight =
            homeSheetStage === 'full' ? 280 : homeSheetStage === 'mid' ? 210 : 176;
          const nestSurface = nestedChrome(themeMode === 'dark');
          const watermarkColor = themeMode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(47,158,106,0.08)';
          return (
            <View style={styles.kejaSheetRoot}>
              <View style={styles.kejaWatermark} pointerEvents="none" accessibilityElementsHidden>
                <AppIcon name="home" size={168} color={watermarkColor} />
              </View>

              <View style={styles.kejaHeaderBlock}>
                <AccessibleText style={[styles.kejaTitle, { color: theme.textPrimary }]}>Keja</AccessibleText>
                <AccessibleText style={[styles.kejaSubtitle, { color: theme.textSecondary }]}>
                  {listingsInitialLoading
                    ? 'Finding places near you…'
                    : stayCount
                      ? `${stayCount} nearby · ${staysRadiusKm} km`
                      : listingsCounty
                        ? `Nothing nearby in ${countyDisplayLabel}`
                        : 'Turn on location to see nearby'}
                </AccessibleText>
              </View>

              <View style={styles.fuaServiceChoiceRow}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={chipLabel('BnB', !isRental)}
                  accessibilityState={{ selected: !isRental }}
                  style={[
                    styles.fuaServiceChoiceCard,
                    nestSurface,
                    !isRental && styles.fuaServiceChoiceCardOn,
                  ]}
                  onPress={() => {
                    HapticMap.selection();
                    setStaysSubTab('bnb');
                  }}
                >
                  <View
                    style={[
                      styles.fuaChoiceIconWell,
                      { backgroundColor: !isRental ? `${theme.primary}22` : theme.mutedSurface },
                    ]}
                  >
                    <AppIcon name="stays" size={24} color={!isRental ? theme.primary : theme.textSecondary} />
                  </View>
                  <AccessibleText
                    style={[
                      styles.fuaServiceChoiceTitle,
                      { color: !isRental ? theme.primary : theme.textPrimary },
                    ]}
                  >
                    BnB
                  </AccessibleText>
                  <AccessibleText style={[styles.fuaServiceChoiceSub, { color: theme.textSecondary }]}>
                    Short stays
                  </AccessibleText>
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={chipLabel('Rental', isRental)}
                  accessibilityState={{ selected: isRental }}
                  style={[
                    styles.fuaServiceChoiceCard,
                    nestSurface,
                    isRental && styles.fuaServiceChoiceCardOn,
                  ]}
                  onPress={() => {
                    HapticMap.selection();
                    setStaysSubTab('rental');
                  }}
                >
                  <View
                    style={[
                      styles.fuaChoiceIconWell,
                      { backgroundColor: isRental ? `${theme.primary}22` : theme.mutedSurface },
                    ]}
                  >
                    <AppIcon name="home" size={24} color={isRental ? theme.primary : theme.textSecondary} />
                  </View>
                  <AccessibleText
                    style={[
                      styles.fuaServiceChoiceTitle,
                      { color: isRental ? theme.primary : theme.textPrimary },
                    ]}
                  >
                    Rental
                  </AccessibleText>
                  <AccessibleText style={[styles.fuaServiceChoiceSub, { color: theme.textSecondary }]}>
                    Longer stay
                  </AccessibleText>
                </PressableScale>
              </View>

              <PressableScale
                style={[styles.kejaBrowseAll, nestSurface, { borderColor: theme.primary }]}
                onPress={() => {
                  HapticMap.light();
                  setListingCatalog(isRental ? 'house' : 'bnb');
                  setListingCounty('any');
                  setListingRadiusKm(staysRadiusKm);
                  setListingDetail(null);
                  setHomeSheetStageAnimated('full');
                  setHomeDeepPage('listings');
                }}
                accessibilityRole="button"
                accessibilityLabel="View all listings"
              >
                <View style={styles.kejaBrowseAllBody}>
                  <AccessibleText style={[styles.kejaBrowseAllTitle, { color: theme.primary }]}>
                    View all listings
                  </AccessibleText>
                  <AccessibleText style={[styles.kejaBrowseAllSub, { color: theme.textSecondary }]}>
                    Browse every place
                  </AccessibleText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.primary} />
              </PressableScale>

              <View style={styles.kejaToolbar}>
                <View style={[styles.staysViewToggle, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
                  <Pressable
                    style={[
                      styles.staysViewModeBtn,
                      staysSheetViewMode === 'list' && { backgroundColor: theme.primaryLight },
                    ]}
                    onPress={() => {
                      HapticMap.selection();
                      setStaysSheetViewMode('list');
                    }}
                    hitSlop={4}
                  >
                    <Ionicons
                      name="list-outline"
                      size={16}
                      color={staysSheetViewMode === 'list' ? theme.primary : theme.textSecondary}
                    />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.staysViewModeBtn,
                      staysSheetViewMode === 'map' && { backgroundColor: theme.primaryLight },
                    ]}
                    onPress={() => {
                      HapticMap.selection();
                      setStaysSheetViewMode('map');
                      if (!currentCoords) void fetchCurrentLocation();
                    }}
                    hitSlop={4}
                  >
                    <Ionicons
                      name="map-outline"
                      size={16}
                      color={staysSheetViewMode === 'map' ? theme.primary : theme.textSecondary}
                    />
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kejaRadiusRow}>
                  {STAYS_RADIUS_OPTIONS.map((km) => {
                    const on = staysRadiusKm === km;
                    return (
                      <Pressable
                        key={km}
                        style={[
                          styles.staysRadiusChip,
                          { borderColor: theme.border, backgroundColor: theme.canvas },
                          on && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
                        ]}
                        onPress={() => {
                          HapticMap.selection();
                          setStaysRadiusKm(km);
                        }}
                        hitSlop={4}
                      >
                        <Text
                          style={[
                            styles.staysRadiusChipText,
                            { color: on ? theme.primary : theme.textSecondary },
                            on && styles.staysViewLinkOn,
                          ]}
                        >
                          {km} km
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {staysSheetViewMode === 'map' ? (
                <View style={[styles.staysHomeMapBand, { height: staysMapHeight }]}>
                  {listingsInitialLoading ? (
                    <View style={[styles.serviceMapFallback, { justifyContent: 'center' }]}>
                      <ActivityIndicator size="small" color={theme.primary} />
                    </View>
                  ) : staysHomeMapHtml ? (
                    <WebView
                      ref={staysHomeMapWebViewRef}
                      source={{ html: staysHomeMapHtml }}
                      style={StyleSheet.absoluteFillObject}
                      originWhitelist={['*']}
                      javaScriptEnabled
                      domStorageEnabled
                      scrollEnabled={false}
                      bounces={false}
                      setSupportMultipleWindows={false}
                      mixedContentMode="always"
                      onMessage={onHomeMapWebViewMessage}
                      onLoadEnd={() => {
                        injectStaysHomeMapSync();
                      }}
                      {...ANDROID_MAP_WEBVIEW_PROPS}
                    />
                  ) : (
                    <View style={styles.serviceMapFallback}>
                      <Text style={styles.serviceMapFallbackText}>Map needs a Mapbox token.</Text>
                    </View>
                  )}
                </View>
              ) : listingsInitialLoading ? (
                <View style={styles.listingsLoadingRow}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : dataError && !listingsLoaded ? (
                <View style={styles.listingsLoadingRow}>
                  <Text style={[styles.juxHintMuted, { flex: 1 }]}>{dataError}</Text>
                  <Pressable onPress={() => void refreshAppData()} hitSlop={8}>
                    <Text style={{ color: theme.primary, fontWeight: '600' }}>Retry</Text>
                  </Pressable>
                </View>
              ) : stayRows.length > 0 ? (
                <CarouselZone>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.juxStayCarousel}
                    decelerationRate="fast"
                    snapToInterval={stayCardW + 10}
                  >
                    {isRental
                      ? featuredHouses.map((house) => {
                          const selected = focusedHouse?.id === house.id;
                          return (
                            <Pressable
                              key={house.id}
                              style={[styles.juxStayCard, { width: stayCardW }, selected && styles.juxStayCardSelected]}
                              onPress={() => {
                                setSelectedHouseId(house.id);
                                setHomeSheetStageAnimated('full');
                              }}
                            >
                              <View style={styles.juxStayCardImageWrap}>
                                <Image source={house.image} style={styles.juxStayCardImage} resizeMode="cover" />
                                <View style={styles.juxVacantBadge}>
                                  <Text style={styles.juxVacantBadgeText}>Vacant</Text>
                                </View>
                              </View>
                              <View style={styles.juxStayCardBody}>
                                <Text style={styles.juxStayCardTitle} numberOfLines={2}>
                                  {house.title}
                                </Text>
                                <ListingMetaText
                                  coords={house.coords}
                                  price={house.price}
                                  reference={listingDistanceRef}
                                  fallbackCounty={house.county}
                                  distanceColor={theme.primary}
                                  metaColor={theme.textSecondary}
                                  style={styles.juxStayCardMeta}
                                />
                              </View>
                            </Pressable>
                          );
                        })
                      : featuredBnbs.map((bnb) => {
                          const selected = focusedBnb?.id === bnb.id;
                          return (
                            <Pressable
                              key={bnb.id}
                              style={[styles.juxStayCard, { width: stayCardW }, selected && styles.juxStayCardSelected]}
                              onPress={() => {
                                setSelectedBnbId(bnb.id);
                                setHomeSheetStageAnimated('full');
                              }}
                            >
                              <Image source={bnb.image} style={styles.juxStayCardImage} resizeMode="cover" />
                              <View style={styles.juxStayCardBody}>
                                <Text style={styles.juxStayCardTitle} numberOfLines={2}>
                                  {bnb.title}
                                </Text>
                                <ListingMetaText
                                  coords={bnb.coords}
                                  price={`${bnb.rating} ★ · ${bnb.price}`}
                                  reference={listingDistanceRef}
                                  fallbackCounty={bnb.county}
                                  distanceColor={theme.primary}
                                  metaColor={theme.textSecondary}
                                  style={styles.juxStayCardMeta}
                                />
                              </View>
                            </Pressable>
                          );
                        })}
                  </ScrollView>
                </CarouselZone>
              ) : (
                <AccessibleText style={[styles.kejaLead, { color: theme.textMuted }]}>
                  Nothing nearby — try View all listings
                </AccessibleText>
              )}

              {isRental && focusedHouse ? (
                <View style={styles.juxListingDetail}>
                  <CarouselZone style={[styles.juxListingCarouselWrap, { width: listingCarouselW }]}>
                    <FlatList
                      style={{ width: listingCarouselW }}
                      data={focusedHouse.gallery}
                      horizontal
                      pagingEnabled
                      decelerationRate="fast"
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(_, i) => `${focusedHouse.id}-g-${i}`}
                      renderItem={({ item }) => (
                        <Image
                          source={item}
                          style={[
                            styles.juxListingCarouselSlide,
                            compactDetail && styles.juxListingCarouselSlideCompact,
                            { width: listingCarouselW },
                          ]}
                          resizeMode="cover"
                        />
                      )}
                      getItemLayout={(_, index) => ({
                        length: listingCarouselW,
                        offset: listingCarouselW * index,
                        index,
                      })}
                    />
                  </CarouselZone>
                  <View style={styles.juxListingDetailBody}>
                    <View style={styles.juxListingTitleRow}>
                      <Text style={styles.juxListingTitle}>{focusedHouse.title}</Text>
                      <ListingDistanceBadge
                        coords={focusedHouse.coords}
                        reference={listingDistanceRef}
                        fallbackLabel={`${focusedHouse.county} area`}
                        color={theme.primary}
                        approxColor={theme.textSecondary}
                        style={styles.juxListingRating}
                      />
                    </View>
                    <Text style={styles.juxListingPrice}>{focusedHouse.price}</Text>
                    <Text style={styles.juxListingDesc} numberOfLines={compactDetail ? 2 : 6}>
                      {rentalSubscriptionActive
                        ? `${focusedHouse.county} · exact pin unlocked. Viewings by appointment.`
                        : `${focusedHouse.county} area only — subscribe to unlock exact location and contact landlord.`}
                    </Text>
                    {!compactDetail
                      ? focusedHouse.detailHighlights.slice(0, 4).map((line) => (
                          <View key={line} style={styles.juxListingBulletRow}>
                            <Text style={styles.juxListingBulletGlyph}>●</Text>
                            <Text style={styles.juxListingBulletText}>{line}</Text>
                          </View>
                        ))
                      : null}
                    {!compactDetail ? (
                      <CarouselZone>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.juxChipRow}>
                        {focusedHouse.amenities.map((tag) => (
                          <View key={tag} style={styles.juxChip}>
                            <Text style={styles.juxChipText}>{tag}</Text>
                          </View>
                        ))}
                      </ScrollView>
                      </CarouselZone>
                    ) : null}
                    <View style={styles.valetListingFooterCompact}>
                      {rentalSubscriptionActive ? (
                        <Pressable
                          onPress={() => {
                            if (!MAPBOX_ACCESS_TOKEN) {
                              setBookingMessage('Add a Mapbox token (EXPO_PUBLIC_MAPBOX_TOKEN) for navigation.');
                              return;
                            }
                            if (!currentCoords) {
                              setBookingMessage('We need your current location — tap the location pill, then try again.');
                              return;
                            }
                            beginGuidedJourney({
                              end: focusedHouse.coords,
                              title: focusedHouse.title,
                              subtitle: formatListingMetaLine(
                              focusedHouse.coords,
                              focusedHouse.price,
                              listingDistanceRef,
                              focusedHouse.county,
                            ),
                              kind: 'house',
                            });
                          }}
                          style={styles.textRowActionHit}
                        >
                          <Text style={styles.textRowAction}>Live route</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          if (!focusedHouse.has3dTour) return;
                          setTourSheetTarget({ kind: 'house', id: focusedHouse.id });
                        }}
                        disabled={!focusedHouse.has3dTour}
                        style={styles.textRowActionHit}
                      >
                        <Text
                          style={[
                            styles.textRowActionMuted,
                            !focusedHouse.has3dTour && styles.valetListingSecondaryDisabled,
                          ]}
                        >
                          3D walkthrough
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : !isRental && focusedBnb ? (
                <View style={styles.juxListingDetail}>
                  <CarouselZone style={[styles.juxListingCarouselWrap, { width: listingCarouselW }]}>
                    <FlatList
                      style={{ width: listingCarouselW }}
                      data={focusedBnb.gallery}
                      horizontal
                      pagingEnabled
                      decelerationRate="fast"
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(_, i) => `${focusedBnb.id}-g-${i}`}
                      renderItem={({ item }) => (
                        <Image
                          source={item}
                          style={[
                            styles.juxListingCarouselSlide,
                            compactDetail && styles.juxListingCarouselSlideCompact,
                            { width: listingCarouselW },
                          ]}
                          resizeMode="cover"
                        />
                      )}
                      getItemLayout={(_, index) => ({
                        length: listingCarouselW,
                        offset: listingCarouselW * index,
                        index,
                      })}
                    />
                  </CarouselZone>
                  <View style={styles.juxListingDetailBody}>
                    <View style={styles.juxListingTitleRow}>
                      <Text style={styles.juxListingTitle}>{focusedBnb.title}</Text>
                      <ListingDistanceBadge
                        coords={focusedBnb.coords}
                        reference={listingDistanceRef}
                        fallbackLabel={`${focusedBnb.rating} ★`}
                        color={theme.primary}
                        approxColor={theme.textSecondary}
                        style={styles.juxListingRating}
                      />
                    </View>
                    <Text style={styles.juxListingPrice}>{focusedBnb.price}</Text>
                    <Text style={styles.juxListingDesc} numberOfLines={compactDetail ? 2 : 5}>
                      {focusedBnb.exploreReason}
                    </Text>
                    {!compactDetail
                      ? focusedBnb.detailHighlights.slice(0, 3).map((line) => (
                          <View key={line} style={styles.juxListingBulletRow}>
                            <Text style={styles.juxListingBulletGlyph}>●</Text>
                            <Text style={styles.juxListingBulletText}>{line}</Text>
                          </View>
                        ))
                      : null}
                    {!compactDetail ? (
                      <CarouselZone>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.juxChipRow}>
                        {focusedBnb.amenities.slice(0, 6).map((tag) => (
                          <View key={tag} style={styles.juxChip}>
                            <Text style={styles.juxChipText}>{tag}</Text>
                          </View>
                        ))}
                      </ScrollView>
                      </CarouselZone>
                    ) : null}
                    <View style={styles.valetListingFooterCompact}>
                      <Pressable
                        onPress={() => {
                          if (!MAPBOX_ACCESS_TOKEN) {
                            setBookingMessage('Add a Mapbox token (EXPO_PUBLIC_MAPBOX_TOKEN) for navigation.');
                            return;
                          }
                          if (!currentCoords) {
                            setBookingMessage('We need your current location — tap the location pill, then try again.');
                            return;
                          }
                          beginGuidedJourney({
                            end: focusedBnb.coords,
                            title: focusedBnb.title,
                            subtitle: `${focusedBnb.county} · ${focusedBnb.rating} ★ · ${focusedBnb.price}`,
                            kind: 'bnb',
                          });
                        }}
                        style={styles.textRowActionHit}
                      >
                        <Text style={styles.textRowAction}>Live route</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          void submitListingRequest('tour', focusedBnb.id, focusedBnb.title, 'bnb');
                        }}
                        style={styles.textRowActionHit}
                      >
                        <Text style={styles.textRowActionMuted}>Request tour</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          );
        }
        default:
          return null;
      }
    })();

    const laundryEstimateFooter =
      activeService === 'laundry'
        ? serverLaundryEstimate ??
          (laundryPickupMode === 'mamafua'
            ? mamaFuaDispatchFee +
              selectedMamaFuaTasks.reduce((sum, id) => sum + (mamaFuaTasks.find((t) => t.id === id)?.priceKes ?? 0), 0)
            : laundryMeasureMode === 'kg'
              ? laundryQuantity * LAUNDRY_KES_PER_KG
              : laundryItemCount * LAUNDRY_KES_PER_ITEM)
        : 0;
    const laundryLoadFooter =
      activeService === 'laundry'
        ? laundryPickupMode === 'mamafua'
          ? selectedMamaFuaTasks.length
            ? `${selectedMamaFuaTasks.length} task(s)`
            : 'No tasks'
          : laundryMeasureMode === 'kg'
            ? `${laundryQuantity} kg`
            : `${laundryItemCount} items`
        : '';

    const sheetFooter = (() => {
      if (activeTab !== 'home' || isComingSoonSegment) return null;
      if (activeSegment === 'home') return null;
      if (isActiveTripMode) {
        return (
          <SheetStickyFooter
            label="Cancel trip"
            sublabel="End live trip and return to booking"
            tone="outline"
            darkMode={themeMode === 'dark'}
            onPress={cancelLiveTrip}
          />
        );
      }
      if (activeService === 'laundry' && !isActiveTripMode) {
        const wizardBack = prevFuaWizardStep(laundryWizardStep);
        const advanceFuaWizard = () => {
          if (laundryWizardStep === 'load' && laundryPickupMode === 'mamafua' && selectedMamaFuaTasks.length === 0) {
            setBookingMessage('Select at least one task for Mama Fua');
            return;
          }
          const next = nextFuaWizardStep(laundryWizardStep);
          setLaundryWizardStep(next);
          setPhaseForService('laundry', 'selecting');
          setHomeSheetStageAnimated('mid');
        };
        const confirmLaundry = async () => {
          if (orderSubmitting) return;
          if (!isAuthed) {
            setBookingMessage('Sign in to place a Fua order');
            return;
          }
          if (laundryPickupMode === 'mamafua' && selectedMamaFuaTasks.length === 0) {
            setBookingMessage('Select at least one Mama Fua task');
            return;
          }
          setOrderSubmitting(true);
          try {
            const order = await createLaundryOrder(buildLaundryOrderBody());
            const where =
              laundryPickupMode === 'mamafua'
                ? 'Mama Fua visit'
                : laundryStationId
                  ? pickupStations.find((s) => s.id === laundryStationId)?.name ?? 'Station'
                  : 'Your location';
            const request = `Jua Fua · ${order.pickupLabel || where} · ${order.loadLabel} · KES ${order.totalKes}`;
            setTripFeed((prev) => [request, ...prev].slice(0, 10));
            const shortMsg =
              order.serviceType === 'mamafua'
                ? 'Mama Fua visit submitted — check Activity'
                : 'Fua request submitted — check Activity';
            flashBookingNotice(shortMsg, { goTrips: true });
            setLaundryWizardStep('pickup');
            setFuaShowHubs(false);
            setPhaseForService('laundry', 'selecting');
            setHomeSheetStageAnimated('mid');
            void reloadLaundryOrders();
          } catch (err) {
            setBookingMessage(err instanceof Error ? err.message : 'Could not create order — sign in and try again');
          } finally {
            setOrderSubmitting(false);
          }
        };
        if (laundryWizardStep === 'pickup') {
          const pickupSublabel =
            laundryPickupMode === 'mamafua'
              ? fuaWhenLabel(valetStudioWhen, mamafuaWhenOptions)
              : laundryStationId != null
                ? pickupStations.find((s) => s.id === laundryStationId)?.name ?? 'Hub'
                : 'Door pickup';
          return (
            <SheetStickyFooter
              label="Continue"
              sublabel={pickupSublabel}
              darkMode={themeMode === 'dark'}
              onPress={advanceFuaWizard}
            />
          );
        }
        if (laundryWizardStep === 'load') {
          return (
            <SheetStickyFooter
              label="Continue"
              sublabel={`${laundryLoadFooter} · KES ${laundryEstimateFooter}`}
              darkMode={themeMode === 'dark'}
              onBack={() => wizardBack && setLaundryWizardStep(wizardBack)}
              onPress={advanceFuaWizard}
            />
          );
        }
        if (laundryWizardStep === 'review') {
          return (
            <SheetStickyFooter
              label={orderSubmitting ? 'Submitting…' : 'Confirm request'}
              tone="primary"
              sublabel={`KES ${laundryEstimateFooter} · ${laundryLoadFooter}`}
              disabled={orderSubmitting}
              darkMode={themeMode === 'dark'}
              onBack={() => wizardBack && setLaundryWizardStep(wizardBack)}
              onPress={() => void confirmLaundry()}
            />
          );
        }
        return null;
      }
      if (activeService === 'rides' && !isActiveTripMode) {
        const pickupLabel =
          ridePickupMode === 'station' && ridePickupStationId
            ? pickupStations.find((s) => s.id === ridePickupStationId)?.name ?? 'Pickup hub'
            : 'Your location';
        const wizardBack = prevRideWizardStep(rideWizardStep);
        const advanceWizard = () => {
          const next = nextRideWizardStep(rideWizardStep);
          setRideWizardStep(next);
          if (next === 'matching') {
            setPhaseForService('rides', 'confirmed');
          }
          setHomeSheetStageAnimated('mid');
        };
        if (rideWizardStep === 'pickup') {
          return (
            <SheetStickyFooter
              label="Continue"
              sublabel={pickupLabel}
              darkMode={themeMode === 'dark'}
              onPress={advanceWizard}
            />
          );
        }
        if (rideWizardStep === 'destination') {
          return (
            <SheetStickyFooter
              label="Continue"
              sublabel={selectedDestination.name}
              darkMode={themeMode === 'dark'}
              onBack={() => wizardBack && setRideWizardStep(wizardBack)}
              onPress={advanceWizard}
            />
          );
        }
        if (rideWizardStep === 'ride_type') {
          return (
            <SheetStickyFooter
              label="Continue"
              sublabel={selectedRide.label}
              darkMode={themeMode === 'dark'}
              onBack={() => wizardBack && setRideWizardStep(wizardBack)}
              onPress={advanceWizard}
            />
          );
        }
        if (rideWizardStep === 'review') {
          return (
            <SheetStickyFooter
              label={estimatedFare !== null ? `Request ride · KES ${estimatedFare}` : 'Request ride'}
              tone="primary"
              sublabel={`${pickupLabel} → ${selectedDestination.name}`}
              darkMode={themeMode === 'dark'}
              onBack={() => wizardBack && setRideWizardStep(wizardBack)}
              onPress={advanceWizard}
            />
          );
        }
        if (rideWizardStep === 'matching') {
          return (
            <SheetStickyFooter
              label="Finding your driver…"
              sublabel="Checking proximity nearby"
              disabled
              darkMode={themeMode === 'dark'}
              onPress={() => {}}
            />
          );
        }
        if (rideWizardStep === 'driver_eta') {
          return (
            <SheetStickyFooter
              label={`Driver ~${Math.max(2, selectedRide.minutes - 1)} min away`}
              sublabel={`${selectedRide.label} en route to ${pickupLabel}`}
              disabled
              darkMode={themeMode === 'dark'}
              onPress={() => {}}
            />
          );
        }
        if (rideWizardStep === 'payment') {
          return (
            <SheetStickyFooter
              label={estimatedFare !== null ? `Pay with M-Pesa · KES ${estimatedFare}` : 'Pay with M-Pesa'}
              tone="primary"
              sublabel={`${selectedDestination.name} · ${selectedRide.label}`}
              darkMode={themeMode === 'dark'}
              onPress={() => {
                const bits = [
                  `${selectedRide.label} • ${selectedDestination.name}${routeDurationMin ? ` • ${routeDurationMin} min` : ''}`,
                ];
                if (ridePlannerLuggage) bits.push('luggage');
                if (ridePlannerMeetAssist) bits.push('meet & assist');
                if (ridePlannerStop.trim()) bits.push(`via ${ridePlannerStop.trim()}`);
                const tripSummary = bits.join(' · ');
                setTripFeed((previous) => [tripSummary, ...previous].slice(0, 10));
                flashBookingNotice('Ride confirmed — check Activity', { goTrips: true });
                setPhaseForService('rides', 'idle');
                setRideWizardStep('pickup');
                setHomeSheetStageAnimated('mid');
              }}
            />
          );
        }
        return null;
      }
      if (activeService === 'bnbs' || activeService === 'houses') {
        const isRental = staysSubTab === 'rental' || activeService === 'houses';
        if (isRental) {
          if (!focusedHouse) {
            return (
              <SheetStickyFooter
                label="Select a rental"
                sublabel={`Within ${staysRadiusKm} km · ${countyDisplayLabel}`}
                disabled
                darkMode={themeMode === 'dark'}
                onPress={() => {}}
              />
            );
          }
        const focusedHouseRequest = activeListingRequestsByListingId.get(focusedHouse.id);
        if (focusedHouseRequest) {
          return (
            <SheetStickyFooter
              label="Requested"
              tone="outline"
              sublabel={`${focusedHouse.title} · ${focusedHouseRequest.statusLabel ?? LISTING_REQUEST_STATUS_LABELS[focusedHouseRequest.status] ?? focusedHouseRequest.status}`}
              darkMode={themeMode === 'dark'}
              onPress={() => void openListingRequestDetail(focusedHouseRequest.id)}
            />
          );
        }
          if (!rentalSubscriptionActive) {
            return (
              <SheetStickyFooter
                label={requestSubmitting ? 'Submitting…' : 'Subscribe to unlock'}
                tone="primary"
                sublabel={
                  subscriptionPlans[0]
                    ? `${subscriptionPlans[0].label} · KES ${subscriptionPlans[0].priceKes} · request viewings`
                    : 'Weekly plan · request viewings'
                }
                disabled={requestSubmitting}
                darkMode={themeMode === 'dark'}
                onPress={() => setSubscriptionSheetOpen(true)}
              />
            );
          }
          return (
            <SheetStickyFooter
              label={requestSubmitting ? 'Submitting…' : 'Request viewing'}
              tone="primary"
              sublabel={`${focusedHouse.title} · ${focusedHouse.price}`}
              disabled={requestSubmitting}
              darkMode={themeMode === 'dark'}
              onPress={() =>
                openViewingRequestSheet(focusedHouse.id, focusedHouse.title, 'house', {
                  priceLabel: focusedHouse.price,
                })
              }
            />
          );
        }
        if (!focusedBnb) {
          return (
            <SheetStickyFooter
              label="Select a stay"
              sublabel={`Book-to-reveal address · ${countyDisplayLabel}`}
              disabled
              darkMode={themeMode === 'dark'}
              onPress={() => {}}
            />
          );
        }
        const focusedBnbBooking = findActiveBnbBookingForListing(bnbBookings, focusedBnb.id);
        if (focusedBnbBooking) {
          return (
            <SheetStickyFooter
              label="Reserved"
              tone="outline"
              sublabel={`${focusedBnb.title} · ${focusedBnbBooking.checkIn} → ${focusedBnbBooking.checkOut}`}
              darkMode={themeMode === 'dark'}
              onPress={() => void openBookedStayDetail(focusedBnbBooking.id)}
            />
          );
        }
        return (
          <SheetStickyFooter
            label={requestSubmitting ? 'Submitting…' : 'Reserve stay'}
            tone="primary"
            sublabel={`${focusedBnb.title} · ${focusedBnb.price}`}
            disabled={requestSubmitting}
            darkMode={themeMode === 'dark'}
            onPress={() => openBnbBooking(focusedBnb.id, focusedBnb.title, focusedBnb.price)}
          />
        );
      }
      return null;
    })();

    const homeDeepFooter = (() => {
      if (homeDeepPage === null) return null;
      if (homeDeepPage === 'listing-detail' && listingDetailEntity) {
        if (listingDetail?.kind === 'bnb') {
          const b = listingDetailEntity as BnbListing;
          const detailBooking = findActiveBnbBookingForListing(bnbBookings, b.id);
          if (detailBooking) {
            return (
              <SheetStickyFooter
                label="Reserved"
                tone="outline"
                sublabel={`${b.title} · ${detailBooking.checkIn} → ${detailBooking.checkOut}`}
                darkMode={themeMode === 'dark'}
                style={{ paddingBottom: insets.bottom + 8 }}
                onPress={() => void openBookedStayDetail(detailBooking.id)}
              />
            );
          }
          return (
            <SheetStickyFooter
              label={requestSubmitting ? 'Submitting…' : 'Reserve stay'}
              sublabel={`${b.title} · ${b.price}`}
              disabled={requestSubmitting}
              darkMode={themeMode === 'dark'}
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={() => openBnbBooking(b.id, b.title, b.price)}
            />
          );
        }
        const h = listingDetailEntity as HouseListing;
        const houseRequest = activeListingRequestsByListingId.get(h.id);
        if (houseRequest) {
          return (
            <SheetStickyFooter
              label="Requested"
              tone="outline"
              sublabel={`${h.title} · ${houseRequest.statusLabel ?? LISTING_REQUEST_STATUS_LABELS[houseRequest.status] ?? houseRequest.status}`}
              darkMode={themeMode === 'dark'}
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={() => void openListingRequestDetail(houseRequest.id)}
            />
          );
        }
        if (!rentalSubscriptionActive) {
          return (
            <SheetStickyFooter
              label={requestSubmitting ? 'Submitting…' : 'Subscribe to unlock'}
              sublabel={
                subscriptionPlans[0]
                  ? `${subscriptionPlans[0].label} · KES ${subscriptionPlans[0].priceKes}`
                  : 'Weekly · then request viewing'
              }
              disabled={requestSubmitting}
              darkMode={themeMode === 'dark'}
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={() => setSubscriptionSheetOpen(true)}
            />
          );
        }
        return (
          <SheetStickyFooter
            label={requestSubmitting ? 'Submitting…' : 'Request viewing'}
            sublabel={`${h.title} · ${h.price}`}
            disabled={requestSubmitting}
            darkMode={themeMode === 'dark'}
            style={{ paddingBottom: insets.bottom + 8 }}
            onPress={() =>
              openViewingRequestSheet(h.id, h.title, 'house', {
                closeDeepPage: true,
                priceLabel: h.price,
              })
            }
          />
        );
      }
      if (homeDeepPage === 'listings' && listingsViewMode === 'map' && listingsMapSelectedId) {
        const mapListing =
          listingCatalog === 'bnb'
            ? catalogBnbs.find((b) => b.id === listingsMapSelectedId)
            : catalogHouses.find((h) => h.id === listingsMapSelectedId);
        if (mapListing) {
          const title = mapListing.title;
          const price = mapListing.price;
          const distLabel = formatListingDistanceLabel(mapListing.coords, listingDistanceRef);
          return (
            <SheetStickyFooter
              label="View listing details"
              sublabel={
                distLabel
                  ? `${distLabel}${listingDistanceRef.isApproximate ? ' approx' : ''} · ${title} · ${price}`
                  : `${title} · ${price}`
              }
              darkMode={themeMode === 'dark'}
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={() => {
                setHomeListingPreview(null);
                if (listingCatalog === 'bnb') {
                  setSelectedBnbId(mapListing.id);
                  setSelectedHouseId(null);
                  setActiveService('bnbs');
                  setActiveSegment('bnbs');
                  setListingDetail({ kind: 'bnb', id: mapListing.id });
                } else {
                  setSelectedHouseId(mapListing.id);
                  setSelectedBnbId(null);
                  setActiveService('bnbs');
                  setActiveSegment('bnbs');
                  setStaysSubTab('rental');
                  setListingDetail({ kind: 'house', id: mapListing.id });
                }
                setHomeDeepPage('listing-detail');
              }}
            />
          );
        }
      }
      if (homeDeepPage === 'valet-studio') {
        return (
          <SheetStickyFooter
            label="Save & return to sheet"
            sublabel="Preferences apply to your Fua request"
            darkMode={themeMode === 'dark'}
            style={{ paddingBottom: insets.bottom + 8 }}
            onPress={() => {
              setBookingMessage('Fua studio preferences saved — review the sheet and confirm.');
              setHomeDeepPage(null);
              setListingDetail(null);
              setHomeSheetStageAnimated('mid');
            }}
          />
        );
      }
      if (homeDeepPage === 'rides-planner') {
        return (
          <SheetStickyFooter
            label="Done · back to ride sheet"
            sublabel="Extras saved to your ride"
            darkMode={themeMode === 'dark'}
            style={{ paddingBottom: insets.bottom + 8 }}
            onPress={() => {
              setHomeDeepPage(null);
              setListingDetail(null);
              setActiveService('rides');
              setActiveSegment('rides');
              setRideWizardStep('ride_type');
              setHomeSheetStageAnimated('mid');
            }}
          />
        );
      }
      if (homeDeepPage === 'service-map') {
        if (activeService === 'laundry' && laundryPickupMode === 'mamafua') {
          return (
            <SheetStickyFooter
              label="Back to Mama Fua booking"
              sublabel={currentLocationLabel}
              darkMode={themeMode === 'dark'}
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={() => {
                setHomeDeepPage(null);
                setLaundryWizardStep('pickup');
                setHomeSheetStageAnimated('mid');
              }}
            />
          );
        }
        const laundryStation =
          activeService === 'laundry' && laundryStationId
            ? pickupStations.find((s) => s.id === laundryStationId)
            : null;
        const rideHub =
          activeService === 'rides' && ridePickupStationId
            ? pickupStations.find((s) => s.id === ridePickupStationId)
            : null;
        if (laundryStation && activeService === 'laundry') {
          return (
            <SheetStickyFooter
              label="Use pickup station"
              sublabel={`${laundryStation.name} · return to wizard`}
              darkMode={themeMode === 'dark'}
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={() => {
                setHomeDeepPage(null);
                setLaundryWizardStep('pickup');
                setHomeSheetStageAnimated('mid');
                setPhaseForService('laundry', 'selecting');
                setBookingMessage('Pickup station saved — continue in the Fua wizard.');
              }}
            />
          );
        }
        if (
          activeService === 'rides' &&
          rideWizardStep === 'pickup' &&
          serviceMapRidePinFocus === 'destination'
        ) {
          return (
            <SheetStickyFooter
              label="Use destination"
              sublabel={`${selectedDestination.name} · return to wizard`}
              darkMode={themeMode === 'dark'}
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={() => {
                setHomeDeepPage(null);
                setRideWizardStep('destination');
                setHomeSheetStageAnimated('mid');
                setPhaseForService('rides', 'selecting');
                setServiceMapRidePinFocus(null);
                setBookingMessage(`Destination set · ${selectedDestination.name}`);
              }}
            />
          );
        }
        if (
          rideHub &&
          activeService === 'rides' &&
          rideWizardStep === 'pickup' &&
          serviceMapRidePinFocus === 'hub'
        ) {
          return (
            <SheetStickyFooter
              label="Use pickup hub"
              sublabel={`${rideHub.name} · return to wizard`}
              darkMode={themeMode === 'dark'}
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={() => {
                setRidePickupMode('station');
                setHomeDeepPage(null);
                setRideWizardStep('pickup');
                setHomeSheetStageAnimated('mid');
                setPhaseForService('rides', 'selecting');
                setServiceMapRidePinFocus(null);
                setBookingMessage('Pickup hub saved — continue in the ride wizard.');
              }}
            />
          );
        }
        if (activeService === 'rides' && rideWizardStep === 'destination') {
          return (
            <SheetStickyFooter
              label="Use destination"
              sublabel={`${selectedDestination.name} · return to wizard`}
              darkMode={themeMode === 'dark'}
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={() => {
                setHomeDeepPage(null);
                setRideWizardStep('destination');
                setHomeSheetStageAnimated('mid');
                setPhaseForService('rides', 'selecting');
                setBookingMessage(`Destination set · ${selectedDestination.name}`);
              }}
            />
          );
        }
        return (
          <SheetStickyFooter
            label="Back to wizard"
            sublabel={
              activeService === 'laundry'
                ? laundryPickupMode === 'mamafua'
                  ? 'Green pin = your home — confirm you are in the right place'
                  : 'Green pin = you · orange = hub — tap a pin to select'
                : activeService === 'rides' && rideWizardStep === 'destination'
                  ? 'Tap a gold pin for your destination'
                  : activeService === 'rides'
                    ? 'Green = you · blue = hub · gold = destination — tap a pin'
                    : 'Tap a pin to preview a listing'
            }
            darkMode={themeMode === 'dark'}
            style={{ paddingBottom: insets.bottom + 8 }}
            onPress={() => {
              setHomeDeepPage(null);
              if (activeService === 'laundry') setLaundryWizardStep('pickup');
              if (activeService === 'rides') {
                setRideWizardStep(rideWizardStep === 'destination' ? 'destination' : 'pickup');
              }
              setHomeSheetStageAnimated('mid');
            }}
          />
        );
      }
      return null;
    })();

    return (
      <>
      <ServiceSwipeProvider>
      <View
        style={[styles.juxShell, { backgroundColor: theme.canvas }]}
        {...serviceSwipePan.panHandlers}
      >
        {showMapBand ? (
          <View style={[styles.juxMapBand, { height: mapBandHeight }]} pointerEvents="box-none" collapsable={false}>
            {mapCfg.html ? (
              <WebView
                ref={homeMainMapRef}
                source={{ html: mapCfg.html }}
                style={StyleSheet.absoluteFillObject}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                scrollEnabled={false}
                bounces={false}
                setSupportMultipleWindows={false}
                mixedContentMode="always"
                onMessage={onHomeMapWebViewMessage}
                onLoadEnd={() => {
                  injectMapSync();
                }}
                {...ANDROID_MAP_WEBVIEW_PROPS}
              />
            ) : mapCfg.previewUri ? (
              <Image source={{ uri: mapCfg.previewUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            ) : (
              <ImageBackground source={require('./template/Preview 4.png')} style={StyleSheet.absoluteFillObject} resizeMode="cover">
                <View style={styles.mapOverlay}>
                  <Text style={styles.mapOverlayText}>{mapCfg.fb}</Text>
                </View>
              </ImageBackground>
            )}
            {onHomeTab && mapEmphasis === 'default' ? (
              <View style={[styles.mapLocationBanner, { top: 8 }]}>
                <View style={styles.mapLocationDot} />
                <Text style={styles.mapLocationText} numberOfLines={1}>
                  {locationLoading ? 'Locating…' : currentLocationLabel}
                </Text>
                {locationLoading ? <ActivityIndicator size="small" color={theme.primary} /> : null}
              </View>
            ) : null}
            {mapEmphasis === 'route' ? (
              <View style={[styles.mapEmphasisPill, { top: 8 }]}>
                <Text style={styles.mapEmphasisPillText}>Route preview</Text>
              </View>
            ) : null}
            {mapEmphasis === 'pickup' ? (
              <View style={[styles.mapEmphasisPill, { top: 8 }]}>
                <Text style={styles.mapEmphasisPillText}>Move map to set pickup</Text>
              </View>
            ) : null}
            {mapEmphasis === 'active_trip' ? (
              <View style={[styles.mapEmphasisPill, { top: 8 }]}>
                <Text style={styles.mapEmphasisPillText}>Live trip</Text>
              </View>
            ) : null}
            {mapNeedsRecenter && onHomeTab && !destinationSearchOpen ? (
              <Pressable style={[styles.recenterChip, { bottom: 12 }]} onPress={recenterMapOnUser}>
                <Text style={styles.recenterChipIcon}>◎</Text>
                <Text style={styles.recenterChipText}>Recenter on me</Text>
              </Pressable>
            ) : null}
            <View style={[styles.mapFabColumn, { top: 48 }]}>
              <TouchableOpacity style={styles.mapControlButton} onPress={fetchCurrentLocation} activeOpacity={0.86}>
                <Text style={styles.mapControlLabel}>◎</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mapControlButton} onPress={() => setMapZoomOffset(0)} activeOpacity={0.86}>
                <Text style={styles.mapControlLabel}>⌖</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {onHomeTab && !destinationSearchOpen && !isActiveTripMode ? (
          <View style={[styles.homeTopChrome, { paddingHorizontal: gutter, borderColor: theme.border, backgroundColor: theme.canvas }]}>
            <Pressable
              style={styles.homeLocationStrip}
              onPress={() => void fetchCurrentLocation()}
              accessibilityRole="button"
              accessibilityLabel={`Location, ${homeLocationLine}`}
            >
              <Ionicons name="location-outline" size={16} color={theme.primary} />
              <Text style={[styles.homeLocationStripText, { color: theme.textPrimary }]} numberOfLines={1}>
                {homeLocationLine}
              </Text>
              <Ionicons name="chevron-down" size={14} color={theme.textMuted} />
            </Pressable>
            <Pressable
              style={styles.homeNotifyBtn}
              onPress={() => setActiveTab('activity')}
              accessibilityRole="button"
              accessibilityLabel={
                activityTabBadgeCount > 0
                  ? `Notifications, ${activityTabBadgeCount} updates`
                  : 'Notifications'
              }
              hitSlop={8}
            >
              <Ionicons name="notifications-outline" size={20} color={theme.textPrimary} />
              {activityTabBadgeCount > 0 ? (
                <View style={[styles.homeNotifyBadge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.homeNotifyBadgeText}>
                    {activityTabBadgeCount > 9 ? '9+' : String(activityTabBadgeCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        ) : null}

        {showServiceSegment ? (
          <View style={[styles.homeBrandRow, { paddingHorizontal: gutter, backgroundColor: theme.canvas }]}>
            <View style={styles.homeLogoMark} accessibilityRole="header" accessibilityLabel="JuaX">
              <Text style={[styles.homeLogoJua, { color: theme.primary }]}>Jua</Text>
              <Text style={[styles.homeLogoX, { color: theme.textPrimary }]}>X</Text>
            </View>
            <View style={styles.homeHeaderSegments}>
              <CarouselZone style={styles.homeHeaderSegmentsScroll}>
                <ERServiceSegment
                  tabs={HOME_HEADER_SEGMENTS}
                  active={headerSegmentActive}
                  variant="inline"
                  onChange={(key) => {
                    if (key === 'more') {
                      setMoreServicesOpen(true);
                      return;
                    }
                    setActiveSegment(key);
                    if (key === 'laundry' || key === 'bnbs') {
                      setActiveService(key);
                      setHomeSheetStageAnimated('mid');
                    } else if (key === 'home') {
                      setHomeSheetStageAnimated('mid');
                    }
                  }}
                  onComingSoon={(key) => {
                    if (key === 'more') {
                      setMoreServicesOpen(true);
                      return;
                    }
                    setActiveSegment(key);
                    setHomeSheetStageAnimated('mid');
                  }}
                  fontSize={13}
                  darkMode={themeMode === 'dark'}
                />
              </CarouselZone>
            </View>
          </View>
        ) : null}

        <Modal
          visible={moreServicesOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMoreServicesOpen(false)}
        >
          <Pressable style={styles.moreMenuBackdrop} onPress={() => setMoreServicesOpen(false)}>
            <Pressable
              style={[
                styles.moreMenuCard,
                { backgroundColor: theme.sheet, borderColor: theme.border },
              ]}
              onPress={() => {}}
            >
              <Text style={[styles.moreMenuTitle, { color: theme.textPrimary }]}>More services</Text>
              <View style={styles.moreMenuGrid}>
                {MORE_SERVICE_MENU_SEGMENTS.map((seg) => (
                  <Pressable
                    key={seg.key}
                    style={[
                      styles.moreMenuItem,
                      { borderColor: theme.border, backgroundColor: theme.mutedSurface },
                      activeSegment === seg.key && { borderColor: theme.primary },
                    ]}
                    onPress={() => {
                      setMoreServicesOpen(false);
                      setActiveSegment(seg.key);
                      setHomeSheetStageAnimated('mid');
                    }}
                  >
                    <Text style={[styles.moreMenuItemLabel, { color: theme.textPrimary }]}>
                      {seg.label.charAt(0) + seg.label.slice(1).toLowerCase()}
                    </Text>
                    <Text style={[styles.moreMenuItemSoon, { color: theme.textMuted }]}>Soon</Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <View
          style={[
            styles.juxSheetAttached,
            styles.juxSheetFlex,
            showMapSheetRadius ? null : styles.juxSheetFlat,
            sheetSnap === 'full' ? styles.juxSheetImmersive : styles.juxSheetMid,
            { backgroundColor: theme.sheet, borderColor: theme.border },
          ]}
        >
          {showDragHandle ? (
            <View {...sheetDragResponder.panHandlers}>
              <Pressable
                style={styles.juxSheetGrabberWrap}
                onPress={() => {
                  if (isActiveTripMode && homeSheetStage === 'collapsed') {
                    setHomeSheetStageAnimated('mid');
                    return;
                  }
                  setHomeSheetStageAnimated(
                    homeSheetStage === 'collapsed' ? 'mid' : homeSheetStage === 'mid' ? 'full' : 'mid',
                  );
                }}
                hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }}
              >
                <View style={styles.juxSheetGrabber} />
              </Pressable>
            </View>
          ) : null}
          {bookingMessage ? (
            <AnimatedNotice
              message={bookingMessage}
              onPress={() => {
                if (/check Activity/i.test(bookingMessage)) setActiveTab('activity');
                setBookingMessage('');
              }}
              style={styles.juxNoticePill}
              textStyle={styles.juxNoticePillText}
            />
          ) : null}
          {locationError ? (
            <Pressable onPress={fetchCurrentLocation} style={styles.locationErrorBanner}>
              <Text style={styles.juxErrorInline}>{locationError}</Text>
              <Text style={styles.locationErrorRetry}>Tap to retry</Text>
            </Pressable>
          ) : null}
          {showPullRefreshStrip ? (
            <View
              style={[
                styles.pullRefreshStrip,
                { opacity: pullRefreshing ? 1 : 0.35 + pullProgress * 0.65 },
              ]}
              pointerEvents="none"
            >
              {pullRefreshing ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Text
                  style={[
                    styles.pullRefreshGlyph,
                    { transform: [{ rotate: `${pullProgress * 360}deg` }] },
                  ]}
                >
                  ↻
                </Text>
              )}
              <Text style={styles.pullRefreshHint}>{pullRefreshLabel}</Text>
            </View>
          ) : null}
          <View style={styles.juxSheetScrollHost}>
            <View style={styles.juxSheetScrollClip}>
          <ScrollView
            style={styles.juxSheetScroll}
            contentContainerStyle={[
              styles.juxSheetScrollContent,
              {
                paddingHorizontal: gutter,
                paddingBottom: sheetFooter ? 20 : tabBarBottomPad + 8,
              },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            removeClippedSubviews={false}
            keyboardDismissMode="on-drag"
            bounces
            alwaysBounceVertical
            scrollEventThrottle={16}
            onScroll={onSheetScroll}
            onScrollEndDrag={onSheetScrollEndDrag}
            onContentSizeChange={onSheetContentSizeChange}
            onLayout={onSheetLayout}
            refreshControl={
              <RefreshControl
                refreshing={pullRefreshing}
                onRefresh={() => void handlePullRefresh()}
                tintColor={theme.primary}
                colors={[theme.primary]}
                progressBackgroundColor={theme.surface}
                progressViewOffset={Platform.OS === 'android' ? 48 : 0}
              />
            }
            onScrollBeginDrag={() => {
              Keyboard.dismiss();
              setDestinationSuggestions([]);
            }}
            directionalLockEnabled
          >
            {sheetInner}
          </ScrollView>
          {sheetFooter && sheetHasMoreBelow ? (
            <View style={[styles.sheetScrollCueWrap, { borderTopColor: theme.border }]} pointerEvents="none">
              <View style={[styles.sheetScrollCueFade, { backgroundColor: theme.sheet }]} />
              <Text style={[styles.sheetScrollCueText, { color: theme.textSecondary }]}>Scroll for more ↓</Text>
            </View>
          ) : null}
            </View>
          {sheetFooter}
          </View>
        </View>

        {showMainTabBar ? (
          <ERTabBar
            tabs={mainTabConfig}
            active={activeTab}
            onChange={(key) => {
              setActiveTab(key);
              if (key === 'home') {
                setHomeSheetStageAnimated('mid');
                setActiveSegment('home');
              }
            }}
            bottomInset={tabBarBottomPad}
            horizontalPad={gutter}
            darkMode={themeMode === 'dark'}
          />
        ) : null}

          {homeDeepPage !== null ? (
            <View
              style={[
                styles.homeDeepRoot,
                { paddingTop: insets.top + 10, paddingHorizontal: gutter },
              ]}
            >
              <View style={styles.homeDeepHeader}>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    if (homeDeepPage === 'listing-detail') {
                      setHomeDeepPage('listings');
                      setListingDetail(null);
                      return;
                    }
                    setHomeDeepPage(null);
                    setListingDetail(null);
                  }}
                  hitSlop={12}
                >
                  <Text style={styles.homeDeepBack}>
                    {homeDeepPage === 'listing-detail' ? '← Results' : '← Back'}
                  </Text>
                </Pressable>
                {homeDeepPage === 'service-map' ? (
                  <Text style={styles.homeDeepMapTitle}>{serviceMapTitle}</Text>
                ) : null}
              </View>
              {homeDeepPage === 'listings' ? (
                <View style={styles.listingsExploreChrome}>
                  <ListingsExplorePanel
                    theme={theme}
                    darkMode={theme.isDark}
                    collapsed={listingsFiltersCollapsed}
                    listingsViewMode={listingsViewMode}
                    onViewModeChange={setListingsViewMode}
                    listingCatalog={listingCatalog}
                    onListingCatalogChange={setListingCatalog}
                    listingCounty={listingCounty}
                    onListingCountyChange={handleListingCountyChange}
                    listingAreaChips={listingAreaChips}
                    countyLabel={listingCountyChipLabel}
                    listingRadiusKm={listingRadiusKm}
                    onListingRadiusChange={(km) =>
                      setListingRadiusKm(km as (typeof STAYS_RADIUS_OPTIONS)[number])
                    }
                    radiusOptions={LISTING_RADIUS_OPTIONS}
                    showRadiusChips={listingCounty === 'near_me'}
                    locationReady={!!currentCoords}
                    onRequestLocation={() => void fetchCurrentLocation()}
                    resultCount={(listingCatalog === 'bnb' ? catalogBnbs : catalogHouses).length}
                  />
                </View>
              ) : null}
              {homeDeepPage === 'service-map' ? (
                <View style={styles.serviceMapBody}>
                  {serviceMapHtml ? (
                    <WebView
                      ref={serviceMapWebViewRef}
                      source={{ html: serviceMapHtml }}
                      style={StyleSheet.absoluteFillObject}
                      originWhitelist={['*']}
                      javaScriptEnabled
                      domStorageEnabled
                      scrollEnabled={false}
                      bounces={false}
                      setSupportMultipleWindows={false}
                      mixedContentMode="always"
                      onMessage={onHomeMapWebViewMessage}
                      onLoadEnd={() => {
                        injectServiceMapSync();
                      }}
                      {...ANDROID_MAP_WEBVIEW_PROPS}
                    />
                  ) : (
                    <View style={styles.serviceMapFallback}>
                      <Text style={styles.serviceMapFallbackText}>
                        Add EXPO_PUBLIC_MAPBOX_TOKEN to view the map.
                      </Text>
                    </View>
                  )}
                  <View style={[styles.mapLocationBanner, { top: 8, left: 0, right: 0 }]}>
                    <View style={[styles.mapLocationDot, { backgroundColor: '#22c55e' }]} />
                    <Text style={styles.mapLocationText} numberOfLines={1}>
                      {locationLoading
                        ? 'Locating you…'
                        : currentCoords
                          ? `You are here · ${currentLocationLabel}`
                          : 'Tap ◎ to show your location'}
                    </Text>
                  </View>
                  {activeService === 'laundry' && laundryPickupMode !== 'mamafua' ? (
                    <View style={[styles.serviceMapLegend, styles.serviceMapLegendWrap, { top: 48 }]}>
                      <View style={styles.serviceMapLegendRow}>
                        <View style={[styles.serviceMapLegendDot, { backgroundColor: '#22c55e' }]} />
                        <Text style={styles.serviceMapLegendText}>You are here</Text>
                      </View>
                      <View style={styles.serviceMapLegendRow}>
                        <View style={[styles.serviceMapLegendDot, { backgroundColor: '#F59E0B' }]} />
                        <Text style={styles.serviceMapLegendText}>Drop-off hub</Text>
                      </View>
                    </View>
                  ) : activeService === 'laundry' && laundryPickupMode === 'mamafua' ? (
                    <View style={[styles.serviceMapLegend, styles.serviceMapLegendWrap, { top: 48 }]}>
                      <View style={styles.serviceMapLegendRow}>
                        <View style={[styles.serviceMapLegendDot, { backgroundColor: '#22c55e' }]} />
                        <Text style={styles.serviceMapLegendText}>Your home</Text>
                      </View>
                    </View>
                  ) : activeService === 'rides' && rideWizardStep === 'pickup' ? (
                    <View style={[styles.serviceMapLegend, styles.serviceMapLegendWrap, { top: 48 }]}>
                      <View style={styles.serviceMapLegendRow}>
                        <View style={[styles.serviceMapLegendDot, { backgroundColor: '#22c55e' }]} />
                        <Text style={styles.serviceMapLegendText}>You are here</Text>
                      </View>
                      <View style={styles.serviceMapLegendRow}>
                        <View style={[styles.serviceMapLegendDot, { backgroundColor: '#38BDF8' }]} />
                        <Text style={styles.serviceMapLegendText}>Pickup hub</Text>
                      </View>
                      <View style={styles.serviceMapLegendRow}>
                        <View style={[styles.serviceMapLegendDot, { backgroundColor: '#C9A227' }]} />
                        <Text style={styles.serviceMapLegendText}>Top destination</Text>
                      </View>
                    </View>
                  ) : null}
                  {mapNeedsRecenter ? (
                    <Pressable style={[styles.recenterChip, { bottom: 16 }]} onPress={recenterMapOnUser}>
                      <Text style={styles.recenterChipIcon}>◎</Text>
                      <Text style={styles.recenterChipText}>Recenter on me</Text>
                    </Pressable>
                  ) : null}
                  <View style={[styles.mapFabColumn, { top: 48 }]}>
                    <TouchableOpacity
                      style={styles.mapControlButton}
                      onPress={() => void fetchCurrentLocation()}
                      activeOpacity={0.86}
                    >
                      <Text style={styles.mapControlLabel}>◎</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : homeDeepPage === 'listings' ? (
                listingsViewMode === 'map' ? (
                  <View style={styles.listingsMapShell}>
                    <Text style={styles.homeDeepCount}>
                      {listingsPageLoading
                        ? 'Loading…'
                        : `${(listingCatalog === 'bnb' ? catalogBnbs : catalogHouses).length} on map · tap a pin`}
                    </Text>
                    <View style={styles.listingsMapBody}>
                      {listingsPageLoading ? (
                        <View style={[styles.serviceMapFallback, { justifyContent: 'center' }]}>
                          <ActivityIndicator size="small" color={theme.primary} />
                          <Text style={[styles.serviceMapFallbackText, { marginTop: 10 }]}>
                            Loading listings from server…
                          </Text>
                        </View>
                      ) : listingsMapHtml ? (
                        <WebView
                          key={listingsMapPinKey}
                          ref={listingsMapWebViewRef}
                          source={{ html: listingsMapHtml }}
                          style={StyleSheet.absoluteFillObject}
                          originWhitelist={['*']}
                          javaScriptEnabled
                          domStorageEnabled
                          scrollEnabled={false}
                          bounces={false}
                          setSupportMultipleWindows={false}
                          mixedContentMode="always"
                          onMessage={onHomeMapWebViewMessage}
                          onLoadEnd={() => {
                            injectListingsMapSync();
                          }}
                          {...ANDROID_MAP_WEBVIEW_PROPS}
                        />
                      ) : (
                        <View style={styles.serviceMapFallback}>
                          <Text style={styles.serviceMapFallbackText}>
                            Add EXPO_PUBLIC_MAPBOX_TOKEN to view listings on the map.
                          </Text>
                        </View>
                      )}
                      <View style={[styles.mapLocationBanner, { top: 8, left: 0, right: 0 }]}>
                        <View style={[styles.mapLocationDot, { backgroundColor: '#22c55e' }]} />
                        <Text style={styles.mapLocationText} numberOfLines={1}>
                          {locationLoading
                            ? 'Locating you…'
                            : currentCoords
                              ? `You are here · ${currentLocationLabel}`
                              : 'Tap ◎ to show your location'}
                        </Text>
                      </View>
                      <View style={[styles.serviceMapLegend, styles.serviceMapLegendWrap, { top: 48 }]}>
                        <View style={styles.serviceMapLegendRow}>
                          <View style={[styles.serviceMapLegendDot, { backgroundColor: '#22c55e' }]} />
                          <Text style={styles.serviceMapLegendText}>You</Text>
                        </View>
                        <View style={styles.serviceMapLegendRow}>
                          <View
                            style={[
                              styles.serviceMapLegendDot,
                              { backgroundColor: listingCatalog === 'bnb' ? '#F472B6' : '#A78BFA' },
                            ]}
                          />
                          <Text style={styles.serviceMapLegendText}>
                            {listingCatalog === 'bnb' ? 'BnB' : 'Rental'}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.mapFabColumn, { top: 48 }]}>
                        <TouchableOpacity
                          style={styles.mapControlButton}
                          onPress={() => void fetchCurrentLocation()}
                          activeOpacity={0.86}
                        >
                          <Text style={styles.mapControlLabel}>◎</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : (
                <ScrollView
                  style={[styles.homeDeepScroll, styles.homeDeepScrollFlex]}
                  contentContainerStyle={styles.homeDeepScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onScroll={(event) => {
                    const y = event.nativeEvent.contentOffset.y;
                    setListingsFiltersCollapsedAnimated(y > 52);
                  }}
                >
                  {listingsPageLoading ? (
                    <View style={styles.listingsLoadingRow}>
                      <ActivityIndicator size="small" color={theme.primary} />
                      <Text style={[styles.juxHintMuted, { marginLeft: 10 }]}>Loading listings from server…</Text>
                    </View>
                  ) : listingsError ? (
                    <View style={styles.listingsLoadingRow}>
                      <Text style={[styles.juxHintMuted, { flex: 1 }]}>{listingsError}</Text>
                      <Pressable onPress={() => void refreshListingsForArea()} hitSlop={8}>
                        <Text style={{ color: theme.primary, fontWeight: '600' }}>Retry</Text>
                      </Pressable>
                    </View>
                  ) : dataError ? (
                    <View style={styles.listingsLoadingRow}>
                      <Text style={[styles.juxHintMuted, { flex: 1 }]}>{dataError}</Text>
                      <Pressable onPress={() => void refreshListingsForArea()} hitSlop={8}>
                        <Text style={{ color: theme.primary, fontWeight: '600' }}>Retry</Text>
                      </Pressable>
                    </View>
                  ) : (listingCatalog === 'bnb' ? catalogBnbs : catalogHouses).length === 0 ? (
                    <Text style={styles.juxHintMuted}>
                      {listingCounty === 'near_me' && !currentCoords && !listingsCounty
                        ? 'Turn on location to filter Near me.'
                        : listingCounty === 'near_me' && !currentCoords
                          ? `Showing listings in ${countyDisplayLabel} while location loads — enable GPS for precise Near me.`
                          : listingCounty === 'near_me' && currentCoords
                            ? `No listings within ${listingRadiusKm} km — try widening the radius or switch to All areas.`
                            : 'No matches — try All areas or your county chip above.'}
                    </Text>
                  ) : null}
                  {!listingsInitialLoading && !listingsError
                    ? (listingCatalog === 'bnb' ? catalogBnbs : catalogHouses).map((row, ri, arr) => {
                    const rowListingId = row.id;
                    const activeRequest = activeListingRequestsByListingId.get(rowListingId) ?? null;
                    const stayBooking =
                      listingCatalog === 'bnb'
                        ? findActiveBnbBookingForListing(bnbBookings, rowListingId)
                        : undefined;
                    const requestLabel =
                      activeRequest?.statusLabel ??
                      (activeRequest ? LISTING_REQUEST_STATUS_LABELS[activeRequest.status] ?? 'Requested' : null);
                    const statusLabel = stayBooking ? 'Reserved' : requestLabel;
                    return (
                    <Pressable
                      key={listingCatalog === 'bnb' ? (row as BnbListing).id : (row as HouseListing).id}
                      style={[styles.listingCatRow, ri === arr.length - 1 && styles.listingCatRowLast]}
                      onPress={() => {
                        setHomeListingPreview(null);
                        if (listingCatalog === 'bnb') {
                          const id = (row as BnbListing).id;
                          setSelectedBnbId(id);
                          setSelectedHouseId(null);
                          setActiveService('bnbs');
        setActiveSegment('bnbs');
                          setListingDetail({ kind: 'bnb', id });
                        } else {
                          const id = (row as HouseListing).id;
                          setSelectedHouseId(id);
                          setSelectedBnbId(null);
                          setActiveService('bnbs');
        setActiveSegment('bnbs');
                          setStaysSubTab('rental');
                          setListingDetail({ kind: 'house', id });
                        }
                        setHomeDeepPage('listing-detail');
                      }}
                    >
                      <Image
                        source={listingCatalog === 'bnb' ? (row as BnbListing).image : (row as HouseListing).image}
                        style={styles.listingCatThumb}
                        resizeMode="cover"
                      />
                      <View style={styles.listingCatBody}>
                        <View style={styles.listingCatTitleRow}>
                          <Text style={styles.listingCatTitle} numberOfLines={2}>
                            {listingCatalog === 'bnb' ? (row as BnbListing).title : (row as HouseListing).title}
                          </Text>
                          {statusLabel ? (
                            <View style={[styles.listingRequestBadge, { backgroundColor: theme.primaryLight }]}>
                              <Text style={[styles.listingRequestBadgeText, { color: theme.primary }]}>
                                {statusLabel}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <ListingMetaText
                          coords={row.coords}
                          price={
                            listingCatalog === 'bnb'
                              ? (row as BnbListing).price
                              : (row as HouseListing).price
                          }
                          reference={listingDistanceRef}
                          fallbackCounty={
                            listingCatalog === 'bnb'
                              ? (row as BnbListing).county
                              : (row as HouseListing).county
                          }
                          distanceColor={theme.primary}
                          metaColor={theme.textMuted}
                        />
                      </View>
                      <Text style={styles.listingCatChev}>›</Text>
                    </Pressable>
                  );
                  })
                    : null}
                </ScrollView>
                )
              ) : homeDeepPage === 'listing-detail' && listingDetail && listingDetailEntity ? (
                <ScrollView
                  ref={listingDetailScrollRef}
                  style={[styles.homeDeepScroll, styles.homeDeepScrollFlex]}
                  contentContainerStyle={styles.homeDeepScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {listingDetail.kind === 'bnb' ? (
                    <>
                      <Text style={styles.homeDeepPageTitle}>{(listingDetailEntity as BnbListing).title}</Text>
                      <ListingMetaText
                        coords={(listingDetailEntity as BnbListing).coords}
                        price={`${(listingDetailEntity as BnbListing).rating} ★ · ${(listingDetailEntity as BnbListing).price}`}
                        reference={listingDistanceRef}
                        fallbackCounty={(listingDetailEntity as BnbListing).county}
                        distanceColor={theme.primary}
                        metaColor={theme.textSecondary}
                        style={styles.homeDeepPageLead}
                      />
                      {(() => {
                        const stayBooking = findActiveBnbBookingForListing(
                          bnbBookings,
                          (listingDetailEntity as BnbListing).id,
                        );
                        if (!stayBooking) return null;
                        return (
                          <View
                            style={[
                              styles.listingReservedBadge,
                              { borderColor: theme.primary, backgroundColor: theme.mutedSurface },
                            ]}
                          >
                            <Text style={[styles.listingReservedBadgeText, { color: theme.primary }]}>
                              Reserved · {stayBooking.checkIn} → {stayBooking.checkOut}
                            </Text>
                          </View>
                        );
                      })()}
                      <View style={[styles.juxListingCarouselWrap, { width: listingCarouselW }]}>
                        <FlatList
                          style={{ width: listingCarouselW }}
                          data={(listingDetailEntity as BnbListing).gallery}
                          horizontal
                          pagingEnabled
                          decelerationRate="fast"
                          showsHorizontalScrollIndicator={false}
                          keyExtractor={(_, i) => `${(listingDetailEntity as BnbListing).id}-ld-${i}`}
                          renderItem={({ item }) => (
                            <Image
                              source={item}
                              style={[styles.juxListingCarouselSlide, { width: listingCarouselW }]}
                              resizeMode="cover"
                            />
                          )}
                          getItemLayout={(_, index) => ({
                            length: listingCarouselW,
                            offset: listingCarouselW * index,
                            index,
                          })}
                        />
                      </View>
                      <View style={styles.juxListingDetailBody}>
                        <Text style={styles.juxListingDesc}>{(listingDetailEntity as BnbListing).exploreReason}</Text>
                        {!(listingDetailEntity as BnbListing).locationLocked &&
                        (listingDetailEntity as BnbListing).exactAddress ? (
                          <View style={[styles.listingUnlockCard, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
                            <Text style={[styles.makeTripTitle, { color: theme.textPrimary }]}>Exact address</Text>
                            <Text style={[styles.juxListingDesc, { color: theme.textSecondary, marginTop: 0 }]}>
                              {(listingDetailEntity as BnbListing).exactAddress}
                            </Text>
                            {(listingDetailEntity as BnbListing).hostPhone ? (
                              <Text style={[styles.juxListingTip, { color: theme.primary, marginTop: 2 }]}>
                                Host: {(listingDetailEntity as BnbListing).hostName ?? 'Contact'} ·{' '}
                                {(listingDetailEntity as BnbListing).hostPhone}
                              </Text>
                            ) : null}
                          </View>
                        ) : (
                          <Text style={[styles.juxListingTip, { color: theme.textMuted }]}>
                            Reserve & pay to reveal exact address, host contact, and coordinates.
                          </Text>
                        )}
                        {!(listingDetailEntity as BnbListing).locationLocked ? (
                          <ListingLocationActions
                            title={(listingDetailEntity as BnbListing).title}
                            coords={
                              (listingDetailEntity as BnbListing).exactCoords ??
                              (listingDetailEntity as BnbListing).coords
                            }
                            unlocked
                            theme={theme}
                            onNavigate={() => startGuidedToListing(listingDetailEntity as BnbListing, 'bnb')}
                            onRequestRide={() =>
                              void requestRideToListing(
                                (listingDetailEntity as BnbListing).id,
                                (listingDetailEntity as BnbListing).title,
                                'bnb',
                              )
                            }
                            navigateDisabled={!MAPBOX_ACCESS_TOKEN || !currentCoords}
                          />
                        ) : null}
                        {(listingDetailEntity as BnbListing).detailHighlights.map((line) => (
                          <View key={line} style={styles.juxListingBulletRow}>
                            <Text style={styles.juxListingBulletGlyph}>●</Text>
                            <Text style={styles.juxListingBulletText}>{line}</Text>
                          </View>
                        ))}
                        {(listingDetailEntity as BnbListing).exploreTip ? (
                          <Text style={styles.juxListingTip}>Tip: {(listingDetailEntity as BnbListing).exploreTip}</Text>
                        ) : null}
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.juxChipRow}
                        >
                          {(listingDetailEntity as BnbListing).amenities.map((tag) => (
                            <View key={tag} style={styles.juxChip}>
                              <Text style={styles.juxChipText}>{tag}</Text>
                            </View>
                          ))}
                        </ScrollView>
                        <View style={styles.valetListingFooterCompact}>
                          <Pressable
                            onPress={() => {
                              const b = listingDetailEntity as BnbListing;
                              void submitListingRequest('tour', b.id, b.title, 'bnb');
                            }}
                            style={styles.textRowActionHit}
                          >
                            <Text style={styles.textRowActionMuted}>Request tour</Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.homeDeepPageTitle}>{(listingDetailEntity as HouseListing).title}</Text>
                      <ListingMetaText
                        coords={(listingDetailEntity as HouseListing).coords}
                        price={(listingDetailEntity as HouseListing).price}
                        reference={listingDistanceRef}
                        fallbackCounty={(listingDetailEntity as HouseListing).county}
                        distanceColor={theme.primary}
                        metaColor={theme.textSecondary}
                        style={styles.homeDeepPageLead}
                      />
                      <View style={[styles.juxListingCarouselWrap, { width: listingCarouselW }]}>
                        <FlatList
                          style={{ width: listingCarouselW }}
                          data={(listingDetailEntity as HouseListing).gallery}
                          horizontal
                          pagingEnabled
                          decelerationRate="fast"
                          showsHorizontalScrollIndicator={false}
                          keyExtractor={(_, i) => `${(listingDetailEntity as HouseListing).id}-ld-${i}`}
                          renderItem={({ item }) => (
                            <Image
                              source={item}
                              style={[styles.juxListingCarouselSlide, { width: listingCarouselW }]}
                              resizeMode="cover"
                            />
                          )}
                          getItemLayout={(_, index) => ({
                            length: listingCarouselW,
                            offset: listingCarouselW * index,
                            index,
                          })}
                        />
                      </View>
                      <View style={styles.juxListingDetailBody}>
                        <Text style={styles.juxListingDesc}>
                          Longer stays and in-person viewings by appointment. Below: highlights and what is on site.
                        </Text>
                        {!(listingDetailEntity as HouseListing).locationLocked &&
                        (listingDetailEntity as HouseListing).exactAddress ? (
                          <View style={[styles.listingUnlockCard, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
                            <Text style={[styles.makeTripTitle, { color: theme.textPrimary }]}>Exact location</Text>
                            <Text style={[styles.juxListingDesc, { color: theme.textSecondary, marginTop: 0 }]}>
                              {(listingDetailEntity as HouseListing).exactAddress}
                            </Text>
                            {(listingDetailEntity as HouseListing).hostPhone ? (
                              <Text style={[styles.juxListingTip, { color: theme.primary, marginTop: 2 }]}>
                                Landlord: {(listingDetailEntity as HouseListing).hostName ?? 'Contact'} ·{' '}
                                {(listingDetailEntity as HouseListing).hostPhone}
                              </Text>
                            ) : null}
                          </View>
                        ) : (
                          <Text style={[styles.juxListingTip, { color: theme.textMuted }]}>
                            Subscribe to unlock exact address, landlord contact, and coordinates.
                          </Text>
                        )}
                        {!(listingDetailEntity as HouseListing).locationLocked ? (
                          <ListingLocationActions
                            title={(listingDetailEntity as HouseListing).title}
                            coords={
                              (listingDetailEntity as HouseListing).exactCoords ??
                              (listingDetailEntity as HouseListing).coords
                            }
                            unlocked
                            theme={theme}
                            onNavigate={() => startGuidedToListing(listingDetailEntity as HouseListing, 'house')}
                            onRequestRide={() =>
                              void requestRideToListing(
                                (listingDetailEntity as HouseListing).id,
                                (listingDetailEntity as HouseListing).title,
                                'house',
                              )
                            }
                            navigateDisabled={!MAPBOX_ACCESS_TOKEN || !currentCoords}
                          />
                        ) : null}
                        {(listingDetailEntity as HouseListing).detailHighlights.map((line) => (
                          <View key={line} style={styles.juxListingBulletRow}>
                            <Text style={styles.juxListingBulletGlyph}>●</Text>
                            <Text style={styles.juxListingBulletText}>{line}</Text>
                          </View>
                        ))}
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.juxChipRow}
                        >
                          {(listingDetailEntity as HouseListing).amenities.map((tag) => (
                            <View key={tag} style={styles.juxChip}>
                              <Text style={styles.juxChipText}>{tag}</Text>
                            </View>
                          ))}
                        </ScrollView>
                        <View style={styles.valetListingFooterCompact}>
                          {!(listingDetailEntity as HouseListing).locationLocked ? (
                            (() => {
                              const existingRequest = activeListingRequestsByListingId.get(
                                (listingDetailEntity as HouseListing).id,
                              );
                              if (existingRequest) {
                                return (
                                  <Pressable
                                    onPress={() => void openListingRequestDetail(existingRequest.id)}
                                    style={styles.textRowActionHit}
                                  >
                                    <Text style={styles.textRowAction}>
                                      Requested ·{' '}
                                      {existingRequest.statusLabel ??
                                        LISTING_REQUEST_STATUS_LABELS[existingRequest.status] ??
                                        existingRequest.status}
                                    </Text>
                                  </Pressable>
                                );
                              }
                              return (
                            <Pressable
                              onPress={() => {
                                if (!listingDetailEntity || listingDetail.kind !== 'house') return;
                                openViewingRequestSheet(
                                  listingDetailEntity.id,
                                  listingDetailEntity.title,
                                  'house',
                                  { priceLabel: (listingDetailEntity as HouseListing).price },
                                );
                              }}
                              style={styles.textRowActionHit}
                            >
                              <Text style={styles.textRowActionMuted}>Request viewing</Text>
                            </Pressable>
                              );
                            })()
                          ) : null}
                        </View>
                      </View>
                    </>
                  )}
                  {listingDetailMoreRows.length > 0 ? (
                    <>
                      <Text style={[styles.juxSectionLabel, styles.homeDeepFilterSpaced]}>Also in this search</Text>
                      {listingDetailMoreRows.map((row) => (
                        <Pressable
                          key={row.id}
                          style={styles.homeDeepRelatedRow}
                          onPress={() => {
                            setHomeListingPreview(null);
                            const id = row.id;
                            if (listingDetail.kind === 'bnb') {
                              setSelectedBnbId(id);
                              setSelectedHouseId(null);
                              setListingDetail({ kind: 'bnb', id });
                            } else {
                              setSelectedHouseId(id);
                              setSelectedBnbId(null);
                              setListingDetail({ kind: 'house', id });
                            }
                          }}
                        >
                          <Image source={row.image} style={styles.homeDeepRelatedThumb} resizeMode="cover" />
                          <View style={styles.listingCatBody}>
                            <Text style={styles.listingCatTitle} numberOfLines={2}>
                              {row.title}
                            </Text>
                            <ListingMetaText
                              coords={row.coords}
                              price={
                                listingDetail.kind === 'bnb'
                                  ? (row as BnbListing).price
                                  : (row as HouseListing).price
                              }
                              reference={listingDistanceRef}
                              fallbackCounty={
                                listingDetail.kind === 'bnb'
                                  ? (row as BnbListing).county
                                  : (row as HouseListing).county
                              }
                              distanceColor={theme.primary}
                              metaColor={theme.textMuted}
                            />
                          </View>
                          <Text style={styles.listingCatChev}>›</Text>
                        </Pressable>
                      ))}
                    </>
                  ) : null}
                </ScrollView>
              ) : homeDeepPage === 'valet-studio' ? (
                <ScrollView
                  style={[styles.homeDeepScroll, styles.homeDeepScrollFlex]}
                  contentContainerStyle={styles.homeDeepScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.homeDeepPageTitle}>Valet studio</Text>
                  <Text style={styles.homeDeepPageLead}>
                    Request a mama fua at your door, set timing, and leave special care notes — then confirm on the
                    sheet.
                  </Text>
                  <Text style={[styles.juxSectionLabel, styles.homeDeepFilterSpaced]}>When</Text>
                  <View style={styles.valetSegmentTrack}>
                    {mamafuaWhenOptions.map((band, wi) => (
                      <Fragment key={band.id}>
                        {wi > 0 ? <View style={styles.valetSegmentDivider} /> : null}
                        <Pressable
                          style={[styles.valetSegment, valetStudioWhen === band.id && styles.valetSegmentActive]}
                          onPress={() => setValetStudioWhen(band.id)}
                        >
                          <Text style={[styles.valetSegmentText, valetStudioWhen === band.id && styles.valetSegmentTextActive]}>
                            {band.label}
                          </Text>
                        </Pressable>
                      </Fragment>
                    ))}
                  </View>
                  <Pressable
                    style={[styles.listingCatRow, styles.homeDeepToggleRow]}
                    onPress={() => setValetMamaFuaHome((v) => !v)}
                  >
                    <View style={styles.listingCatBody}>
                      <Text style={styles.listingCatTitle}>Mama fua at home</Text>
                      <Text style={styles.listingCatMeta}>Someone comes to your door with supplies and care.</Text>
                    </View>
                    <Text style={styles.valetStationCheck}>{valetMamaFuaHome ? '✓' : ''}</Text>
                  </Pressable>
                  <Text style={[styles.juxSectionLabel, styles.homeDeepFilterSpaced]}>Notes</Text>
                  <TextInput
                    value={valetStudioNotes}
                    onChangeText={setValetStudioNotes}
                    placeholder="Delicates, detergents, allergies…"
                    placeholderTextColor={theme.textMuted}
                    multiline
                    style={styles.homeDeepNotes}
                  />
                </ScrollView>
              ) : (
                <ScrollView
                  style={[styles.homeDeepScroll, styles.homeDeepScrollFlex]}
                  contentContainerStyle={styles.homeDeepScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.homeDeepPageTitle}>Ride planner</Text>
                  <Text style={styles.homeDeepPageLead}>Extras ride with your booking — no clutter.</Text>
                  <Text style={[styles.juxSectionLabel, styles.homeDeepFilterSpaced]}>Extra stop (optional)</Text>
                  <TextInput
                    value={ridePlannerStop}
                    onChangeText={setRidePlannerStop}
                    placeholder="Neighbourhood or landmark"
                    placeholderTextColor={theme.textMuted}
                    style={styles.homeDeepSearch}
                  />
                  <Pressable
                    style={[styles.listingCatRow, styles.homeDeepToggleRow]}
                    onPress={() => setRidePlannerLuggage((v) => !v)}
                  >
                    <View style={styles.listingCatBody}>
                      <Text style={styles.listingCatTitle}>Luggage help</Text>
                    </View>
                    <Text style={styles.valetStationCheck}>{ridePlannerLuggage ? '✓' : ''}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.listingCatRow, styles.homeDeepToggleRow]}
                    onPress={() => setRidePlannerMeetAssist((v) => !v)}
                  >
                    <View style={styles.listingCatBody}>
                      <Text style={styles.listingCatTitle}>Meet & assist</Text>
                    </View>
                    <Text style={styles.valetStationCheck}>{ridePlannerMeetAssist ? '✓' : ''}</Text>
                  </Pressable>
                </ScrollView>
              )}
              {homeDeepFooter}
            </View>
          ) : null}
      </View>
      </ServiceSwipeProvider>
      <Modal
        visible={destinationSearchOpen}
        animationType="slide"
        onRequestClose={() => {
          setDestinationSearchOpen(false);
          setDestinationSuggestions([]);
          Keyboard.dismiss();
        }}
      >
        <View style={[styles.destinationSearchModal, { backgroundColor: theme.canvas, paddingTop: insets.top + 8 }]}>
          <View style={[styles.destinationSearchHeader, { paddingHorizontal: gutter }]}>
            <Pressable
              onPress={() => {
                setDestinationSearchOpen(false);
                setDestinationSuggestions([]);
                Keyboard.dismiss();
              }}
              hitSlop={12}
            >
              <Text style={styles.destinationSearchBack}>← Back</Text>
            </Pressable>
            <Text style={styles.destinationSearchTitle}>Where to?</Text>
            <View style={{ width: 48 }} />
          </View>
          <View style={[styles.juxSearchPill, { marginHorizontal: gutter }]}>
            <Text style={styles.juxSearchIcon}>⌕</Text>
            <TextInput
              value={destinationQuery}
              onChangeText={(value) => {
                setDestinationQuery(value);
                void fetchDestinationSuggestions(value);
              }}
              placeholder="Search destination"
              placeholderTextColor={theme.textSecondary}
              style={styles.juxSearchInput}
              returnKeyType="search"
              autoFocus
              blurOnSubmit
              onSubmitEditing={() => {
                Keyboard.dismiss();
                void searchDestination();
              }}
            />
            {destinationSearchLoading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : null}
          </View>
          <ScrollView
            style={styles.destinationSearchList}
            contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {recentSearches.length > 0 && destinationSuggestions.length === 0 ? (
              <>
                <Text style={styles.destinationSearchSection}>Recent</Text>
                {recentSearches.map((suggestion) => (
                  <Pressable
                    key={suggestion.id}
                    style={styles.juxSuggestionRow}
                    onPress={() => selectSuggestion(suggestion)}
                  >
                    <Text style={styles.juxSuggestionTitle}>{suggestion.name}</Text>
                    <Text style={styles.juxSuggestionSub} numberOfLines={1}>
                      {suggestion.subtitle}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}
            {destinationSuggestions.map((suggestion, si) => (
              <Pressable
                key={suggestion.id}
                style={[
                  styles.juxSuggestionRow,
                  si === destinationSuggestions.length - 1 && styles.juxSuggestionRowLast,
                ]}
                onPress={() => selectSuggestion(suggestion)}
              >
                <Text style={styles.juxSuggestionTitle}>{suggestion.name}</Text>
                <Text style={styles.juxSuggestionSub} numberOfLines={1}>
                  {suggestion.subtitle}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
      <Modal
        visible={!!homeListingPreview && !!listingPreviewEntity}
        transparent
        animationType="fade"
        onRequestClose={() => setHomeListingPreview(null)}
      >
        <Pressable style={styles.exploreKeyBackdrop} onPress={() => setHomeListingPreview(null)}>
          <Pressable
            style={[styles.exploreKeyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.exploreKeyTitle, { color: theme.textPrimary }]}>Listing preview</Text>
            {listingPreviewEntity && homeListingPreview?.catalog === 'bnb' ? (
              <>
                <Image
                  source={(listingPreviewEntity as BnbListing).image}
                  style={{ width: '100%', height: 140, borderRadius: 2, marginTop: 8 }}
                  resizeMode="cover"
                />
                <Text style={[styles.exploreKeyRowText, { color: theme.textPrimary, marginTop: 10 }]}>
                  {(listingPreviewEntity as BnbListing).title}
                </Text>
                <ListingMetaText
                  coords={(listingPreviewEntity as BnbListing).coords}
                  price={`${(listingPreviewEntity as BnbListing).rating} ★ · ${(listingPreviewEntity as BnbListing).price}`}
                  reference={listingDistanceRef}
                  fallbackCounty={(listingPreviewEntity as BnbListing).county}
                  distanceColor={theme.primary}
                  metaColor={theme.textSecondary}
                  style={{ ...styles.exploreKeyLead, marginTop: 4 }}
                />
                <Text style={[styles.exploreKeyFine, { color: theme.textMuted, marginTop: 8 }]} numberOfLines={3}>
                  {(listingPreviewEntity as BnbListing).exploreReason}
                </Text>
              </>
            ) : listingPreviewEntity ? (
              <>
                <Image
                  source={(listingPreviewEntity as HouseListing).image}
                  style={{ width: '100%', height: 140, borderRadius: 2, marginTop: 8 }}
                  resizeMode="cover"
                />
                <Text style={[styles.exploreKeyRowText, { color: theme.textPrimary, marginTop: 10 }]}>
                  {(listingPreviewEntity as HouseListing).title}
                </Text>
                <ListingMetaText
                  coords={(listingPreviewEntity as HouseListing).coords}
                  price={(listingPreviewEntity as HouseListing).price}
                  reference={listingDistanceRef}
                  fallbackCounty={(listingPreviewEntity as HouseListing).county}
                  distanceColor={theme.primary}
                  metaColor={theme.textSecondary}
                  style={{ ...styles.exploreKeyLead, marginTop: 4 }}
                />
                <Text style={[styles.exploreKeyFine, { color: theme.textMuted, marginTop: 8 }]} numberOfLines={3}>
                  {(listingPreviewEntity as HouseListing).detailHighlights[0] ?? 'Longer stays — book a viewing from the full sheet.'}
                </Text>
              </>
            ) : null}
            <Pressable
              style={[styles.exploreKeyDone, { marginTop: 14 }]}
              onPress={() => {
                if (!homeListingPreview || !listingPreviewEntity) return;
                const { catalog, id } = homeListingPreview;
                setHomeListingPreview(null);
                setActiveTab('home');
                if (catalog === 'bnb') {
                  setActiveService('bnbs');
        setActiveSegment('bnbs');
                  setSelectedBnbId(id);
                  setSelectedHouseId(null);
                  setListingCatalog('bnb');
                  setListingDetail({ kind: 'bnb', id });
                } else {
                  setActiveService('bnbs');
        setActiveSegment('bnbs');
                  setStaysSubTab('rental');
                  setSelectedHouseId(id);
                  setSelectedBnbId(null);
                  setListingCatalog('house');
                  setListingDetail({ kind: 'house', id });
                }
                setHomeDeepPage('listing-detail');
                setHomeSheetStageAnimated('mid');
              }}
            >
              <Text style={[styles.exploreKeyDoneText, { color: theme.accentText }]}>Open full listing</Text>
            </Pressable>
            <Pressable style={[styles.exploreKeyDone, { marginTop: 4 }]} onPress={() => setHomeListingPreview(null)}>
              <Text style={[styles.exploreKeyDoneText, { color: theme.textMuted }]}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      </>
    );
  };
  const renderExplore = () => {
    const stayCardW = Math.min(272, Math.max(220, Math.round(windowWidth * 0.72)));
    const exploreMidH = Math.max(380, Math.round(windowHeight * 0.62));
    const exploreFullH = Math.max(480, Math.round(windowHeight * 0.94));
    const exploreSheetBottomOffset =
      exploreSheetStage === 'full' ? Math.max(insets.bottom, 10) + 6 : insets.bottom + floatingNavHeight + 12;
    const exploreSheetHeight = exploreSheetStage === 'collapsed' ? 0 : exploreSheetStage === 'mid' ? exploreMidH : exploreFullH;
    const lensLabels: Record<ExploreLens, string> = {
      discover: 'Discover',
      hotels: 'Hotels',
      markets: 'Markets',
      meetups: 'Meetups',
      fashion: 'Fashion',
      journal: 'Journal',
    };
    const exploreChromeCue = `${lensLabels[exploreLens]} · ${
      exploreScope === 'nearby' ? `Near ${countyDisplayLabel}` : 'Everywhere'
    }`;
    const sheetLead =
      exploreLens === 'journal'
        ? 'Editorial — tap a card for the byline'
        : exploreLens === 'fashion'
          ? 'Street fashion & where to buy the drip'
          : exploreLens === 'hotels'
            ? 'Signature hotels on the map'
            : exploreLens === 'markets'
              ? 'Groceries & hypermarkets'
              : exploreLens === 'meetups'
                ? 'Meetups with city anchors'
                : 'Guides, pins & live-ish signals';

    const showDest =
      exploreLens === 'discover' || exploreLens === 'meetups' || exploreLens === 'fashion' || exploreLens === 'markets';
    const showStays = exploreLens === 'discover';
    const fashionReads = exploreJournalDisplayed.filter(
      (a) =>
        /street|fashion|drip|style|city|coast|hills|night|food/i.test(a.tag) ||
        /denim|kitenge|tailor|atelier|boutique|drip|rails|grill/i.test(a.reason),
    );

    const openPick = (pick: ExplorePick) => {
      setSelectedExploreCard(pick);
      if (pick.kind === 'article') {
        const art = EXPLORE_ARTICLES.find((a) => a.id === pick.id);
        setExploreReadHereTarget(art?.readHere ?? null);
      } else {
        setExploreReadHereTarget(null);
      }
      if (exploreSheetStage === 'collapsed') {
        setExploreSheetStageAnimated('mid');
      }
    };

    const exHotels = exploreVenuesDisplayed.filter((v) => v.category === 'hotel');
    const exMeetups = exploreVenuesDisplayed.filter((v) => v.category === 'meetup');
    const exFashion = exploreVenuesDisplayed.filter((v) => v.category === 'fashion');
    const exMarkets = exploreVenuesDisplayed.filter((v) => v.category === 'market');
    const exCulture = exploreVenuesDisplayed.filter((v) => v.category === 'culture');

    const renderVenueStrip = (sectionLabel: string, list: ExploreVenue[]) => {
      if (list.length === 0) return null;
      return (
        <View key={sectionLabel}>
          <View style={[styles.juxSectionRow, styles.valetSectionLabelSpaced]}>
            <Text style={styles.juxSectionLabel}>{sectionLabel}</Text>
            <Text style={styles.juxSeeAll}>{list.length}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.juxStayCarousel}
            decelerationRate="fast"
            snapToInterval={stayCardW + 10}
          >
            {list.map((v) => {
              const spotSelected =
                selectedExploreCard?.kind === 'spot' && selectedExploreCard.spotId === v.id;
              return (
                <Pressable
                  key={v.id}
                  style={[styles.juxStayCard, { width: stayCardW }, spotSelected && styles.juxStayCardSelected]}
                  onPress={() =>
                    openPick({
                      kind: 'spot',
                      spotId: v.id,
                      category: v.category,
                      title: v.title,
                      subtitle: v.subtitle,
                      reason: v.exploreReason,
                      tip: v.exploreTip,
                      coords: v.coords,
                      touringNow: v.touringNow,
                      visitedToday: v.visitedToday,
                    })
                  }
                >
                  <Image source={v.image} style={styles.juxStayCardImage} resizeMode="cover" />
                  <View style={styles.juxStayCardBody}>
                    <Text style={styles.juxStayCardTitle} numberOfLines={2}>
                      {v.title}
                    </Text>
                    <Text style={styles.juxStayCardMeta} numberOfLines={2}>
                      ~{v.touringNow} nearby · {v.visitedToday.toLocaleString()} modeled today
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      );
    };

    return (
      <>
      <View style={[styles.juxShell, { backgroundColor: theme.canvas }]}>
        <View style={styles.juxMapLayer} pointerEvents="box-none" collapsable={false}>
          {exploreMapHtml ? (
            <WebView
              source={{ html: exploreMapHtml }}
              style={StyleSheet.absoluteFillObject}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              nestedScrollEnabled
              bounces={false}
              allowsFullscreenVideo
              mixedContentMode="always"
              setSupportMultipleWindows={false}
              onMessage={onHomeMapWebViewMessage}
              {...ANDROID_MAP_WEBVIEW_PROPS}
            />
          ) : (
            <ImageBackground source={require('./template/Preview 4.png')} style={StyleSheet.absoluteFillObject} resizeMode="cover">
              <View style={styles.exploreMapFallback}>
                <Text style={styles.exploreMapFallbackText}>
                  Add your Mapbox token to unlock the live map — zoom, pan, and tap pins for details.
                </Text>
              </View>
            </ImageBackground>
          )}
          <View style={[styles.mapFabColumn, { top: insets.top + 200, bottom: undefined }]}>
            <TouchableOpacity style={styles.mapControlButton} onPress={fetchCurrentLocation} activeOpacity={0.86}>
              <Text style={styles.mapControlLabel}>◎</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapControlButton} onPress={() => setMapZoomOffset(0)} activeOpacity={0.86}>
              <Text style={styles.mapControlLabel}>⌖</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.juxHeaderBlock, { paddingTop: insets.top + 8, paddingHorizontal: gutter }]} pointerEvents="box-none">
          <View style={styles.juxTopRow}>
            <View style={styles.juxBrandBlock}>
              <View style={styles.juxLogoDisc}>
                <Text style={styles.juxLogoGlyph}>×</Text>
              </View>
              <Text style={styles.juxWordmark}>JUA X</Text>
            </View>
            <Pressable style={styles.juxLocationPill} onPress={fetchCurrentLocation}>
              <View style={styles.juxPinDot} />
              <Text style={styles.juxLocationText} numberOfLines={1}>
                {currentLocationLabel.length > 22 ? `${currentLocationLabel.slice(0, 20)}…` : currentLocationLabel}
              </Text>
              {locationLoading ? <ActivityIndicator size="small" color={theme.textPrimary} /> : null}
            </Pressable>
            <Pressable style={styles.juxMenuOrb} hitSlop={8} onPress={() => setExploreMapKeyVisible(true)}>
              <Text style={styles.juxMenuIcon}>≡</Text>
            </Pressable>
          </View>

          <View style={styles.juxSearchPill}>
            <Text style={styles.juxSearchIcon}>⌕</Text>
            <Text style={styles.juxSearchInput} numberOfLines={1}>
              Destinations, stays, hotels, meetups & markets
            </Text>
            <View style={styles.juxSparkleBtn}>
              <Text style={styles.juxSparkle}>✦</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.juxPillRow, { paddingBottom: 4 }]}
            keyboardShouldPersistTaps="handled"
          >
            {(
              [
                { key: 'discover' as const, label: 'Discover' },
                { key: 'hotels' as const, label: 'Hotels' },
                { key: 'markets' as const, label: 'Markets' },
                { key: 'meetups' as const, label: 'Meetups' },
                { key: 'fashion' as const, label: 'Fashion' },
                { key: 'journal' as const, label: 'Journal' },
              ] as const
            ).map(({ key, label }) => (
              <Pressable
                key={key}
                style={[styles.juxServicePill, exploreLens === key && styles.juxServicePillOn]}
                onPress={() => setExploreLens(key)}
              >
                <Text style={[styles.juxServicePillText, exploreLens === key && styles.juxServicePillTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.juxPillRow}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              style={[styles.juxServicePill, exploreScope === 'nearby' && styles.juxServicePillOn]}
              onPress={() => setExploreScope('nearby')}
            >
              <Text style={[styles.juxServicePillText, exploreScope === 'nearby' && styles.juxServicePillTextOn]}>
                Nearby
              </Text>
            </Pressable>
            <Pressable
              style={[styles.juxServicePill, exploreScope === 'everywhere' && styles.juxServicePillOn]}
              onPress={() => setExploreScope('everywhere')}
            >
              <Text style={[styles.juxServicePillText, exploreScope === 'everywhere' && styles.juxServicePillTextOn]}>
                Everywhere
              </Text>
            </Pressable>
          </ScrollView>
        </View>

        {exploreSheetStage === 'collapsed' ? (
          <>
            {!!bookingMessage ? (
              <View
                style={[
                  styles.juxDockNotice,
                  { bottom: insets.bottom + floatingNavHeight + 86, left: gutter, right: gutter },
                ]}
              >
                <Text style={styles.juxDockNoticeText}>{bookingMessage}</Text>
              </View>
            ) : null}
            <Pressable
              style={[
                styles.juxSheetDock,
                { bottom: insets.bottom + floatingNavHeight + 12, left: gutter, right: gutter },
              ]}
              onPress={() => setExploreSheetStageAnimated('mid')}
              accessibilityRole="button"
              accessibilityLabel="Open Explore sheet"
            >
              <View style={styles.juxSheetDockAccent} />
              <View style={styles.juxSheetDockCopy}>
                <Text style={styles.juxSheetDockEyebrow}>Explore</Text>
                <Text style={styles.juxSheetDockTitle}>{exploreChromeCue}</Text>
                <Text style={styles.juxSheetDockSub}>
                  {lensLabels[exploreLens]} · {exploreScope === 'nearby' ? 'Nearby' : 'Everywhere'}
                </Text>
              </View>
              <Text style={styles.juxSheetDockChevron}>⌃</Text>
            </Pressable>
          </>
        ) : null}

        {exploreSheetStage !== 'collapsed' ? (
          <View
            style={[
              styles.juxSheet,
              exploreSheetStage === 'full' ? styles.juxSheetImmersive : styles.juxSheetMid,
              {
                height: exploreSheetHeight,
                bottom: exploreSheetBottomOffset,
                borderColor: theme.border,
                backgroundColor: theme.surface,
                shadowColor: '#000',
              },
            ]}
          >
            <Pressable
              style={styles.juxSheetGrabberWrap}
              onPress={() => setExploreSheetStageAnimated(exploreSheetStage === 'mid' ? 'full' : 'mid')}
            >
              <View style={styles.juxSheetGrabber} />
              <Text style={styles.juxSheetPeekTitle}>
                {exploreSheetStage === 'full' ? 'Tap · mid height' : 'Tap · full screen'}
              </Text>
            </Pressable>
            <View style={styles.juxSheetChromeRow}>
              <Text style={styles.juxSheetChromeCue}>{exploreChromeCue}</Text>
              <Pressable onPress={() => setExploreSheetStageAnimated('collapsed')} hitSlop={12} style={styles.juxSheetMinimizeHit}>
                <Text style={styles.juxSheetMinimize}>Map ⌄</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.juxSheetScroll}
              contentContainerStyle={[styles.juxSheetScrollContent, { paddingBottom: 22 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              keyboardDismissMode="on-drag"
            >
              <Text style={styles.juxSheetSubtitle}>{sheetLead}</Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.juxPillRow, { paddingTop: 2, paddingBottom: 6 }]}
                keyboardShouldPersistTaps="handled"
              >
                {(EXPLORE_SHEET_SCOPES[exploreLens] ?? []).map((chip) => (
                  <Pressable
                    key={chip.key}
                    style={[styles.juxServicePill, exploreSheetScope === chip.key && styles.juxServicePillOn]}
                    onPress={() => setExploreSheetScope(chip.key)}
                  >
                    <Text style={[styles.juxServicePillText, exploreSheetScope === chip.key && styles.juxServicePillTextOn]}>
                      {chip.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {exploreLens === 'journal' ? (
                <>
                  <View style={[styles.juxSectionRow, styles.valetSectionLabelSpaced]}>
                    <Text style={styles.juxSectionLabel}>Journal</Text>
                    <Text style={styles.juxSeeAll}>{exploreJournalDisplayed.length}</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.juxStayCarousel}
                    decelerationRate="fast"
                    snapToInterval={stayCardW + 10}
                  >
                    {exploreJournalDisplayed.map((art) => {
                      const selected = selectedExploreCard?.kind === 'article' && selectedExploreCard.id === art.id;
                      return (
                        <Pressable
                          key={art.id}
                          style={[styles.juxStayCard, { width: stayCardW }, selected && styles.juxStayCardSelected]}
                          onPress={() =>
                            openPick({
                              kind: 'article',
                              id: art.id,
                              title: art.title,
                              subtitle: art.subtitle,
                              reason: art.reason,
                              readMin: art.readMin,
                              tag: art.tag,
                              author: art.author,
                            })
                          }
                        >
                          <Image source={art.image} style={styles.juxStayCardImage} resizeMode="cover" />
                          <View style={styles.juxStayCardBody}>
                            <Text style={styles.juxStayCardTitle} numberOfLines={2}>
                              {art.title}
                            </Text>
                            <Text style={styles.juxStayCardMeta} numberOfLines={2}>
                              {art.readMin} min · {art.tag} · {art.author}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              ) : (
                <>
                  {showDest ? (
                    <>
                      <View style={styles.juxSectionRow}>
                        <Text style={styles.juxSectionLabel}>Destinations</Text>
                        <Text style={styles.juxSeeAll}>{exploreDestinationsDisplayed.length}</Text>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.juxStayCarousel}
                        decelerationRate="fast"
                        snapToInterval={stayCardW + 10}
                      >
                        {exploreDestinationsDisplayed.map((destination) => {
                          const selected =
                            selectedExploreCard?.kind === 'destination' &&
                            selectedExploreCard.title === destination.name &&
                            selectedExploreCard.coords.latitude === destination.coords.latitude &&
                            selectedExploreCard.coords.longitude === destination.coords.longitude;
                          return (
                            <Pressable
                              key={destination.id}
                              style={[styles.juxStayCard, { width: stayCardW }, selected && styles.juxStayCardSelected]}
                              onPress={() =>
                                openPick({
                                  kind: 'destination',
                                  title: destination.name,
                                  subtitle: destination.subtitle,
                                  reason: destination.exploreReason,
                                  tip: destination.exploreTip,
                                  coords: destination.coords,
                                })
                              }
                            >
                              <Image source={destination.image} style={styles.juxStayCardImage} resizeMode="cover" />
                              <View style={styles.juxStayCardBody}>
                                <Text style={styles.juxStayCardTitle} numberOfLines={2}>
                                  {destination.name}
                                </Text>
                                <Text style={styles.juxStayCardMeta} numberOfLines={2}>
                                  {destination.subtitle}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </>
                  ) : null}

                  {showStays ? (
                    <>
                      <View style={[styles.juxSectionRow, styles.valetSectionLabelSpaced]}>
                        <Text style={styles.juxSectionLabel}>Stays</Text>
                        <Text style={styles.juxSeeAll}>{exploreBnbsDisplayed.length}</Text>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.juxStayCarousel}
                        decelerationRate="fast"
                        snapToInterval={stayCardW + 10}
                      >
                        {exploreBnbsDisplayed.map((bnb) => {
                          const bnbSelected =
                            selectedExploreCard?.kind === 'bnb' &&
                            selectedExploreCard.title === bnb.title &&
                            selectedExploreCard.coords.latitude === bnb.coords.latitude &&
                            selectedExploreCard.coords.longitude === bnb.coords.longitude;
                          return (
                            <Pressable
                              key={bnb.id}
                              style={[styles.juxStayCard, { width: stayCardW }, bnbSelected && styles.juxStayCardSelected]}
                              onPress={() =>
                                openPick({
                                  kind: 'bnb',
                                  title: bnb.title,
                                  subtitle: `${bnb.county} · ${bnb.rating} · ${bnb.price}`,
                                  reason: bnb.exploreReason,
                                  tip: bnb.exploreTip,
                                  coords: bnb.coords,
                                })
                              }
                            >
                              <Image source={bnb.image} style={styles.juxStayCardImage} resizeMode="cover" />
                              <View style={styles.juxStayCardBody}>
                                <Text style={styles.juxStayCardTitle} numberOfLines={2}>
                                  {bnb.title}
                                </Text>
                                <Text style={styles.juxStayCardMeta} numberOfLines={1}>
                                  {bnb.rating} ★ · {bnb.price}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </>
                  ) : null}

                  {exploreLens === 'discover' ? (
                    <>
                      {renderVenueStrip('Featured hotels', exHotels)}
                      {renderVenueStrip('Meetups & dev', exMeetups)}
                      {renderVenueStrip('Fashion & studios', exFashion)}
                      {renderVenueStrip('Markets & groceries', exMarkets)}
                      {renderVenueStrip('Culture & venues', exCulture)}
                    </>
                  ) : exploreLens === 'hotels' ? (
                    renderVenueStrip('Featured hotels', exHotels)
                  ) : exploreLens === 'markets' ? (
                    renderVenueStrip('Markets & groceries', exMarkets)
                  ) : exploreLens === 'meetups' ? (
                    renderVenueStrip('Meetups & dev', exMeetups)
                  ) : exploreLens === 'fashion' ? (
                    <>
                      <Text style={[styles.juxHintMuted, { marginBottom: 10, lineHeight: 18 }]}>
                        What people are wearing this week, sample-sale rumours, and where to tailor or grab basics —
                        stack with a supermarket run for a full day.
                      </Text>
                      {renderVenueStrip('Fashion & studios', exFashion)}
                      {renderVenueStrip('Where to stock up', exMarkets)}
                      {fashionReads.length > 0 ? (
                        <>
                          <View style={[styles.juxSectionRow, styles.valetSectionLabelSpaced]}>
                            <Text style={styles.juxSectionLabel}>Street journal</Text>
                            <Text style={styles.juxSeeAll}>{fashionReads.length}</Text>
                          </View>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.juxStayCarousel}
                            decelerationRate="fast"
                            snapToInterval={stayCardW + 10}
                          >
                            {fashionReads.map((art) => {
                              const selected = selectedExploreCard?.kind === 'article' && selectedExploreCard.id === art.id;
                              return (
                                <Pressable
                                  key={art.id}
                                  style={[styles.juxStayCard, { width: stayCardW }, selected && styles.juxStayCardSelected]}
                                  onPress={() =>
                                    openPick({
                                      kind: 'article',
                                      id: art.id,
                                      title: art.title,
                                      subtitle: art.subtitle,
                                      reason: art.reason,
                                      readMin: art.readMin,
                                      tag: art.tag,
                                      author: art.author,
                                    })
                                  }
                                >
                                  <Image source={art.image} style={styles.juxStayCardImage} resizeMode="cover" />
                                  <View style={styles.juxStayCardBody}>
                                    <Text style={styles.juxStayCardTitle} numberOfLines={2}>
                                      {art.title}
                                    </Text>
                                    <Text style={styles.juxStayCardMeta} numberOfLines={2}>
                                      By {art.author} · {art.readMin} min
                                    </Text>
                                  </View>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {exploreLens === 'discover' ? (
                    <>
                      <View style={[styles.juxSectionRow, styles.valetSectionLabelSpaced]}>
                        <Text style={styles.juxSectionLabel}>Journal</Text>
                        <Text style={styles.juxSeeAll}>{exploreJournalDisplayed.length}</Text>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.juxStayCarousel}
                        decelerationRate="fast"
                        snapToInterval={stayCardW + 10}
                      >
                        {exploreJournalDisplayed.map((art) => {
                          const selected = selectedExploreCard?.kind === 'article' && selectedExploreCard.id === art.id;
                          return (
                            <Pressable
                              key={art.id}
                              style={[styles.juxStayCard, { width: stayCardW }, selected && styles.juxStayCardSelected]}
                              onPress={() =>
                                openPick({
                                  kind: 'article',
                                  id: art.id,
                                  title: art.title,
                                  subtitle: art.subtitle,
                                  reason: art.reason,
                                  readMin: art.readMin,
                                  tag: art.tag,
                                  author: art.author,
                                })
                              }
                            >
                              <Image source={art.image} style={styles.juxStayCardImage} resizeMode="cover" />
                              <View style={styles.juxStayCardBody}>
                                <Text style={styles.juxStayCardTitle} numberOfLines={2}>
                                  {art.title}
                                </Text>
                                <Text style={styles.juxStayCardMeta} numberOfLines={2}>
                                  {art.readMin} min · {art.tag} · {art.author}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </>
                  ) : null}
                </>
              )}

              {selectedExploreCard ? (
                <View style={styles.juxListingDetail}>
                  <View style={styles.juxSheetChromeRow}>
                    <Text style={styles.juxSheetChromeCue}>Selected</Text>
                    <Pressable
                      hitSlop={10}
                      onPress={() => {
                        setSelectedExploreCard(null);
                        setExploreReadHereTarget(null);
                      }}
                    >
                      <Text style={styles.juxSheetMinimize}>Clear</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.juxListingTitle}>{selectedExploreCard.title}</Text>
                  <Text style={styles.juxListingPrice}>{selectedExploreCard.subtitle}</Text>
                  {selectedExploreCard.kind === 'spot' ? (
                    <Text style={styles.juxListingTip}>
                      ~{selectedExploreCard.touringNow} exploring nearby · ~
                      {selectedExploreCard.visitedToday.toLocaleString()} visits modeled today (demo insight, not a
                      census).
                    </Text>
                  ) : null}
                  <Text style={styles.juxListingDesc} numberOfLines={exploreSheetStage === 'full' ? 14 : 8}>
                    {selectedExploreCard.reason}
                  </Text>
                  {(selectedExploreCard.kind === 'destination' ||
                    selectedExploreCard.kind === 'bnb' ||
                    selectedExploreCard.kind === 'spot') &&
                  selectedExploreCard.tip ? (
                    <Text style={styles.juxListingTip}>Tip: {selectedExploreCard.tip}</Text>
                  ) : null}
                  {selectedExploreCard.kind === 'article' ? (
                    <>
                      <Text style={styles.juxListingTip}>By {selectedExploreCard.author}</Text>
                      <Text style={styles.juxListingTip}>
                        {selectedExploreCard.readMin} min read · {selectedExploreCard.tag}
                      </Text>
                      {(() => {
                        const art = EXPLORE_ARTICLES.find((a) => a.id === selectedExploreCard.id);
                        if (!art?.readHere) return null;
                        return (
                          <View style={[styles.exploreDetailLinks, { borderTopColor: theme.border, marginTop: 10 }]}>
                            <Pressable onPress={() => setExploreReadHereTarget(art.readHere ?? null)}>
                              <Text style={styles.exploreDetailLink}>Fly map to story</Text>
                            </Pressable>
                          </View>
                        );
                      })()}
                    </>
                  ) : null}
                  {selectedExploreCard.kind !== 'article' ? (
                    <View style={[styles.exploreDetailLinks, { borderTopColor: theme.border, marginTop: 12 }]}>
                      <Pressable
                        onPress={() => {
                          if (!MAPBOX_ACCESS_TOKEN) {
                            setBookingMessage('Add a Mapbox token (EXPO_PUBLIC_MAPBOX_TOKEN) for navigation.');
                            return;
                          }
                          if (!currentCoords) {
                            setBookingMessage('We need your current location — tap the location pill, then try again.');
                            return;
                          }
                          const c = selectedExploreCard.coords;
                          beginGuidedJourney({
                            end: c,
                            title: selectedExploreCard.title,
                            subtitle: selectedExploreCard.subtitle,
                            kind:
                              selectedExploreCard.kind === 'bnb'
                                ? 'bnb'
                                : selectedExploreCard.kind === 'destination'
                                  ? 'destination'
                                  : 'place',
                          });
                        }}
                      >
                        <Text style={styles.exploreDetailLink}>Navigate</Text>
                      </Pressable>
                      <Text style={styles.exploreDetailLinkSep}>·</Text>
                      <Pressable
                        onPress={() => {
                          const c = selectedExploreCard.coords;
                          setExploreRouteTarget(c);
                          if (selectedExploreCard.kind === 'destination') {
                            const known = DESTINATIONS.find(
                              (d) =>
                                d.coords.latitude === c.latitude && d.coords.longitude === c.longitude,
                            );
                            if (known) setSelectedDestination(known);
                          }
                        }}
                      >
                        <Text style={styles.exploreDetailLink}>Route on map</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
      <Modal
        visible={exploreMapKeyVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExploreMapKeyVisible(false)}
      >
        <Pressable style={styles.exploreKeyBackdrop} onPress={() => setExploreMapKeyVisible(false)}>
          <Pressable
            style={[styles.exploreKeyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.exploreKeyTitle, { color: theme.textPrimary }]}>Explore map key</Text>
            <Text style={[styles.exploreKeyLead, { color: theme.textSecondary }]}>
              Pin colours match the sheet. Heat is a soft density layer from the same pins (illustrative).
            </Text>
            {(
              [
                ['#38BDF8', 'Destinations'],
                ['#C084FC', 'Stays (BnB)'],
                ['#FB923C', 'Featured hotels'],
                ['#4ADE80', 'Meetups & dev'],
                ['#FB7185', 'Fashion & studios'],
                ['#2DD4BF', 'Markets & groceries'],
                ['#A78BFA', 'Culture & venues'],
                ['#E879F9', 'Journal reads'],
              ] as const
            ).map(([hex, label]) => (
              <View key={label} style={styles.exploreKeyRow}>
                <View style={[styles.exploreKeySwatch, { backgroundColor: hex }]} />
                <Text style={[styles.exploreKeyRowText, { color: theme.textPrimary }]}>{label}</Text>
              </View>
            ))}
            <View style={[styles.exploreKeyHeatBar, { borderColor: theme.border }]} />
            <Text style={[styles.exploreKeyFine, { color: theme.textMuted }]}>
              Warmer heat = higher modeled footfall near pins. Touring and “visits today” in cards and pop-ups are
              demo signals for discovery — wire real analytics or POI providers when you go live.
            </Text>
            <Pressable style={styles.exploreKeyDone} onPress={() => setExploreMapKeyVisible(false)}>
              <Text style={[styles.exploreKeyDoneText, { color: theme.accentText }]}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
    );
  };

  const renderTrips = () => (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>Trips</Text>
      <Text style={styles.sectionSub}>Your booked rides and service requests.</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {tripFeed.length === 0 ? (
          <View style={styles.historyCard}>
            <Text style={styles.historyRider}>No trips yet</Text>
            <Text style={styles.historyDate}>Book from Home to see trips here.</Text>
          </View>
        ) : (
          tripFeed.map((trip, index) => (
            <View key={`${trip}-${index}`} style={styles.historyCard}>
              <Text style={styles.historyRider}>{trip}</Text>
              <Text style={styles.historyDate}>Active</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );

  const renderInbox = () => (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>Inbox</Text>
      <View style={styles.historyCard}>
        <Text style={styles.historyRider}>Jua Fua</Text>
        <Text style={styles.historyDate}>Driver assigned for your next ride.</Text>
      </View>
      <View style={styles.historyCard}>
        <Text style={styles.historyRider}>Laundry Service</Text>
        <Text style={styles.historyDate}>Pickup slots available tomorrow morning.</Text>
      </View>
    </View>
  );

  const renderProfile = () => (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>Profile</Text>
      <Image source={require('./template/Preview 6.png')} style={styles.profileImage} resizeMode="cover" />
      <View style={styles.detailCard}>
        <Text style={styles.detailLabel}>Name</Text>
        <Text style={styles.detailValue}>Mesh Traveler</Text>
      </View>
      <View style={styles.detailCard}>
        <Text style={styles.detailLabel}>Email</Text>
        <Text style={styles.detailValue}>mesh@email.com</Text>
      </View>
      <View style={styles.detailCard}>
        <Text style={styles.detailLabel}>Membership</Text>
        <Text style={styles.detailValue}>Gold</Text>
      </View>

      <Text style={styles.sectionTitle}>Settings</Text>
      <TouchableOpacity
        style={styles.settingRow}
        onPress={() => {
          const next: ThemePreference =
            themePreference === 'system' ? 'light' : themePreference === 'light' ? 'dark' : 'system';
          setThemePreference(next);
        }}
        activeOpacity={0.86}
      >
        <View style={styles.settingLeft}>
          <Image
            source={themeMode === 'light' ? require('./assets/icon.png') : require('./assets/adaptive-icon.png')}
            style={styles.settingIcon}
            resizeMode="cover"
          />
          <View>
            <Text style={styles.settingTitle}>Appearance</Text>
            <Text style={styles.settingSubtitle}>Theme: {themePreferenceLabel}</Text>
          </View>
        </View>
        <Text style={styles.settingAction}>Change</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCurrent = () => {
    if (authLoading) {
      return (
        <View style={[styles.page, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      );
    }
    if (!isAuthed) return renderOnboarding();
    if (activeTab === 'home' || activeTab === 'activity' || activeTab === 'profile') return renderHome();
    return renderHome();
  };

  return (
    <View style={[styles.screenRoot, { backgroundColor: theme.canvas }]}>
      <View
        style={[
          styles.container,
          { backgroundColor: theme.canvas, paddingTop: insets.top },
          !isAuthed && styles.containerAuth,
        ]}
      >
      {renderCurrent()}

      <BookedStaySheet
        visible={bookedStaySheetBooking !== null}
        booking={bookedStaySheetBooking}
        listing={bookedStayListing}
        loading={bookedStayLoading}
        theme={theme}
        navigateDisabled={!MAPBOX_ACCESS_TOKEN || !currentCoords}
        onClose={() => {
          setBookedStaySheetBooking(null);
          setBookedStayListing(null);
        }}
        onStartTrip={startTripToBookedStay}
        onRequestRide={() => {
          if (!bookedStaySheetBooking) return;
          void requestRideToListing(
            bookedStaySheetBooking.listingId,
            bookedStaySheetBooking.listing?.title ?? 'BnB stay',
            'bnb',
          );
        }}
      />

      <ViewingRequestSheet
        visible={viewingRequestTarget !== null}
        listingTitle={viewingRequestTarget?.listingTitle ?? ''}
        priceLabel={viewingRequestTarget?.priceLabel}
        submitting={requestSubmitting}
        theme={theme}
        onClose={() => setViewingRequestTarget(null)}
        onConfirm={async ({ pickupMode, userNote }) => {
          if (!viewingRequestTarget) return;
          await submitListingRequest(
            'viewing',
            viewingRequestTarget.listingId,
            viewingRequestTarget.listingTitle,
            viewingRequestTarget.catalog,
            {
              closeDeepPage: viewingRequestTarget.closeDeepPage,
              pickupMode,
              userNote,
            },
          );
        }}
      />

      <ListingRequestSheet
        visible={listingRequestSheetId !== null}
        request={listingRequestDetail}
        loading={listingRequestSheetLoading}
        submitting={listingRequestReplySubmitting}
        onClose={() => {
          if (listingRequestSheetId) markListingRequestViewed(listingRequestSheetId);
          setListingRequestSheetId(null);
          setListingRequestDetail(null);
        }}
        onReply={handleListingRequestReply}
        theme={theme}
      />

      <BnbBookingSheet
        visible={bnbBookingSheetOpen}
        listingTitle={bnbBookingTarget?.title ?? ''}
        priceLabel={bnbBookingTarget?.price ?? ''}
        onClose={() => {
          setBnbBookingSheetOpen(false);
          setBnbBookingTarget(null);
        }}
        onConfirm={async () => {
          if (!bnbBookingTarget) return;
          await bookBnbStay(bnbBookingTarget.id, bnbBookingTarget.title, {
            stayOnListing: homeDeepPage === 'listing-detail',
          });
        }}
        submitting={requestSubmitting}
        theme={theme}
      />

      <SubscriptionSheet
        visible={subscriptionSheetOpen}
        plans={subscriptionPlans}
        selectedPlan={selectedSubscriptionPlan}
        onSelectPlan={setSelectedSubscriptionPlan}
        onClose={() => setSubscriptionSheetOpen(false)}
        onSubscribe={(plan) => subscribeToKeja(plan)}
        submitting={requestSubmitting}
        theme={theme}
      />

      <GuidedNavigationModal
        visible={guidedJourney !== null && guidanceMapHtml !== null}
        journey={guidedJourney}
        guidanceMapHtml={guidanceMapHtml}
        theme={theme}
        gold={BRAND.gold}
        topInset={insets.top}
        horizontalPad={gutter}
        onClose={() => setGuidedJourney(null)}
      />

      <Modal
        visible={tourSheetTarget !== null && tourListing !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setTourSheetTarget(null)}
      >
        {tourListing && tourSheetTarget ? (
          <View style={styles.tourModalRoot}>
            <Image source={tourListing.image} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            <View style={[styles.tourModalTopBar, { paddingTop: insets.top + 10, paddingHorizontal: gutter }]}>
              <View style={{ flex: 1 }} />
              <Pressable style={styles.tourCloseFab} onPress={() => setTourSheetTarget(null)} hitSlop={14}>
                <Text style={styles.tourCloseFabText}>Done</Text>
              </Pressable>
            </View>
            <View style={[styles.tourModalFooter, { paddingBottom: insets.bottom + 24, paddingHorizontal: gutter }]}>
              <Text style={styles.tourModalTag}>3D tour</Text>
              <Text style={styles.tourModalTitle} numberOfLines={2}>
                {tourListing.title}
              </Text>
              <Text style={styles.tourModalSub}>
                {tourSheetTarget.kind === 'bnb'
                  ? 'Pan and pinch on web builds; here you get a full-screen preview of the listing hero. Wire your Matterport or Polycam embed when ready.'
                  : 'Walk room-to-room in the published capture. This demo uses the listing photo as a stand-in for the 360° viewer.'}
              </Text>
            </View>
          </View>
        ) : null}
      </Modal>
      <StatusBar style={theme.statusBar} />
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screenRoot: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    containerAuth: {
      paddingTop: 0,
      paddingBottom: 0,
    },
    splashWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 32,
    },
    logoBox: {
      width: 88,
      height: 88,
      borderRadius: 22,
      backgroundColor: BRAND.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    logoGlyph: {
      fontSize: 40,
      color: BRAND.primaryText,
      fontFamily: 'Inter_700Bold',
      lineHeight: 42,
    },
    splashTitle: {
      fontSize: 38,
      fontFamily: 'Inter_700Bold',
    },
    splashSub: {
      fontSize: 13,
      marginBottom: 28,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 1,
    },
    splashButton: {
      marginTop: 6,
      minHeight: 56,
      minWidth: 220,
      paddingHorizontal: 28,
      borderRadius: 14,
      backgroundColor: BRAND.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: BRAND.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
      elevation: 4,
    },
    splashButtonLabel: {
      color: BRAND.primaryText,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
    },
    splashButtonIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(255,255,255,0.24)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    splashButtonIcon: {
      color: theme.accentText,
      fontSize: 18,
      marginTop: -1,
    },
    page: {
      flex: 1,
      paddingBottom: 150,
      paddingTop: 8,
      paddingHorizontal: 18,
    },
    homeHeaderRow: {
      marginBottom: 8,
    },
    homeHeaderTitle: {
      color: theme.textPrimary,
      fontSize: 24,
      fontFamily: 'Inter_700Bold',
    },
    homeHeaderSub: {
      color: theme.textSecondary,
      marginTop: 2,
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
    },
    homeCompactCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
    },
    homeCompactHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    homeCompactCopy: {
      flex: 1,
    },
    homeCompactTitle: {
      color: theme.textSecondary,
      fontSize: 11,
      fontFamily: 'Inter_500Medium',
    },
    homeCompactValue: {
      color: theme.textPrimary,
      fontSize: 14,
      marginTop: 2,
      fontFamily: 'Inter_600SemiBold',
    },
    homeCompactChevron: {
      color: theme.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
    },
    homeCompactBody: {
      marginTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      paddingTop: 8,
      gap: 6,
    },
    exploreRoot: {
      flex: 1,
      marginHorizontal: -18,
    },
    exploreMapLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    exploreMapStage: {
      height: FULL_SECTION_MAP_HEIGHT,
      width: SCREEN_WIDTH,
      alignSelf: 'center',
      marginTop: -8,
      marginBottom: 14,
      position: 'relative',
      overflow: 'hidden',
    },
    exploreSplitRoot: {
      flex: 1,
    },
    exploreMapFixed: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: theme.mutedSurface,
    },
    exploreMapChrome: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingHorizontal: 14,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    exploreSegHairline: {
      flexDirection: 'row',
      alignItems: 'stretch',
      marginTop: 8,
    },
    exploreSegCell: {
      flex: 1,
      paddingVertical: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exploreSegCellOn: {},
    exploreSegText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    exploreSegTextOn: {
      color: theme.textPrimary,
    },
    exploreSegVert: {
      width: StyleSheet.hairlineWidth,
    },
    exploreSplitScroll: {
      flex: 1,
    },
    exploreSplitScrollInner: {
      paddingHorizontal: 18,
      paddingTop: 10,
    },
    exploreListBlockFlat: {
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 2,
    },
    explorePlainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    explorePlainThumb: {
      width: 44,
      height: 44,
      borderRadius: 0,
      backgroundColor: theme.border,
    },
    exploreDetailInset: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    exploreDetailHeadRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    exploreDetailDismiss: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
    },
    exploreDetailLinks: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    exploreDetailLink: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
    },
    exploreDetailLinkSep: {
      fontSize: 12,
      color: theme.textMuted,
      fontFamily: 'Inter_500Medium',
    },
    exploreMapWebView: {
      flex: 1,
      width: '100%',
      height: '100%',
      backgroundColor: theme.mutedSurface,
    },
    exploreTopOverlay: {
      position: 'absolute',
      top: Platform.OS === 'android' ? 10 : 14,
      left: 12,
      right: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 10,
    },
    exploreMapFallback: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    exploreMapFallbackText: {
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    exploreKeyBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.42)',
      justifyContent: 'flex-end',
      paddingHorizontal: 18,
      paddingBottom: 28,
    },
    exploreKeyCard: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      maxHeight: '78%',
    },
    exploreKeyTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 17,
      marginBottom: 6,
    },
    exploreKeyLead: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 12,
    },
    exploreKeyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    exploreKeySwatch: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: '#FFFFFF',
    },
    exploreKeyRowText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      flex: 1,
    },
    exploreKeyHeatBar: {
      height: 10,
      borderRadius: 5,
      marginTop: 6,
      marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      backgroundColor: theme.mutedSurface,
    },
    exploreKeyFine: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      lineHeight: 16,
      marginBottom: 12,
    },
    exploreKeyDone: {
      alignSelf: 'stretch',
      backgroundColor: theme.accent,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    exploreKeyDoneText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
    },
    exploreSheet: {
      display: 'none',
    },
    exploreScopeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    exploreScopeBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.mutedSurface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    exploreScopeBtnActive: {
      borderColor: theme.accent,
      backgroundColor: theme.surface,
    },
    exploreScopeText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
    },
    exploreScopeTextActive: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    exploreDetailCard: {
      marginTop: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      backgroundColor: theme.surface,
      padding: 12,
    },
    exploreDetailTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.2,
    },
    exploreDetailTitleRow: {
      flex: 1,
      minWidth: 0,
    },
    exploreDetailSub: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 4,
      fontFamily: 'Inter_400Regular',
    },
    exploreDetailReason: {
      color: theme.textPrimary,
      fontSize: 13,
      marginTop: 8,
      lineHeight: 18,
      fontFamily: 'Inter_400Regular',
    },
    exploreDetailTip: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 8,
      lineHeight: 17,
      fontFamily: 'Inter_400Regular',
    },
    exploreDetailActions: {
      marginTop: 12,
      flexDirection: 'row',
      gap: 8,
    },
    exploreDetailActionStack: {
      marginTop: 12,
      gap: 8,
    },
    exploreDetailPrimaryWide: {
      borderRadius: 10,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
    },
    exploreDetailGhostWide: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      backgroundColor: theme.mutedSurface,
    },
    exploreDetailPrimary: {
      flex: 1,
      borderRadius: 10,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
    },
    exploreDetailPrimaryText: {
      color: theme.accentText,
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    exploreDetailGhost: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.mutedSurface,
    },
    exploreDetailGhostText: {
      color: theme.textPrimary,
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    exploreSheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      marginBottom: 10,
    },
    exploreSheetTitle: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      marginBottom: 4,
    },
    exploreSheetSub: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: 'Inter_400Regular',
      marginBottom: 10,
    },
    exploreScrollRoot: {
      paddingBottom: 96,
    },
    exploreScrollContent: {
      paddingHorizontal: 18,
      paddingBottom: 24,
    },
    exploreSheetSubMuted: {
      color: theme.textMuted,
      fontSize: 11,
      fontFamily: 'Inter_500Medium',
      marginBottom: 8,
      lineHeight: 16,
    },
    exploreDestStrip: {
      gap: 10,
      paddingVertical: 4,
      marginBottom: 6,
    },
    exploreDestTile: {
      width: 112,
    },
    exploreDestTileImg: {
      width: 112,
      height: 76,
      borderRadius: 10,
      backgroundColor: theme.border,
    },
    exploreDestTileLabel: {
      marginTop: 6,
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
      lineHeight: 16,
    },
    exploreBnbsHeader: {
      marginTop: 14,
    },
    exploreListBlock: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: theme.surface,
    },
    exploreCurrentHint: {
      color: theme.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      fontFamily: 'Inter_500Medium',
      marginBottom: 10,
    },
    exploreSheetSection: {
      marginTop: 4,
    },
    exploreHScroll: {
      flexDirection: 'row',
      paddingVertical: 6,
      paddingRight: 8,
      gap: 10,
    },
    homeLocationBlock: {
      marginBottom: 20,
      paddingBottom: 18,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    homeHeroCard: {
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    homeHeroTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
    },
    homeHeroSub: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: 'Inter_400Regular',
      marginTop: 4,
    },
    homeLocationTitle: {
      color: theme.textPrimary,
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      marginBottom: 6,
    },
    homeLocationSub: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: 'Inter_400Regular',
      marginBottom: 10,
    },
    homeCountyHint: {
      color: theme.textSecondary,
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      textTransform: 'capitalize',
      lineHeight: 17,
      marginTop: 2,
    },
    locationFoundTag: {
      marginTop: 8,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.mutedSurface,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      color: theme.textPrimary,
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
    },
    exploreDestTouch: {
      width: 148,
    },
    exploreDestCard: {
      width: 148,
      height: 108,
      borderRadius: 12,
      overflow: 'hidden',
      justifyContent: 'flex-end',
      padding: 10,
    },
    pageTitle: {
      fontSize: 30,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      marginBottom: 18,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      marginTop: 8,
    },
    sectionTitleFlush: {
      marginTop: 0,
    },
    sectionSub: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: 'Inter_400Regular',
      marginTop: 4,
      marginBottom: 10,
    },
    sectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
    },
    linkText: {
      color: '#3B82F6',
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
    },
    linkLine: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      marginTop: 12,
      textDecorationLine: 'underline',
    },
    homeTouchWrap: {
      flex: 1,
    },
    serviceTabScroll: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      flexGrow: 1,
      justifyContent: 'center',
      minWidth: '100%',
      gap: 18,
      paddingTop: 10,
      paddingBottom: 6,
      paddingHorizontal: 6,
      marginBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    serviceTabItem: {
      paddingBottom: 10,
      paddingHorizontal: 8,
    },
    serviceTabText: {
      fontSize: 14,
      color: theme.textSecondary,
      fontFamily: 'Inter_500Medium',
    },
    serviceTabTextActive: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    serviceTabUnderline: {
      height: 2,
      backgroundColor: theme.accent,
      marginTop: 8,
      borderRadius: 1,
    },
    serviceTabUnderlinePlaceholder: {
      height: 2,
      marginTop: 8,
      opacity: 0,
    },
    flowHint: {
      color: theme.textSecondary,
      fontSize: 11,
      fontFamily: 'Inter_500Medium',
      marginTop: -2,
      marginBottom: 6,
      textTransform: 'capitalize',
    },
    homeServiceViewport: {
      minHeight: HOME_SERVICE_MAP_HEIGHT,
    },
    fieldLabel: {
      color: theme.textSecondary,
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      marginTop: 4,
      marginBottom: 8,
    },
    choiceRow: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      marginBottom: 8,
    },
    choiceRowActive: {
      borderColor: theme.accent,
      backgroundColor: theme.mutedSurface,
    },
    choiceTitle: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
    },
    choiceSub: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 4,
      fontFamily: 'Inter_400Regular',
    },
    emptyCard: {
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      marginBottom: 12,
    },
    emptyTitle: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
    },
    emptyBody: {
      color: theme.textSecondary,
      fontSize: 13,
      marginTop: 6,
      lineHeight: 19,
      fontFamily: 'Inter_400Regular',
    },
    inlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 4,
      marginBottom: 2,
    },
    quantityRow: {
      marginTop: 8,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    qtyButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mutedSurface,
    },
    qtyButtonText: {
      color: theme.textPrimary,
      fontFamily: 'Inter_700Bold',
      fontSize: 18,
      marginTop: -1,
    },
    qtyValue: {
      color: theme.textPrimary,
      fontFamily: 'Inter_700Bold',
      fontSize: 16,
    },
    inputMock: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 16,
      marginBottom: 10,
    },
    inputText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    primaryButton: {
      marginTop: 18,
      borderRadius: 10,
      paddingVertical: 14,
      minHeight: 52,
      alignItems: 'center',
      backgroundColor: theme.primary,
      justifyContent: 'center',
    },
    primaryLabel: {
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
      fontSize: 16,
    },
    secondaryButton: {
      marginTop: 10,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    secondaryLabel: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
    },
    scroll: {
      paddingBottom: 120,
      paddingHorizontal: 18,
    },
    mapCard: {
      height: HOME_SERVICE_MAP_HEIGHT,
      borderRadius: 0,
      overflow: 'hidden',
      marginTop: 0,
      width: SCREEN_WIDTH,
      alignSelf: 'center',
      marginHorizontal: -18,
      backgroundColor: theme.mutedSurface,
    },
    serviceMapCard: {
      height: HOME_SERVICE_MAP_HEIGHT,
      borderRadius: 0,
      overflow: 'hidden',
      marginTop: -4,
      marginBottom: 14,
      width: SCREEN_WIDTH,
      alignSelf: 'center',
      marginHorizontal: -18,
      backgroundColor: theme.mutedSurface,
    },
    mapTopSlot: {
      position: 'absolute',
      left: 12,
      right: 60,
      top: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    mapTopTitle: {
      color: theme.textPrimary,
      fontSize: 13,
      fontFamily: 'Inter_700Bold',
    },
    mapTopSub: {
      color: theme.textSecondary,
      fontSize: 11,
      marginTop: 2,
      fontFamily: 'Inter_400Regular',
    },
    mapTopSearchRow: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    mapTopSearchInput: {
      flex: 1,
      height: 36,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.mutedSurface,
      borderRadius: 9,
      color: theme.textPrimary,
      paddingHorizontal: 10,
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
    },
    mapTopSearchBtn: {
      width: 36,
      height: 36,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mapActionSheet: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 10,
    },
    mapFlowRow: {
      marginBottom: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    mapFlowLabel: {
      color: theme.textSecondary,
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      textTransform: 'capitalize',
    },
    mapActionTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
    },
    mapActionSub: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: 'Inter_400Regular',
      marginTop: 4,
    },
    mapQuickRow: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    mapRideTierRow: {
      marginTop: 10,
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    mapRideTierChip: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.mutedSurface,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    mapRideTierChipActive: {
      borderColor: theme.accent,
      backgroundColor: theme.surface,
    },
    mapRideTierLabel: {
      color: theme.textPrimary,
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    mapRideTierLabelActive: {
      color: theme.textPrimary,
    },
    mapRideTierMeta: {
      color: theme.textSecondary,
      fontSize: 11,
      marginTop: 2,
      fontFamily: 'Inter_500Medium',
    },
    mapRideTierMetaActive: {
      color: theme.textSecondary,
    },
    mapQuickBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      backgroundColor: theme.mutedSurface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    mapQuickBtnText: {
      color: theme.textPrimary,
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    mapQuickValue: {
      color: theme.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
    },
    mapActionPrimary: {
      marginTop: 10,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      backgroundColor: theme.primary,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
      elevation: 4,
    },
    mapActionPrimaryText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.3,
    },
    mapImage: {
      width: '100%',
      height: '100%',
      justifyContent: 'flex-end',
    },
    mapControls: {
      position: 'absolute',
      right: 10,
      bottom: 10,
      gap: 8,
    },
    mapFabColumn: {
      position: 'absolute',
      right: 10,
      top: 70,
      gap: 8,
    },
    mapControlButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.sheet,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    mapControlLabel: {
      color: theme.textPrimary,
      fontFamily: 'Inter_700Bold',
      fontSize: 16,
      lineHeight: 20,
    },
    mapOverlay: {
      backgroundColor: 'rgba(0,0,0,0.4)',
      padding: 10,
    },
    mapOverlayText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    locationHeadRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    locationHeadCopy: {
      flex: 1,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonText: {
      color: theme.textPrimary,
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      marginTop: -1,
    },
    searchRowMinimal: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    searchInputFlex: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.textPrimary,
      paddingHorizontal: 14,
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
    },
    searchIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchIconGlyph: {
      color: theme.textPrimary,
      fontSize: 18,
      fontFamily: 'Inter_600SemiBold',
      marginTop: -2,
    },
    recentRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
    },
    recentChip: {
      maxWidth: '47%',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    recentChipText: {
      color: theme.textPrimary,
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
    },
    suggestionsCard: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      marginBottom: 10,
      overflow: 'hidden',
    },
    suggestionItem: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    suggestionTitle: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    suggestionSubtitle: {
      marginTop: 2,
      color: theme.textSecondary,
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
    },
    errorText: {
      color: '#EF4444',
      fontSize: 12,
      marginTop: 6,
      marginBottom: 2,
      fontFamily: 'Inter_500Medium',
    },
    routeStatsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 10,
      marginBottom: 8,
    },
    routeStatCard: {
      flex: 1,
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    routeStatTitle: {
      color: theme.textSecondary,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
    },
    routeStatValue: {
      marginTop: 4,
      color: theme.textPrimary,
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
    },
    destinationRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 8,
    },
    destinationTouch: {
      width: '48%',
      borderWidth: 1,
      borderColor: 'transparent',
      borderRadius: 12,
      overflow: 'hidden',
    },
    destinationTouchActive: {
      borderColor: theme.accent,
    },
    destinationCard: {
      flex: 1,
      height: 120,
      borderRadius: 12,
      overflow: 'hidden',
      justifyContent: 'flex-end',
      padding: 10,
    },
    destinationImage: {
      borderRadius: 12,
    },
    destinationOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.28)',
    },
    destinationTitle: {
      color: '#FFFFFF',
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
    },
    bnbCard: {
      marginTop: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      overflow: 'hidden',
    },
    bnbImage: {
      width: '100%',
      height: 132,
    },
    bnbCopy: {
      padding: 12,
    },
    carCard: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 14,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    carImage: {
      width: 66,
      height: 50,
      borderRadius: 8,
    },
    carMeta: {
      flex: 1,
    },
    carName: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
    },
    carRating: {
      color: theme.textSecondary,
      marginTop: 4,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    carPrice: {
      color: theme.textPrimary,
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
    },
    rideCard: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 10,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    rideCardActive: {
      borderColor: theme.accent,
    },
    bookingSuccess: {
      marginTop: 12,
      color: '#16A34A',
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    tripStarted: {
      marginTop: 10,
      color: '#2563EB',
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    detailCard: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    detailLabel: {
      color: theme.textSecondary,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    detailValue: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
    },
    paymentMethod: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      borderRadius: 10,
      padding: 13,
      marginBottom: 8,
    },
    methodText: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    historyCard: {
      backgroundColor: theme.surface,
      borderWidth: 1.5,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    historyRider: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    historyDate: {
      color: theme.textSecondary,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    walletRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 12,
    },
    walletCard: {
      flex: 1,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    walletAmount: {
      color: theme.textPrimary,
      fontSize: 26,
      fontFamily: 'Inter_700Bold',
    },
    walletLabel: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 4,
      fontFamily: 'Inter_400Regular',
    },
    profileImage: {
      width: '100%',
      height: 160,
      borderRadius: 12,
      marginBottom: 12,
    },
    settingRow: {
      marginTop: 8,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    settingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    settingIcon: {
      width: 28,
      height: 28,
      borderRadius: 6,
    },
    settingTitle: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
    },
    settingSubtitle: {
      color: theme.textSecondary,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      marginTop: 2,
    },
    settingAction: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    juxShell: {
      flex: 1,
      flexDirection: 'column',
    },
    homeTopChrome: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    homeLocationStrip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minWidth: 0,
    },
    homeLocationStripText: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
    },
    homeNotifyBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    homeNotifyBadge: {
      position: 'absolute',
      top: 2,
      right: 2,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    homeNotifyBadgeText: {
      color: '#fff',
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
    },
    homeBrandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 8,
      paddingBottom: 10,
      flexShrink: 0,
    },
    homeLogoMark: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexShrink: 0,
      marginRight: 2,
    },
    homeLogoJua: {
      fontSize: 24,
      lineHeight: 28,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.6,
    },
    homeLogoX: {
      fontSize: 24,
      lineHeight: 28,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.6,
    },
    homeHeaderSegments: {
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
    },
    homeHeaderSegmentsScroll: {
      flexGrow: 0,
      width: '100%',
    },
    moreMenuBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    moreMenuCard: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 18,
      paddingBottom: 28,
      gap: 12,
    },
    moreMenuTitle: {
      fontSize: 17,
      fontFamily: 'Inter_600SemiBold',
    },
    moreMenuGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    moreMenuItem: {
      width: '48%',
      minHeight: 52,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12,
      paddingVertical: 10,
      justifyContent: 'center',
    },
    moreMenuItemLabel: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.4,
    },
    moreMenuItemSoon: {
      fontSize: 10,
      fontFamily: 'Inter_500Medium',
      marginTop: 2,
    },
    homeLocationRefresh: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      paddingHorizontal: 4,
    },
    serviceMapBody: {
      flex: 1,
      minHeight: 0,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: theme.border,
      position: 'relative',
    },
    serviceMapFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    serviceMapFallbackText: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
      textAlign: 'center',
    },
    juxMapBand: {
      width: '100%',
      overflow: 'hidden',
      position: 'relative',
    },
    bottomChrome: {
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
    },
    serviceSegmentInChrome: {
      paddingVertical: 8,
      backgroundColor: theme.canvas,
      flexShrink: 0,
    },
    juxSheetAttached: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      overflow: 'hidden',
      borderTopWidth: theme.isDark ? 0 : StyleSheet.hairlineWidth,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: theme.isDark ? -3 : -2 },
      shadowOpacity: theme.isDark ? 0.38 : 0.1,
      shadowRadius: theme.isDark ? 16 : 20,
      elevation: theme.isDark ? 10 : 16,
      minHeight: 0,
    },
    juxSheetFlex: {
      flex: 1,
    },
    juxSheetFlat: {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      shadowOpacity: 0,
      elevation: 0,
    },
    tabBarShell: {
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    tabBarAttached: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingTop: 10,
      minHeight: 56,
    },
    mapLocationBanner: {
      position: 'absolute',
      left: 16,
      right: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      zIndex: 12,
    },
    mapLocationDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#22c55e',
    },
    serviceMapLegend: {
      position: 'absolute',
      left: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      zIndex: 12,
    },
    serviceMapLegendWrap: {
      flexWrap: 'wrap',
      maxWidth: '92%',
      borderRadius: 12,
    },
    serviceMapLegendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    serviceMapLegendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: '#fff',
    },
    serviceMapLegendText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
    },
    mapLocationText: {
      flex: 1,
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
    },
    mapEmphasisPill: {
      position: 'absolute',
      alignSelf: 'center',
      left: '15%',
      right: '15%',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.primary,
      zIndex: 12,
    },
    mapEmphasisPillText: {
      textAlign: 'center',
      color: '#FFFFFF',
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.3,
    },
    recenterChip: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      zIndex: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 4,
    },
    recenterChipIcon: {
      fontSize: 14,
      color: theme.primary,
    },
    recenterChipText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
    },
    activeTripBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 12,
      flex: 1,
    },
    activeTripBarMain: {
      flex: 1,
      minWidth: 0,
    },
    activeTripBarTitle: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
    },
    activeTripBarSub: {
      marginTop: 2,
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
    },
    activeTripBarEta: {
      alignItems: 'flex-end',
    },
    activeTripBarEtaValue: {
      fontSize: 16,
      fontFamily: 'Inter_700Bold',
      color: theme.primary,
    },
    activeTripBarEtaLabel: {
      fontSize: 10,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 0.4,
    },
    activeTripBarRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      backgroundColor: theme.primaryLight,
    },
    activeTripCancel: {
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: theme.border,
    },
    activeTripCancelText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: theme.primary,
    },
    serviceHero: {
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 16,
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: 172,
      justifyContent: 'flex-end',
    },
    serviceHeroImageStyle: {
      borderRadius: 16,
    },
    serviceHeroOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(8, 7, 5, 0.52)',
    },
    serviceHeroGoldWash: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(201, 162, 39, 0.14)',
    },
    serviceHeroContent: {
      padding: 16,
      justifyContent: 'flex-end',
      minHeight: 172,
    },
    serviceHeroEyebrow: {
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.2,
      color: BRAND.gold,
      marginBottom: 6,
    },
    serviceHeroTitle: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: '#FFFFFF',
      letterSpacing: -0.3,
      marginBottom: 6,
    },
    serviceHeroDesc: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 19,
      color: 'rgba(255,255,255,0.88)',
    },
    destinationSearchModal: {
      flex: 1,
    },
    destinationSearchHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    destinationSearchBack: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: theme.primary,
      width: 48,
    },
    destinationSearchTitle: {
      fontSize: 17,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
    },
    destinationSearchList: {
      flex: 1,
      marginTop: 8,
    },
    destinationSearchSection: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
      marginBottom: 8,
      marginTop: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    juxSearchPlaceholder: {
      color: theme.textSecondary,
    },
    locationErrorBanner: {
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.primaryLight,
      borderWidth: 1,
      borderColor: theme.border,
    },
    locationErrorRetry: {
      marginTop: 4,
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.primary,
    },
    juxMapLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    juxHeaderBlock: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      zIndex: 20,
    },
    juxTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    juxBrandBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    juxLogoDisc: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    juxLogoGlyph: {
      color: theme.accentText,
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      marginTop: -2,
    },
    juxWordmark: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      letterSpacing: 2,
    },
    juxLocationPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minWidth: 0,
      backgroundColor: theme.surface,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: theme.border,
    },
    juxPinDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.accentBlue,
    },
    juxLocationText: {
      flex: 1,
      minWidth: 0,
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
      textTransform: 'uppercase',
    },
    juxMenuOrb: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    juxMenuIcon: {
      fontSize: 18,
      color: theme.textPrimary,
      marginTop: -2,
    },
    juxSearchPill: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      marginBottom: 10,
      gap: 8,
    },
    juxSearchIcon: {
      fontSize: 16,
      color: theme.textSecondary,
    },
    juxSearchInput: {
      flex: 1,
      minWidth: 0,
      color: theme.textPrimary,
      fontFamily: 'Inter_500Medium',
      fontSize: 15,
      paddingVertical: 10,
    },
    juxSparkleBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    juxSparkle: {
      color: theme.accentBlue,
      fontSize: 16,
    },
    juxPillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
    },
    juxServicePill: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    juxServicePillOn: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    juxServicePillText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
      letterSpacing: 0.6,
    },
    juxServicePillTextOn: {
      color: theme.accentText,
    },
    juxSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 18,
      paddingTop: 4,
      zIndex: 30,
      elevation: 24,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    juxSheetGrabberWrap: {
      alignItems: 'center',
      paddingTop: 12,
      paddingBottom: 8,
    },
    juxSheetGrabber: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.grabber,
      marginBottom: 6,
    },
    juxSheetPeekTitle: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    juxSheetMid: {
      shadowOpacity: 0.14,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: -6 },
    },
    juxSheetImmersive: {
      zIndex: 50,
      elevation: 36,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      shadowOpacity: 0.24,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: -12 },
    },
    juxDockNotice: {
      position: 'absolute',
      zIndex: 120,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      elevation: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.1,
      shadowRadius: 14,
      gap: 4,
    },
    juxDockNoticeText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: theme.accentBlue,
      textAlign: 'center',
    },
    juxDockNoticeError: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: '#EF4444',
      textAlign: 'center',
    },
    juxSheetDock: {
      position: 'absolute',
      zIndex: 55,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      elevation: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 22,
      gap: 12,
    },
    juxSheetDockAccent: {
      width: 4,
      height: 40,
      borderRadius: 2,
      backgroundColor: theme.accentBlue,
    },
    juxSheetDockCopy: {
      flex: 1,
      minWidth: 0,
    },
    juxSheetDockEyebrow: {
      fontSize: 10,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    juxSheetDockTitle: {
      marginTop: 2,
      fontSize: 16,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
    },
    juxSheetDockSub: {
      marginTop: 2,
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
    },
    juxSheetDockChevron: {
      fontSize: 20,
      color: theme.accentBlue,
      paddingLeft: 4,
    },
    juxSheetChromeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
      paddingBottom: 6,
      marginTop: -2,
    },
    juxSheetChromeCue: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      letterSpacing: -0.2,
    },
    juxSheetMinimizeHit: {
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    juxSheetMinimize: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: theme.accentBlue,
    },
    juxNoticePill: {
      alignSelf: 'center',
      marginHorizontal: 16,
      marginBottom: 8,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      maxWidth: '92%',
    },
    juxNoticePillText: {
      fontSize: 12,
      color: theme.accentBlue,
      fontFamily: 'Inter_600SemiBold',
      textAlign: 'center',
    },
    pullRefreshStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 4,
      minHeight: 28,
      marginBottom: 2,
    },
    pullRefreshGlyph: {
      fontSize: 17,
      color: theme.primary,
      fontFamily: 'Inter_600SemiBold',
    },
    pullRefreshHint: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
    },
    juxSheetScrollHost: {
      flex: 1,
      minHeight: 0,
    },
    juxSheetScrollClip: {
      flex: 1,
      minHeight: 0,
      position: 'relative',
    },
    sheetScrollCueWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      paddingTop: 18,
      paddingBottom: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    sheetScrollCueFade: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.92,
    },
    sheetScrollCueText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.2,
    },
    juxErrorInline: {
      fontSize: 11,
      color: '#EF4444',
      marginBottom: 6,
      textAlign: 'center',
    },
    juxSheetScroll: {
      flex: 1,
    },
    juxSheetScrollContent: {
      paddingBottom: 20,
    },
    juxSuggestions: {
      marginBottom: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    juxSuggestionRow: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    juxSuggestionRowLast: {
      borderBottomWidth: 0,
    },
    juxSuggestionTitle: {
      color: theme.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    juxSuggestionSub: {
      marginTop: 2,
      color: theme.textSecondary,
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
    },
    juxSectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    juxSectionLabel: {
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    juxSectionMeta: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: theme.primary,
    },
    juxSeeAll: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
    },
    juxCardTitle: {
      fontSize: 17,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      marginBottom: 4,
    },
    juxCardSub: {
      fontSize: 12,
      color: theme.textSecondary,
      fontFamily: 'Inter_400Regular',
      marginBottom: 10,
    },
    juxSheetTitle: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
    },
    juxSheetSubtitle: {
      marginTop: 2,
      marginBottom: 8,
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    valetSheetTag: {
      marginTop: 4,
      fontSize: 10,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: theme.textMuted,
    },
    valetSheetLead: {
      marginTop: 8,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 19,
      color: theme.textSecondary,
    },
    valetSectionLabelSpaced: {
      marginTop: 22,
    },
    valetSectionLabelCompact: {
      marginTop: 12,
    },
    valetAddressCompact: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      marginTop: 8,
      marginBottom: 4,
    },
    fuaStationScroll: {
      marginTop: 6,
      marginBottom: 4,
    },
    fuaSheetRoot: {
      position: 'relative',
      overflow: 'hidden',
      paddingBottom: 4,
    },
    fuaWatermark: {
      position: 'absolute',
      right: -28,
      top: 8,
      opacity: 1,
      transform: [{ rotate: '-12deg' }],
    },
    fuaHeaderBlock: {
      marginBottom: 14,
      paddingRight: 56,
    },
    fuaDots: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 10,
    },
    fuaDot: {
      width: 22,
      height: 4,
      borderRadius: 2,
    },
    fuaTitle: {
      fontSize: 24,
      lineHeight: 28,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.4,
    },
    fuaSubtitle: {
      marginTop: 4,
      fontSize: 14,
      lineHeight: 19,
      fontFamily: 'Inter_400Regular',
    },
    fuaProgressDots: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 14,
    },
    fuaProgressDot: {
      flex: 1,
      height: 3,
      borderRadius: 2,
    },
    fuaInlineLink: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      marginTop: 4,
      marginBottom: 10,
    },
    fuaLocationCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 10,
    },
    fuaLocationBody: {
      flex: 1,
      minWidth: 0,
    },
    fuaLocationLabel: {
      fontSize: 11,
      fontFamily: 'Inter_500Medium',
      marginBottom: 2,
    },
    fuaLocationValue: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      lineHeight: 18,
    },
    fuaLocationAction: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      paddingHorizontal: 4,
    },
    fuaWhenRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
    },
    fuaWhenChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: theme.border,
    },
    fuaWhenChipText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    fuaLoadCard: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingVertical: 16,
      paddingHorizontal: 12,
      marginBottom: 12,
      gap: 8,
    },
    fuaLoadCenter: {
      alignItems: 'center',
      minWidth: 96,
    },
    fuaLoadValue: {
      fontSize: 28,
      lineHeight: 32,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.5,
    },
    fuaLoadHint: {
      marginTop: 2,
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
    },
    fuaAddressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    fuaAddressPin: {
      fontSize: 14,
    },
    fuaAddressText: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      lineHeight: 19,
    },
    fuaAddressAction: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      paddingHorizontal: 4,
    },
    fuaChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    fuaChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
    },
    fuaChipText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    fuaNotesInput: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      minHeight: 48,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      marginBottom: 8,
      textAlignVertical: 'top',
    },
    fuaTaskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1.5,
      borderColor: theme.border,
      borderRadius: 12,
      marginBottom: 8,
    },
    fuaTaskLabel: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
    fuaTaskPrice: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
    },
    fuaTaskCheck: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      width: 18,
      textAlign: 'center',
    },
    fuaReceipt: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      gap: 6,
    },
    fuaReceiptLine: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      lineHeight: 22,
    },
    fuaReceiptMeta: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
    },
    fuaReceiptTotal: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 10,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    fuaReceiptTotalLabel: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
    },
    fuaReceiptTotalValue: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
    },
    listingsLoadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 28,
    },
    fuaServiceChoiceRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 12,
    },
    fuaServiceChoiceCard: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: theme.border,
      padding: 14,
      gap: 6,
      alignItems: 'flex-start',
      minHeight: 108,
    },
    fuaServiceChoiceCardOn: {
      borderColor: theme.primary,
      backgroundColor: theme.primaryLight,
    },
    fuaChoiceIconWell: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    fuaServiceChoiceIcon: {
      marginBottom: 4,
    },
    fuaServiceChoiceTitle: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
    },
    fuaServiceChoiceSub: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      lineHeight: 15,
    },
    fuaStationChip: {
      marginRight: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      minWidth: 100,
      maxWidth: 150,
      justifyContent: 'center',
    },
    fuaStationChipOn: {
      borderColor: theme.primary,
      backgroundColor: theme.primaryLight,
    },
    fuaStationChipText: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
    },
    fuaStationChipTextOn: {
      fontFamily: 'Inter_600SemiBold',
      color: theme.primary,
    },
    fuaStationChipSub: {
      fontSize: 10,
      fontFamily: 'Inter_400Regular',
      marginTop: 2,
    },
    valetStepperCompact: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
    },
    valetSegmentTrack: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    valetSegment: {
      flex: 1,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    valetSegmentActive: {
      backgroundColor: theme.primaryLight,
    },
    valetSegmentDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
    },
    valetSegmentText: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
    },
    valetSegmentTextActive: {
      fontFamily: 'Inter_600SemiBold',
      color: theme.primary,
    },
    valetSegmentTextDisabled: {
      opacity: 0.38,
    },
    valetPickupBlock: {
      marginTop: 14,
      paddingBottom: 4,
    },
    valetAddress: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
      lineHeight: 22,
    },
    valetMeta: {
      marginTop: 6,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: theme.textSecondary,
      lineHeight: 17,
    },
    valetFinePrint: {
      marginTop: 10,
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      lineHeight: 16,
      color: theme.textMuted,
    },
    valetStationList: {
      marginTop: 6,
    },
    valetStationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 12,
      marginBottom: 8,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    valetStationRowLast: {
      marginBottom: 0,
    },
    valetStationRowSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primaryLight,
    },
    valetStationRowText: {
      flex: 1,
      paddingRight: 8,
    },
    valetStationName: {
      fontSize: 15,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
    },
    valetStationNameOn: {
      fontFamily: 'Inter_600SemiBold',
    },
    valetStationSub: {
      marginTop: 3,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: theme.textMuted,
    },
    valetStationCheck: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: theme.primary,
    },
    valetStepper: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
    },
    valetStepperBtn: {
      minWidth: 44,
      minHeight: 44,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    valetStepperBtnText: {
      fontSize: 20,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
      lineHeight: 22,
    },
    valetStepperValue: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
      minWidth: 88,
      textAlign: 'center',
    },
    valetEstimateBar: {
      marginTop: 22,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    valetEstimateLabel: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: theme.textMuted,
      letterSpacing: 0.4,
    },
    valetEstimateAmount: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      letterSpacing: -0.3,
    },
    valetLinkRow: {
      marginTop: 14,
      paddingVertical: 4,
      alignSelf: 'flex-start',
    },
    valetLinkText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
    },
    valetConfirmBtn: {
      marginTop: 18,
    },
    valetListingFooter: {
      marginTop: 18,
      paddingTop: 4,
    },
    valetListingFooterCompact: {
      marginTop: 10,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    valetListingLinkRow: {
      paddingVertical: 10,
      alignSelf: 'flex-start',
    },
    valetListingSecondary: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
    },
    valetListingSecondaryDisabled: {
      color: theme.textMuted,
      textDecorationLine: 'none',
    },
    journeyModalRoot: {
      flex: 1,
    },
    journeyModalTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      zIndex: 2,
    },
    journeyModalTitle: {
      fontSize: 16,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.2,
    },
    journeyModalDestStrip: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    journeyModalEyebrow: {
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.2,
    },
    journeyModalDestTitle: {
      fontSize: 17,
      fontFamily: 'Inter_700Bold',
      marginTop: 4,
      letterSpacing: -0.2,
    },
    journeyModalDestSub: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      marginTop: 2,
      lineHeight: 17,
    },
    journeyMapWebView: {
      flex: 1,
    },
    juxStayCarousel: {
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 6,
      paddingRight: 2,
    },
    juxStayCard: {
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.mutedSurface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    juxStayCardSelected: {
      borderColor: theme.primary,
      borderWidth: 2,
    },
    juxStayCardImage: {
      width: '100%',
      height: 112,
      backgroundColor: theme.border,
    },
    juxStayCardImageWrap: {
      position: 'relative',
    },
    juxVacantBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: 'rgba(0,0,0,0.72)',
    },
    juxVacantBadgeText: {
      fontSize: 10,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    juxStayCardBody: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    juxStayCardTitle: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      lineHeight: 18,
    },
    juxStayCardMeta: {
      fontSize: 11,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
    },
    juxStayCardPrice: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
      marginTop: 2,
    },
    juxListingDetail: {
      marginTop: 16,
      borderRadius: 0,
      overflow: 'visible',
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      paddingTop: 16,
    },
    juxListingHero: {
      width: '100%',
      height: 148,
      backgroundColor: theme.border,
    },
    juxListingCarouselWrap: {
      alignSelf: 'center',
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: theme.border,
    },
    juxListingCarouselSlide: {
      height: 200,
      backgroundColor: theme.border,
    },
    juxListingCarouselSlideCompact: {
      height: 120,
    },
    juxListingBulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 6,
      paddingRight: 2,
    },
    juxListingBulletGlyph: {
      fontSize: 9,
      marginTop: 4,
      color: theme.accentBlue,
      fontFamily: 'Inter_700Bold',
    },
    juxListingBulletText: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      lineHeight: 19,
      color: theme.textPrimary,
    },
    juxListingTip: {
      marginTop: 10,
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      lineHeight: 17,
      color: theme.textSecondary,
      fontStyle: 'italic',
    },
    juxListingDetailBody: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 14,
    },
    listingUnlockCard: {
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
      marginVertical: 8,
    },
    juxListingTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    juxListingTitle: {
      flex: 1,
      fontSize: 17,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      lineHeight: 22,
    },
    juxListingRating: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
    },
    juxListingPrice: {
      marginTop: 6,
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
    },
    juxListingDesc: {
      marginTop: 8,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 19,
      color: theme.textSecondary,
    },
    juxChipRow: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      gap: 8,
      marginTop: 12,
      paddingRight: 4,
    },
    juxChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.mutedSurface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    juxChipText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
    },
    juxHintMuted: {
      marginTop: 10,
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: theme.textMuted,
      lineHeight: 17,
    },
    tourModalRoot: {
      flex: 1,
      backgroundColor: '#0a0a0a',
    },
    tourModalTopBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 2,
      flexDirection: 'row',
      alignItems: 'center',
    },
    tourCloseFab: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.94)',
    },
    tourCloseFabText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: '#111',
    },
    tourModalFooter: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 2,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingTop: 16,
    },
    tourModalTag: {
      fontSize: 10,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.75)',
    },
    tourModalTitle: {
      marginTop: 6,
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: '#fff',
      lineHeight: 28,
    },
    tourModalSub: {
      marginTop: 8,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 19,
      color: 'rgba(255,255,255,0.82)',
    },
    homeDeepRoot: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 200,
      elevation: 40,
      backgroundColor: theme.background,
      flexDirection: 'column',
    },
    homeDeepHeader: {
      marginBottom: 8,
      flexShrink: 0,
    },
    listingsExploreChrome: {
      flexShrink: 0,
      zIndex: 2,
      backgroundColor: theme.background,
    },
    homeDeepMapTitle: {
      marginTop: 6,
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      letterSpacing: -0.3,
    },
    homeDeepBack: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: theme.accentBlue,
    },
    listingsHeaderRow: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    listingsViewToggle: {
      flexDirection: 'row',
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      overflow: 'hidden',
      backgroundColor: theme.mutedSurface,
    },
    listingsViewChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    listingsViewChipOn: {
      backgroundColor: theme.primaryLight,
    },
    listingsViewChipText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
    },
    listingsViewChipTextOn: {
      fontFamily: 'Inter_600SemiBold',
      color: theme.primary,
    },
    listingsMapShell: {
      flex: 1,
      minHeight: 0,
      gap: 8,
    },
    listingsMapBody: {
      flex: 1,
      minHeight: 0,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: theme.border,
      position: 'relative',
    },
    staysHomeMapBand: {
      width: '100%',
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: theme.border,
      position: 'relative',
      marginBottom: 8,
    },
    staysSectionActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    homeDeepScroll: {
      flex: 1,
    },
    homeDeepScrollFlex: {
      flexGrow: 1,
      flexShrink: 1,
    },
    homeDeepScrollContent: {
      paddingBottom: 16,
    },
    homeDeepPageTitle: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      letterSpacing: -0.3,
    },
    homeDeepPageLead: {
      marginTop: 8,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 19,
      color: theme.textSecondary,
    },
    homeDeepFilterSpaced: {
      marginTop: 20,
      marginBottom: 8,
    },
    homeDeepChipRow: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 4,
    },
    homeDeepChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    homeDeepChipOn: {
      borderColor: theme.textPrimary,
      backgroundColor: theme.mutedSurface,
    },
    homeDeepChipText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
    },
    homeDeepChipTextOn: {
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
    },
    homeDeepFilterHint: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      color: theme.textMuted,
      lineHeight: 16,
      marginTop: 4,
      marginBottom: 8,
    },
    textRowActionHit: {
      marginTop: 12,
      paddingVertical: 4,
      alignSelf: 'flex-start',
    },
    textRowAction: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
    },
    textRowActionMuted: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
    },
    homeDeepRelatedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    homeDeepRelatedThumb: {
      width: 48,
      height: 48,
      borderRadius: 0,
      backgroundColor: theme.border,
    },
    homeDeepRadiusTap: {
      alignSelf: 'flex-start',
      paddingVertical: 6,
    },
    homeDeepRadiusTapText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
    },
    homeDeepRadiusTapMuted: {
      opacity: 0.45,
    },
    homeDeepRadiusTapTextMuted: {
      color: theme.textMuted,
    },
    homeDeepSearch: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
    },
    homeDeepNotes: {
      minHeight: 100,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: theme.textPrimary,
    },
    homeDeepCount: {
      marginTop: 14,
      marginBottom: 6,
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
    },
    homeDeepEntryRow: {
      marginTop: 14,
      paddingVertical: 4,
    },
    fuaMapEntryRow: {
      marginTop: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
    },
    homeDeepEntryTitle: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      letterSpacing: -0.2,
    },
    homeDeepEntrySub: {
      marginTop: 4,
      fontSize: 11,
      fontFamily: 'Inter_500Medium',
      color: theme.textMuted,
    },
    homeDeepToggleRow: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    listingCatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
      gap: 12,
    },
    listingCatRowLast: {
      borderBottomWidth: 0,
    },
    listingCatThumb: {
      width: 56,
      height: 56,
      borderRadius: 8,
      backgroundColor: theme.border,
    },
    listingCatBody: {
      flex: 1,
    },
    listingCatTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    listingCatTitle: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
      lineHeight: 20,
    },
    listingRequestBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      alignSelf: 'flex-start',
    },
    listingRequestBadgeText: {
      fontSize: 10,
      fontFamily: 'Inter_600SemiBold',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    listingCatMeta: {
      marginTop: 3,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: theme.textMuted,
    },
    homeDeepPageLeadDistance: {
      fontFamily: 'Inter_600SemiBold',
      color: theme.primary,
    },
    listingReservedBadge: {
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
    },
    listingReservedBadgeText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    listingCatChev: {
      fontSize: 18,
      color: theme.textMuted,
      fontFamily: 'Inter_600SemiBold',
    },
    tabBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingTop: 10,
      paddingHorizontal: 24,
      zIndex: 80,
      elevation: 24,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      minHeight: 44,
    },
    tabIcon: {
      fontSize: 19,
      color: theme.tabIdle,
      marginBottom: 2,
    },
    tabIconActive: {
      color: theme.primary,
    },
    tabLabel: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.tabIdle,
      letterSpacing: 0.2,
    },
    tabLabelActive: {
      color: theme.primary,
    },
    serviceSegmentWrap: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 25,
    },
    serviceSegmentTrack: {
      flexDirection: 'row',
      gap: 6,
      padding: 5,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    serviceSegmentBtn: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 11,
      paddingHorizontal: 6,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    serviceSegmentBtnOn: {
      backgroundColor: theme.sheet,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    serviceSegmentText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    serviceSegmentTextOn: {
      color: theme.textPrimary,
    },
    staysSubSegment: {
      flexDirection: 'row',
      gap: 4,
      marginHorizontal: 4,
      marginBottom: 10,
      padding: 4,
      borderRadius: 16,
      backgroundColor: theme.mutedSurface,
    },
    staysSubSegmentBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
    },
    staysSubSegmentBtnOn: {
      backgroundColor: theme.sheet,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    staysSubSegmentText: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      color: theme.textSecondary,
    },
    staysSubSegmentTextOn: {
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
    },
    kejaSheetRoot: {
      position: 'relative',
      overflow: 'hidden',
      paddingBottom: 4,
    },
    kejaWatermark: {
      position: 'absolute',
      right: -28,
      top: 4,
      transform: [{ rotate: '-12deg' }],
    },
    kejaHeaderBlock: {
      marginBottom: 12,
      paddingRight: 56,
    },
    kejaTitle: {
      fontSize: 24,
      lineHeight: 28,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.4,
    },
    kejaSubtitle: {
      marginTop: 4,
      fontSize: 14,
      lineHeight: 19,
      fontFamily: 'Inter_400Regular',
    },
    kejaLead: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      marginBottom: 10,
      lineHeight: 18,
    },
    kejaBrowseAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      borderWidth: 1.5,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    kejaBrowseAllBody: {
      flex: 1,
      minWidth: 0,
    },
    kejaBrowseAllTitle: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
    },
    kejaBrowseAllSub: {
      marginTop: 2,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    kejaToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    kejaRadiusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingRight: 4,
    },
    staysSectionActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
      flexWrap: 'wrap',
    },
    staysViewToggle: {
      flexDirection: 'row',
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 3,
      gap: 2,
    },
    staysViewModeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 9,
    },
    staysViewModeLabel: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
    },
    staysRadiusChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    staysRadiusChipText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
    },
    staysViewLink: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      color: theme.textMuted,
    },
    staysViewLinkOn: {
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
    },
    staysViewDot: {
      fontSize: 13,
      color: theme.textMuted,
    },
    profileHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 20,
      paddingHorizontal: 4,
    },
    profileAvatar: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileAvatarText: {
      color: '#fff',
      fontFamily: 'Inter_700Bold',
      fontSize: 18,
    },
    profileName: {
      fontFamily: 'Inter_700Bold',
      fontSize: 16,
      color: theme.textPrimary,
    },
    profilePhone: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 2,
    },
    profileSettingIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.mutedSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileSettingIconText: {
      fontSize: 16,
      color: theme.textSecondary,
    },
    mpesaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 12,
      padding: 14,
      borderRadius: 16,
      backgroundColor: theme.mutedSurface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    mpesaIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: BRAND.mpesa,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mpesaIconText: {
      color: '#fff',
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
    },
    mpesaTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: theme.textPrimary,
    },
    mpesaSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
    },
    tabActiveDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.primary,
      marginTop: 4,
    },
    makeTripsTitle: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
      marginBottom: 8,
    },
    activityHero: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
      gap: 12,
    },
    activityHeroText: {
      flex: 1,
      minWidth: 0,
    },
    activityHeroIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    activityTitle: {
      fontSize: 24,
      lineHeight: 28,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.4,
    },
    activitySubtitle: {
      marginTop: 4,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
    activityBadgePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    activityBadgeText: {
      fontSize: 12,
      fontFamily: 'Inter_700Bold',
    },
    activityTabs: {
      flexDirection: 'row',
      borderRadius: 12,
      padding: 4,
      gap: 4,
      marginBottom: 16,
    },
    activityTab: {
      flex: 1,
      minHeight: 36,
      borderRadius: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 8,
    },
    activityTabLabel: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    activityTabUnread: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activityTabUnreadText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
    },
    activityCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      padding: 14,
      marginBottom: 10,
    },
    activityCardWrap: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      marginBottom: 10,
      overflow: 'hidden',
    },
    activityCardRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
    },
    activityNewBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    activityNewBannerText: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.2,
    },
    activityIconWell: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activityPlanBanner: {
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    activityServiceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
      marginBottom: 8,
    },
    activityServiceTitle: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
    },
    activityServiceCount: {
      minWidth: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    activityServiceCountText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    activityCardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    activityMsgBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: 9,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    activityMsgBadgeText: {
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
    },
    activityMsgPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 4,
    },
    activityMsgPreviewText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
    },
    profileHero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      padding: 14,
      marginBottom: 14,
    },
    profileStatsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    profileStatCard: {
      flex: 1,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    profileStatValue: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
    },
    profileStatLabel: {
      marginTop: 4,
      fontSize: 11,
      fontFamily: 'Inter_500Medium',
    },
    profileGroup: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      overflow: 'hidden',
      marginBottom: 8,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    profileRowIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileRowDivider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 62,
    },
    profileSectionLabel: {
      marginTop: 12,
      marginBottom: 8,
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    profileSubBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    profileSubBadgeText: {
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.2,
    },
    makeTripsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    makeTripsAlertRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    makeTripsAlertChip: {
      minWidth: 42,
      height: 30,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    makeTripsAlertIcon: {
      fontSize: 12,
    },
    makeTripsAlertCount: {
      fontSize: 12,
      fontFamily: 'Inter_700Bold',
    },
    makeTripsActiveList: {
      gap: 12,
      marginBottom: 20,
      paddingHorizontal: 0,
    },
    makeTripCard: {
      borderRadius: 16,
      overflow: 'hidden',
      ...(theme.isDark ? DarkElevation.card : {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 2,
      }),
      marginBottom: 12,
    },
    makeTripIntroCard: {
      borderRadius: 10,
      overflow: 'visible',
    },
    makeTripCardHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    makeTripDotWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    makeTripDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    makeTripTitle: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      lineHeight: 18,
    },
    makeTripSub: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      marginTop: 2,
    },
    makeHistoryCard: {
      borderRadius: 16,
      borderWidth: theme.isDark ? 0 : StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: 16,
      ...(theme.isDark ? DarkElevation.card : {}),
    },
    makeHistoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    makeHistoryIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    makeHistoryCheck: {
      color: '#10B981',
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
    makeHistoryAmount: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    makeProfileHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 20,
    },
    makeProfileAvatar: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    makeProfileAvatarText: {
      color: '#FFFFFF',
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
    },
    makeProfileName: {
      fontSize: 16,
      fontFamily: 'Inter_700Bold',
    },
    makeProfilePhone: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      marginTop: 2,
    },
    makeStatsGrid: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
    },
    makeStatCell: {
      flex: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    makeStatLabel: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      marginBottom: 2,
    },
    makeStatValue: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
    },
    makeProfileSection: {
      marginBottom: 16,
    },
    themePreferenceHint: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      marginBottom: 10,
    },
    themePreferenceRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 4,
    },
    themePreferenceChip: {
      flex: 1,
      minHeight: 72,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 16,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    themePreferenceIconWell: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    themePreferenceChipText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    makeProfileCard: {
      borderRadius: 16,
      borderWidth: theme.isDark ? 0 : StyleSheet.hairlineWidth,
      overflow: 'hidden',
      ...(theme.isDark ? DarkElevation.card : {}),
    },
    makeProfileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    makeProfileRowIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    makeProfileRowEmoji: {
      fontSize: 16,
    },
    makeProfileRowLabel: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
    },
    makeProfileRowDetail: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      marginRight: 4,
    },
    makeProfileChevron: {
      fontSize: 18,
      fontFamily: 'Inter_400Regular',
    },
    makeMpesaRow: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: 16,
    },
    makeMpesaRowInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    makeLogoutBtn: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 12,
    },
    makeLogoutText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
    makeVersion: {
      textAlign: 'center',
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      marginBottom: 8,
    },
    makeFlowTitle: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      marginBottom: 4,
    },
    makeFlowSub: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      marginBottom: 16,
      lineHeight: 20,
    },
    comingSoonBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      borderWidth: 1,
      marginBottom: 12,
    },
    comingSoonBadgeText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    comingSoonEta: {
      marginTop: 16,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
    },
    comingSoonSheetRoot: {
      position: 'relative',
      overflow: 'hidden',
      paddingBottom: 4,
    },
    comingSoonWatermark: {
      position: 'absolute',
      right: -28,
      top: 4,
      transform: [{ rotate: '-12deg' }],
    },
    comingSoonHeaderBlock: {
      marginBottom: 12,
      paddingRight: 56,
    },
    comingSoonTitle: {
      fontSize: 24,
      lineHeight: 28,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.4,
    },
    comingSoonSubtitle: {
      marginTop: 4,
      fontSize: 14,
      lineHeight: 19,
      fontFamily: 'Inter_400Regular',
    },
    comingSoonEmojiBanner: {
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1.5,
      marginBottom: 14,
    },
    comingSoonEmojiBannerText: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.2,
    },
    comingSoonMore: {
      marginTop: 14,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
    },
    rideWizardStepMeta: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    rideWizardProgress: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 14,
    },
    rideWizardProgressSeg: {
      flex: 1,
      height: 4,
      borderRadius: 2,
    },
    rideWizardTitle: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      marginBottom: 4,
    },
    rideWizardSubtitle: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
      marginBottom: 16,
    },
    rideWizardReviewRow: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      marginBottom: 4,
    },
    rideWizardReviewLabel: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginBottom: 4,
    },
    rideWizardReviewValue: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
    },
    rideWizardReviewSub: {
      marginTop: 2,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      lineHeight: 17,
    },
    rideWizardFareCard: {
      marginTop: 12,
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
    },
    rideWizardFareLabel: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
    },
    rideWizardFareValue: {
      marginTop: 4,
      fontSize: 24,
      fontFamily: 'Inter_700Bold',
    },
    rideFlowTrack: {
      flexDirection: 'row',
      gap: 4,
      paddingBottom: 14,
      paddingRight: 8,
    },
    rideFlowStep: {
      alignItems: 'center',
      width: 56,
    },
    rideFlowDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: theme.border,
      backgroundColor: theme.mutedSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rideFlowDotDone: {
      borderColor: theme.primary,
      backgroundColor: theme.primaryLight,
    },
    rideFlowDotOn: {
      borderColor: theme.primary,
      backgroundColor: theme.primary,
    },
    rideFlowDotGlyph: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    rideFlowDotGlyphOn: {
      color: BRAND.primaryText,
    },
    rideFlowLabel: {
      marginTop: 6,
      fontSize: 10,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
      textAlign: 'center',
    },
    rideFlowLabelOn: {
      color: theme.primary,
    },
    rideStatusCard: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 14,
    },
    rideStatusEmoji: {
      marginBottom: 4,
    },
    rideStatusTitle: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      minWidth: '70%',
    },
    rideStatusSub: {
      width: '100%',
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      lineHeight: 17,
      paddingLeft: 32,
    },
    rideTierRow: {
      gap: 10,
      paddingBottom: 12,
      paddingRight: 4,
    },
    rideTierCard: {
      width: 148,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1.5,
    },
    rideTierCardFull: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      padding: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      marginBottom: 10,
    },
    rideTierCardBody: {
      flex: 1,
      minWidth: 0,
    },
    rideTierCardOn: {
      borderColor: theme.primary,
      backgroundColor: theme.primaryLight,
    },
    rideTierIcon: {
      marginBottom: 8,
    },
    rideReviewRideRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    rideTierLabel: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      marginBottom: 4,
    },
    rideTierBlurb: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      lineHeight: 15,
      marginBottom: 6,
      minHeight: 30,
    },
    rideTierMeta: {
      fontSize: 10,
      fontFamily: 'Inter_500Medium',
      marginBottom: 6,
    },
    rideTierFare: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
    },
    makeModeChips: {
      flexDirection: 'row',
      gap: 12,
    },
    makeModeChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
    },
    makeModeChipText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      flex: 1,
    },
    makeSearchTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 16,
      marginBottom: 16,
    },
    makeSearchIcon: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
    },
    makeSearchPlaceholder: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    makeRecentsScroll: {
      marginBottom: 8,
      marginHorizontal: -4,
    },
    makeRecentChip: {
      marginRight: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 16,
      borderWidth: 1.5,
      maxWidth: 160,
    },
    makeRecentChipTitle: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    makeRecentChipSub: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      marginTop: 2,
    },
    tabActiveDotPlaceholder: {
      width: 4,
      height: 4,
      marginTop: 4,
      opacity: 0,
    },
  });
