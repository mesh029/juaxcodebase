/** Shared Mapbox WebView helpers: center pickup pin, recenter detection, fly-to user. */
export const MAP_INTERACTION_STYLES = `
  #center-pickup-pin {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -92%);
    z-index: 5;
    pointer-events: none;
    display: none;
    filter: drop-shadow(0 2px 6px rgba(0,0,0,0.28));
  }
  #center-pickup-pin svg { width: 38px; height: 38px; display: block; }
`;

export const MAP_INTERACTION_HTML = `<div id="center-pickup-pin" aria-hidden="true"><svg viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg"><path fill="#000000" d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0zm0 16.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9z"/><circle cx="12" cy="12" r="3.2" fill="#ffffff"/></svg></div>`;

export const MAP_INTERACTION_JS = `
(function () {
  var pickupMode = false;
  var USER = null;
  function haversineKm(lng1, lat1, lng2, lat2) {
    var R = 6371;
    var dLat = ((lat2 - lat1) * Math.PI) / 180;
    var dLng = ((lng2 - lng1) * Math.PI) / 180;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function post(obj) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    } catch (_) {}
  }
  function ensurePin() {
    var el = document.getElementById('center-pickup-pin');
    if (el) el.style.display = pickupMode ? 'block' : 'none';
  }
  function postCenter(map) {
    var c = map.getCenter();
    var away = false;
    if (USER) away = haversineKm(c.lng, c.lat, USER.longitude, USER.latitude) > 0.22;
    if (pickupMode) {
      post({ type: 'mapCenterChanged', lng: c.lng, lat: c.lat, needsRecenter: away });
    } else {
      post({ type: 'mapMoved', needsRecenter: away });
    }
  }
  window.juaInstallMapInteraction = function (map, userCoords) {
    if (userCoords) USER = userCoords;
    map.on('moveend', function () {
      postCenter(map);
    });
    window.juaSetPickupMode = function (on) {
      pickupMode = !!on;
      ensurePin();
      if (pickupMode) postCenter(map);
    };
    window.juaRecenterMap = function (lng, lat) {
      map.easeTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 14),
        duration: 650,
        essential: true,
      });
      post({ type: 'mapMoved', needsRecenter: false });
    };
    window.juaSetUserCoords = function (coords) {
      USER = coords;
    };
    ensurePin();
  };
})();
`;
