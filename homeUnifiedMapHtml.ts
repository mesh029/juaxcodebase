/**
 * Single Mapbox WebView document for Home VALET / BNBS / RENTALS tabs.
 * Switching tabs only calls `juaApplyHomeMode` via injectJavaScript — no full reload, no black flash.
 */

import { MAP_INTERACTION_HTML, MAP_INTERACTION_JS, MAP_INTERACTION_STYLES } from './mapInteractionScript';

export type HomeUnifiedCoords = { latitude: number; longitude: number };

export type HomeUnifiedPin = {
  id: string;
  title: string;
  subtitle: string;
  kind: 'station' | 'bnb' | 'house' | 'ride' | 'destination';
  coords: HomeUnifiedCoords;
};

export type HomeUnifiedBanks = {
  laundry: HomeUnifiedPin[];
  bnbs: HomeUnifiedPin[];
  houses: HomeUnifiedPin[];
  rides: HomeUnifiedPin[];
  destinations: HomeUnifiedPin[];
};

function slicePins(pts: HomeUnifiedPin[]) {
  return pts.slice(0, 14).map((p) => ({
    id: p.id,
    title: p.title,
    subtitle: p.subtitle,
    kind: p.kind,
    coords: [p.coords.longitude, p.coords.latitude] as [number, number],
  }));
}

