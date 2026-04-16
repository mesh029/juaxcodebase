import { StatusBar } from 'expo-status-bar';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  ActivityIndicator,
  Dimensions,
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
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type HomeSheetStage = 'collapsed' | 'mid' | 'full';

type Screen = 'splash' | 'signin';
type MainTab = 'home' | 'explore' | 'trips' | 'inbox' | 'profile';

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
type PlaceStation = { id: string; name: string; subtitle: string; county: CountyKey; coords: Coordinates };
type HouseListing = {
  id: string;
  title: string;
  county: CountyKey;
  coords: Coordinates;
  distanceKm: number;
  price: string;
  image: any;
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
  coords: Coordinates;
  exploreReason: string;
  exploreTip?: string;
  beds: number;
  guests: number;
  amenities: string[];
  has3dTour: boolean;
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

const buildInteractivePointsMapHtml = (
  token: string,
  styleId: string,
  points: Array<{ id: string; title: string; subtitle: string; coords: Coordinates }>,
  current: Coordinates | null,
) => {
  if (!token) return null;
  const payload = {
    current,
    points: points.slice(0, 12).map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle,
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
      const center = DATA.current
        ? [DATA.current.longitude, DATA.current.latitude]
        : (DATA.points[0] ? DATA.points[0].coords : fallbackCenter);
      const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/${styleId}',
        center,
        zoom: 10.5,
        touchPitch: false,
        dragRotate: false,
      });
      map.touchZoomRotate.enable();
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new mapboxgl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
      map.on('load', function () {
        const features = DATA.points.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: p.coords },
          properties: { id: p.id, title: p.title, subtitle: p.subtitle }
        }));
        map.addSource('pins', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.addLayer({
          id: 'pins-circle',
          type: 'circle',
          source: 'pins',
          paint: {
            'circle-radius': 10,
            'circle-color': '#3B82F6',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });
        if (DATA.current) {
          new mapboxgl.Marker({ color: '#16A34A' })
            .setLngLat([DATA.current.longitude, DATA.current.latitude])
            .addTo(map);
        }
        if (features.length > 1 || (features.length && DATA.current)) {
          const b = new mapboxgl.LngLatBounds();
          if (DATA.current) b.extend([DATA.current.longitude, DATA.current.latitude]);
          features.forEach((f) => b.extend(f.geometry.coordinates));
          map.fitBounds(b, { padding: 38, maxZoom: 12.5, duration: 0 });
        }
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
          btn.textContent = DATA.current ? 'Show directions' : 'Enable location for directions';
          btn.disabled = !DATA.current;
          btn.onclick = async function () {
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
          wrap.appendChild(btn);
          pop.setDOMContent(wrap).addTo(map);
        });
        map.on('mouseenter', 'pins-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'pins-circle', () => { map.getCanvas().style.cursor = ''; });
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

const DESTINATIONS: Destination[] = [
  {
    id: 'nairobi',
    name: 'Nairobi',
    subtitle: 'Nairobi CBD, Kenya',
    coords: { latitude: -1.2864, longitude: 36.8172 },
    county: 'nairobi',
    image: require('./template/Preview 5.png'),
    exploreReason: 'East Africa’s business and culture hub — galleries, food, and Karura Forest escapes.',
    exploreTip: 'Best for city breaks, meetings, and safari stopovers.',
  },
  {
    id: 'mombasa',
    name: 'Mombasa',
    subtitle: 'Mombasa, Kenya',
    coords: { latitude: -4.0435, longitude: 39.6682 },
    county: 'mombasa',
    image: require('./template/Preview 6.png'),
    exploreReason: 'Swahili coast history plus Indian Ocean beaches and island day trips.',
    exploreTip: 'Ideal for sun, seafood, and Old Town architecture.',
  },
  {
    id: 'kisumu',
    name: 'Kisumu',
    subtitle: 'Kisumu, Kenya',
    coords: { latitude: -0.0917, longitude: 34.768 },
    county: 'kisumu',
    image: require('./template/Preview 1.jpg'),
    exploreReason: 'Lakeside sunsets on Lake Victoria and a relaxed Nyanza vibe.',
    exploreTip: 'Great for weekend resets and fish dishes by the water.',
  },
  {
    id: 'nyamira-town',
    name: 'Nyamira Town',
    subtitle: 'Nyamira County HQ, Kenya',
    coords: { latitude: -0.5669, longitude: 34.9341 },
    county: 'nyamira',
    image: require('./template/Preview 5.png'),
    exploreReason: 'County center with markets, tea highlands, and easy links to Kisii and Keroka.',
    exploreTip: 'Great base for short county trips and local food stops.',
  },
  {
    id: 'keroka',
    name: 'Keroka',
    subtitle: 'Keroka, Nyamira County',
    coords: { latitude: -0.7758, longitude: 34.9453 },
    county: 'nyamira',
    image: require('./template/Preview 6.png'),
    exploreReason: 'Busy transit town with produce markets and highway-side eateries.',
    exploreTip: 'Best for stopovers and local market shopping.',
  },
  {
    id: 'manga-hills',
    name: 'Manga Hills',
    subtitle: 'Manga Ridge, Nyamira/Kisii',
    coords: { latitude: -0.6805, longitude: 34.8712 },
    county: 'nyamira',
    image: require('./template/Preview 1-1.jpg'),
    exploreReason: 'High-altitude viewpoints over Gusii highlands and scenic ridge walks.',
    exploreTip: 'Morning visits give the clearest valley views.',
  },
  {
    id: 'paris',
    name: 'Paris',
    subtitle: 'Charles de Gaulle Airport',
    coords: { latitude: 48.8566, longitude: 2.3522 },
    image: require('./template/Preview 1.jpg'),
    exploreReason: 'Art, cafés, and iconic boulevards — a classic city break.',
    exploreTip: 'Pair museums with evening walks along the Seine.',
  },
  {
    id: 'dubai',
    name: 'Dubai',
    subtitle: 'Downtown / Burj Area',
    coords: { latitude: 25.2048, longitude: 55.2708 },
    image: require('./template/Preview 1-1.jpg'),
    exploreReason: 'Desert modernity: skyline views, malls, and beach clubs.',
    exploreTip: 'Mix a desert safari with waterfront dining.',
  },
  {
    id: 'accra',
    name: 'Accra',
    subtitle: 'Kotoka International',
    coords: { latitude: 5.6037, longitude: -0.187 },
    image: require('./template/Preview 6.png'),
    exploreReason: 'West African energy — markets, music, and Atlantic beaches.',
    exploreTip: 'Try Jamestown walks and fresh grilled tilapia by the coast.',
  },
];

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
    image: require('./template/Preview 5.png'),
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
    image: require('./template/Preview 6.png'),
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
    image: require('./template/Preview 1.jpg'),
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
    image: require('./template/Preview 1-1.jpg'),
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
    image: require('./template/Preview 5.png'),
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
    image: require('./template/Preview 6.png'),
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
    image: require('./template/Preview 1.jpg'),
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
    image: require('./template/Preview 1-1.jpg'),
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
    image: require('./template/Preview 6.png'),
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
    image: require('./template/Preview 5.png'),
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
    image: require('./template/Preview 1.jpg'),
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
    image: require('./template/Preview 1-1.jpg'),
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
  const [tripFeed, setTripFeed] = useState<string[]>([]);
  const [laundryQuantity, setLaundryQuantity] = useState(4);
  /** null = door-to-door at your address; otherwise pickup & return at that station */
  const [laundryStationId, setLaundryStationId] = useState<string | null>(null);
  const [houseProximityKm, setHouseProximityKm] = useState(8);
  const [exploreScope, setExploreScope] = useState<'nearby' | 'everywhere'>('nearby');
  const [exploreRouteTarget, setExploreRouteTarget] = useState<Coordinates | null>(null);
  const [selectedExploreCard, setSelectedExploreCard] = useState<{
    kind: 'destination' | 'bnb';
    title: string;
    subtitle: string;
    reason: string;
    tip?: string;
    coords: Coordinates;
  } | null>(null);
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
  const [homeSheetStage, setHomeSheetStage] = useState<HomeSheetStage>('collapsed');
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const theme = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const gutter = Math.min(24, Math.max(14, Math.round(windowWidth * 0.042)));
  const floatingNavHeight = Math.min(64, Math.max(52, Math.round(windowHeight * 0.072)));
  const sheetMidH = Math.max(268, Math.round(windowHeight * 0.44));
  const sheetFullH = Math.max(420, Math.round(windowHeight * 0.91));
  const hideTabBarForHomeSheet = activeTab === 'home' && homeSheetStage === 'full';
  const showMainTabBar = isAuthed && !hideTabBarForHomeSheet;
  const sheetBottomOffset = hideTabBarForHomeSheet
    ? Math.max(insets.bottom, 10) + 6
    : insets.bottom + floatingNavHeight + 12;
  const sheetHeight = homeSheetStage === 'collapsed' ? 0 : homeSheetStage === 'mid' ? sheetMidH : sheetFullH;

  const setHomeSheetStageAnimated = useCallback((next: HomeSheetStage) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(320, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
    setHomeSheetStage(next);
  }, []);

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
  const exploreBnbs = exploreScope === 'everywhere' ? BNB_LISTINGS : nearbyBnbs;
  const estimatedFare =
    routeDistanceKm !== null
      ? Math.max(8, Math.round((3.2 + routeDistanceKm * 1.1) * selectedRide.multiplier))
      : null;
  const laundryMapHtml = useMemo(
    () =>
      buildInteractivePointsMapHtml(
        MAPBOX_ACCESS_TOKEN,
        theme.mapStyleId,
        nearbyStations.map((s) => ({
          id: s.id,
          title: s.name,
          subtitle: s.subtitle,
          coords: s.coords,
        })),
        currentCoords,
      ),
    [MAPBOX_ACCESS_TOKEN, theme.mapStyleId, nearbyStations, currentCoords],
  );
  const bnbMapHtml = useMemo(
    () =>
      buildInteractivePointsMapHtml(
        MAPBOX_ACCESS_TOKEN,
        theme.mapStyleId,
        nearbyBnbs.map((b) => ({
          id: b.id,
          title: b.title,
          subtitle: `${b.county} · ${b.rating} · ${b.price}`,
          coords: b.coords,
        })),
        currentCoords,
      ),
    [MAPBOX_ACCESS_TOKEN, theme.mapStyleId, nearbyBnbs, currentCoords],
  );
  const houseMapHtml = useMemo(
    () =>
      buildInteractivePointsMapHtml(
        MAPBOX_ACCESS_TOKEN,
        theme.mapStyleId,
        nearbyHouses.map((h) => ({
          id: h.id,
          title: h.title,
          subtitle: `${h.distanceKm} km · ${h.price}`,
          coords: h.coords,
        })),
        currentCoords,
      ),
    [MAPBOX_ACCESS_TOKEN, theme.mapStyleId, nearbyHouses, currentCoords],
  );

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
        image: require('./template/Preview 5.png'),
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
      image: require('./template/Preview 5.png'),
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
  }, [exploreScope]);

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
          scrollEnabled
          nestedScrollEnabled
          bounces={false}
          setSupportMultipleWindows={false}
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

    const center =
      routeCoordinates.length > 1
        ? routeCoordinates[Math.floor(routeCoordinates.length / 2)]
        : [selectedDestination.coords.longitude, selectedDestination.coords.latitude];

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

    const zoom = Math.min(14, Math.max(5, 9 + mapZoomOffset));

    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"/>
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
    <style>
      html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
    <script>
      window.onerror = function () { return true; };
      mapboxgl.accessToken = '${MAPBOX_ACCESS_TOKEN}';
      const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/${theme.mapStyleId}',
        center: [${center[0]}, ${center[1]}],
        zoom: ${zoom}
      });
      map.touchZoomRotate.enable();
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => {
        const route = ${routeFeature};
        map.addSource('route', { type: 'geojson', data: route });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#3B82F6', 'line-width': 5, 'line-opacity': 0.9 }
        });
        new mapboxgl.Marker({ color: '#16A34A' }).setLngLat([${currentCoords.longitude}, ${currentCoords.latitude}]).addTo(map);
        new mapboxgl.Marker({ color: '#111827' }).setLngLat([${selectedDestination.coords.longitude}, ${selectedDestination.coords.latitude}]).addTo(map);
        const bounds = new mapboxgl.LngLatBounds();
        route.geometry.coordinates.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, { padding: 46, duration: 600, maxZoom: 14 });
      });
    </script>
  </body>
