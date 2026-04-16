import { StatusBar } from 'expo-status-bar';
import { Fragment, ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  LayoutAnimation,
  Modal,
  Pressable,
  Platform,
  UIManager,
  StatusBar as RNStatusBar,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { buildUnifiedHomeServicesMapHtml, type HomeUnifiedPin } from './homeUnifiedMapHtml';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type HomeSheetStage = 'collapsed' | 'mid' | 'full';
/** Full-screen flows from Home (minimal chrome, no card stacks). */
type HomeDeepPage = null | 'listings' | 'listing-detail' | 'valet-studio' | 'rides-planner';
type ListingCatalog = 'bnb' | 'house';
type StaySpaceFilter = 'any' | 'entire' | 'room';

type Screen = 'splash' | 'signin';
type MainTab = 'home' | 'explore' | 'trips' | 'inbox' | 'profile';

const FEATURED_STAYS_HOME = 3;

const MAIN_TAB_CONFIG: { key: MainTab; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'explore', label: 'Explore', icon: '◎' },
  { key: 'trips', label: 'Trips', icon: '◇' },
  { key: 'inbox', label: 'Inbox', icon: '✉' },
  { key: 'profile', label: 'Me', icon: '○' },
];
type ThemeMode = 'light' | 'dark';
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
type RideOption = { id: string; label: string; minutes: number; multiplier: number };
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
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentText: string;
  accentBlue: string;
  mutedSurface: string;
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
const buildGuidanceMapHtml = (
  token: string,
  styleId: string,
  origin: Coordinates,
  destination: Coordinates,
  title: string,
  subtitle: string,
) => {
  const nav = JSON.stringify({
    token,
    styleId,
    origin,
    destination,
    title,
    subtitle,
  });
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"/>
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #020617; }
      #map { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
      #navPanel {
        position: absolute; left: 0; right: 0; bottom: 0; max-height: 44vh;
        background: linear-gradient(180deg, transparent, rgba(2,6,23,0.94) 20%);
        color: #fff; font-family: system-ui, -apple-system, sans-serif;
        padding: 12px 14px 22px; pointer-events: auto; overflow-y: auto;
      }
      .nav-eyebrow { font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(255,255,255,0.5); }
      .nav-title { font-size: 15px; font-weight: 700; margin-top: 4px; }
      .nav-sub { font-size: 12px; color: rgba(255,255,255,0.68); margin-top: 2px; }
      .nav-live {
        margin-top: 14px; padding: 14px 14px 12px; border-radius: 16px;
        background: rgba(15,23,42,0.92); border: 1px solid rgba(59,130,246,0.45);
      }
      .nav-live-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(147,197,253,0.95); }
      .nav-live-main { font-size: 22px; font-weight: 800; margin-top: 6px; letter-spacing: -0.02em; line-height: 1.15; }
      .nav-live-caption { font-size: 11px; line-height: 1.45; color: rgba(255,255,255,0.65); margin-top: 8px; }
      .nav-live-badge {
        display: inline-block; margin-top: 10px; font-size: 11px; font-weight: 600;
        padding: 5px 10px; border-radius: 999px; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.75);
      }
      .nav-live-badge.on { background: rgba(34,197,94,0.25); color: #86efac; border: 1px solid rgba(34,197,94,0.45); }
      .nav-sdk-note { font-size: 10px; line-height: 1.4; color: rgba(255,255,255,0.45); margin-top: 10px; }
      .nav-upcoming-label {
        font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
        color: rgba(255,255,255,0.42); margin-top: 16px; margin-bottom: 6px;
      }
      .nav-step {
        font-size: 11px; line-height: 1.4; padding: 7px 0; border-top: 1px solid rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.55);
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
          '<div class="nav-eyebrow">Live route</div>' +
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
        setLiveBadge('Live · map is following your position', true);
      });
      geo.on('trackuserlocationend', function () {
        setLiveBadge('Live tracking paused — tap the arrow on the map to resume', false);
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
              paint: { 'line-color': '#3B82F6', 'line-width': 6, 'line-opacity': 0.95 },
            });
            var coords = route.geometry.coordinates;
            var b = new mapboxgl.LngLatBounds();
            coords.forEach(function (pt) { b.extend(pt); });
            map.fitBounds(b, { padding: { top: 72, bottom: 240, left: 16, right: 16 }, duration: 800, maxZoom: 16, essential: true });
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
                '<div class="nav-live-label">Progress from your live location</div>' +
                '<div class="nav-live-main">' + progressLine + '</div>' +
                '<div class="nav-live-caption">The blue line is your path. Your dot moves as you move — this screen centers on where you are now, not a fixed list of turns.</div>' +
                '<div id="liveBadge" class="nav-live-badge">Starting location…</div>' +
                '<div class="nav-sdk-note">Voice prompts and lane-level guidance ship with Mapbox Navigation SDK (or Google Navigation) in production. Here, turn text is only background context along the route.</div>' +
                '</div>' +
                (stepsHtml ? '<div class="nav-upcoming-label">Along the route · preview</div>' + stepsHtml : '');
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
  background: '#F2F2F0',
  canvas: '#F2F2F0',
  surface: '#FFFFFF',
  border: '#E8E8E6',
  textPrimary: '#1A1A18',
  textSecondary: '#6B6B68',
  textMuted: '#9A9A97',
  accent: '#1A1A18',
  accentText: '#FFFFFF',
  accentBlue: '#2563EB',
  mutedSurface: '#F7F7F6',
  statusBar: 'dark',
  mapStyleId: 'light-v11',
};

const DARK_THEME: Theme = {
  background: '#0F1115',
  canvas: '#0F1115',
  surface: '#1A1D24',
  border: '#2D3139',
  textPrimary: '#F7F7F8',
  textSecondary: '#AAB0BD',
  textMuted: '#7C8494',
  accent: '#FFFFFF',
  accentText: '#111111',
  accentBlue: '#3B82F6',
  mutedSurface: '#252A34',
  statusBar: 'light',
  mapStyleId: 'dark-v11',
};

/** Remote hero shots — section-relevant, cacheable Unsplash URLs. */
const U = (path: string) => ({ uri: `https://images.unsplash.com/${path}` });
const IMG = {
  nairobiCity: U('photo-1611348524140-53c9a25280d9?auto=format&fit=crop&w=960&q=80'),
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
  { id: 'economy', label: 'Jua X Ride', minutes: 3, multiplier: 1 },
  { id: 'comfort', label: 'Jua X Comfort', minutes: 5, multiplier: 1.35 },
  { id: 'premium', label: 'Jua X XL', minutes: 7, multiplier: 1.85 },
];

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

