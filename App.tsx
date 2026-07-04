import { StatusBar } from 'expo-status-bar';
import { Fragment, ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  ActivityIndicator,
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
  UIManager,
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
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { useChromeInsets } from './hooks/useChromeInsets';
import { buildUnifiedHomeServicesMapHtml, type HomeUnifiedBanks, type HomeUnifiedPin } from './homeUnifiedMapHtml';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { BRAND } from './theme/brand';
import { Colors } from './theme/colors';
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

type MainTab = 'home' | 'trips' | 'profile';
type StaysSubTab = 'bnb' | 'rental';

const FEATURED_STAYS_HOME = 5;

const MAIN_TAB_CONFIG: { key: MainTab; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'trips', label: 'Trips', icon: '◇' },
  { key: 'profile', label: 'Me', icon: '○' },
];
type ThemeMode = 'light' | 'dark';
type ThemePreference = 'system' | 'light' | 'dark';
type Coordinates = { latitude: number; longitude: number };

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
type RideOption = { id: string; label: string; minutes: number; multiplier: number; icon: string; seats: number; blurb: string };
type ServiceType = 'rides' | 'bnbs' | 'laundry' | 'houses';
type TripPhase = 'idle' | 'selecting' | 'route_preview' | 'confirmed' | 'active_trip';
type CountyKey = 'nairobi' | 'mombasa' | 'kisumu' | 'nyamira';
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
};
type BnbListing = {
  id: string;
  title: string;
  county: CountyKey;
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
  statusBar: 'light' | 'dark';
  mapStyleId: string;
};

const MAPBOX_ACCESS_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

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

const SUPPORTED_COUNTIES: CountyKey[] = ['nairobi', 'mombasa', 'kisumu', 'nyamira'];

const COUNTY_ALIASES: Record<CountyKey, string[]> = {
  nairobi: ['nairobi'],
  mombasa: ['mombasa'],
  kisumu: ['kisumu'],
  nyamira: ['nyamira', 'nyamira county', 'keroka', 'manga'],
};

const detectCountyFromText = (raw: string): CountyKey | null => {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  for (const county of SUPPORTED_COUNTIES) {
    if (COUNTY_ALIASES[county].some((alias) => normalized.includes(alias))) {
      return county;
    }
  }
  return null;
};

const detectCountyFromCoords = (coords: Coordinates): CountyKey | null => {
  const countyCenters: { county: CountyKey; coords: Coordinates; maxKm: number }[] = [
    { county: 'nairobi', coords: { latitude: -1.2864, longitude: 36.8172 }, maxKm: 60 },
    { county: 'mombasa', coords: { latitude: -4.0435, longitude: 39.6682 }, maxKm: 70 },
    { county: 'kisumu', coords: { latitude: -0.0917, longitude: 34.768 }, maxKm: 75 },
    { county: 'nyamira', coords: { latitude: -0.5669, longitude: 34.9341 }, maxKm: 60 },
  ];
  const nearest = countyCenters
    .map((c) => ({ county: c.county, distance: getDistanceKm(coords, c.coords), maxKm: c.maxKm }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest || nearest.distance > nearest.maxKm) return null;
  return nearest.county;
};

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
                '<div class="nav-live-main">' + progressLine + '</div>' +
                '<div class="nav-live-caption">Gold line is your path. Your dot updates as you move — the map stays centered on you.</div>' +
                '<div id="liveBadge" class="nav-live-badge">Starting location…</div>' +
                '<div class="nav-sdk-note">Voice and lane guidance ship with Mapbox Navigation SDK in production. Turn list below is preview only.</div>' +
                '</div>' +
                (stepsHtml ? '<div class="nav-upcoming-label">Along the route</div>' + stepsHtml : '');
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
  border: Colors.light.border,
  textPrimary: Colors.light.text,
  textSecondary: Colors.light.textSecondary,
  textMuted: Colors.light.textMuted,
  accent: Colors.light.text,
  accentText: Colors.light.ctaText,
  primary: Colors.light.primary,
  primaryLight: Colors.light.primaryLight,
  accentBlue: Colors.light.primary,
  mutedSurface: Colors.light.surface,
  tabIdle: Colors.light.tabIdle,
  statusBar: Colors.light.statusBar,
  mapStyleId: Colors.light.mapStyleId,
};

const DARK_THEME: Theme = {
  background: Colors.dark.canvas,
  canvas: Colors.dark.canvas,
  surface: Colors.dark.surface,
  sheet: Colors.dark.sheet,
  border: Colors.dark.border,
  textPrimary: Colors.dark.text,
  textSecondary: Colors.dark.textSecondary,
  textMuted: Colors.dark.textMuted,
  accent: Colors.dark.text,
  accentText: Colors.dark.ctaText,
  primary: Colors.dark.primary,
  primaryLight: Colors.dark.primaryLight,
  accentBlue: Colors.dark.primary,
  mutedSurface: Colors.dark.surface,
  tabIdle: Colors.dark.tabIdle,
  statusBar: Colors.dark.statusBar,
  mapStyleId: Colors.dark.mapStyleId,
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
  { id: 'economy', label: 'Jua Ride', minutes: 3, multiplier: 1, icon: '🚗', seats: 4, blurb: 'Everyday trips · best value' },
  { id: 'comfort', label: 'Jua Comfort', minutes: 5, multiplier: 1.35, icon: '🚙', seats: 4, blurb: 'Extra legroom · quiet AC' },
  { id: 'premium', label: 'Jua XL', minutes: 7, multiplier: 1.85, icon: '🚐', seats: 6, blurb: 'Groups · luggage · airport runs' },
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
  { key: 'pickup', title: 'Pickup point', subtitle: 'Door pickup or drop at a verified station', icon: '📍' },
  { key: 'load', title: 'Your load', subtitle: 'How much laundry are we collecting?', icon: '👕' },
  { key: 'review', title: 'Review & confirm', subtitle: 'Check details before we dispatch mama fua', icon: '✓' },
] as const;

const FUA_WIZARD_BOOKING_ORDER = FUA_WIZARD_BOOKING.map((s) => s.key);

type FuaWizardStep = (typeof FUA_WIZARD_BOOKING)[number]['key'];

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

