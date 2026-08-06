import type { Coordinates, GuidanceUiTheme, InteractiveMapOptions, MapPointPayload } from './types';


export function buildInteractivePointsMapHtml(
  token: string,
  styleId: string,
  points: MapPointPayload[],
  current: Coordinates | null,
  options?: InteractiveMapOptions,
) {
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

/** WebView preview: live GPS on map + route progress. */
export function buildGuidanceMapHtml(
  token: string,
  styleId: string,
  origin: Coordinates,
  destination: Coordinates,
  title: string,
  subtitle: string,
  ui: GuidanceUiTheme,
) {
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