export function buildUnifiedHomeServicesMapHtml(
  token: string,
  styleId: string,
  banks: HomeUnifiedBanks,
  current: HomeUnifiedCoords | null,
  bodyBg: string,
  viewportPad: { top: number; bottom: number; left: number; right: number } | null,
): string | null {
  if (!token) return null;

  const BANKS = {
    laundry: slicePins(banks.laundry),
    bnbs: slicePins(banks.bnbs),
    houses: slicePins(banks.houses),
    rides: slicePins(banks.rides),
    destinations: slicePins(banks.destinations),
  };
  const banksJson = JSON.stringify(BANKS);
  const defaultPad = { top: 56, bottom: 112, left: 16, right: 16 };
  const pad = viewportPad
    ? {
        top: Math.max(48, Math.round(viewportPad.top)),
        bottom: Math.max(96, Math.round(viewportPad.bottom)),
        left: Math.max(8, Math.round(viewportPad.left)),
        right: Math.max(8, Math.round(viewportPad.right)),
      }
    : defaultPad;
  const padJson = JSON.stringify(pad);
  const currentJson = JSON.stringify(current);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"/>
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
    <style>
      html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: ${bodyBg}; }
      .mapboxgl-popup-content {
        border-radius: 2px !important;
        padding: 8px 10px !important;
        box-shadow: 0 2px 10px rgba(0,0,0,0.07) !important;
      }
      .jua-pop-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 10px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #E5E7EB;
        font-size: 11px;
        font-weight: 600;
      }
      .jua-pop-link {
        cursor: pointer;
        text-decoration: none;
        color: #111827;
        font-weight: 600;
      }
      .jua-pop-link.jua-pop-off {
        opacity: 0.35;
        pointer-events: none;
        text-decoration: none;
      }
      .jua-pop-muted {
        font-size: 10px;
        line-height: 1.45;
        color: #6B7280;
        margin-top: 6px;
      }
      .user-marker-wrap {
        width: 56px; height: 56px; position: relative; pointer-events: none; z-index: 3;
      }
      .user-marker-label {
        position: absolute; left: 50%; bottom: calc(50% + 10px);
        transform: translateX(-50%);
        background: #16a34a; color: #fff; font-size: 10px; font-weight: 700;
        padding: 3px 8px; border-radius: 6px; white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.22); letter-spacing: 0.02em;
      }
      .user-pulse-ring {
        position: absolute; left: 50%; top: 50%;
        width: 44px; height: 44px; margin-left: -22px; margin-top: -22px;
        border-radius: 50%; border: 2px solid rgba(34,197,94,0.75);
        animation: juxPulse 2s ease-out infinite;
      }
      .user-dot {
        position: absolute; left: 50%; top: 50%; width: 16px; height: 16px; margin-left: -8px; margin-top: -8px;
        border-radius: 50%; background: #22c55e; border: 3px solid #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      }
      .jua-pop-cta {
        display: block; width: 100%; margin-top: 10px; padding: 10px 12px;
        border-radius: 8px; background: #C9A227; color: #111827;
        font-size: 12px; font-weight: 700; text-align: center; cursor: pointer; border: none;
      }
      .jua-pop-cta-outline {
        display: block; width: 100%; margin-top: 6px; padding: 8px 12px;
        border-radius: 8px; background: transparent; color: #111827;
        font-size: 12px; font-weight: 600; text-align: center; cursor: pointer;
        border: 1px solid #E5E7EB;
      }
      .jua-pop-cta-outline:disabled { opacity: 0.45; cursor: not-allowed; }
      @keyframes juxPulse {
        0% { transform: scale(0.55); opacity: 0.95; }
        70% { transform: scale(1.45); opacity: 0; }
        100% { opacity: 0; }
      }
      ${MAP_INTERACTION_STYLES}
    </style>
  </head>
  <body>
    <div id="map"></div>
    ${MAP_INTERACTION_HTML}
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
    <script>${MAP_INTERACTION_JS}</script>
    <script>
      window.onerror = function () { return true; };
      const BANKS = ${banksJson};
      const DATA = { current: ${currentJson}, viewportPad: ${padJson} };
      let homeMode = 'laundry';
      let ridesMapFocus = 'pickup';
      let activePoints = (BANKS.laundry || []).slice();
      let SELECTED_HIGHLIGHT = null;
      let mapReady = false;
      var pendingMode = 'laundry';
      var userMarker = null;
      function postMsg(obj) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(obj));
          }
        } catch (_) {}
      }
      function setUserMarker(coords) {
        if (!coords || typeof coords.longitude !== 'number' || typeof coords.latitude !== 'number') return;
        DATA.current = coords;
        var lngLat = [coords.longitude, coords.latitude];
        if (userMarker) {
          userMarker.setLngLat(lngLat);
          return;
        }
        var el = document.createElement('div');
        el.className = 'user-marker-wrap';
        el.innerHTML =
          '<div class="user-marker-label">You are here</div>' +
          '<div class="user-pulse-ring"></div><div class="user-dot"></div>';
        userMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(map);
      }
      mapboxgl.accessToken = '${token}';
      const fallbackCenter = [36.8172, -1.2864];
      function startCenterZoom() {
        const c = DATA.current;
        if (c) return { center: [c.longitude, c.latitude], zoom: 12.6 };
        const p0 = activePoints[0];
        if (p0) return { center: p0.coords.slice(), zoom: 11.2 };
        return { center: fallbackCenter, zoom: 10.2 };
      }
      const sz = startCenterZoom();
      const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/${styleId}',
        center: sz.center,
        zoom: sz.zoom,
        touchPitch: false,
        dragRotate: false,
      });
      map.touchZoomRotate.enable();
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new mapboxgl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');

      function featuresFromPoints(pts) {
        return (pts || []).map(function (p) {
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: p.coords },
            properties: { id: p.id, title: p.title, subtitle: p.subtitle, kind: p.kind || 'ride' },
          };
        });
      }
      function fitProximityNice() {
        var pad = DATA.viewportPad || { top: 56, bottom: 112, left: 16, right: 16 };
        var features = featuresFromPoints(activePoints);
        if (!DATA.current && features.length === 0) return;
        if (DATA.current && features.length === 0) {
          map.easeTo({
            center: [DATA.current.longitude, DATA.current.latitude],
            zoom: 13.5,
            padding: pad,
            duration: 650,
            essential: true,
          });
          return;
        }
        var b = new mapboxgl.LngLatBounds();
        if (DATA.current) b.extend([DATA.current.longitude, DATA.current.latitude]);
        features.forEach(function (f) { b.extend(f.geometry.coordinates); });
        map.fitBounds(b, { padding: pad, maxZoom: 14.2, duration: 700, essential: true });
      }
      function syncPickHighlight() {
        var show = !!SELECTED_HIGHLIGHT;
        if (map.getLayer('pick-highlight-ring')) {
          try { map.removeLayer('pick-highlight-ring'); } catch (_) {}
        }
        if (map.getSource('pick-highlight')) {
          try { map.removeSource('pick-highlight'); } catch (_) {}
        }
        if (!show) return;
        map.addSource('pick-highlight', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [SELECTED_HIGHLIGHT.lng, SELECTED_HIGHLIGHT.lat] },
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
      function ridesActivePoints() {
        if (ridesMapFocus === 'destination') return (BANKS.destinations || []);
        var hubs = BANKS.rides || [];
        var dests = BANKS.destinations || [];
        return hubs.concat(dests);
      }
      function internalApplyMode(mode) {
        homeMode =
          mode === 'houses' ? 'houses' : mode === 'bnbs' ? 'bnbs' : mode === 'rides' ? 'rides' : 'laundry';
        activePoints =
          homeMode === 'laundry'
            ? BANKS.laundry
            : homeMode === 'bnbs'
              ? BANKS.bnbs
              : homeMode === 'houses'
                ? BANKS.houses
                : ridesActivePoints();
        var fc = { type: 'FeatureCollection', features: featuresFromPoints(activePoints) };
        if (map.getSource('pins')) map.getSource('pins').setData(fc);
        syncPickHighlight();
        fitProximityNice();
      }
      window.juaSetRidesMapFocus = function (focus) {
        ridesMapFocus = focus === 'destination' ? 'destination' : 'pickup';
        try {
          if (mapReady && homeMode === 'rides') {
            activePoints = ridesActivePoints();
            var fc = { type: 'FeatureCollection', features: featuresFromPoints(activePoints) };
            if (map.getSource('pins')) map.getSource('pins').setData(fc);
            fitProximityNice();
          }
        } catch (_) {}
      };
      window.juaApplyHomeMode = function (mode) {
        pendingMode =
          mode === 'houses' ? 'houses' : mode === 'bnbs' ? 'bnbs' : mode === 'rides' ? 'rides' : 'laundry';
        try {
          if (mapReady) internalApplyMode(pendingMode);
        } catch (_) {}
      };
      window.juaSetHighlight = function (lng, lat) {
        if (lng == null || lat == null || typeof lng !== 'number' || typeof lat !== 'number') {
          SELECTED_HIGHLIGHT = null;
        } else {
          SELECTED_HIGHLIGHT = { lng: lng, lat: lat };
        }
        try {
          if (mapReady) syncPickHighlight();
        } catch (_) {}
      };
      window.juaSetUserCoords = function (coords) {
        if (!coords) return;
        try {
          if (mapReady) setUserMarker(coords);
          else DATA.current = coords;
        } catch (_) {}
      };
      map.on('load', function () {
        var fc = { type: 'FeatureCollection', features: featuresFromPoints(activePoints) };
        map.addSource('pins', { type: 'geojson', data: fc });
        map.addLayer({
          id: 'pins-circle',
          type: 'circle',
          source: 'pins',
          paint: {
            'circle-radius': ['match', ['get', 'kind'], 'station', 11, 'bnb', 10, 'house', 10, 'destination', 10, 'ride', 9, 9],
            'circle-color': [
              'match', ['get', 'kind'],
              'station', '#F59E0B',
              'bnb', '#F472B6',
              'house', '#A78BFA',
              'destination', '#C9A227',
              'ride', '#38BDF8',
              '#38BDF8',
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
        if (DATA.current) setUserMarker(DATA.current);
        mapReady = true;
        internalApplyMode(pendingMode);
        map.on('click', 'pins-circle', async function (e) {
          var f = e.features[0];
          var c = f.geometry.coordinates.slice();
          var props = f.properties || {};
          if (homeMode === 'laundry' && String(props.kind) === 'station' && props.id) {
            SELECTED_HIGHLIGHT = { lng: c[0], lat: c[1] };
            syncPickHighlight();
            postMsg({ type: 'laundryStationMapSelect', id: String(props.id) });
          }
          if (homeMode === 'rides' && String(props.kind) === 'ride' && props.id) {
            SELECTED_HIGHLIGHT = { lng: c[0], lat: c[1] };
            syncPickHighlight();
            postMsg({ type: 'ridePickupMapSelect', id: String(props.id) });
          }
          if (homeMode === 'rides' && String(props.kind) === 'destination' && props.id) {
            SELECTED_HIGHLIGHT = { lng: c[0], lat: c[1] };
            syncPickHighlight();
            postMsg({ type: 'rideDestinationMapSelect', id: String(props.id) });
          }
          if (
            (homeMode === 'bnbs' && String(props.kind) === 'bnb') ||
            (homeMode === 'houses' && String(props.kind) === 'house')
          ) {
            if (props.id) {
              SELECTED_HIGHLIGHT = { lng: c[0], lat: c[1] };
              syncPickHighlight();
              postMsg({
                type: 'listingMapSelect',
                catalog: homeMode === 'bnbs' ? 'bnb' : 'house',
                id: String(props.id),
              });
            }
          }
          var pop = new mapboxgl.Popup({ offset: 12 }).setLngLat(c);
          var wrap = document.createElement('div');
          var h = document.createElement('div');
          h.textContent = String(props.title || 'Selected');
          h.style.cssText = 'font-size:13px;font-weight:700;';
          var s = document.createElement('div');
          s.textContent = String(props.subtitle || '');
          s.style.cssText = 'font-size:11px;color:#6B7280;margin-top:2px;';
          wrap.appendChild(h);
          wrap.appendChild(s);
          if (homeMode === 'laundry' && String(props.kind) === 'station' && props.id) {
            var pickLaundry = document.createElement('button');
            pickLaundry.type = 'button';
            pickLaundry.className = 'jua-pop-cta';
            pickLaundry.textContent = 'Use this pickup station';
            pickLaundry.onclick = function () {
              postMsg({ type: 'laundryStationPick', id: String(props.id) });
            };
            wrap.appendChild(pickLaundry);
          }
          if (homeMode === 'rides' && String(props.kind) === 'ride' && props.id) {
            var ridePick = document.createElement('button');
            ridePick.type = 'button';
            ridePick.className = 'jua-pop-cta';
            ridePick.textContent = 'Use this pickup hub';
            ridePick.onclick = function () {
              postMsg({ type: 'ridePickupHub', id: String(props.id) });
            };
            wrap.appendChild(ridePick);
          }
          if (homeMode === 'rides' && String(props.kind) === 'destination' && props.id) {
            var rideDest = document.createElement('button');
            rideDest.type = 'button';
            rideDest.className = 'jua-pop-cta';
            rideDest.textContent = 'Use this destination';
            rideDest.onclick = function () {
              postMsg({ type: 'rideDestination', id: String(props.id) });
            };
            wrap.appendChild(rideDest);
          }
          if (
            (homeMode === 'bnbs' && String(props.kind) === 'bnb') ||
            (homeMode === 'houses' && String(props.kind) === 'house')
          ) {
            if (props.id) {
              var catalog = homeMode === 'bnbs' ? 'bnb' : 'house';
              var viewListing = document.createElement('button');
              viewListing.type = 'button';
              viewListing.className = 'jua-pop-cta';
              viewListing.textContent = 'View listing details';
              viewListing.onclick = function () {
                postMsg({ type: 'openListingDetail', catalog: catalog, id: String(props.id) });
              };
              wrap.appendChild(viewListing);
              var navListing = document.createElement('button');
              navListing.type = 'button';
              navListing.className = 'jua-pop-cta-outline';
              navListing.textContent = DATA.current ? 'Navigate' : 'Enable location to navigate';
              navListing.disabled = !DATA.current;
              navListing.onclick = function () {
                if (!DATA.current) return;
                postMsg({
                  type: 'startJourney',
                  destLng: c[0],
                  destLat: c[1],
                  title: String(props.title || 'Listing'),
                  subtitle: String(props.subtitle || ''),
                  kind: catalog,
                });
              };
              wrap.appendChild(navListing);
            }
          }
          var isListingPin =
            (homeMode === 'bnbs' && String(props.kind) === 'bnb') ||
            (homeMode === 'houses' && String(props.kind) === 'house');
          if (!isListingPin) {
          var row = document.createElement('div');
          row.className = 'jua-pop-actions';
          var navL = document.createElement('span');
          navL.className = 'jua-pop-link' + (DATA.current ? '' : ' jua-pop-off');
          navL.textContent = 'Navigate';
          navL.onclick = function () {
            if (!DATA.current) return;
            try {
              if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                window.ReactNativeWebView.postMessage(
                  JSON.stringify({
                    type: 'startJourney',
                    destLng: c[0],
                    destLat: c[1],
                    title: String(props.title || 'Destination'),
                    subtitle: String(props.subtitle || ''),
                    kind: String(props.kind || 'place'),
                  }),
                );
              }
            } catch (_) {}
          };
          var mid = document.createElement('span');
          mid.textContent = '·';
          mid.style.color = '#9CA3AF';
          mid.style.fontWeight = '500';
          var prevL = document.createElement('span');
          prevL.className = 'jua-pop-link' + (DATA.current ? '' : ' jua-pop-off');
          prevL.textContent = 'Route preview';
          prevL.onclick = async function () {
            if (!DATA.current) return;
            var from = DATA.current;
            var url =
              'https://api.mapbox.com/directions/v5/mapbox/driving/' +
              from.longitude +
              ',' +
              from.latitude +
              ';' +
              c[0] +
              ',' +
              c[1] +
              '?overview=full&geometries=geojson&access_token=' +
              mapboxgl.accessToken;
            try {
              var res = await fetch(url);
              var json = await res.json();
              var route = json && json.routes && json.routes[0];
              if (!route || !route.geometry) return;
              var data = { type: 'Feature', geometry: route.geometry, properties: {} };
              if (map.getSource('route')) {
                map.getSource('route').setData(data);
              } else {
                map.addSource('route', { type: 'geojson', data: data });
                map.addLayer({
                  id: 'route-line',
                  type: 'line',
                  source: 'route',
                  paint: { 'line-color': '#2563EB', 'line-width': 4, 'line-opacity': 0.88 },
                });
              }
            } catch (_) {}
          };
          row.appendChild(navL);
          row.appendChild(mid);
          row.appendChild(prevL);
          wrap.appendChild(row);
          }
          pop.setDOMContent(wrap).addTo(map);
        });
        map.on('mouseenter', 'pins-circle', function () {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'pins-circle', function () {
          map.getCanvas().style.cursor = '';
        });
        if (window.juaInstallMapInteraction) {
          window.juaInstallMapInteraction(map, DATA.current);
          var interactionSetUser = window.juaSetUserCoords;
          window.juaSetUserCoords = function (coords) {
            setUserMarker(coords);
            if (interactionSetUser) interactionSetUser(coords);
          };
        }
      });
    </script>
  </body>
</html>`;
}