const PICKUP_STATIONS: PlaceStation[] = [
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

type ComingSoonServiceId = 'cloth_shop' | 'groceries' | 'tours' | 'spots' | 'events';

type ServiceSegmentId = ServiceType | ComingSoonServiceId;

const COMING_SOON_SEGMENT_IDS: ComingSoonServiceId[] = [
  'cloth_shop',
  'groceries',
  'tours',
  'spots',
  'events',
];

const isComingSoonService = (seg: ServiceSegmentId): seg is ComingSoonServiceId =>
  (COMING_SOON_SEGMENT_IDS as readonly string[]).includes(seg);

const SERVICE_SEGMENTS: ServiceSegmentItem<ServiceSegmentId>[] = [
  { key: 'laundry', label: 'FUA' },
  { key: 'bnbs', label: 'SAKA KEJA' },
  { key: 'rides', label: 'RIDES' },
  { key: 'tours', label: 'TOURS', comingSoon: true, soonEmoji: '🗺️' },
  { key: 'spots', label: 'SPOTS', comingSoon: true, soonEmoji: '✨' },
  { key: 'events', label: 'EVENTS', comingSoon: true, soonEmoji: '🎉' },
  { key: 'cloth_shop', label: 'CLOTH', comingSoon: true, soonEmoji: '👗' },
  { key: 'groceries', label: 'GROCERY', comingSoon: true, soonEmoji: '🛒' },
];

const COMING_SOON_SERVICE_INFO: Record<
  ComingSoonServiceId,
  { emoji: string; title: string; lead: string; features: string[]; hero: keyof typeof IMG }
> = {
  cloth_shop: {
    emoji: '👗',
    title: 'Jua Cloth',
    lead: 'Fashion and essentials from local vendors — mitumba finds, market stalls, and trusted tailors in one tap.',
    features: [
      'Browse curated sellers near your pin',
      'Mitumba, new arrivals, and custom tailor orders',
      'Pay with M-Pesa · pickup or doorstep delivery',
    ],
    hero: 'clothHero',
  },
  groceries: {
    emoji: '🛒',
    title: 'Jua Grocery',
    lead: 'Market runs without the queue — dukas, greens, and household staples brought to your door.',
    features: [
      'Fresh produce and pantry items from nearby shops',
      'Build a list or reorder your usual basket',
      'Bundle with a Fua pickup or ride home',
    ],
    hero: 'groceryHero',
  },
  tours: {
    emoji: '🗺️',
    title: 'Jua Tours',
    lead: 'Request guided city tours — culture, food, nightlife, and hidden gems with a local host.',
    features: [
      'Half-day & full-day itineraries around your city',
      'Fixed routes or custom requests (markets, museums, coast)',
      'Pay per person · M-Pesa · group-friendly',
    ],
    hero: 'toursHero',
  },
  spots: {
    emoji: '✨',
    title: 'Jua Spots',
    lead: 'The best places in town — hotels, rooftops, cafés, and photo-worthy corners picked for you.',
    features: [
      'Editor picks by neighbourhood and mood',
      'Hotels, brunch, date night, and family-friendly',
      'Save favourites · share · book a ride there',
    ],
    hero: 'spotsHero',
  },
  events: {
    emoji: '🎉',
    title: 'Jua Events',
    lead: 'What’s on this week — concerts, markets, meetups, and county showcases in one feed.',
    features: [
      'Upcoming events near your pin',
      'Free & ticketed · reminders before sell-out',
      'Get there with Jua Rides in one tap',
    ],
    hero: 'eventsHero',
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

const comingSoonHeroSlides = (seg: ComingSoonServiceId): IntroHeroSlide[] => {
  const info = COMING_SOON_SERVICE_INFO[seg];
  return [
    {
      id: `${seg}-overview`,
      eyebrow: info.emoji,
      title: info.title,
      description: info.lead,
      image: IMG[info.hero],
      workAreas: info.features.slice(0, 3),
      comingSoon: true,
    },
    {
      id: `${seg}-soon`,
      eyebrow: 'ON THE WAY',
      title: 'Launching on Jua X',
      description: 'We are piloting Fua, Saka Keja, and Rides first — this service joins the same app and wallet.',
      image: IMG.nairobiCity,
      workAreas: ['Same account', 'M-Pesa ready', 'Notify at launch'],
      comingSoon: true,
    },
  ];
};

const STAYS_RADIUS_OPTIONS = [2, 5, 10] as const;
const HOUSE_RADIUS_OPTIONS = [2, 5, 10, 15, 25] as const;

const HOUSE_LISTINGS: HouseListing[] = [
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

const BNB_LISTINGS: BnbListing[] = [
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
  const [isAuthed, setIsAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [activeService, setActiveService] = useState<ServiceType>('laundry');
  const [activeSegment, setActiveSegment] = useState<ServiceSegmentId>('laundry');
  const [staysSubTab, setStaysSubTab] = useState<StaysSubTab>('bnb');
  const [staysRadiusKm, setStaysRadiusKm] = useState<(typeof STAYS_RADIUS_OPTIONS)[number]>(5);
  const [rentalSubscribed, setRentalSubscribed] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const systemColorScheme = useColorScheme();
  const themeMode: ThemeMode =
    themePreference === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : themePreference;
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(null);
  const [currentLocationLabel, setCurrentLocationLabel] = useState('Locating you...');
  const [currentPickupLocation, setCurrentPickupLocation] = useState('Locating you...');
  const [currentCounty, setCurrentCounty] = useState<CountyKey>('nairobi');
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
  const [listingsMapSelectedId, setListingsMapSelectedId] = useState<string | null>(null);
  const [staysSheetViewMode, setStaysSheetViewMode] = useState<'list' | 'map'>('list');
  const [listingCounty, setListingCounty] = useState<ListingCatalogArea>('any');
  const [listingSpace, setListingSpace] = useState<StaySpaceFilter>('any');
  const [listingQuery, setListingQuery] = useState('');
  const [listingRadiusKm, setListingRadiusKm] = useState<(typeof STAYS_RADIUS_OPTIONS)[number]>(5);
  const [valetMamaFuaHome, setValetMamaFuaHome] = useState(false);
  const [valetStudioNotes, setValetStudioNotes] = useState('');
  const [valetStudioWhen, setValetStudioWhen] = useState<'asap' | 'morning' | 'evening'>('asap');
  const [ridePlannerStop, setRidePlannerStop] = useState('');
  const [ridePlannerLuggage, setRidePlannerLuggage] = useState(false);
  const [ridePlannerMeetAssist, setRidePlannerMeetAssist] = useState(false);
  const [ridePickupMode, setRidePickupMode] = useState<'current' | 'station'>('current');
  const [ridePickupStationId, setRidePickupStationId] = useState<string | null>(null);
  /** Which rides pin type was last tapped on the service map (pickup step). */
  const [serviceMapRidePinFocus, setServiceMapRidePinFocus] = useState<'hub' | 'destination' | null>(null);
  const [rideWizardStep, setRideWizardStep] = useState<RideWizardStep>('pickup');
  const [laundryWizardStep, setLaundryWizardStep] = useState<FuaWizardStep>('pickup');
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const theme = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;
  const { insets, bottomInset } = useChromeInsets({
    backgroundColor: theme.canvas,
    isDark: themeMode === 'dark',
  });

  const pickupDisplayLabel = useMemo(() => {
    if (!draftPickupCoords) return currentLocationLabel;
    const county = detectCountyFromCoords(draftPickupCoords) ?? currentCounty;
    return summarizeLocationFromCoords(draftPickupCoords, county);
  }, [draftPickupCoords, currentLocationLabel, currentCounty]);

  const ridePickupDisplayLabel = useMemo(() => {
    if (ridePickupMode === 'station' && ridePickupStationId) {
      const hub = PICKUP_STATIONS.find((s) => s.id === ridePickupStationId);
      if (hub) return `${hub.name} · ${hub.subtitle}`;
    }
    return pickupDisplayLabel;
  }, [ridePickupMode, ridePickupStationId, pickupDisplayLabel]);

  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    RNStatusBar.setBackgroundColor(theme.background, true);
    RNStatusBar.setBarStyle(themeMode === 'dark' ? 'light-content' : 'dark-content');
  }, [theme.background, themeMode]);
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
    const chromeBelowMap = (showServiceSegment ? 52 : 0) + tabBarTotalHeight;
    return Math.max(200, windowHeight - mapBandHeight - chromeBelowMap);
  }, [mapBandHeight, showServiceSegment, tabBarTotalHeight, windowHeight]);
  const serviceSegmentHeight = showServiceSegment ? 52 : 0;
  const bottomChromeHeight = sheetHeight + tabBarTotalHeight + serviceSegmentHeight;
  const showMainTabBar = isAuthed && guidedJourney === null && homeDeepPage === null;

  /** Mapbox padding so framing centers in the visible map band (below header/search, above sheet or dock+nav). */
  const homeMapCameraPad = useMemo((): MapViewportPad => {
    const topChrome = insets.top + 56;
    const top = Math.round(Math.min(windowHeight * 0.22, Math.max(88, topChrome)));
    const bottom = Math.round(Math.min(windowHeight * 0.72, Math.max(120, bottomChromeHeight + 12)));
    const side = Math.round(Math.max(10, Math.min(28, gutter + 4)));
    return { top, bottom, left: side, right: side };
  }, [insets.top, gutter, bottomChromeHeight, windowHeight]);

  const setHomeSheetStageAnimated = useCallback((next: HomeSheetStage) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(320, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
    setHomeSheetStage(next);
  }, []);

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

  const setExploreSheetStageAnimated = useCallback((next: HomeSheetStage) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(320, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
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
          end: { longitude: lng, latitude: lat },
          title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Destination',
          subtitle: typeof data.subtitle === 'string' ? data.subtitle : '',
          kind,
        });
        return;
      }
      if (data.type === 'ridePickupHub' && data.id) {
        if (!PICKUP_STATIONS.some((s) => s.id === data.id)) return;
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
        if (!PICKUP_STATIONS.some((s) => s.id === data.id)) return;
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
        if (!PICKUP_STATIONS.some((s) => s.id === data.id)) return;
        setLaundryStationId(data.id);
        setLaundryWizardStep('pickup');
        setPhaseForService('laundry', 'selecting');
        setHomeDeepPage(null);
        setHomeSheetStageAnimated('mid');
        setBookingMessage('Pickup station saved — continue in the Fua wizard.');
        return;
      }
      if (data.type === 'laundryStationMapSelect' && data.id) {
        if (!PICKUP_STATIONS.some((s) => s.id === data.id)) return;
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
  const selectedRide = RIDE_OPTIONS.find((ride) => ride.id === selectedRideId) || RIDE_OPTIONS[0];
  const nearbyStations = useMemo(() => {
    if (!currentCoords) {
      return PICKUP_STATIONS.filter((station) => station.county === currentCounty);
    }
    return PICKUP_STATIONS.filter(
      (station) => getDistanceKm(currentCoords, station.coords) <= PICKUP_RADIUS_KM,
    );
  }, [currentCoords, currentCounty]);
  const nearbyHouses = useMemo(() => {
    return HOUSE_LISTINGS.filter((house) => {
      if (house.county !== currentCounty) return false;
      if (currentCoords) {
        return getDistanceKm(currentCoords, house.coords) <= staysRadiusKm;
      }
      return house.distanceKm <= staysRadiusKm;
    });
  }, [currentCounty, currentCoords, staysRadiusKm]);
  const nearbyBnbs = BNB_LISTINGS.filter((bnb) => bnb.county === currentCounty);
  const featuredBnbs = useMemo(() => nearbyBnbs.slice(0, FEATURED_STAYS_HOME), [nearbyBnbs]);
  const featuredHouses = useMemo(() => nearbyHouses.slice(0, FEATURED_STAYS_HOME), [nearbyHouses]);
  const catalogBnbs = useMemo(() => {
    let rows = [...BNB_LISTINGS];
    if (listingCounty === 'near_me') {
      if (!currentCoords) return [];
      rows = rows.filter((b) => getDistanceKm(currentCoords, b.coords) <= listingRadiusKm);
    } else if (listingCounty !== 'any') {
      rows = rows.filter((b) => b.county === listingCounty);
    }
    if (listingQuery.trim()) {
      const q = listingQuery.trim().toLowerCase();
      rows = rows.filter(
        (b) => b.title.toLowerCase().includes(q) || b.exploreReason.toLowerCase().includes(q),
      );
    }
    if (listingSpace === 'room') rows = rows.filter((b) => /\broom|studio|private|shared\b/i.test(b.title));
    if (listingSpace === 'entire') rows = rows.filter((b) => !/\broom|shared\b/i.test(b.title));
    return rows;
  }, [listingCounty, listingQuery, listingSpace, currentCoords, listingRadiusKm]);
  const catalogHouses = useMemo(() => {
    let rows = [...HOUSE_LISTINGS];
    if (listingCounty === 'near_me') {
      if (!currentCoords) return [];
      rows = rows.filter((h) => getDistanceKm(currentCoords, h.coords) <= listingRadiusKm);
    } else if (listingCounty !== 'any') {
      rows = rows.filter((h) => h.county === listingCounty);
    }
    if (listingQuery.trim()) {
      const q = listingQuery.trim().toLowerCase();
      rows = rows.filter((h) => h.title.toLowerCase().includes(q));
    }
    return rows;
  }, [listingCounty, listingQuery, listingRadiusKm, currentCoords]);
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
    if (listingDetail.kind === 'bnb') {
      return BNB_LISTINGS.find((b) => b.id === listingDetail.id) ?? null;
    }
    return HOUSE_LISTINGS.find((h) => h.id === listingDetail.id) ?? null;
  }, [listingDetail]);
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
      ? BNB_LISTINGS.find((b) => b.id === tourSheetTarget.id) ?? null
      : tourSheetTarget?.kind === 'house'
        ? HOUSE_LISTINGS.find((h) => h.id === tourSheetTarget.id) ?? null
        : null;
  const countyDestinations = DESTINATIONS.filter((destination) => destination.county === currentCounty);
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
    if (exploreScope === 'everywhere') return BNB_LISTINGS;
    if (currentCoords) {
      return BNB_LISTINGS.filter((b) => getDistanceKm(currentCoords, b.coords) <= listingRadiusKm);
    }
    return nearbyBnbs;
  }, [exploreScope, currentCoords, listingRadiusKm, nearbyBnbs]);
  const exploreVenues = useMemo(() => {
    if (exploreScope === 'everywhere') return EXPLORE_VENUES;
    if (currentCoords) {
      return EXPLORE_VENUES.filter((v) => getDistanceKm(currentCoords, v.coords) <= listingRadiusKm);
    }
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
    const s = PICKUP_STATIONS.find((x) => x.id === laundryStationId);
    return s ? s.coords : null;
  }, [laundryStationId]);
  const rideMapHighlight = useMemo(() => {
    if (ridePickupMode !== 'station' || !ridePickupStationId) return null;
    const s = PICKUP_STATIONS.find((x) => x.id === ridePickupStationId);
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
    const bnbPins: HomeUnifiedPin[] = nearbyBnbs.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: `${b.county} · ${b.rating} · ${b.price}`,
      coords: b.coords,
      kind: 'bnb',
    }));
    const housePins: HomeUnifiedPin[] = nearbyHouses.map((h) => ({
      id: h.id,
      title: h.title,
      subtitle: `${h.distanceKm} km · ${h.price}`,
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
  }, [nearbyStations, nearbyBnbs, nearbyHouses, currentCoords, popularNearbyDestinations]);

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
    homeMapCameraPad,
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
    const rows = isRental ? nearbyHouses : nearbyBnbs;
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
    const rows = listingCatalog === 'bnb' ? catalogBnbs : catalogHouses;
    const pins: HomeUnifiedPin[] = rows.map((row) =>
      listingCatalog === 'bnb'
        ? {
            id: (row as BnbListing).id,
            title: (row as BnbListing).title,
            subtitle: `${(row as BnbListing).county} · ${(row as BnbListing).rating} ★ · ${(row as BnbListing).price}`,
            coords: (row as BnbListing).coords,
            kind: 'bnb' as const,
          }
        : {
            id: (row as HouseListing).id,
            title: (row as HouseListing).title,
            subtitle: `${(row as HouseListing).distanceKm} km · ${(row as HouseListing).price}`,
            coords: (row as HouseListing).coords,
            kind: 'house' as const,
          },
    );
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

  const injectListingsMapSync = useCallback(() => {
    const wv = listingsMapWebViewRef.current;
    if (!wv || !MAPBOX_ACCESS_TOKEN || !listingsMapHtml) return;
    const mode = listingCatalog === 'bnb' ? 'bnbs' : 'houses';
    const hl = listingsMapHighlight;
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
      )});${hlJs}${userJs}}catch(e){}},80);true;`,
    );
  }, [
    MAPBOX_ACCESS_TOKEN,
    listingsMapHtml,
    listingCatalog,
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
      )});${hlJs}${userJs}}catch(e){}},80);true;`,
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
      )});${hlJs}${userJs}${pickupJs}}catch(e){}},80);true;`,
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
      )});${ridesFocusJs}${hlJs}${userJs}${pickupJs}}catch(e){}},80);true;`,
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
    nearbyBnbs,
    nearbyHouses,
    staysRadiusKm,
    selectedBnbId,
    selectedHouseId,
    currentCoords,
  ]);

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
  }, [listingCatalog, listingCounty, listingQuery, listingSpace, listingRadiusKm]);

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
    catalogBnbs,
    catalogHouses,
    listingsMapSelectedId,
    currentCoords,
  ]);

  useEffect(() => {
    if (isActiveTripMode) {
      setHomeSheetStageAnimated('collapsed');
    }
  }, [isActiveTripMode, setHomeSheetStageAnimated]);

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
    if (!MAPBOX_ACCESS_TOKEN || !currentCoords || !guidedJourney) return null;
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
      currentCoords,
      guidedJourney.end,
      guidedJourney.title,
      guidedJourney.subtitle,
      ui,
    );
  }, [MAPBOX_ACCESS_TOKEN, theme.mapStyleId, theme.canvas, theme.sheet, theme.textPrimary, theme.textMuted, themeMode, currentCoords, guidedJourney]);

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
    const displayName = summarizeLocationFromCoords(coords, countyFromCoords || currentCounty);
    const preciseCoords = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
    setCurrentLocationLabel(displayName);
    setCurrentPickupLocation(preciseCoords);
    setLocationError('');
  }, [currentCounty]);

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
        const detectedFromText = textCandidates.map(detectCountyFromText).find(Boolean) || null;
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
        ? BNB_LISTINGS.some((b) => b.id === listingDetail.id)
        : HOUSE_LISTINGS.some((h) => h.id === listingDetail.id);
    if (!ok) {
      setListingDetail(null);
      setHomeDeepPage('listings');
    }
  }, [homeDeepPage, listingDetail]);

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
        setIsAuthed(true);
        setActiveTab('home');
        setHomeSheetStage('mid');
      }}
    />
  );

  const renderHome = () => {
    const serviceMapTitle =
      activeService === 'laundry'
        ? 'Pickup stations near you'
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
          ? (BNB_LISTINGS.find((b) => b.id === homeListingPreview.id) ?? null)
          : (HOUSE_LISTINGS.find((h) => h.id === homeListingPreview.id) ?? null);

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
      if (isComingSoonSegment) {
        const info = COMING_SOON_SERVICE_INFO[activeSegment];
        return (
          <>
            {renderSectionHero(comingSoonHeroSlides(activeSegment), `How ${info.title} will work`)}
            <View style={[styles.comingSoonEmojiBanner, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
              <Text style={[styles.comingSoonEmojiBannerText, { color: theme.primary }]}>
                {info.emoji} Coming soon
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
          </>
        );
      }
      if (activeTab === 'trips') {
        const tripsActive = [
          ...MAKE_TRIPS.active,
          ...tripFeed.map((trip, index) => ({
            type: 'ride' as const,
            id: `live-${index}`,
            title: trip,
            sub: 'Active',
            step: 1,
            steps: ['Requested', 'En route', 'Arrived', 'Complete'],
          })),
        ];
        return (
          <>
            <Text style={styles.makeTripsTitle}>My Trips</Text>
            <MakeLabel darkMode={themeMode === 'dark'}>Active</MakeLabel>
            <View style={styles.makeTripsActiveList}>
              {tripsActive.map((trip) => (
                <View key={trip.id} style={[styles.makeTripCard, { backgroundColor: theme.sheet }]}>
                  <View style={styles.makeTripCardHead}>
                    <View
                      style={[
                        styles.makeTripDotWrap,
                        { backgroundColor: `${SERVICE_DOT_COLORS[trip.type]}33` },
                      ]}
                    >
                      <View
                        style={[styles.makeTripDot, { backgroundColor: SERVICE_DOT_COLORS[trip.type] }]}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.makeTripTitle, { color: theme.textPrimary }]}>{trip.title}</Text>
                      <Text style={[styles.makeTripSub, { color: theme.textSecondary }]}>🕐 {trip.sub}</Text>
                    </View>
                  </View>
                  {trip.steps.length > 0 ? (
                    <>
                      <MakeDivider darkMode={themeMode === 'dark'} />
                      <MakeStatusStepper
                        steps={trip.steps}
                        current={trip.step}
                        darkMode={themeMode === 'dark'}
                      />
                    </>
                  ) : null}
                </View>
              ))}
            </View>
            <MakeLabel darkMode={themeMode === 'dark'}>History</MakeLabel>
            <View style={[styles.makeHistoryCard, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
              {MAKE_TRIPS.history.map((h, i) => (
                <View
                  key={h.id}
                  style={[
                    styles.makeHistoryRow,
                    i < MAKE_TRIPS.history.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                  ]}
                >
                  <View style={[styles.makeHistoryIcon, { backgroundColor: theme.mutedSurface }]}>
                    <Text style={styles.makeHistoryCheck}>✓</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.makeTripTitle, { color: theme.textPrimary }]}>{h.title}</Text>
                    <Text style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                      {h.date} · Completed
                    </Text>
                  </View>
                  <Text style={[styles.makeHistoryAmount, { color: theme.textSecondary }]}>{h.amount}</Text>
                </View>
              ))}
            </View>
          </>
        );
      }
      if (activeTab === 'profile') {
        const profileSections = [
          {
            title: 'Account',
            items: [
              { icon: '📍', label: 'Saved addresses', detail: '2 saved', toggle: false },
              { icon: '💳', label: 'Payment methods', detail: 'M-Pesa, Cash', toggle: false },
            ],
          },
          {
            title: 'Preferences',
            items: [
              { icon: '🔔', label: 'Notifications', detail: null as string | null, toggle: true, value: true },
            ],
          },
          {
            title: 'Support',
            items: [{ icon: '❓', label: 'Help & support', detail: null as string | null, toggle: false }],
          },
        ];
        return (
          <>
            <View style={styles.makeProfileHead}>
              <View style={[styles.makeProfileAvatar, { backgroundColor: theme.primary }]}>
                <Text style={styles.makeProfileAvatarText}>AM</Text>
              </View>
              <View>
                <Text style={[styles.makeProfileName, { color: theme.textPrimary }]}>Alex Mwangi</Text>
                <Text style={[styles.makeProfilePhone, { color: theme.textSecondary }]}>+254 712 *** 456</Text>
              </View>
            </View>
            <View style={styles.makeStatsGrid}>
              {[
                { label: 'Member since', value: 'Jan 2025' },
                { label: 'Total trips', value: '18' },
                { label: 'Laundry kg', value: '62 kg' },
              ].map((s) => (
                <View key={s.label} style={[styles.makeStatCell, { backgroundColor: theme.mutedSurface }]}>
                  <Text style={[styles.makeStatLabel, { color: theme.textSecondary }]}>{s.label}</Text>
                  <Text style={[styles.makeStatValue, { color: theme.textPrimary }]}>{s.value}</Text>
                </View>
              ))}
            </View>
            {profileSections.map((sec) => (
              <View key={sec.title} style={styles.makeProfileSection}>
                <MakeLabel darkMode={themeMode === 'dark'}>{sec.title}</MakeLabel>
                <View style={[styles.makeProfileCard, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
                  {sec.items.map((item, i) => (
                    <Pressable
                      key={item.label}
                      style={[
                        styles.makeProfileRow,
                        i < sec.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                      ]}
                    >
                      <View style={[styles.makeProfileRowIcon, { backgroundColor: theme.mutedSurface }]}>
                        <Text style={styles.makeProfileRowEmoji}>{item.icon}</Text>
                      </View>
                      <Text style={[styles.makeProfileRowLabel, { color: theme.textPrimary }]}>{item.label}</Text>
                      {item.detail ? (
                        <Text style={[styles.makeProfileRowDetail, { color: theme.textSecondary }]}>{item.detail}</Text>
                      ) : null}
                      {item.toggle ? (
                        <Switch
                          value={'value' in item ? item.value : false}
                          onValueChange={undefined}
                          trackColor={{ false: theme.border, true: theme.primary }}
                          thumbColor="#FFFFFF"
                        />
                      ) : (
                        <Text style={[styles.makeProfileChevron, { color: theme.textSecondary }]}>›</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            <View style={styles.makeProfileSection}>
              <MakeLabel darkMode={themeMode === 'dark'}>Appearance</MakeLabel>
              <Text style={[styles.themePreferenceHint, { color: theme.textSecondary }]}>
                Currently {themePreferenceLabel.toLowerCase()}
              </Text>
              <View style={styles.themePreferenceRow}>
                {(
                  [
                    { key: 'system' as const, label: 'System' },
                    { key: 'light' as const, label: 'Light' },
                    { key: 'dark' as const, label: 'Dark' },
                  ] as const
                ).map((opt) => {
                  const on = themePreference === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      style={[
                        styles.themePreferenceChip,
                        { borderColor: theme.border, backgroundColor: theme.sheet },
                        on && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
                      ]}
                      onPress={() => setThemePreference(opt.key)}
                    >
                      <Text
                        style={[
                          styles.themePreferenceChipText,
                          { color: theme.textSecondary },
                          on && { color: theme.primary },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={[styles.makeMpesaRow, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
              <View style={styles.makeMpesaRowInner}>
                <View style={styles.mpesaIcon}>
                  <Text style={styles.mpesaIconText}>M</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mpesaTitle, { color: theme.textPrimary }]}>M-Pesa</Text>
                  <Text style={[styles.mpesaSub, { color: theme.textSecondary }]}>07XX *** 456 · Default</Text>
                </View>
                <Text style={[styles.makeProfileChevron, { color: theme.textSecondary }]}>›</Text>
              </View>
            </View>
            <Pressable style={[styles.makeLogoutBtn, { borderColor: theme.border }]}>
              <Text style={[styles.makeLogoutText, { color: theme.textSecondary }]}>↪ Log out</Text>
            </Pressable>
            <Text style={[styles.makeVersion, { color: theme.textSecondary }]}>Jua X · v1.0.0-mvp</Text>
          </>
        );
      }

      switch (activeService) {
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
              ? PICKUP_STATIONS.find((s) => s.id === ridePickupStationId)?.name ?? 'Pickup hub'
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
              {isRideBookingWizardStep(rideWizardStep)
                ? renderSectionHero(RIDES_HERO_SLIDES, 'How Jua Rides works')
                : null}
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
                        <Text style={styles.rideTierIcon}>{ride.icon}</Text>
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
                    <Text style={[styles.rideWizardReviewValue, { color: theme.textPrimary }]}>
                      {selectedRide.icon} {selectedRide.label}
                    </Text>
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
                  <Text style={styles.rideStatusEmoji}>🚗</Text>
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
                  <Text style={styles.rideStatusEmoji}>💳</Text>
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
            laundryMeasureMode === 'kg' ? laundryQuantity * LAUNDRY_KES_PER_KG : laundryItemCount * LAUNDRY_KES_PER_ITEM;
          const loadSummary =
            laundryMeasureMode === 'kg' ? `${laundryQuantity} kg` : `${laundryItemCount} items`;
          const stationMode = laundryStationId !== null;
          const visibleStations = nearbyStations.slice(0, 4);
          const pickupLabel = stationMode && laundryStationId
            ? PICKUP_STATIONS.find((s) => s.id === laundryStationId)?.name ?? 'Station'
            : 'Your door';
          const pickupDetail = stationMode && laundryStationId
            ? PICKUP_STATIONS.find((s) => s.id === laundryStationId)?.subtitle ?? pickupDisplayLabel
            : pickupDisplayLabel;
          const bookingIndex = FUA_WIZARD_BOOKING_ORDER.indexOf(laundryWizardStep);
          const bookingMeta = FUA_WIZARD_BOOKING[bookingIndex];
          return (
            <>
              {FUA_WIZARD_BOOKING_ORDER.includes(laundryWizardStep)
                ? renderSectionHero(FUA_HERO_SLIDES, 'How Jua Fua works')
                : null}
              {bookingMeta ? (
                <>
                  <Text style={[styles.rideWizardStepMeta, { color: theme.textMuted }]}>
                    Step {bookingIndex + 1} of {FUA_WIZARD_BOOKING.length}
                  </Text>
                  <View style={styles.rideWizardProgress}>
                    {FUA_WIZARD_BOOKING.map((step, i) => (
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
              ) : null}
              {laundryWizardStep === 'pickup' ? (
                <>
                  <View style={styles.valetSegmentTrack}>
                    <Pressable
                      style={[styles.valetSegment, !stationMode && styles.valetSegmentActive]}
                      onPress={() => setLaundryStationId(null)}
                    >
                      <Text style={[styles.valetSegmentText, !stationMode && styles.valetSegmentTextActive]}>Door</Text>
                    </Pressable>
                    <View style={styles.valetSegmentDivider} />
                    <Pressable
                      style={[styles.valetSegment, stationMode && styles.valetSegmentActive]}
                      disabled={nearbyStations.length === 0}
                      onPress={() => {
                        if (nearbyStations.length === 0) return;
                        setLaundryStationId(
                          laundryStationId && nearbyStations.some((s) => s.id === laundryStationId)
                            ? laundryStationId
                            : nearbyStations[0].id,
                        );
                      }}
                    >
                      <Text
                        style={[
                          styles.valetSegmentText,
                          stationMode && styles.valetSegmentTextActive,
                          nearbyStations.length === 0 && styles.valetSegmentTextDisabled,
                        ]}
                      >
                        Station
                      </Text>
                    </Pressable>
                  </View>
                  {!stationMode ? (
                    <Text style={[styles.valetAddressCompact, { color: theme.textPrimary }]} numberOfLines={2}>
                      {pickupDisplayLabel}
                    </Text>
                  ) : visibleStations.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fuaStationScroll}>
                      {visibleStations.map((st) => {
                        const on = laundryStationId === st.id;
                        return (
                          <Pressable
                            key={st.id}
                            onPress={() => setLaundryStationId(st.id)}
                            style={[
                              styles.fuaStationChip,
                              { borderColor: theme.border },
                              on && styles.fuaStationChipOn,
                            ]}
                          >
                            <Text style={[styles.fuaStationChipText, on && styles.fuaStationChipTextOn]} numberOfLines={1}>
                              {st.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <Text style={styles.juxHintMuted}>No stations in range.</Text>
                  )}
                  <Pressable
                    style={styles.homeDeepEntryRow}
                    onPress={() => {
                      setHomeSheetStageAnimated('collapsed');
                      setHomeDeepPage('service-map');
                    }}
                  >
                    <Text style={styles.homeDeepEntryTitle}>Pickup stations on map ›</Text>
                    <Text style={styles.homeDeepEntrySub}>Tap a station pin — your choice saves to this step</Text>
                  </Pressable>
                </>
              ) : null}
              {laundryWizardStep === 'load' ? (
                <>
                  <View style={styles.valetSegmentTrack}>
                    <Pressable
                      style={[styles.valetSegment, laundryMeasureMode === 'kg' && styles.valetSegmentActive]}
                      onPress={() => setLaundryMeasureMode('kg')}
                    >
                      <Text style={[styles.valetSegmentText, laundryMeasureMode === 'kg' && styles.valetSegmentTextActive]}>
                        By kg
                      </Text>
                    </Pressable>
                    <View style={styles.valetSegmentDivider} />
                    <Pressable
                      style={[styles.valetSegment, laundryMeasureMode === 'items' && styles.valetSegmentActive]}
                      onPress={() => setLaundryMeasureMode('items')}
                    >
                      <Text
                        style={[styles.valetSegmentText, laundryMeasureMode === 'items' && styles.valetSegmentTextActive]}
                      >
                        By items
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.juxHintMuted, { marginBottom: 12 }]}>
                    {laundryMeasureMode === 'kg'
                      ? 'Typical load: 3–6 kg for one person · 8–12 kg for a family'
                      : 'Count shirts, trousers, bedsheets — we will weigh at pickup if needed'}
                  </Text>
                  <View style={styles.valetStepperCompact}>
                    <Pressable
                      style={styles.valetStepperBtn}
                      onPress={() =>
                        laundryMeasureMode === 'kg'
                          ? setLaundryQuantity((q) => Math.max(1, q - 1))
                          : setLaundryItemCount((n) => Math.max(1, n - 1))
                      }
                    >
                      <Text style={styles.valetStepperBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.valetStepperValue}>{loadSummary}</Text>
                    <Pressable
                      style={styles.valetStepperBtn}
                      onPress={() =>
                        laundryMeasureMode === 'kg'
                          ? setLaundryQuantity((q) => Math.min(30, q + 1))
                          : setLaundryItemCount((n) => Math.min(45, n + 1))
                      }
                    >
                      <Text style={styles.valetStepperBtnText}>+</Text>
                    </Pressable>
                  </View>
                  <View style={[styles.rideWizardFareCard, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
                    <Text style={[styles.rideWizardFareLabel, { color: theme.textSecondary }]}>Estimated total</Text>
                    <Text style={[styles.rideWizardFareValue, { color: theme.textPrimary }]}>KES {laundryEstimateKes}</Text>
                  </View>
                </>
              ) : null}
              {laundryWizardStep === 'review' ? (
                <>
                  <View style={[styles.rideWizardReviewRow, { borderColor: theme.border }]}>
                    <Text style={[styles.rideWizardReviewLabel, { color: theme.textMuted }]}>Pickup</Text>
                    <Text style={[styles.rideWizardReviewValue, { color: theme.textPrimary }]}>{pickupLabel}</Text>
                    <Text style={[styles.rideWizardReviewSub, { color: theme.textSecondary }]} numberOfLines={2}>
                      {pickupDetail}
                    </Text>
                  </View>
                  <View style={[styles.rideWizardReviewRow, { borderColor: theme.border }]}>
                    <Text style={[styles.rideWizardReviewLabel, { color: theme.textMuted }]}>Load</Text>
                    <Text style={[styles.rideWizardReviewValue, { color: theme.textPrimary }]}>{loadSummary}</Text>
                    <Text style={[styles.rideWizardReviewSub, { color: theme.textSecondary }]}>
                      {laundryMeasureMode === 'kg' ? 'Charged per kg' : 'Charged per item'} · washed, folded & delivered
                    </Text>
                  </View>
                  <View style={[styles.rideWizardReviewRow, { borderColor: theme.border }]}>
                    <Text style={[styles.rideWizardReviewLabel, { color: theme.textMuted }]}>ETA</Text>
                    <Text style={[styles.rideWizardReviewValue, { color: theme.textPrimary }]}>30–45 min</Text>
                    <Text style={[styles.rideWizardReviewSub, { color: theme.textSecondary }]}>
                      Mama fua picks up, washes at a verified station, and returns to you
                    </Text>
                  </View>
                  <View style={[styles.rideWizardFareCard, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
                    <Text style={[styles.rideWizardFareLabel, { color: theme.textSecondary }]}>Total due</Text>
                    <Text style={[styles.rideWizardFareValue, { color: theme.textPrimary }]}>KES {laundryEstimateKes}</Text>
                  </View>
                </>
              ) : null}
            </>
          );
        }
        case 'bnbs':
        case 'houses': {
          const isRental = staysSubTab === 'rental' || activeService === 'houses';
          const stayRows = isRental ? featuredHouses : featuredBnbs;
          const stayCount = isRental ? nearbyHouses.length : nearbyBnbs.length;
          const compactDetail = homeSheetStage !== 'full';
          const staysMapHeight =
            homeSheetStage === 'full' ? 300 : homeSheetStage === 'mid' ? 228 : 188;
          return (
            <>
              <View style={styles.staysSubSegment}>
                {(['bnb', 'rental'] as const).map((t) => {
                  const on = (t === 'rental') === isRental;
                  return (
                    <Pressable
                      key={t}
                      style={[styles.staysSubSegmentBtn, on && styles.staysSubSegmentBtnOn]}
                      onPress={() => setStaysSubTab(t)}
                    >
                      <Text style={[styles.staysSubSegmentText, on && styles.staysSubSegmentTextOn]}>
                        {t === 'bnb' ? 'BnB' : 'Rental'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {renderSectionHero(
                isRental ? STAYS_RENTAL_HERO_SLIDES : STAYS_BNB_HERO_SLIDES,
                isRental ? 'How rentals work' : 'How BnBs work',
              )}
              <Text style={styles.valetSheetTag}>Kisumu pilot · {currentCounty}</Text>
              <Text style={styles.valetSheetLead}>
                {isRental
                  ? stayCount
                    ? `Vacant rentals within ${staysRadiusKm} km. Exact pins unlock with subscription.`
                    : `No rentals in ${staysRadiusKm} km — widen radius or browse all.`
                  : stayCount
                    ? `Short stays near you — book to reveal the full address.`
                    : `Nothing listed in ${currentCounty} yet.`}
              </Text>
              <Text style={[styles.juxSectionLabel, styles.valetSectionLabelCompact]}>Radius</Text>
              <View style={styles.staysRadiusRow}>
                {STAYS_RADIUS_OPTIONS.map((km) => {
                  const on = staysRadiusKm === km;
                  return (
                    <Pressable
                      key={km}
                      style={[styles.staysRadiusChip, on && styles.staysRadiusChipOn]}
                      onPress={() => setStaysRadiusKm(km)}
                    >
                      <Text style={[styles.staysRadiusChipText, on && styles.staysRadiusChipTextOn]}>{km} km</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.juxSectionRow}>
                <Text style={styles.juxSectionLabel}>{isRental ? 'Vacant nearby' : 'Stays nearby'}</Text>
                <View style={styles.staysSectionActions}>
                  <View style={styles.listingsViewToggle}>
                    <Pressable
                      style={[styles.listingsViewChip, staysSheetViewMode === 'list' && styles.listingsViewChipOn]}
                      onPress={() => setStaysSheetViewMode('list')}
                    >
                      <Text
                        style={[
                          styles.listingsViewChipText,
                          staysSheetViewMode === 'list' && styles.listingsViewChipTextOn,
                        ]}
                      >
                        List
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.listingsViewChip, staysSheetViewMode === 'map' && styles.listingsViewChipOn]}
                      onPress={() => {
                        setStaysSheetViewMode('map');
                        if (!currentCoords) void fetchCurrentLocation();
                      }}
                    >
                      <Text
                        style={[
                          styles.listingsViewChipText,
                          staysSheetViewMode === 'map' && styles.listingsViewChipTextOn,
                        ]}
                      >
                        Map
                      </Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => {
                      setListingCatalog(isRental ? 'house' : 'bnb');
                      setListingRadiusKm(staysRadiusKm);
                      setHomeDeepPage('listings');
                      setHomeSheetStageAnimated('full');
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.juxSeeAll}>See all</Text>
                  </Pressable>
                </View>
              </View>
              {staysSheetViewMode === 'map' ? (
                <>
                  <Text style={styles.homeDeepCount}>
                    {stayCount} on map within {staysRadiusKm} km · tap a pin for details
                  </Text>
                  <View style={[styles.staysHomeMapBand, { height: staysMapHeight }]}>
                    {staysHomeMapHtml ? (
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
                        <Text style={styles.serviceMapFallbackText}>
                          Add EXPO_PUBLIC_MAPBOX_TOKEN to view stays on the map.
                        </Text>
                      </View>
                    )}
                    <View style={[styles.serviceMapLegend, styles.serviceMapLegendWrap, { top: 6, left: 8 }]}>
                      <View style={styles.serviceMapLegendRow}>
                        <View style={[styles.serviceMapLegendDot, { backgroundColor: '#22c55e' }]} />
                        <Text style={styles.serviceMapLegendText}>You</Text>
                      </View>
                      <View style={styles.serviceMapLegendRow}>
                        <View
                          style={[
                            styles.serviceMapLegendDot,
                            { backgroundColor: isRental ? '#A78BFA' : '#F472B6' },
                          ]}
                        />
                        <Text style={styles.serviceMapLegendText}>{isRental ? 'Rental' : 'BnB'}</Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : stayRows.length > 0 ? (
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
                              <Text style={styles.juxStayCardMeta}>
                                {house.beds} bed · {house.baths} bath · {house.distanceKm} km
                              </Text>
                              <Text style={styles.juxStayCardPrice}>{house.price}</Text>
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
                              <Text style={styles.juxStayCardMeta}>
                                {bnb.rating} ★ · {bnb.beds} bed · {bnb.guests} guests
                              </Text>
                              <Text style={styles.juxStayCardPrice}>{bnb.price}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                </ScrollView>
              ) : (
                <Text style={styles.juxHintMuted}>
                  {isRental ? 'No rentals in range — widen radius.' : 'No stays in this area yet.'}
                </Text>
              )}
              {stayCount > 0 ? (
                <Pressable
                  style={styles.homeDeepEntryRow}
                  onPress={() => {
                    setListingCatalog(isRental ? 'house' : 'bnb');
                    setListingCounty(stayCount > FEATURED_STAYS_HOME ? currentCounty : 'any');
                    if (!isRental) setListingSpace('any');
                    setListingQuery('');
                    setListingRadiusKm(staysRadiusKm);
                    setListingDetail(null);
                    setHomeSheetStageAnimated('collapsed');
                    setHomeDeepPage('listings');
                  }}
                >
                  <Text style={styles.homeDeepEntryTitle}>
                    {stayCount > FEATURED_STAYS_HOME ? 'View all listings' : 'Browse catalog'} ›
                  </Text>
                  <Text style={styles.homeDeepEntrySub}>Area · distance · search</Text>
                </Pressable>
              ) : null}
              {isRental && focusedHouse ? (
                <View style={styles.juxListingDetail}>
                  <View style={[styles.juxListingCarouselWrap, { width: listingCarouselW }]}>
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
                  </View>
                  <View style={styles.juxListingDetailBody}>
                    <View style={styles.juxListingTitleRow}>
                      <Text style={styles.juxListingTitle}>{focusedHouse.title}</Text>
                      <Text style={styles.juxListingRating}>{focusedHouse.distanceKm} km</Text>
                    </View>
                    <Text style={styles.juxListingPrice}>{focusedHouse.price}</Text>
                    <Text style={styles.juxListingDesc} numberOfLines={compactDetail ? 2 : 6}>
                      {rentalSubscribed
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
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.juxChipRow}>
                        {focusedHouse.amenities.map((tag) => (
                          <View key={tag} style={styles.juxChip}>
                            <Text style={styles.juxChipText}>{tag}</Text>
                          </View>
                        ))}
                      </ScrollView>
                    ) : null}
                    <View style={styles.valetListingFooterCompact}>
                      {rentalSubscribed ? (
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
                            setGuidedJourney({
                              end: focusedHouse.coords,
                              title: focusedHouse.title,
                              subtitle: `${focusedHouse.distanceKm} km · ${focusedHouse.price}`,
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
                  <View style={[styles.juxListingCarouselWrap, { width: listingCarouselW }]}>
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
                  </View>
                  <View style={styles.juxListingDetailBody}>
                    <View style={styles.juxListingTitleRow}>
                      <Text style={styles.juxListingTitle}>{focusedBnb.title}</Text>
                      <Text style={styles.juxListingRating}>{focusedBnb.rating} ★</Text>
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
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.juxChipRow}>
                        {focusedBnb.amenities.slice(0, 6).map((tag) => (
                          <View key={tag} style={styles.juxChip}>
                            <Text style={styles.juxChipText}>{tag}</Text>
                          </View>
                        ))}
                      </ScrollView>
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
                          setGuidedJourney({
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
                          if (!focusedBnb.has3dTour) return;
                          setTourSheetTarget({ kind: 'bnb', id: focusedBnb.id });
                        }}
                        disabled={!focusedBnb.has3dTour}
                        style={styles.textRowActionHit}
                      >
                        <Text
                          style={[
                            styles.textRowActionMuted,
                            !focusedBnb.has3dTour && styles.valetListingSecondaryDisabled,
                          ]}
                        >
                          3D tour
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : (
                <Text style={styles.juxHintMuted}>
                  {isRental ? 'Tap a vacant rental to preview — request viewing below.' : 'Tap a stay to preview — reserve below.'}
                </Text>
              )}
            </>
          );
        }
        default:
          return null;
      }
    })();

    const laundryEstimateFooter =
      activeService === 'laundry'
        ? laundryMeasureMode === 'kg'
          ? laundryQuantity * LAUNDRY_KES_PER_KG
          : laundryItemCount * LAUNDRY_KES_PER_ITEM
        : 0;
    const laundryLoadFooter =
      activeService === 'laundry'
        ? laundryMeasureMode === 'kg'
          ? `${laundryQuantity} kg`
          : `${laundryItemCount} items`
        : '';

    const sheetFooter = (() => {
      if (activeTab !== 'home' || isComingSoonSegment) return null;
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
          const next = nextFuaWizardStep(laundryWizardStep);
          setLaundryWizardStep(next);
          setPhaseForService('laundry', 'selecting');
          setHomeSheetStageAnimated('mid');
        };
        const confirmLaundry = () => {
          const station = laundryStationId ? PICKUP_STATIONS.find((s) => s.id === laundryStationId) : null;
          const where = station ? station.name : 'Your location';
          const request = `Jua Fua • ${where} • ${laundryLoadFooter} • KES ${laundryEstimateFooter}`;
          setTripFeed((prev) => [request, ...prev].slice(0, 10));
          setBookingMessage(request);
          setActiveTripInfo({
            service: 'laundry',
            title: 'Fua pickup',
            subtitle: where,
            eta: '30–45 min',
          });
          setPhaseForService('laundry', 'active_trip');
          setHomeSheetStageAnimated('collapsed');
        };
        if (laundryWizardStep === 'pickup') {
          const pickupSublabel =
            laundryStationId != null
              ? PICKUP_STATIONS.find((s) => s.id === laundryStationId)?.name ?? 'Station'
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
              label="Confirm request"
              sublabel={`KES ${laundryEstimateFooter} · ${laundryLoadFooter}`}
              darkMode={themeMode === 'dark'}
              onBack={() => wizardBack && setLaundryWizardStep(wizardBack)}
              onPress={confirmLaundry}
            />
          );
        }
        return null;
      }
      if (activeService === 'rides' && !isActiveTripMode) {
        const pickupLabel =
          ridePickupMode === 'station' && ridePickupStationId
            ? PICKUP_STATIONS.find((s) => s.id === ridePickupStationId)?.name ?? 'Pickup hub'
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
              sublabel={`${selectedRide.icon} ${selectedRide.label}`}
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
                setBookingMessage(`Paid · ${tripSummary}`);
                setActiveTripInfo({
                  service: 'rides',
                  title: selectedRide.label,
                  subtitle: selectedDestination.name,
                  eta: routeDurationMin != null ? `${routeDurationMin} min` : '—',
                });
                setPhaseForService('rides', 'active_trip');
                setRideWizardStep('on_trip');
                setTripStarted(true);
                setHomeSheetStageAnimated('collapsed');
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
                sublabel={`Within ${staysRadiusKm} km · ${currentCounty}`}
                disabled
                darkMode={themeMode === 'dark'}
                onPress={() => {}}
              />
            );
          }
          if (!rentalSubscribed) {
            return (
              <SheetStickyFooter
                label="Subscribe to unlock"
                sublabel="Weekly · KES 499 · exact pins + landlord contact"
                darkMode={themeMode === 'dark'}
                onPress={() => {
                  setRentalSubscribed(true);
                  setBookingMessage('Saka Keja weekly unlock active — exact locations and contact unlocked.');
                }}
              />
            );
          }
          return (
            <SheetStickyFooter
              label="Request viewing"
              sublabel={`${focusedHouse.title} · ${focusedHouse.price}`}
              darkMode={themeMode === 'dark'}
              onPress={() => {
                const request = `House viewing request • ${focusedHouse.title} • ${focusedHouse.price}`;
                setTripFeed((prev) => [request, ...prev].slice(0, 10));
                setBookingMessage(request);
                setPhaseForService('bnbs', 'confirmed');
                setActiveTab('trips');
              }}
            />
          );
        }
        if (!focusedBnb) {
          return (
            <SheetStickyFooter
              label="Select a stay"
              sublabel={`Book-to-reveal address · ${currentCounty}`}
              disabled
              darkMode={themeMode === 'dark'}
              onPress={() => {}}
            />
          );
        }
        return (
          <SheetStickyFooter
            label="Reserve stay"
            sublabel={`${focusedBnb.title} · ${focusedBnb.price}`}
            darkMode={themeMode === 'dark'}
            onPress={() => {
              const booking = `BnB booked • ${focusedBnb.title} • ${focusedBnb.price}`;
              setTripFeed((prev) => [booking, ...prev].slice(0, 10));
              setBookingMessage(booking);
              setPhaseForService('bnbs', 'confirmed');
              setActiveTab('trips');
            }}
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
          return (
            <SheetStickyFooter
              label="Reserve stay"
              sublabel={`${b.title} · ${b.price}`}
              darkMode={themeMode === 'dark'}
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={() => {
                const booking = `BnB booked • ${b.title} • ${b.price}`;
                setTripFeed((prev) => [booking, ...prev].slice(0, 10));
                setBookingMessage(booking);
                setPhaseForService('bnbs', 'confirmed');
                setHomeDeepPage(null);
                setListingDetail(null);
                setActiveTab('trips');
              }}
            />
          );
        }
        const h = listingDetailEntity as HouseListing;
        if (!rentalSubscribed) {
          return (
            <SheetStickyFooter
              label="Subscribe to unlock"
              sublabel="Weekly · KES 499 · then request viewing"
              darkMode={themeMode === 'dark'}
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={() => {
                setRentalSubscribed(true);
                setBookingMessage('Saka Keja weekly unlock active — you can request viewings.');
              }}
            />
          );
        }
        return (
          <SheetStickyFooter
            label="Request viewing"
            sublabel={`${h.title} · ${h.price}`}
            darkMode={themeMode === 'dark'}
            style={{ paddingBottom: insets.bottom + 8 }}
            onPress={() => {
              const request = `House viewing request • ${h.title} • ${h.price}`;
              setTripFeed((prev) => [request, ...prev].slice(0, 10));
              setBookingMessage(request);
              setPhaseForService('bnbs', 'confirmed');
              setHomeDeepPage(null);
              setListingDetail(null);
              setActiveTab('trips');
            }}
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
          return (
            <SheetStickyFooter
              label="View listing details"
              sublabel={`${title} · ${price}`}
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
        const laundryStation =
          activeService === 'laundry' && laundryStationId
            ? PICKUP_STATIONS.find((s) => s.id === laundryStationId)
            : null;
        const rideHub =
          activeService === 'rides' && ridePickupStationId
            ? PICKUP_STATIONS.find((s) => s.id === ridePickupStationId)
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
                ? 'Green pin = you · orange = station — tap a pin to select'
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
      <View style={[styles.juxShell, { backgroundColor: theme.canvas }]}>
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
          <Pressable
            style={[styles.homeLocationStrip, { paddingHorizontal: gutter, borderColor: theme.border }]}
            onPress={() => void fetchCurrentLocation()}
          >
            <View style={styles.mapLocationDot} />
            <Text style={[styles.homeLocationStripText, { color: theme.textPrimary }]} numberOfLines={1}>
              {locationLoading ? 'Locating…' : currentLocationLabel}
            </Text>
            {locationLoading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={[styles.homeLocationRefresh, { color: theme.accentBlue }]}>↻</Text>
            )}
          </Pressable>
        ) : null}

        {showServiceSegment ? (
          <View style={[styles.serviceSegmentInChrome, { paddingHorizontal: gutter }]}>
            <ERServiceSegment
              tabs={SERVICE_SEGMENTS}
              active={activeSegment}
              onChange={(key) => {
                setActiveSegment(key);
                if (key === 'laundry' || key === 'bnbs' || key === 'rides') {
                  setActiveService(key);
                  setHomeSheetStageAnimated('mid');
                }
              }}
              onComingSoon={(key) => {
                setActiveSegment(key);
                setHomeSheetStageAnimated('mid');
              }}
              fontSize={windowWidth < 360 ? 9 : windowWidth < 400 ? 10 : 11}
              darkMode={themeMode === 'dark'}
            />
          </View>
        ) : null}

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
          {!!bookingMessage ? <Text style={styles.juxToast}>{bookingMessage}</Text> : null}
          {tripStarted ? <Text style={styles.juxToast}>Trip is live.</Text> : null}
          {locationError ? (
            <Pressable onPress={fetchCurrentLocation} style={styles.locationErrorBanner}>
              <Text style={styles.juxErrorInline}>{locationError}</Text>
              <Text style={styles.locationErrorRetry}>Tap to retry</Text>
            </Pressable>
          ) : null}
          {isActiveTripMode && onHomeTab && homeSheetStage === 'collapsed' ? (
            <View style={styles.activeTripBarRow}>
              <Pressable style={styles.activeTripBar} onPress={() => setHomeSheetStageAnimated('mid')}>
                <View style={styles.activeTripBarMain}>
                  <Text style={styles.activeTripBarTitle}>{activeTripInfo?.title ?? 'Trip in progress'}</Text>
                  <Text style={styles.activeTripBarSub} numberOfLines={1}>
                    {activeTripInfo?.subtitle ?? 'Tap for details'}
                  </Text>
                </View>
                <View style={styles.activeTripBarEta}>
                  <Text style={styles.activeTripBarEtaValue}>{activeTripInfo?.eta ?? '—'}</Text>
                  <Text style={styles.activeTripBarEtaLabel}>ETA</Text>
                </View>
              </Pressable>
              <Pressable style={styles.activeTripCancel} onPress={cancelLiveTrip} hitSlop={8}>
                <Text style={styles.activeTripCancelText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.juxSheetScroll}
                contentContainerStyle={[
                  styles.juxSheetScrollContent,
                  { paddingHorizontal: gutter, paddingBottom: sheetFooter ? 4 : tabBarBottomPad + 8 },
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                removeClippedSubviews={false}
                keyboardDismissMode="on-drag"
                onScrollBeginDrag={() => {
                  Keyboard.dismiss();
                  setDestinationSuggestions([]);
                }}
                directionalLockEnabled
                overScrollMode="never"
              >
                {sheetInner}
              </ScrollView>
              {sheetFooter}
            </>
          )}
        </View>

        {showMainTabBar ? (
          <ERTabBar
            tabs={MAIN_TAB_CONFIG}
            active={activeTab}
            onChange={(key) => {
              setActiveTab(key);
              if (key === 'home') setHomeSheetStageAnimated('mid');
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
                ) : homeDeepPage === 'listings' ? (
                  <View style={styles.listingsHeaderRow}>
                    <Text style={styles.homeDeepMapTitle}>Listings</Text>
                    <View style={styles.listingsViewToggle}>
                      <Pressable
                        style={[styles.listingsViewChip, listingsViewMode === 'list' && styles.listingsViewChipOn]}
                        onPress={() => setListingsViewMode('list')}
                      >
                        <Text
                          style={[
                            styles.listingsViewChipText,
                            listingsViewMode === 'list' && styles.listingsViewChipTextOn,
                          ]}
                        >
                          List
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.listingsViewChip, listingsViewMode === 'map' && styles.listingsViewChipOn]}
                        onPress={() => {
                          setListingsViewMode('map');
                          if (!currentCoords) void fetchCurrentLocation();
                        }}
                      >
                        <Text
                          style={[
                            styles.listingsViewChipText,
                            listingsViewMode === 'map' && styles.listingsViewChipTextOn,
                          ]}
                        >
                          Map
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
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
                  {activeService === 'laundry' ||
                  (activeService === 'rides' && rideWizardStep === 'pickup') ? (
                    <View style={[styles.serviceMapLegend, styles.serviceMapLegendWrap, { top: 48 }]}>
                      <View style={styles.serviceMapLegendRow}>
                        <View style={[styles.serviceMapLegendDot, { backgroundColor: '#22c55e' }]} />
                        <Text style={styles.serviceMapLegendText}>You are here</Text>
                      </View>
                      <View style={styles.serviceMapLegendRow}>
                        <View
                          style={[
                            styles.serviceMapLegendDot,
                            { backgroundColor: activeService === 'laundry' ? '#F59E0B' : '#38BDF8' },
                          ]}
                        />
                        <Text style={styles.serviceMapLegendText}>
                          {activeService === 'laundry' ? 'Pickup station' : 'Pickup hub'}
                        </Text>
                      </View>
                      {activeService === 'rides' && rideWizardStep === 'pickup' ? (
                        <View style={styles.serviceMapLegendRow}>
                          <View style={[styles.serviceMapLegendDot, { backgroundColor: '#C9A227' }]} />
                          <Text style={styles.serviceMapLegendText}>Top destination</Text>
                        </View>
                      ) : null}
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
                    <View style={styles.valetSegmentTrack}>
                      <Pressable
                        style={[styles.valetSegment, listingCatalog === 'bnb' && styles.valetSegmentActive]}
                        onPress={() => setListingCatalog('bnb')}
                      >
                        <Text
                          style={[styles.valetSegmentText, listingCatalog === 'bnb' && styles.valetSegmentTextActive]}
                        >
                          BnBs
                        </Text>
                      </Pressable>
                      <View style={styles.valetSegmentDivider} />
                      <Pressable
                        style={[styles.valetSegment, listingCatalog === 'house' && styles.valetSegmentActive]}
                        onPress={() => setListingCatalog('house')}
                      >
                        <Text
                          style={[styles.valetSegmentText, listingCatalog === 'house' && styles.valetSegmentTextActive]}
                        >
                          Rentals
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={styles.homeDeepCount}>
                      {(listingCatalog === 'bnb' ? catalogBnbs : catalogHouses).length} on map · tap a pin for
                      details
                    </Text>
                    <View style={styles.listingsMapBody}>
                      {listingsMapHtml ? (
                        <WebView
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
                >
                  <Text style={styles.homeDeepPageLead}>Tune the catalog, open a row for the full sheet.</Text>
                  <View style={styles.valetSegmentTrack}>
                    <Pressable
                      style={[styles.valetSegment, listingCatalog === 'bnb' && styles.valetSegmentActive]}
                      onPress={() => setListingCatalog('bnb')}
                    >
                      <Text
                        style={[styles.valetSegmentText, listingCatalog === 'bnb' && styles.valetSegmentTextActive]}
                      >
                        BnBs
                      </Text>
                    </Pressable>
                    <View style={styles.valetSegmentDivider} />
                    <Pressable
                      style={[styles.valetSegment, listingCatalog === 'house' && styles.valetSegmentActive]}
                      onPress={() => setListingCatalog('house')}
                    >
                      <Text
                        style={[styles.valetSegmentText, listingCatalog === 'house' && styles.valetSegmentTextActive]}
                      >
                        Rentals
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.juxSectionLabel, styles.homeDeepFilterSpaced]}>Area on the map</Text>
                  <Text style={styles.homeDeepFilterHint}>
                    Near me uses your map pin and the distance cap only. All areas and county chips ignore distance —
                    they filter by place only.
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.homeDeepChipRow}>
                    {(['near_me', 'any', ...SUPPORTED_COUNTIES] as const).map((key) => {
                      const on = listingCounty === key;
                      const label =
                        key === 'near_me'
                          ? 'Near me'
                          : key === 'any'
                            ? 'All areas'
                            : key.charAt(0).toUpperCase() + key.slice(1);
                      return (
                        <Pressable
                          key={key}
                          style={[styles.homeDeepChip, on && styles.homeDeepChipOn]}
                          onPress={() => setListingCounty(key)}
                        >
                          <Text style={[styles.homeDeepChipText, on && styles.homeDeepChipTextOn]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Text style={[styles.juxSectionLabel, styles.homeDeepFilterSpaced]}>Distance cap</Text>
                  <Text style={styles.homeDeepFilterHint}>
                    {listingCounty !== 'near_me'
                      ? 'Select Near me to turn on distance filtering from your pin.'
                      : !currentCoords
                        ? 'Enable location from the map pill to use Near me and the distance cap.'
                        : `Listings within ${listingRadiusKm} km of your pin (BnBs and rentals).`}
                  </Text>
                  <Pressable
                    style={[
                      styles.homeDeepRadiusTap,
                      (listingCounty !== 'near_me' || !currentCoords) && styles.homeDeepRadiusTapMuted,
                    ]}
                    onPress={() => {
                      const opts = [...STAYS_RADIUS_OPTIONS];
                      const i = opts.indexOf(listingRadiusKm);
                      setListingRadiusKm(opts[(i >= 0 ? i + 1 : 0) % opts.length]);
                    }}
                    disabled={listingCounty !== 'near_me' || !currentCoords}
                  >
                    <Text
                      style={[
                        styles.homeDeepRadiusTapText,
                        (listingCounty !== 'near_me' || !currentCoords) && styles.homeDeepRadiusTapTextMuted,
                      ]}
                    >
                      {listingRadiusKm} km · tap to cycle
                      {listingCounty !== 'near_me' ? ' · needs Near me' : !currentCoords ? ' · needs location' : ''}
                    </Text>
                  </Pressable>
                  {listingCatalog === 'bnb' ? (
                    <>
                      <Text style={[styles.juxSectionLabel, styles.homeDeepFilterSpaced]}>Stay type</Text>
                      <View style={styles.valetSegmentTrack}>
                        {(['any', 'entire', 'room'] as const).map((sp, si) => (
                          <Fragment key={sp}>
                            {si > 0 ? <View style={styles.valetSegmentDivider} /> : null}
                            <Pressable
                              style={[styles.valetSegment, listingSpace === sp && styles.valetSegmentActive]}
                              onPress={() => setListingSpace(sp)}
                            >
                              <Text style={[styles.valetSegmentText, listingSpace === sp && styles.valetSegmentTextActive]}>
                                {sp === 'any' ? 'Any' : sp === 'entire' ? 'Entire' : 'Room'}
                              </Text>
                            </Pressable>
                          </Fragment>
                        ))}
                      </View>
                    </>
                  ) : null}
                  <Text style={[styles.juxSectionLabel, styles.homeDeepFilterSpaced]}>Search</Text>
                  <TextInput
                    value={listingQuery}
                    onChangeText={setListingQuery}
                    placeholder="Title or vibe"
                    placeholderTextColor={theme.textMuted}
                    style={styles.homeDeepSearch}
                  />
                  <Text style={styles.homeDeepCount}>
                    {(listingCatalog === 'bnb' ? catalogBnbs : catalogHouses).length} results
                  </Text>
                  {(listingCatalog === 'bnb' ? catalogBnbs : catalogHouses).length === 0 ? (
                    <Text style={styles.juxHintMuted}>
                      No matches — try All areas or a county, or Near me with location and a wider distance cap
                      {listingCatalog === 'bnb' ? ', stay type' : ''}, or search.
                    </Text>
                  ) : null}
                  {(listingCatalog === 'bnb' ? catalogBnbs : catalogHouses).map((row, ri, arr) => (
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
                        <Text style={styles.listingCatTitle} numberOfLines={2}>
                          {listingCatalog === 'bnb' ? (row as BnbListing).title : (row as HouseListing).title}
                        </Text>
                        <Text style={styles.listingCatMeta} numberOfLines={1}>
                          {listingCatalog === 'bnb'
                            ? `${(row as BnbListing).county} · ${(row as BnbListing).price}`
                            : `${(row as HouseListing).distanceKm} km · ${(row as HouseListing).price}`}
                        </Text>
                      </View>
                      <Text style={styles.listingCatChev}>›</Text>
                    </Pressable>
                  ))}
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
                      <Text style={styles.homeDeepPageLead}>
                        {(listingDetailEntity as BnbListing).county} · {(listingDetailEntity as BnbListing).rating} ★ ·{' '}
                        {(listingDetailEntity as BnbListing).price}
                      </Text>
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
                              if (!MAPBOX_ACCESS_TOKEN) {
                                setBookingMessage('Add a Mapbox token (EXPO_PUBLIC_MAPBOX_TOKEN) for navigation.');
                                return;
                              }
                              if (!currentCoords) {
                                setBookingMessage('We need your current location — tap the location pill, then try again.');
                                return;
                              }
                              const b = listingDetailEntity as BnbListing;
                              setGuidedJourney({
                                end: b.coords,
                                title: b.title,
                                subtitle: `${b.county} · ${b.rating} ★ · ${b.price}`,
                                kind: 'bnb',
                              });
                            }}
                            style={styles.textRowActionHit}
                          >
                            <Text style={styles.textRowAction}>Live route</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              const b = listingDetailEntity as BnbListing;
                              if (!b.has3dTour) return;
                              setTourSheetTarget({ kind: 'bnb', id: b.id });
                            }}
                            disabled={!(listingDetailEntity as BnbListing).has3dTour}
                            style={styles.textRowActionHit}
                          >
                            <Text
                              style={[
                                styles.textRowActionMuted,
                                !(listingDetailEntity as BnbListing).has3dTour && styles.valetListingSecondaryDisabled,
                              ]}
                            >
                              3D tour
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.homeDeepPageTitle}>{(listingDetailEntity as HouseListing).title}</Text>
                      <Text style={styles.homeDeepPageLead}>
                        {(listingDetailEntity as HouseListing).county} · {(listingDetailEntity as HouseListing).distanceKm}{' '}
                        km · {(listingDetailEntity as HouseListing).price}
                      </Text>
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
                          {rentalSubscribed ? (
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
                                const h = listingDetailEntity as HouseListing;
                                setGuidedJourney({
                                  end: h.coords,
                                  title: h.title,
                                  subtitle: `${h.distanceKm} km · ${h.price}`,
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
                              const h = listingDetailEntity as HouseListing;
                              if (!h.has3dTour) return;
                              setTourSheetTarget({ kind: 'house', id: h.id });
                            }}
                            disabled={!(listingDetailEntity as HouseListing).has3dTour}
                            style={styles.textRowActionHit}
                          >
                            <Text
                              style={[
                                styles.textRowActionMuted,
                                !(listingDetailEntity as HouseListing).has3dTour && styles.valetListingSecondaryDisabled,
                              ]}
                            >
                              3D walkthrough
                            </Text>
                          </Pressable>
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
                            <Text style={styles.listingCatMeta} numberOfLines={1}>
                              {listingDetail.kind === 'bnb'
                                ? `${(row as BnbListing).county} · ${(row as BnbListing).price}`
                                : `${(row as HouseListing).distanceKm} km · ${(row as HouseListing).price}`}
                            </Text>
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
                    {(['asap', 'morning', 'evening'] as const).map((w, wi) => (
                      <Fragment key={w}>
                        {wi > 0 ? <View style={styles.valetSegmentDivider} /> : null}
                        <Pressable
                          style={[styles.valetSegment, valetStudioWhen === w && styles.valetSegmentActive]}
                          onPress={() => setValetStudioWhen(w)}
                        >
                          <Text style={[styles.valetSegmentText, valetStudioWhen === w && styles.valetSegmentTextActive]}>
                            {w === 'asap' ? 'Flexible' : w === 'morning' ? 'Morning' : 'Evening'}
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
                <Text style={[styles.exploreKeyLead, { color: theme.textSecondary, marginTop: 4 }]}>
                  {(listingPreviewEntity as BnbListing).county} · {(listingPreviewEntity as BnbListing).rating} ★ ·{' '}
                  {(listingPreviewEntity as BnbListing).price}
                </Text>
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
                <Text style={[styles.exploreKeyLead, { color: theme.textSecondary, marginTop: 4 }]}>
                  {(listingPreviewEntity as HouseListing).distanceKm} km · {(listingPreviewEntity as HouseListing).price}
                </Text>
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
      exploreScope === 'nearby' ? `Near ${currentCounty.charAt(0).toUpperCase()}${currentCounty.slice(1)}` : 'Everywhere'
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
                          setGuidedJourney({
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
    if (!isAuthed) return renderOnboarding();
    if (activeTab === 'home' || activeTab === 'trips' || activeTab === 'profile') return renderHome();
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

      <Modal
        visible={guidedJourney !== null && guidanceMapHtml !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setGuidedJourney(null)}
      >
        <View style={[styles.journeyModalRoot, { backgroundColor: theme.canvas }]}>
          <View
            style={[
              styles.journeyModalTopBar,
              { paddingTop: insets.top + 8, paddingHorizontal: gutter, borderBottomColor: theme.border },
            ]}
          >
            <Pressable onPress={() => setGuidedJourney(null)} hitSlop={12}>
              <Text style={styles.homeDeepBack}>← End route</Text>
            </Pressable>
            <Text style={[styles.journeyModalTitle, { color: theme.textPrimary }]}>Navigate</Text>
            <View style={{ width: 72 }} />
          </View>
          {guidedJourney ? (
            <View style={[styles.journeyModalDestStrip, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
              <Text style={[styles.journeyModalEyebrow, { color: BRAND.gold }]}>HEADING TO</Text>
              <Text style={[styles.journeyModalDestTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                {guidedJourney.title}
              </Text>
              {guidedJourney.subtitle ? (
                <Text style={[styles.journeyModalDestSub, { color: theme.textSecondary }]} numberOfLines={2}>
                  {guidedJourney.subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}
          {guidanceMapHtml ? (
            <WebView
              source={{ html: guidanceMapHtml }}
              style={styles.journeyMapWebView}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              bounces={false}
              mixedContentMode="always"
              allowsFullscreenVideo
              setSupportMultipleWindows={false}
              {...ANDROID_MAP_WEBVIEW_PROPS}
            />
          ) : null}
        </View>
      </Modal>
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
      backgroundColor: theme.statusBar === 'light' ? theme.surface : '#FFFFFF',
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
    homeLocationStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    homeLocationStripText: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
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
      borderTopWidth: StyleSheet.hairlineWidth,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
      elevation: 16,
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
      backgroundColor: theme.statusBar === 'light' ? '#3D2418' : '#DDD0C8',
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
    juxToast: {
      fontSize: 11,
      color: theme.accentBlue,
      fontFamily: 'Inter_500Medium',
      textAlign: 'center',
      marginBottom: 6,
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
    fuaStationChip: {
      marginRight: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1.5,
      maxWidth: 140,
    },
    fuaStationChipOn: {
      borderColor: theme.primary,
      backgroundColor: theme.primaryLight,
    },
    fuaStationChipText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: theme.textPrimary,
    },
    fuaStationChipTextOn: {
      fontFamily: 'Inter_600SemiBold',
      color: theme.primary,
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
      backgroundColor: theme.primary,
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
      color: BRAND.primaryText,
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
      backgroundColor: theme.primary,
    },
    listingsViewChipText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
    },
    listingsViewChipTextOn: {
      color: BRAND.primaryText,
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
    listingCatTitle: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
      lineHeight: 20,
    },
    listingCatMeta: {
      marginTop: 3,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: theme.textMuted,
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
      backgroundColor: theme.primary,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 3,
    },
    serviceSegmentText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    serviceSegmentTextOn: {
      color: '#FFFFFF',
    },
    staysSubSegment: {
      flexDirection: 'row',
      gap: 4,
      marginHorizontal: 4,
      marginBottom: 12,
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
      backgroundColor: theme.primary,
    },
    staysSubSegmentText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
    },
    staysSubSegmentTextOn: {
      color: BRAND.primaryText,
    },
    staysRadiusRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    staysRadiusChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.mutedSurface,
    },
    staysRadiusChipOn: {
      borderColor: theme.primary,
      backgroundColor: theme.primary,
    },
    staysRadiusChipText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
    },
    staysRadiusChipTextOn: {
      color: '#FFFFFF',
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
    makeTripsActiveList: {
      gap: 12,
      marginBottom: 20,
      paddingHorizontal: 0,
    },
    makeTripCard: {
      borderRadius: 16,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 2,
      marginBottom: 12,
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
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: 16,
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
      gap: 8,
    },
    themePreferenceChip: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: 'center',
    },
    themePreferenceChipText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    makeProfileCard: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
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
      fontSize: 22,
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
      fontSize: 28,
      marginBottom: 8,
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