</html>`;
  }, [MAPBOX_ACCESS_TOKEN, currentCoords, selectedDestination, routeCoordinates, mapZoomOffset, theme.mapStyleId]);

  const exploreMapGeoJson = useMemo(() => {
    const features = [
      ...exploreDestinations.map((d) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [d.coords.longitude, d.coords.latitude] as [number, number],
        },
        properties: {
          id: d.id,
          kind: 'destination',
          name: d.name,
          subtitle: d.subtitle,
          reason: d.exploreReason,
          detail: d.exploreTip ?? '',
        },
      })),
      ...exploreBnbs.map((b) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [b.coords.longitude, b.coords.latitude] as [number, number],
        },
        properties: {
          id: b.id,
          kind: 'bnb',
          name: b.title,
          subtitle: `${b.county} · ${b.rating} ★ · ${b.price}`,
          reason: b.exploreReason,
          detail: b.exploreTip ?? '',
        },
      })),
    ];
    return { type: 'FeatureCollection' as const, features };
  }, [exploreDestinations, exploreBnbs]);

  const exploreMapHtml = useMemo(() => {
    if (!MAPBOX_ACCESS_TOKEN) return null;
    const dataJson = JSON.stringify(exploreMapGeoJson);
    const currentCoordsJson = currentCoords ? JSON.stringify([currentCoords.longitude, currentCoords.latitude]) : 'null';
    const preselectedTargetJson = exploreRouteTarget
      ? JSON.stringify([exploreRouteTarget.longitude, exploreRouteTarget.latitude])
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
        border: 1px solid ${popupBorder};
        border-radius: 14px !important;
        box-shadow: 0 12px 40px rgba(0,0,0,0.35) !important;
        padding: 12px 14px !important;
      }
      .mapboxgl-popup-close-button {
        color: ${popupMuted} !important;
        font-size: 20px !important;
        padding: 4px 8px !important;
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
        map.addLayer({
          id: 'explore-dots',
          type: 'circle',
          source: 'explore-pins',
          paint: {
            'circle-radius': 12,
            'circle-color': ['match', ['get', 'kind'], 'bnb', '#8B5CF6', '#3B82F6'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
          },
        });

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
          root.style.maxWidth = '260px';
          root.style.fontFamily = 'system-ui, -apple-system, sans-serif';

          var badge = document.createElement('div');
          badge.textContent = props.kind === 'bnb' ? 'Stay' : 'Place';
          badge.style.cssText = 'display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${popupAccent};opacity:0.9;margin-bottom:6px;';

          var title = document.createElement('div');
          title.textContent = props.name;
          title.style.cssText = 'font-size:15px;font-weight:600;color:${popupTitle};line-height:1.25;margin-bottom:4px;';

          var sub = document.createElement('div');
          sub.textContent = props.subtitle;
          sub.style.cssText = 'font-size:12px;color:${popupMuted};line-height:1.35;margin-bottom:10px;';

          var whyLabel = document.createElement('div');
          whyLabel.textContent = props.kind === 'bnb' ? 'Why stay here' : 'Why go';
          whyLabel.style.cssText = 'font-size:11px;font-weight:600;color:${popupAccent};margin-bottom:4px;';

          var why = document.createElement('div');
          why.textContent = props.reason;
          why.style.cssText = 'font-size:12px;color:${popupTitle};line-height:1.45;margin-bottom:8px;';

          root.appendChild(badge);
          root.appendChild(title);
          root.appendChild(sub);
          root.appendChild(whyLabel);
          root.appendChild(why);
          if (props.detail) {
            var tip = document.createElement('div');
            tip.textContent = props.detail;
            tip.style.cssText = 'font-size:11px;color:${popupMuted};line-height:1.45;border-top:1px solid ${popupBorder};padding-top:8px;margin-top:2px;';
            root.appendChild(tip);
          }
          const directionsButton = document.createElement('button');
          directionsButton.textContent = CURRENT ? 'Get directions' : 'Enable location for directions';
          directionsButton.disabled = !CURRENT;
          directionsButton.style.cssText =
            'margin-top:10px;border:0;border-radius:9px;padding:8px 10px;font-size:12px;font-weight:600;background:${popupAccent};color:${popupBg};';
          directionsButton.onclick = function () { drawRouteTo(coords); };
          root.appendChild(directionsButton);

          activePopup = new mapboxgl.Popup({
            maxWidth: '288px',
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
  }, [MAPBOX_ACCESS_TOKEN, exploreMapGeoJson, theme.mapStyleId, currentCoords, exploreRouteTarget]);

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
        : activeService === 'laundry'
          ? { html: laundryMapHtml, previewUri: null as string | null, fb: 'Enable Mapbox token to view local pickup points.' }
          : activeService === 'bnbs'
            ? { html: bnbMapHtml, previewUri: null as string | null, fb: 'Enable Mapbox token to view nearby stays.' }
            : { html: houseMapHtml, previewUri: null as string | null, fb: 'Enable Mapbox token to view nearby homes.' };

    const searchPlaceholder = activeService === 'rides' ? 'Where to, Jua?' : 'Search Jua services…';
    const stayCardW = Math.min(272, Math.max(220, Math.round(windowWidth * 0.72)));

    const sheetInner = (() => {
      switch (activeService) {
        case 'rides':
          return (
            <>
              {destinationSuggestions.length > 0 ? (
                <View style={styles.juxSuggestions}>
                  {destinationSuggestions.map((suggestion) => (
                    <TouchableOpacity
                      key={suggestion.id}
                      style={styles.juxSuggestionRow}
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
              <View style={styles.juxSectionRow}>
                <Text style={styles.juxSectionLabel}>Around you</Text>
                <Text style={styles.juxSectionMeta}>
                  {routeLoading ? '…' : routeDurationMin != null ? `${routeDurationMin} min` : '—'}
                </Text>
              </View>
              <Text style={styles.juxCardTitle}>{selectedDestination.name}</Text>
              <Text style={styles.juxCardSub} numberOfLines={2}>
                {selectedDestination.subtitle}
              </Text>
              <Text style={styles.mapActionTitle}>Ride request</Text>
              <Text style={styles.mapActionSub}>
                {selectedRide.label} · {routeDurationMin ? `${routeDurationMin} min` : '--'} ·{' '}
                {estimatedFare !== null ? `$${estimatedFare}` : '--'}
              </Text>
              <View style={styles.mapRideTierRow}>
                {RIDE_OPTIONS.map((ride) => {
                  const active = ride.id === selectedRideId;
                  const fare =
                    routeDistanceKm !== null
                      ? Math.max(8, Math.round((3.2 + routeDistanceKm * 1.1) * ride.multiplier))
                      : null;
                  return (
                    <Pressable
                      key={ride.id}
                      style={[styles.mapRideTierChip, active && styles.mapRideTierChipActive]}
                      onPress={() => {
                        setSelectedRideId(ride.id);
                        setPhaseForService('rides', 'selecting');
                      }}
                    >
                      <Text style={[styles.mapRideTierLabel, active && styles.mapRideTierLabelActive]}>{ride.label}</Text>
                      <Text style={[styles.mapRideTierMeta, active && styles.mapRideTierMetaActive]}>
                        {fare !== null ? `$${fare}` : '--'} · {ride.minutes}m
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TouchableOpacity
                style={styles.mapActionPrimary}
                onPress={() => {
                  const tripSummary = `${selectedRide.label} • ${selectedDestination.name}${routeDurationMin ? ` • ${routeDurationMin} min` : ''}`;
                  setTripFeed((previous) => [tripSummary, ...previous].slice(0, 10));
                  setBookingMessage(`Booked ${tripSummary}`);
                  setPhaseForService('rides', 'confirmed');
                  setTripStarted(true);
                  setActiveTab('trips');
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.mapActionPrimaryText}>Confirm ride →</Text>
              </TouchableOpacity>
            </>
          );
        case 'laundry':
          return (
            <>
              <Text style={styles.juxSheetTitle}>Laundry service</Text>
              <Text style={styles.juxSheetSubtitle}>Select load size</Text>
              <Text style={styles.mapActionSub}>
                {laundryStationId
                  ? `Station: ${PICKUP_STATIONS.find((s) => s.id === laundryStationId)?.name || 'Selected'}`
                  : `Pickup near ${currentLocationLabel}`}
              </Text>
              <View style={styles.mapRideTierRow}>
                <Pressable
                  style={[styles.mapRideTierChip, laundryStationId === null && styles.mapRideTierChipActive]}
                  onPress={() => setLaundryStationId(null)}
                >
                  <Text style={[styles.mapRideTierLabel, laundryStationId === null && styles.mapRideTierLabelActive]}>Door</Text>
                </Pressable>
                {nearbyStations[0] ? (
                  <Pressable
                    style={[styles.mapRideTierChip, laundryStationId !== null && styles.mapRideTierChipActive]}
                    onPress={() => setLaundryStationId(nearbyStations[0].id)}
                  >
                    <Text style={[styles.mapRideTierLabel, laundryStationId !== null && styles.mapRideTierLabelActive]}>Station</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.mapQuickRow}>
                <Pressable style={styles.mapQuickBtn} onPress={() => setLaundryQuantity((q) => Math.max(1, q - 1))}>
                  <Text style={styles.mapQuickBtnText}>-</Text>
                </Pressable>
                <Text style={styles.mapQuickValue}>{laundryQuantity} kg</Text>
                <Pressable style={styles.mapQuickBtn} onPress={() => setLaundryQuantity((q) => Math.min(30, q + 1))}>
                  <Text style={styles.mapQuickBtnText}>+</Text>
                </Pressable>
              </View>
              <View style={styles.juxEstimateRow}>
                <Text style={styles.juxEstimateLabel}>Service estimate</Text>
                <Text style={styles.juxEstimateValue}>KES {laundryQuantity * 180}</Text>
              </View>
              <TouchableOpacity
                style={styles.mapActionPrimary}
                onPress={() => {
                  const station = laundryStationId ? PICKUP_STATIONS.find((s) => s.id === laundryStationId) : null;
                  const where = station ? station.name : 'Door-to-door';
                  const request = `Jua Fua • ${where} • ${laundryQuantity} kg • KES ${laundryQuantity * 180}`;
                  setTripFeed((prev) => [request, ...prev].slice(0, 10));
                  setBookingMessage(request);
                  setPhaseForService('laundry', 'confirmed');
                  setActiveTab('trips');
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.mapActionPrimaryText}>Confirm laundry request →</Text>
              </TouchableOpacity>
            </>
          );
        case 'bnbs':
          return (
            <>
              {homeSheetStage === 'full' ? (
                <View style={styles.juxQuickGrid}>
                  <View style={[styles.juxQuickCard, styles.juxQuickCardYellow]}>
                    <Text style={styles.juxQuickTitle}>Instant book</Text>
                    <Text style={styles.juxQuickSub}>No waiting</Text>
                  </View>
                  <View style={[styles.juxQuickCard, styles.juxQuickCardPink]}>
                    <Text style={styles.juxQuickTitle}>Pet friendly</Text>
                    <Text style={styles.juxQuickSub}>Browse stays</Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.juxSectionRow}>
                <Text style={styles.juxSectionLabel}>Recommended</Text>
                <Pressable onPress={() => setActiveTab('explore')}>
                  <Text style={styles.juxSeeAll}>See all</Text>
                </Pressable>
              </View>
              <Text style={styles.juxSheetTitle}>Stays near you</Text>
              <Text style={styles.juxSheetSubtitle}>
                {nearbyBnbs.length ? 'Tap a card for details, 3D tour, and booking.' : `No BnBs in ${currentCounty} yet`}
              </Text>
              {nearbyBnbs.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.juxStayCarousel}
                  decelerationRate="fast"
                  snapToInterval={stayCardW + 10}
                >
                  {nearbyBnbs.map((bnb) => {
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
              {focusedBnb ? (
                <View style={styles.juxListingDetail}>
                  <Image source={focusedBnb.image} style={styles.juxListingHero} resizeMode="cover" />
                  <View style={styles.juxListingDetailBody}>
                    <View style={styles.juxListingTitleRow}>
                      <Text style={styles.juxListingTitle}>{focusedBnb.title}</Text>
                      <Text style={styles.juxListingRating}>{focusedBnb.rating} ★</Text>
                    </View>
                    <Text style={styles.juxListingPrice}>{focusedBnb.price}</Text>
                    <Text style={styles.juxListingDesc} numberOfLines={homeSheetStage === 'full' ? 6 : 4}>
                      {focusedBnb.exploreReason}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.juxChipRow}>
                      {focusedBnb.amenities.map((tag) => (
                        <View key={tag} style={styles.juxChip}>
                          <Text style={styles.juxChipText}>{tag}</Text>
                        </View>
                      ))}
                    </ScrollView>
                    <View style={styles.juxListingActions}>
                      <Pressable
                        style={[styles.juxTourBtn, !focusedBnb.has3dTour && styles.juxTourBtnDisabled]}
                        onPress={() => {
                          if (!focusedBnb.has3dTour) return;
                          setTourSheetTarget({ kind: 'bnb', id: focusedBnb.id });
                        }}
                      >
                        <Text style={[styles.juxTourBtnText, !focusedBnb.has3dTour && styles.juxTourBtnTextDisabled]}>3D tour</Text>
                      </Pressable>
                      <TouchableOpacity
                        style={styles.juxReserveBtn}
                        onPress={() => {
                          const booking = `BnB booked • ${focusedBnb.title} • ${focusedBnb.price}`;
                          setTripFeed((prev) => [booking, ...prev].slice(0, 10));
                          setBookingMessage(booking);
                          setPhaseForService('bnbs', 'confirmed');
                          setActiveTab('trips');
                        }}
                        activeOpacity={0.88}
                      >
                        <Text style={styles.juxReserveBtnText}>Reserve stay</Text>
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
                <Text style={styles.juxSectionMeta}>{houseProximityKm} km radius</Text>
              </View>
              <Text style={styles.juxSheetTitle}>Homes near you</Text>
              <Text style={styles.juxSheetSubtitle}>
                {nearbyHouses.length ? 'Tap a listing for specs, 3D walkthrough, and a viewing request.' : 'No rentals in this radius yet'}
              </Text>
              <View style={styles.mapQuickRow}>
                <Pressable
                  style={styles.mapQuickBtn}
                  onPress={() => {
                    const opts = [...HOUSE_RADIUS_OPTIONS];
                    const i = opts.indexOf(houseProximityKm as (typeof HOUSE_RADIUS_OPTIONS)[number]);
                    const next = opts[(i >= 0 ? i + 1 : 0) % opts.length];
                    setHouseProximityKm(next);
                  }}
                >
                  <Text style={styles.mapQuickBtnText}>Change radius</Text>
                </Pressable>
              </View>
              {nearbyHouses.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.juxStayCarousel}
                  decelerationRate="fast"
                  snapToInterval={stayCardW + 10}
                >
                  {nearbyHouses.map((house) => {
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
              {focusedHouse ? (
                <View style={styles.juxListingDetail}>
                  <Image source={focusedHouse.image} style={styles.juxListingHero} resizeMode="cover" />
                  <View style={styles.juxListingDetailBody}>
                    <View style={styles.juxListingTitleRow}>
                      <Text style={styles.juxListingTitle}>{focusedHouse.title}</Text>
                      <Text style={styles.juxListingRating}>{focusedHouse.distanceKm} km</Text>
                    </View>
                    <Text style={styles.juxListingPrice}>{focusedHouse.price}</Text>
                    <Text style={styles.juxListingDesc} numberOfLines={homeSheetStage === 'full' ? 5 : 3}>
                      Longer stays and viewings by appointment. Amenities below are verified for this unit.
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.juxChipRow}>
                      {focusedHouse.amenities.map((tag) => (
                        <View key={tag} style={styles.juxChip}>
                          <Text style={styles.juxChipText}>{tag}</Text>
                        </View>
                      ))}
                    </ScrollView>
                    <View style={styles.juxListingActions}>
                      <Pressable
                        style={[styles.juxTourBtn, !focusedHouse.has3dTour && styles.juxTourBtnDisabled]}
                        onPress={() => {
                          if (!focusedHouse.has3dTour) return;
                          setTourSheetTarget({ kind: 'house', id: focusedHouse.id });
                        }}
                      >
                        <Text style={[styles.juxTourBtnText, !focusedHouse.has3dTour && styles.juxTourBtnTextDisabled]}>3D walkthrough</Text>
                      </Pressable>
                      <TouchableOpacity
                        style={styles.juxReserveBtn}
                        onPress={() => {
                          const request = `House viewing request • ${focusedHouse.title} • ${focusedHouse.price}`;
                          setTripFeed((prev) => [request, ...prev].slice(0, 10));
                          setBookingMessage(request);
                          setPhaseForService('houses', 'confirmed');
                          setActiveTab('trips');
                        }}
                        activeOpacity={0.88}
                      >
                        <Text style={styles.juxReserveBtnText}>Request viewing</Text>
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
      <TouchableWithoutFeedback
        onPress={() => {
          Keyboard.dismiss();
          setDestinationSuggestions([]);
        }}
      >
        <View style={[styles.juxShell, { backgroundColor: theme.canvas }]}>
          <View style={styles.juxMapLayer} pointerEvents="box-none">
            {mapCfg.html ? (
              <WebView
                source={{ html: mapCfg.html }}
                style={StyleSheet.absoluteFillObject}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                scrollEnabled
                nestedScrollEnabled
                bounces={false}
                setSupportMultipleWindows={false}
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
                onSubmitEditing={activeService === 'rides' ? searchDestination : undefined}
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
                    { bottom: insets.bottom + floatingNavHeight + 58, left: gutter, right: gutter },
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
                nestedScrollEnabled
              >
                {sheetInner}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </TouchableWithoutFeedback>
    );
  };
  const renderExplore = () => (
    <ScrollView style={styles.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.exploreMapStage}>
        {exploreMapHtml ? (
          <WebView
            source={{ html: exploreMapHtml }}
            style={styles.exploreMapWebView}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled
            nestedScrollEnabled
            bounces={false}
            allowsFullscreenVideo
            mixedContentMode="always"
            setSupportMultipleWindows={false}
          />
        ) : (
          <ImageBackground source={require('./template/Preview 4.png')} style={styles.exploreMapWebView} resizeMode="cover">
            <View style={styles.exploreMapFallback}>
              <Text style={styles.exploreMapFallbackText}>
                Add your Mapbox token to unlock the live map — zoom, pan, and tap pins for details.
              </Text>
            </View>
          </ImageBackground>
        )}
        <View style={styles.exploreTopOverlay}>
          <Text style={styles.exploreSheetTitle}>Explore</Text>
          <Text style={styles.exploreSheetSub}>
            {exploreScope === 'nearby' ? `${currentCounty} nearby` : 'Everywhere'} · Tap pins for details and routes.
          </Text>
          <View style={styles.exploreScopeRow}>
            <Pressable
              style={[styles.exploreScopeBtn, exploreScope === 'nearby' && styles.exploreScopeBtnActive]}
              onPress={() => setExploreScope('nearby')}
            >
              <Text style={[styles.exploreScopeText, exploreScope === 'nearby' && styles.exploreScopeTextActive]}>
                Nearby
              </Text>
            </Pressable>
            <Pressable
              style={[styles.exploreScopeBtn, exploreScope === 'everywhere' && styles.exploreScopeBtnActive]}
              onPress={() => setExploreScope('everywhere')}
            >
              <Text style={[styles.exploreScopeText, exploreScope === 'everywhere' && styles.exploreScopeTextActive]}>
                Everywhere
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      {currentCoords ? (
        <Text style={styles.exploreCurrentHint}>My location: {currentLocationLabel}</Text>
      ) : (
        <Text style={styles.exploreCurrentHint}>Enable location to route from your current position.</Text>
      )}
      <Text style={[styles.sectionTitle, styles.exploreSheetSection]}>Popular destinations</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exploreHScroll}>
        {exploreDestinations.map((destination) => (
          <TouchableOpacity
            key={destination.id}
            style={styles.exploreDestTouch}
            activeOpacity={0.88}
            onPress={() =>
              setSelectedExploreCard({
                kind: 'destination',
                title: destination.name,
                subtitle: destination.subtitle,
                reason: destination.exploreReason,
                tip: destination.exploreTip,
                coords: destination.coords,
              })
            }
          >
            <ImageBackground source={destination.image} style={styles.exploreDestCard} imageStyle={styles.destinationImage}>
              <View style={styles.destinationOverlay} />
              <Text style={styles.destinationTitle}>{destination.name}</Text>
            </ImageBackground>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.sectionTitle}>BnBs</Text>
      {exploreBnbs.map((bnb) => (
        <Pressable
          key={bnb.id}
          style={styles.bnbCard}
          onPress={() =>
            setSelectedExploreCard({
              kind: 'bnb',
              title: bnb.title,
              subtitle: `${bnb.county} · ${bnb.rating} · ${bnb.price}`,
              reason: bnb.exploreReason,
              tip: bnb.exploreTip,
              coords: bnb.coords,
            })
          }
        >
          <Image source={bnb.image} style={styles.bnbImage} resizeMode="cover" />
          <View style={styles.bnbCopy}>
            <Text style={styles.carName}>{bnb.title}</Text>
            <Text style={styles.carRating}>
              {bnb.county} · {bnb.rating} · {bnb.price}
            </Text>
          </View>
        </Pressable>
      ))}
      {selectedExploreCard ? (
        <View style={styles.exploreDetailCard}>
          <Text style={styles.exploreDetailTitle}>{selectedExploreCard.title}</Text>
          <Text style={styles.exploreDetailSub}>{selectedExploreCard.subtitle}</Text>
          <Text style={styles.exploreDetailReason}>{selectedExploreCard.reason}</Text>
          {selectedExploreCard.tip ? (
            <Text style={styles.exploreDetailTip}>Tip: {selectedExploreCard.tip}</Text>
          ) : null}
          <View style={styles.exploreDetailActions}>
            <Pressable
              style={styles.exploreDetailPrimary}
              onPress={() => {
                setExploreRouteTarget(selectedExploreCard.coords);
                if (selectedExploreCard.kind === 'destination') {
                  const known = DESTINATIONS.find(
                    (d) =>
                      d.coords.latitude === selectedExploreCard.coords.latitude &&
                      d.coords.longitude === selectedExploreCard.coords.longitude,
                  );
                  if (known) setSelectedDestination(known);
                }
              }}
            >
              <Text style={styles.exploreDetailPrimaryText}>Get directions</Text>
            </Pressable>
            <Pressable style={styles.exploreDetailGhost} onPress={() => setSelectedExploreCard(null)}>
              <Text style={styles.exploreDetailGhostText}>Close</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );

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
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
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
      zIndex: 44,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      elevation: 10,
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
      zIndex: 45,
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
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      marginBottom: 10,
      overflow: 'hidden',
    },
    juxSuggestionRow: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
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
      color: theme.accentBlue,
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
    juxEstimateRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 12,
    },
    juxEstimateLabel: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textMuted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    juxEstimateValue: {
      fontSize: 16,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
    },
    juxQuickGrid: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 12,
    },
    juxQuickCard: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 10,
    },
    juxQuickCardYellow: {
      backgroundColor: '#FFF6E5',
    },
    juxQuickCardPink: {
      backgroundColor: '#FFE8EE',
    },
    juxQuickTitle: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      color: theme.textPrimary,
    },
    juxQuickSub: {
      marginTop: 4,
      fontSize: 10,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textSecondary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
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
      borderWidth: 2,
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
      marginTop: 14,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    juxListingHero: {
      width: '100%',
      height: 148,
      backgroundColor: theme.border,
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
    juxListingActions: {
      flexDirection: 'row',
      alignItems: 'stretch',
      marginTop: 14,
      gap: 10,
    },
    juxTourBtn: {
      flex: 1,
      minHeight: 48,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: theme.textPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    juxTourBtnDisabled: {
      opacity: 0.38,
      borderColor: theme.border,
    },
    juxTourBtnText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: theme.textPrimary,
    },
    juxTourBtnTextDisabled: {
      color: theme.textMuted,
    },
    juxReserveBtn: {
      flex: 1.15,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    juxReserveBtnText: {
      fontSize: 13,
      fontFamily: 'Inter_700Bold',
      color: theme.accentText,
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