const SERVICE_TABS: { key: ServiceType; label: string }[] = [
  { key: 'laundry', label: 'VALET' },
  { key: 'bnbs', label: 'BNBS' },
  { key: 'houses', label: 'RENTALS' },
  { key: 'rides', label: 'RIDES' },
];

const HOUSE_RADIUS_OPTIONS = [3, 8, 15, 25] as const;

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
];

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [screen, setScreen] = useState<Screen>('splash');
  const [isAuthed, setIsAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [activeService, setActiveService] = useState<ServiceType>('laundry');
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
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
  const listingDetailScrollRef = useRef<ScrollView | null>(null);
  const [tripFeed, setTripFeed] = useState<string[]>([]);
  const [laundryQuantity, setLaundryQuantity] = useState(4);
  /** null = door-to-door at your address; otherwise pickup & return at that station */
  const [laundryStationId, setLaundryStationId] = useState<string | null>(null);
  const [laundryMeasureMode, setLaundryMeasureMode] = useState<'kg' | 'items'>('kg');
  const [laundryItemCount, setLaundryItemCount] = useState(10);
  const [houseProximityKm, setHouseProximityKm] = useState(8);
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
  const [homeSheetStage, setHomeSheetStage] = useState<HomeSheetStage>('collapsed');
  const [homeDeepPage, setHomeDeepPage] = useState<HomeDeepPage>(null);
  /** When `homeDeepPage === 'listing-detail'`, which catalog row is open. */
  const [listingDetail, setListingDetail] = useState<{ kind: ListingCatalog; id: string } | null>(null);
  const [listingCatalog, setListingCatalog] = useState<ListingCatalog>('bnb');
  const [listingCounty, setListingCounty] = useState<ListingCatalogArea>('any');
  const [listingSpace, setListingSpace] = useState<StaySpaceFilter>('any');
  const [listingQuery, setListingQuery] = useState('');
  const [listingRadiusKm, setListingRadiusKm] = useState<(typeof HOUSE_RADIUS_OPTIONS)[number]>(15);
  const [valetMamaFuaHome, setValetMamaFuaHome] = useState(false);
  const [valetStudioNotes, setValetStudioNotes] = useState('');
  const [valetStudioWhen, setValetStudioWhen] = useState<'asap' | 'morning' | 'evening'>('asap');
  const [ridePlannerStop, setRidePlannerStop] = useState('');
  const [ridePlannerLuggage, setRidePlannerLuggage] = useState(false);
  const [ridePlannerMeetAssist, setRidePlannerMeetAssist] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const theme = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const gutter = Math.min(24, Math.max(14, Math.round(windowWidth * 0.042)));
  const floatingNavHeight = Math.min(64, Math.max(52, Math.round(windowHeight * 0.072)));
  const sheetMidH = Math.max(268, Math.round(windowHeight * 0.44));
  const sheetFullH = Math.max(420, Math.round(windowHeight * 0.91));
  const hideTabBarForHomeSheet = activeTab === 'home' && homeSheetStage === 'full';
  const hideTabBarForExploreSheet = activeTab === 'explore' && exploreSheetStage === 'full';
  const showMainTabBar =
    isAuthed &&
    !hideTabBarForHomeSheet &&
    !hideTabBarForExploreSheet &&
    guidedJourney === null &&
    homeDeepPage === null;
  const sheetBottomOffset = hideTabBarForHomeSheet
    ? Math.max(insets.bottom, 10) + 6
    : insets.bottom + floatingNavHeight + 12;
  const sheetHeight = homeSheetStage === 'collapsed' ? 0 : homeSheetStage === 'mid' ? sheetMidH : sheetFullH;

  /** Mapbox padding so framing centers in the visible map band (below header/search, above sheet or dock+nav). */
  const homeMapCameraPad = useMemo((): MapViewportPad => {
    const topChrome = insets.top + 8 + 48 + 52 + 44 + 18;
    const top = Math.round(Math.min(windowHeight * 0.32, Math.max(132, topChrome)));
    const bottomCollapsed = insets.bottom + floatingNavHeight + 12 + 58;
    const bottomSheetOn = sheetBottomOffset + sheetHeight + 14;
    const bottomRaw = homeSheetStage === 'collapsed' ? bottomCollapsed : bottomSheetOn;
    const bottom = Math.round(Math.min(windowHeight * 0.62, Math.max(112, bottomRaw)));
    const side = Math.round(Math.max(10, Math.min(28, gutter + 4)));
    return { top, bottom, left: side, right: side };
  }, [
    insets.top,
    insets.bottom,
    gutter,
    floatingNavHeight,
    homeSheetStage,
    sheetBottomOffset,
    sheetHeight,
    windowHeight,
  ]);

  const setHomeSheetStageAnimated = useCallback((next: HomeSheetStage) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(320, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
    setHomeSheetStage(next);
  }, []);

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
        title?: string;
        subtitle?: string;
        kind?: string;
      };
      if (data.type === 'previewListing' && data.id && (data.catalog === 'bnb' || data.catalog === 'house')) {
        setHomeListingPreview({ catalog: data.catalog, id: String(data.id) });
        return;
      }
      if (data.type === 'exploreSelectArticle' && data.id) {
        const art = EXPLORE_ARTICLES.find((a) => a.id === data.id);
        if (!art) return;
        setActiveTab('explore');
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
          setSelectedBnbId(data.id);
          setSelectedHouseId(null);
          setListingCatalog('bnb');
          setListingDetail({ kind: 'bnb', id: data.id });
        } else {
          setActiveService('houses');
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
      if (data.type === 'openValetFromStation' && data.id) {
        setLaundryStationId(data.id);
        setActiveService('laundry');
        setActiveTab('home');
        setHomeSheetStageAnimated('mid');
        setServicePhase((prev) => ({ ...prev, laundry: 'selecting' }));
        return;
      }
      if (data.type === 'laundryStation' && data.id) {
        setLaundryStationId(data.id);
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
  ]);

  const homeDockCue = useMemo(() => {
    switch (activeService) {
      case 'rides':
        return 'Ride & route';
      case 'laundry':
        return 'Valet';
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
  const nearbyHouses = HOUSE_LISTINGS.filter(
    (house) => house.county === currentCounty && house.distanceKm <= houseProximityKm,
  );
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
  const unifiedHomeMapHtml = useMemo(() => {
    if (!MAPBOX_ACCESS_TOKEN) return null;
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
    return buildUnifiedHomeServicesMapHtml(
      MAPBOX_ACCESS_TOKEN,
      theme.mapStyleId,
      { laundry: laundryPins, bnbs: bnbPins, houses: housePins },
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
    nearbyStations,
    nearbyBnbs,
    nearbyHouses,
    currentCoords,
    homeMapCameraPad,
  ]);

  const injectHomeMapSync = useCallback(() => {
    const wv = homeMainMapRef.current;
    if (!wv || activeService === 'rides' || !MAPBOX_ACCESS_TOKEN || !unifiedHomeMapHtml) return;
    const mode = activeService === 'laundry' ? 'laundry' : activeService === 'bnbs' ? 'bnbs' : 'houses';
    const hl = laundryMapHighlight;
    const hlJs =
      hl != null
        ? `if(window.juaSetHighlight)window.juaSetHighlight(${hl.longitude},${hl.latitude});`
        : 'if(window.juaSetHighlight)window.juaSetHighlight(null,null);';
    wv.injectJavaScript(
      `setTimeout(function(){try{if(window.juaApplyHomeMode)window.juaApplyHomeMode(${JSON.stringify(
        mode,
      )});${hlJs}}catch(e){}},80);true;`,
    );
  }, [activeService, MAPBOX_ACCESS_TOKEN, unifiedHomeMapHtml, laundryMapHighlight]);

  useEffect(() => {
    injectHomeMapSync();
  }, [injectHomeMapSync]);

  const guidanceMapHtml = useMemo(() => {
    if (!MAPBOX_ACCESS_TOKEN || !currentCoords || !guidedJourney) return null;
    return buildGuidanceMapHtml(
      MAPBOX_ACCESS_TOKEN,
      theme.mapStyleId,
      currentCoords,
      guidedJourney.end,
      guidedJourney.title,
      guidedJourney.subtitle,
    );
  }, [MAPBOX_ACCESS_TOKEN, theme.mapStyleId, currentCoords, guidedJourney]);

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

  const fetchCurrentLocation = async () => {
    setLocationLoading(true);
    setLocationError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied. Enable it to book from your exact location.');
        setCurrentLocationLabel('Location unavailable');
        setCurrentPickupLocation('Location unavailable');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setCurrentCoords(coords);

      const countyFromCoords = detectCountyFromCoords(coords);
      if (countyFromCoords) setCurrentCounty(countyFromCoords);

      if (!MAPBOX_ACCESS_TOKEN) {
        const preciseCoords = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
        const displayName = summarizeLocationFromCoords(coords, countyFromCoords || currentCounty);
        setCurrentLocationLabel(displayName);
        setCurrentPickupLocation(preciseCoords);
        return;
      }

      const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.longitude},${coords.latitude}.json?types=address,locality,place,district,region&limit=5&access_token=${MAPBOX_ACCESS_TOKEN}`;
      const geocodeResponse = await fetch(geocodeUrl);
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
      if (detectedFromText) {
        setCurrentCounty(detectedFromText);
      } else if (countyFromCoords) {
        setCurrentCounty(countyFromCoords);
      }
      const preciseCoords = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
      const preciseLocation = placeName ? `${placeName} (${preciseCoords})` : preciseCoords;
      const displayName = placeName
        ? toReadableLocationName(placeName)
        : summarizeLocationFromCoords(coords, detectedFromText || countyFromCoords || currentCounty);
      setCurrentLocationLabel(displayName);
      setCurrentPickupLocation(preciseLocation);
    } catch {
      setLocationError('Unable to retrieve your location right now.');
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
    rememberRecentSearch(suggestion);
    Keyboard.dismiss();
    setBookingMessage('');
  };

  useEffect(() => {
    fetchCurrentLocation();
  }, []);

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
    setHomeSheetStage('collapsed');
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
    if (activeTab !== 'explore') {
      setExploreSheetStage('collapsed');
      setSelectedExploreCard(null);
      setExploreLens('discover');
    }
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
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
    <script>
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
    return null;
  }

  const renderSplash = () => (
    <View style={styles.splashWrap}>
      <View style={styles.logoBox}>
        <Text style={styles.logoGlyph}>◌</Text>
      </View>
      <Text style={styles.splashTitle}>Jua X</Text>
      <Text style={styles.splashSub}>Powered by Jua Fua laundry and city services</Text>
      <TouchableOpacity style={styles.splashButton} onPress={() => setScreen('signin')} activeOpacity={0.9}>
        <Text style={styles.splashButtonLabel}>Experience Convenience</Text>
        <View style={styles.splashButtonIconWrap}>
          <Text style={styles.splashButtonIcon}>→</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderSignIn = () => (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>Sign up with your email or phone number</Text>
      <View style={styles.inputMock}>
        <Text style={styles.inputText}>Name</Text>
      </View>
      <View style={styles.inputMock}>
        <Text style={styles.inputText}>Email</Text>
      </View>
      <View style={styles.inputMock}>
        <Text style={styles.inputText}>+880 Your mobile number</Text>
      </View>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => {
          setIsAuthed(true);
          setActiveTab('home');
        }}
        activeOpacity={0.88}
      >
        <Text style={styles.primaryLabel}>Sign Up</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHome = () => {
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

    const searchPlaceholder = activeService === 'rides' ? 'Where to, Jua?' : 'Search Jua services…';
    const stayCardW = Math.min(272, Math.max(220, Math.round(windowWidth * 0.72)));
    const listingCarouselW = Math.min(Math.max(280, windowWidth - 40), windowWidth - 24);
    const listingPreviewEntity =
      !homeListingPreview
        ? null
        : homeListingPreview.catalog === 'bnb'
          ? (BNB_LISTINGS.find((b) => b.id === homeListingPreview.id) ?? null)
          : (HOUSE_LISTINGS.find((h) => h.id === homeListingPreview.id) ?? null);

    const sheetInner = (() => {
      switch (activeService) {
        case 'rides':
          return (
            <>
              {destinationSuggestions.length > 0 ? (
                <View style={styles.juxSuggestions}>
                  {destinationSuggestions.map((suggestion, si) => (
                    <TouchableOpacity
                      key={suggestion.id}
                      style={[
                        styles.juxSuggestionRow,
                        si === destinationSuggestions.length - 1 && styles.juxSuggestionRowLast,
                      ]}
                      onPress={() => selectSuggestion(suggestion)}
                      activeOpacity={0.86}
                    >
                      <Text style={styles.juxSuggestionTitle}>{suggestion.name}</Text>
                      <Text style={styles.juxSuggestionSub} numberOfLines={1}>
                        {suggestion.subtitle}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <Text style={styles.juxSheetTitle}>Ride</Text>
              <Text style={styles.valetSheetTag}>Jua X</Text>
              <Text style={styles.valetSheetLead}>Drop-off, tier, and fare stay in one glance.</Text>
              <View style={[styles.juxSectionRow, styles.valetSectionLabelSpaced]}>
                <Text style={styles.juxSectionLabel}>Destination</Text>
                <Text style={styles.juxSectionMeta}>
                  {routeLoading ? '…' : routeDurationMin != null ? `${routeDurationMin} min` : '—'}
                </Text>
              </View>
              <Text style={styles.valetAddress}>{selectedDestination.name}</Text>
              <Text style={styles.valetMeta} numberOfLines={2}>
                {selectedDestination.subtitle}
              </Text>
              <Text style={[styles.juxSectionLabel, styles.valetSectionLabelSpaced]}>Tier</Text>
              <View style={styles.valetStationList}>
                {RIDE_OPTIONS.map((ride, idx) => {
                  const active = ride.id === selectedRideId;
                  const fare =
                    routeDistanceKm !== null
                      ? Math.max(8, Math.round((3.2 + routeDistanceKm * 1.1) * ride.multiplier))
                      : null;
                  return (
                    <Pressable
                      key={ride.id}
                      style={[
                        styles.valetStationRow,
                        idx === RIDE_OPTIONS.length - 1 && styles.valetStationRowLast,
                        active && styles.valetStationRowSelected,
                      ]}
                      onPress={() => {
                        setSelectedRideId(ride.id);
                        setPhaseForService('rides', 'selecting');
                      }}
                    >
                      <View style={styles.valetStationRowText}>
                        <Text style={[styles.valetStationName, active && styles.valetStationNameOn]} numberOfLines={1}>
                          {ride.label}
                        </Text>
                        <Text style={styles.valetStationSub} numberOfLines={1}>
                          {fare !== null ? `$${fare}` : '—'} · {ride.minutes} min pickup
                        </Text>
                      </View>
                      {active ? <Text style={styles.valetStationCheck}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.valetEstimateBar}>
                <Text style={styles.valetEstimateLabel}>Fare preview</Text>
                <Text style={styles.valetEstimateAmount}>
                  {estimatedFare !== null ? `$${estimatedFare}` : '—'}
                </Text>
              </View>
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
              <TouchableOpacity
                style={[styles.mapActionPrimary, styles.valetConfirmBtn]}
                onPress={() => {
                  const bits = [
                    `${selectedRide.label} • ${selectedDestination.name}${routeDurationMin ? ` • ${routeDurationMin} min` : ''}`,
                  ];
                  if (ridePlannerLuggage) bits.push('luggage');
                  if (ridePlannerMeetAssist) bits.push('meet & assist');
                  if (ridePlannerStop.trim()) bits.push(`via ${ridePlannerStop.trim()}`);
                  const tripSummary = bits.join(' · ');
                  setTripFeed((previous) => [tripSummary, ...previous].slice(0, 10));
                  setBookingMessage(`Booked ${tripSummary}`);
                  setPhaseForService('rides', 'confirmed');
                  setTripStarted(true);
                  setActiveTab('trips');
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.mapActionPrimaryText}>Confirm ride</Text>
              </TouchableOpacity>
            </>
          );
        case 'laundry': {
          const laundryEstimateKes =
            laundryMeasureMode === 'kg' ? laundryQuantity * LAUNDRY_KES_PER_KG : laundryItemCount * LAUNDRY_KES_PER_ITEM;
          const loadSummary =
            laundryMeasureMode === 'kg' ? `${laundryQuantity} kg` : `${laundryItemCount} tagged items`;
          const stationMode = laundryStationId !== null;
          const stForNav = laundryStationId ? PICKUP_STATIONS.find((s) => s.id === laundryStationId) : null;
          return (
            <>
              <Text style={styles.juxSheetTitle}>Valet</Text>
              <Text style={styles.valetSheetTag}>Jua Fua</Text>
              <Text style={styles.valetSheetLead}>Pickup, then load. Map and sheet stay in sync.</Text>
              <Pressable
                style={styles.homeDeepEntryRow}
                onPress={() => {
                  setHomeSheetStageAnimated('collapsed');
                  setHomeDeepPage('valet-studio');
                }}
              >
                <Text style={styles.homeDeepEntryTitle}>Valet studio ›</Text>
                <Text style={styles.homeDeepEntrySub}>Mama fua at home · schedule · special notes</Text>
              </Pressable>
              <Text style={[styles.juxSectionLabel, styles.valetSectionLabelSpaced]}>Pickup</Text>
              <View style={styles.valetSegmentTrack}>
                <Pressable
                  style={[styles.valetSegment, !stationMode && styles.valetSegmentActive]}
                  onPress={() => setLaundryStationId(null)}
                >
                  <Text style={[styles.valetSegmentText, !stationMode && styles.valetSegmentTextActive]}>My location</Text>
                </Pressable>
                <View style={styles.valetSegmentDivider} />
                <Pressable
                  style={[styles.valetSegment, stationMode && styles.valetSegmentActive]}
                  disabled={nearbyStations.length === 0}
                  onPress={() => {
                    if (nearbyStations.length === 0) return;
                    const currentOk = laundryStationId && nearbyStations.some((s) => s.id === laundryStationId);
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
                <View style={styles.valetPickupBlock}>
                  <Text style={styles.valetAddress} numberOfLines={2}>
                    {currentLocationLabel}
                  </Text>
                  <Text style={styles.valetMeta}>Door service · collect and return here</Text>
                  <Text style={styles.valetFinePrint}>
                    After you confirm, we will share a pickup window for this address.
                  </Text>
                </View>
              ) : nearbyStations.length > 0 ? (
                <View style={styles.valetStationList}>
                  {nearbyStations.map((st, idx) => {
                    const km =
                      currentCoords != null
                        ? Math.max(0.1, Math.round(getDistanceKm(currentCoords, st.coords) * 10) / 10)
                        : null;
                    const on = laundryStationId === st.id;
                    return (
                      <Pressable
                        key={st.id}
                        onPress={() => setLaundryStationId(st.id)}
                        style={[
                          styles.valetStationRow,
                          idx === nearbyStations.length - 1 && styles.valetStationRowLast,
                          on && styles.valetStationRowSelected,
                        ]}
                      >
                        <View style={styles.valetStationRowText}>
                          <Text style={[styles.valetStationName, on && styles.valetStationNameOn]} numberOfLines={1}>
                            {st.name}
                          </Text>
                          <Text style={styles.valetStationSub} numberOfLines={1}>
                            {st.subtitle}
                            {km != null ? ` · ${km} km` : ''}
                          </Text>
                        </View>
                        {on ? <Text style={styles.valetStationCheck}>✓</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.juxHintMuted}>No stations in range for this map view.</Text>
              )}
              <View style={[styles.juxSectionRow, styles.valetSectionLabelSpaced]}>
                <Text style={styles.juxSectionLabel}>Load</Text>
              </View>
              <View style={styles.valetSegmentTrack}>
                <Pressable
                  style={[styles.valetSegment, laundryMeasureMode === 'kg' && styles.valetSegmentActive]}
                  onPress={() => setLaundryMeasureMode('kg')}
                >
                  <Text style={[styles.valetSegmentText, laundryMeasureMode === 'kg' && styles.valetSegmentTextActive]}>
                    By weight
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
                    By item
                  </Text>
                </Pressable>
              </View>
              {laundryMeasureMode === 'kg' ? (
                <View style={styles.valetStepper}>
                  <Pressable style={styles.valetStepperBtn} onPress={() => setLaundryQuantity((q) => Math.max(1, q - 1))}>
                    <Text style={styles.valetStepperBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.valetStepperValue}>{laundryQuantity} kg</Text>
                  <Pressable style={styles.valetStepperBtn} onPress={() => setLaundryQuantity((q) => Math.min(30, q + 1))}>
                    <Text style={styles.valetStepperBtnText}>+</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.valetStepper}>
                  <Pressable style={styles.valetStepperBtn} onPress={() => setLaundryItemCount((n) => Math.max(1, n - 1))}>
                    <Text style={styles.valetStepperBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.valetStepperValue}>{laundryItemCount} items</Text>
                  <Pressable style={styles.valetStepperBtn} onPress={() => setLaundryItemCount((n) => Math.min(45, n + 1))}>
                    <Text style={styles.valetStepperBtnText}>+</Text>
                  </Pressable>
                </View>
              )}
              <View style={styles.valetEstimateBar}>
                <Text style={styles.valetEstimateLabel}>Estimate</Text>
                <Text style={styles.valetEstimateAmount}>KES {laundryEstimateKes}</Text>
              </View>
              {stForNav ? (
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
                      end: stForNav.coords,
                      title: stForNav.name,
                      subtitle: `${stForNav.subtitle} · valet drop-off`,
                      kind: 'station',
                    });
                  }}
                  style={styles.textRowActionHit}
                >
                  <Text style={styles.textRowAction}>Live route to station</Text>
                </Pressable>
              ) : null}
              <TouchableOpacity
                style={[styles.mapActionPrimary, styles.valetConfirmBtn]}
                onPress={() => {
                  const station = laundryStationId ? PICKUP_STATIONS.find((s) => s.id === laundryStationId) : null;
                  const where = station ? station.name : 'Your location';
                  const extra = [
                    valetMamaFuaHome ? 'mama fua at home' : null,
                    valetStudioWhen !== 'asap' ? valetStudioWhen : null,
                    valetStudioNotes.trim() ? `notes: ${valetStudioNotes.trim()}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  const request = `Jua Fua • ${where} • ${loadSummary} • KES ${laundryEstimateKes}${extra ? ` · ${extra}` : ''}`;
                  setTripFeed((prev) => [request, ...prev].slice(0, 10));
                  setBookingMessage(request);
                  setPhaseForService('laundry', 'confirmed');
                  setActiveTab('trips');
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.mapActionPrimaryText}>Confirm request</Text>
              </TouchableOpacity>
            </>
          );
        }
        case 'bnbs':
          return (
            <>
              <View style={styles.juxSectionRow}>
                <Text style={styles.juxSectionLabel}>Featured</Text>
                <Pressable
                  onPress={() => {
                    setActiveTab('explore');
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.juxSeeAll}>Explore tab</Text>
                </Pressable>
              </View>
              <Text style={styles.juxSheetTitle}>Stays</Text>
              <Text style={styles.valetSheetTag}>{currentCounty}</Text>
              <Text style={styles.valetSheetLead}>
                {nearbyBnbs.length
                  ? `A curated row of ${Math.min(FEATURED_STAYS_HOME, nearbyBnbs.length)} near you.`
                  : `Nothing listed in ${currentCounty} yet.`}
              </Text>
              {featuredBnbs.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.juxStayCarousel}
                  decelerationRate="fast"
                  snapToInterval={stayCardW + 10}
                >
                  {featuredBnbs.map((bnb) => {
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
              ) : null}
              {nearbyBnbs.length > 0 ? (
                <Pressable
                  style={styles.homeDeepEntryRow}
                  onPress={() => {
                    setListingCatalog('bnb');
                    setListingCounty(nearbyBnbs.length > FEATURED_STAYS_HOME ? currentCounty : 'any');
                    setListingSpace('any');
                    setListingQuery('');
                    setListingDetail(null);
                    setHomeSheetStageAnimated('collapsed');
                    setHomeDeepPage('listings');
                  }}
                >
                  <Text style={styles.homeDeepEntryTitle}>
                    {nearbyBnbs.length > FEATURED_STAYS_HOME ? 'View all listings' : 'Browse catalog'} ›
                  </Text>
                  <Text style={styles.homeDeepEntrySub}>Area · stay type · search</Text>
                </Pressable>
              ) : null}
              {focusedBnb ? (
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
                    <View style={styles.juxListingTitleRow}>
                      <Text style={styles.juxListingTitle}>{focusedBnb.title}</Text>
                      <Text style={styles.juxListingRating}>{focusedBnb.rating} ★</Text>
                    </View>
                    <Text style={styles.juxListingPrice}>{focusedBnb.price}</Text>
                    <Text style={styles.juxListingDesc} numberOfLines={homeSheetStage === 'full' ? 8 : 5}>
                      {focusedBnb.exploreReason}
                    </Text>
                    {focusedBnb.detailHighlights.map((line) => (
                      <View key={line} style={styles.juxListingBulletRow}>
                        <Text style={styles.juxListingBulletGlyph}>●</Text>
                        <Text style={styles.juxListingBulletText}>{line}</Text>
                      </View>
                    ))}
                    {focusedBnb.exploreTip ? <Text style={styles.juxListingTip}>Tip: {focusedBnb.exploreTip}</Text> : null}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.juxChipRow}>
                      {focusedBnb.amenities.map((tag) => (
                        <View key={tag} style={styles.juxChip}>
                          <Text style={styles.juxChipText}>{tag}</Text>
                        </View>
                      ))}
                    </ScrollView>
                    <View style={styles.valetListingFooter}>
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
                        <Text style={styles.textRowAction}>Live route to this stay</Text>
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
                      <TouchableOpacity
                        style={[styles.mapActionPrimary, styles.valetConfirmBtn]}
                        onPress={() => {
                          const booking = `BnB booked • ${focusedBnb.title} • ${focusedBnb.price}`;
                          setTripFeed((prev) => [booking, ...prev].slice(0, 10));
                          setBookingMessage(booking);
                          setPhaseForService('bnbs', 'confirmed');
                          setActiveTab('trips');
                        }}
                        activeOpacity={0.88}
                      >
                        <Text style={styles.mapActionPrimaryText}>Reserve stay</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                <Text style={styles.juxHintMuted}>Swipe the row above and tap a stay to open details.</Text>
              )}
            </>
          );
        default:
          return (
            <>
              <View style={styles.juxSectionRow}>
                <Text style={styles.juxSectionLabel}>Rentals</Text>
                <Pressable
                  onPress={() => {
                    const opts = [...HOUSE_RADIUS_OPTIONS];
                    const i = opts.indexOf(houseProximityKm as (typeof HOUSE_RADIUS_OPTIONS)[number]);
                    const next = opts[(i >= 0 ? i + 1 : 0) % opts.length];
                    setHouseProximityKm(next);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.juxSeeAll}>Radius · {houseProximityKm} km</Text>
                </Pressable>
              </View>
              <Text style={styles.juxSheetTitle}>Homes</Text>
              <Text style={styles.valetSheetTag}>{currentCounty}</Text>
              <Text style={styles.valetSheetLead}>
                {nearbyHouses.length
                  ? `Featured rentals (${Math.min(FEATURED_STAYS_HOME, nearbyHouses.length)}).`
                  : 'Nothing in this radius — tap radius to widen.'}
              </Text>
              {featuredHouses.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.juxStayCarousel}
                  decelerationRate="fast"
                  snapToInterval={stayCardW + 10}
                >
                  {featuredHouses.map((house) => {
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
                        <Image source={house.image} style={styles.juxStayCardImage} resizeMode="cover" />
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
                  })}
                </ScrollView>
              ) : null}
              {nearbyHouses.length > 0 ? (
                <Pressable
                  style={styles.homeDeepEntryRow}
                  onPress={() => {
                    setListingCatalog('house');
                    setListingCounty(nearbyHouses.length > FEATURED_STAYS_HOME ? currentCounty : 'any');
                    setListingQuery('');
                    setListingRadiusKm(houseProximityKm as (typeof HOUSE_RADIUS_OPTIONS)[number]);
                    setListingDetail(null);
                    setHomeSheetStageAnimated('collapsed');
                    setHomeDeepPage('listings');
                  }}
                >
                  <Text style={styles.homeDeepEntryTitle}>
                    {nearbyHouses.length > FEATURED_STAYS_HOME ? 'View all rentals' : 'Browse rentals'} ›
                  </Text>
                  <Text style={styles.homeDeepEntrySub}>Area · distance cap · search</Text>
                </Pressable>
              ) : null}
              {focusedHouse ? (
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
                    <View style={styles.juxListingTitleRow}>
                      <Text style={styles.juxListingTitle}>{focusedHouse.title}</Text>
                      <Text style={styles.juxListingRating}>{focusedHouse.distanceKm} km</Text>
                    </View>
                    <Text style={styles.juxListingPrice}>{focusedHouse.price}</Text>
                    <Text style={styles.juxListingDesc} numberOfLines={homeSheetStage === 'full' ? 6 : 4}>
                      Longer stays and viewings by appointment. Verified amenities and gallery below — map shows live
                      distance from you.
                    </Text>
                    {focusedHouse.detailHighlights.map((line) => (
                      <View key={line} style={styles.juxListingBulletRow}>
                        <Text style={styles.juxListingBulletGlyph}>●</Text>
                        <Text style={styles.juxListingBulletText}>{line}</Text>
                      </View>
                    ))}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.juxChipRow}>
                      {focusedHouse.amenities.map((tag) => (
                        <View key={tag} style={styles.juxChip}>
                          <Text style={styles.juxChipText}>{tag}</Text>
                        </View>
                      ))}
                    </ScrollView>
                    <View style={styles.valetListingFooter}>
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
                        <Text style={styles.textRowAction}>Live route to this home</Text>
                      </Pressable>
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
                      <TouchableOpacity
                        style={[styles.mapActionPrimary, styles.valetConfirmBtn]}
                        onPress={() => {
                          const request = `House viewing request • ${focusedHouse.title} • ${focusedHouse.price}`;
                          setTripFeed((prev) => [request, ...prev].slice(0, 10));
                          setBookingMessage(request);
                          setPhaseForService('houses', 'confirmed');
                          setActiveTab('trips');
                        }}
                        activeOpacity={0.88}
                      >
                        <Text style={styles.mapActionPrimaryText}>Request viewing</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                <Text style={styles.juxHintMuted}>Swipe the row and tap a home to see the full sheet.</Text>
              )}
            </>
          );
      }
    })();

    return (
      <>
      <View style={[styles.juxShell, { backgroundColor: theme.canvas }]}>
        <View style={styles.juxMapLayer} pointerEvents="box-none" collapsable={false}>
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
                injectHomeMapSync();
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
          <View style={[styles.mapFabColumn, { top: insets.top + 168, bottom: undefined }]}>
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
              <Pressable style={styles.juxMenuOrb} hitSlop={8}>
                <Text style={styles.juxMenuIcon}>≡</Text>
              </Pressable>
            </View>

            <View style={styles.juxSearchPill}>
              <Text style={styles.juxSearchIcon}>⌕</Text>
              <TextInput
                value={destinationQuery}
                onChangeText={(value) => {
                  setDestinationQuery(value);
                  if (activeService === 'rides') fetchDestinationSuggestions(value);
                }}
                placeholder={searchPlaceholder}
                placeholderTextColor={theme.textSecondary}
                style={styles.juxSearchInput}
                returnKeyType="search"
                blurOnSubmit
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  setDestinationSuggestions([]);
                  if (activeService === 'rides') searchDestination();
                }}
              />
              <TouchableOpacity style={styles.juxSparkleBtn} hitSlop={6}>
                <Text style={styles.juxSparkle}>✦</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.juxPillRow}
              keyboardShouldPersistTaps="handled"
            >
              {SERVICE_TABS.map(({ key, label }) => {
                const on = activeService === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.juxServicePill, on && styles.juxServicePillOn]}
                    onPress={() => setActiveService(key)}
                  >
                    <Text style={[styles.juxServicePillText, on && styles.juxServicePillTextOn]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {homeSheetStage === 'collapsed' ? (
            <>
              {!!bookingMessage || tripStarted || !!locationError ? (
                <View
                  style={[
                    styles.juxDockNotice,
                    { bottom: insets.bottom + floatingNavHeight + 86, left: gutter, right: gutter },
                  ]}
                >
                  {!!bookingMessage ? <Text style={styles.juxDockNoticeText}>{bookingMessage}</Text> : null}
                  {tripStarted ? <Text style={styles.juxDockNoticeText}>Trip is live.</Text> : null}
                  {locationError ? <Text style={styles.juxDockNoticeError}>{locationError}</Text> : null}
                </View>
              ) : null}
              <Pressable
                style={[
                  styles.juxSheetDock,
                  { bottom: insets.bottom + floatingNavHeight + 12, left: gutter, right: gutter },
                ]}
                onPress={() => setHomeSheetStageAnimated('mid')}
                accessibilityRole="button"
                accessibilityLabel="Open Jua sheet"
              >
                <View style={styles.juxSheetDockAccent} />
                <View style={styles.juxSheetDockCopy}>
                  <Text style={styles.juxSheetDockEyebrow}>Jua X</Text>
                  <Text style={styles.juxSheetDockTitle}>{homeDockCue}</Text>
                  <Text style={styles.juxSheetDockSub}>View more</Text>
                </View>
                <Text style={styles.juxSheetDockChevron}>⌃</Text>
              </Pressable>
            </>
          ) : null}

          {homeSheetStage !== 'collapsed' ? (
            <View
              style={[
                styles.juxSheet,
                homeSheetStage === 'full' ? styles.juxSheetImmersive : styles.juxSheetMid,
                {
                  height: sheetHeight,
                  bottom: sheetBottomOffset,
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  shadowColor: '#000',
                },
              ]}
            >
              <Pressable
                style={styles.juxSheetGrabberWrap}
                onPress={() => setHomeSheetStageAnimated(homeSheetStage === 'mid' ? 'full' : 'mid')}
              >
                <View style={styles.juxSheetGrabber} />
                <Text style={styles.juxSheetPeekTitle}>
                  {homeSheetStage === 'full' ? 'Tap · mid height' : 'Tap · full screen'}
                </Text>
              </Pressable>
              <View style={styles.juxSheetChromeRow}>
                <Text style={styles.juxSheetChromeCue}>{homeDockCue}</Text>
                <Pressable onPress={() => setHomeSheetStageAnimated('collapsed')} hitSlop={12} style={styles.juxSheetMinimizeHit}>
                  <Text style={styles.juxSheetMinimize}>Map ⌄</Text>
                </Pressable>
              </View>
              {!!bookingMessage ? <Text style={styles.juxToast}>{bookingMessage}</Text> : null}
              {tripStarted ? <Text style={styles.juxToast}>Trip is live.</Text> : null}
              {locationError ? <Text style={styles.juxErrorInline}>{locationError}</Text> : null}
              <ScrollView
                style={styles.juxSheetScroll}
                contentContainerStyle={styles.juxSheetScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={false}
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
            </View>
          ) : null}

          {homeDeepPage !== null ? (
            <View
              style={[
                styles.homeDeepRoot,
                { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 16, paddingHorizontal: gutter },
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
              </View>
              {homeDeepPage === 'listings' ? (
                <ScrollView
                  style={styles.homeDeepScroll}
                  contentContainerStyle={styles.homeDeepScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.homeDeepPageTitle}>Listings</Text>
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
                        Homes
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
                        : `Listings within ${listingRadiusKm} km of your pin (BnBs and homes).`}
                  </Text>
                  <Pressable
                    style={[
                      styles.homeDeepRadiusTap,
                      (listingCounty !== 'near_me' || !currentCoords) && styles.homeDeepRadiusTapMuted,
                    ]}
                    onPress={() => {
                      const opts = [...HOUSE_RADIUS_OPTIONS];
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
                          setListingDetail({ kind: 'bnb', id });
                        } else {
                          const id = (row as HouseListing).id;
                          setSelectedHouseId(id);
                          setSelectedBnbId(null);
                          setActiveService('houses');
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
              ) : homeDeepPage === 'listing-detail' && listingDetail && listingDetailEntity ? (
                <ScrollView
                  ref={listingDetailScrollRef}
                  style={styles.homeDeepScroll}
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
                        <View style={styles.valetListingFooter}>
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
                            <Text style={styles.textRowAction}>Live route to this stay</Text>
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
                          <TouchableOpacity
                            style={[styles.mapActionPrimary, styles.valetConfirmBtn]}
                            onPress={() => {
                              const b = listingDetailEntity as BnbListing;
                              const booking = `BnB booked • ${b.title} • ${b.price}`;
                              setTripFeed((prev) => [booking, ...prev].slice(0, 10));
                              setBookingMessage(booking);
                              setPhaseForService('bnbs', 'confirmed');
                              setActiveTab('trips');
                            }}
                            activeOpacity={0.88}
                          >
                            <Text style={styles.mapActionPrimaryText}>Reserve stay</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.mapActionPrimary, styles.valetConfirmBtn, { marginTop: 10 }]}
                            onPress={() => {
                              const b = listingDetailEntity as BnbListing;
                              const booking = `Viewing request • ${b.title} • ${b.price}`;
                              setTripFeed((prev) => [booking, ...prev].slice(0, 10));
                              setBookingMessage(booking);
                              setPhaseForService('bnbs', 'confirmed');
                              setActiveTab('trips');
                            }}
                            activeOpacity={0.88}
                          >
                            <Text style={styles.mapActionPrimaryText}>Request physical viewing</Text>
                          </TouchableOpacity>
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
                        <View style={styles.valetListingFooter}>
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
                            <Text style={styles.textRowAction}>Live route to this home</Text>
                          </Pressable>
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
                          <TouchableOpacity
                            style={[styles.mapActionPrimary, styles.valetConfirmBtn]}
                            onPress={() => {
                              const h = listingDetailEntity as HouseListing;
                              const request = `House viewing request • ${h.title} • ${h.price}`;
                              setTripFeed((prev) => [request, ...prev].slice(0, 10));
                              setBookingMessage(request);
                              setPhaseForService('houses', 'confirmed');
                              setActiveTab('trips');
                            }}
                            activeOpacity={0.88}
                          >
                            <Text style={styles.mapActionPrimaryText}>Request physical viewing</Text>
                          </TouchableOpacity>
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
                  style={styles.homeDeepScroll}
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
                  <TouchableOpacity
                    style={[styles.mapActionPrimary, styles.valetConfirmBtn]}
                    onPress={() => {
                      setBookingMessage('Valet studio preferences saved — review the sheet and confirm.');
                      setHomeDeepPage(null);
                      setListingDetail(null);
                      setHomeSheetStageAnimated('mid');
                    }}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.mapActionPrimaryText}>Save & return to sheet</Text>
                  </TouchableOpacity>
                </ScrollView>
              ) : (
                <ScrollView
                  style={styles.homeDeepScroll}
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
                  <TouchableOpacity
                    style={[styles.mapActionPrimary, styles.valetConfirmBtn]}
                    onPress={() => {
                      setHomeDeepPage(null);
                      setListingDetail(null);
                      setActiveService('rides');
                      setHomeSheetStageAnimated('mid');
                    }}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.mapActionPrimaryText}>Done · back to ride sheet</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          ) : null}
      </View>
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
                  setSelectedBnbId(id);
                  setSelectedHouseId(null);
                  setListingCatalog('bnb');
                  setListingDetail({ kind: 'bnb', id });
                } else {
                  setActiveService('houses');
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
    const exploreSheetBottomOffset =
      exploreSheetStage === 'full' ? Math.max(insets.bottom, 10) + 6 : insets.bottom + floatingNavHeight + 12;
    const exploreSheetHeight = exploreSheetStage === 'collapsed' ? 0 : exploreSheetStage === 'mid' ? sheetMidH : sheetFullH;
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
        onPress={() => setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'))}
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
            <Text style={styles.settingSubtitle}>Theme: {themeMode === 'light' ? 'Light' : 'Dark'}</Text>
          </View>
        </View>
        <Text style={styles.settingAction}>Change</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCurrent = () => {
    if (!isAuthed) {
      if (screen === 'splash') return renderSplash();
      return renderSignIn();
    }
    if (activeTab === 'home') return renderHome();
    if (activeTab === 'explore') return renderExplore();
    if (activeTab === 'trips') return renderTrips();
    if (activeTab === 'inbox') return renderInbox();
    return renderProfile();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
      {renderCurrent()}

      {showMainTabBar && (
        <View style={[styles.tabBar, { bottom: Math.max(insets.bottom, 10) + 4 }]}>
          {MAIN_TAB_CONFIG.map(({ key, label, icon }) => {
            const active = activeTab === key;
            return (
              <TouchableOpacity key={key} onPress={() => setActiveTab(key)} style={styles.tabItem} activeOpacity={0.85}>
                <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{icon}</Text>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
                {active ? <View style={styles.tabActiveDot} /> : <View style={styles.tabActiveDotPlaceholder} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <Modal
        visible={guidedJourney !== null && guidanceMapHtml !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setGuidedJourney(null)}
      >
        <View style={styles.journeyModalRoot}>
          <View style={[styles.journeyModalTopBar, { paddingTop: insets.top + 8, paddingHorizontal: gutter }]}>
            <Text style={styles.journeyModalEyebrow}>Live route</Text>
            <Pressable style={styles.tourCloseFab} onPress={() => setGuidedJourney(null)} hitSlop={14}>
              <Text style={styles.tourCloseFabText}>Close</Text>
            </Pressable>
          </View>
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
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    container: {
      flex: 1,
      backgroundColor: theme.background,
      paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) + 8 : 8,
      paddingBottom: Platform.OS === 'android' ? 12 : 0,
      paddingHorizontal: 0,
    },
    splashWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    logoBox: {
      width: 84,
      height: 84,
      borderRadius: 24,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    logoGlyph: {
      fontSize: 40,
      color: theme.textPrimary,
      lineHeight: 42,
    },
    splashTitle: {
      fontSize: 38,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
    },
    splashSub: {
      color: theme.textSecondary,
      fontSize: 14,
      marginBottom: 20,
      fontFamily: 'Inter_400Regular',
    },
    splashButton: {
      marginTop: 6,
      minHeight: 54,
      paddingLeft: 20,
      paddingRight: 10,
      borderRadius: 14,
      backgroundColor: theme.accent,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    splashButtonLabel: {
      color: theme.accentText,
      fontFamily: 'Inter_700Bold',
      fontSize: 16,
      letterSpacing: 0.2,
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
      backgroundColor: theme.accent,
      justifyContent: 'center',
    },
    primaryLabel: {
      color: theme.accentText,
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
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
      backgroundColor: theme.accent,
    },
    mapActionPrimaryText: {
      color: theme.accentText,
      fontSize: 13,
      fontFamily: 'Inter_700Bold',
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
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(17,17,17,0.86)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    mapControlLabel: {
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
      fontSize: 17,
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
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
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
      backgroundColor: theme.accent,
      borderColor: theme.accent,
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
      paddingBottom: 6,
    },
    juxSheetGrabber: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
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
      paddingBottom: 18,
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
      color: theme.accentBlue,
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
      backgroundColor: theme.mutedSurface,
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
      color: theme.textPrimary,
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
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    valetStationRowLast: {
      borderBottomWidth: 0,
    },
    valetStationRowSelected: {
      backgroundColor: 'transparent',
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
      color: theme.accentBlue,
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
      backgroundColor: '#020617',
    },
    journeyModalTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 8,
      zIndex: 2,
    },
    journeyModalEyebrow: {
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.75)',
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
      borderColor: theme.accentBlue,
      borderWidth: 1,
    },
    juxStayCardImage: {
      width: '100%',
      height: 112,
      backgroundColor: theme.border,
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
    },
    homeDeepHeader: {
      marginBottom: 8,
    },
    homeDeepBack: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: theme.accentBlue,
    },
    homeDeepScroll: {
      flex: 1,
    },
    homeDeepScrollContent: {
      paddingBottom: 32,
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
      alignSelf: 'center',
      width: '92%',
      maxWidth: 420,
      borderRadius: 28,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'stretch',
      paddingHorizontal: 4,
      paddingTop: 8,
      paddingBottom: 10,
      zIndex: 80,
      elevation: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 28,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 2,
    },
    tabIcon: {
      fontSize: 19,
      color: theme.textMuted,
      marginBottom: 2,
    },
    tabIconActive: {
      color: theme.accentBlue,
    },
    tabLabel: {
      fontSize: 10,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 0.2,
    },
    tabLabelActive: {
      color: theme.textPrimary,
    },
    tabActiveDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.accentBlue,
      marginTop: 4,
    },
    tabActiveDotPlaceholder: {
      width: 4,
      height: 4,
      marginTop: 4,
      opacity: 0,
    },
  });
