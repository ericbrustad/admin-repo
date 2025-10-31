import React, { useEffect, useMemo, useRef, useState } from 'react';

const STATUS_STYLES = {
  complete: {
    fill: 'rgba(61, 214, 140, 0.95)',
    stroke: 'rgba(61, 214, 140, 1)',
    label: 'Complete',
  },
  attempted: {
    fill: 'rgba(245, 166, 35, 0.95)',
    stroke: 'rgba(245, 166, 35, 1)',
    label: 'Attempted',
  },
  pending: {
    fill: 'rgba(59, 130, 246, 0.92)',
    stroke: 'rgba(96, 165, 250, 1)',
    label: 'Pending',
  },
};

const DEVICE_TYPE_STYLES = {
  signal: { fill: 'rgba(14, 165, 233, 0.95)', stroke: '#0ea5e9' },
  decoy: { fill: 'rgba(249, 115, 22, 0.95)', stroke: '#ea580c' },
  timer: { fill: 'rgba(192, 132, 252, 0.95)', stroke: '#a855f7' },
  lockdown: { fill: 'rgba(248, 113, 113, 0.95)', stroke: '#ef4444' },
  relay: { fill: 'rgba(250, 204, 21, 0.95)', stroke: '#facc15' },
  default: { fill: 'rgba(148, 163, 184, 0.95)', stroke: '#94a3b8' },
};

const MAPBOX_VERSION = 'v3.2.0';
const MAPBOX_STYLE = process.env.NEXT_PUBLIC_MAPBOX_STYLE || 'mapbox://styles/mapbox/streets-v12';

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };

function getAnswerEntry(answers, id) {
  if (!id) return null;
  if (answers instanceof Map) {
    return answers.get(id) || null;
  }
  if (answers && typeof answers === 'object') {
    return answers[id] || null;
  }
  return null;
}

function sanitizeCoordinate(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeRadius(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.abs(n) : 0;
}

function clampAccuracy(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.max(Math.abs(n), 5), 1500);
}

function circleFeature({ lat, lng }, radiusMeters, properties = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return null;
  }

  const steps = 48;
  const coordinates = [];
  const earthRadius = 6378137;
  const centerLat = (lat * Math.PI) / 180;
  const centerLng = (lng * Math.PI) / 180;
  const distance = radiusMeters / earthRadius;

  for (let step = 0; step <= steps; step += 1) {
    const bearing = (step / steps) * 2 * Math.PI;
    const latRadians = Math.asin(
      Math.sin(centerLat) * Math.cos(distance) + Math.cos(centerLat) * Math.sin(distance) * Math.cos(bearing),
    );
    const lngRadians =
      centerLng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(distance) * Math.cos(centerLat),
        Math.cos(distance) - Math.sin(centerLat) * Math.sin(latRadians),
      );
    coordinates.push([(lngRadians * 180) / Math.PI, (latRadians * 180) / Math.PI]);
  }

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coordinates] },
    properties: { ...properties },
  };
}

function ensureMapLayers(map) {
  if (!map.getSource('mission-rings')) {
    map.addSource('mission-rings', { type: 'geojson', data: EMPTY_COLLECTION });
    map.addLayer({
      id: 'mission-rings-fill',
      type: 'fill',
      source: 'mission-rings',
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': 0.18,
      },
    });
    map.addLayer({
      id: 'mission-rings-outline',
      type: 'line',
      source: 'mission-rings',
      paint: {
        'line-color': ['get', 'strokeColor'],
        'line-width': 2,
        'line-opacity': 0.65,
      },
    });
  }

  if (!map.getSource('device-rings')) {
    map.addSource('device-rings', { type: 'geojson', data: EMPTY_COLLECTION });
    map.addLayer({
      id: 'device-rings-fill',
      type: 'fill',
      source: 'device-rings',
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': 0.12,
      },
    });
    map.addLayer({
      id: 'device-rings-outline',
      type: 'line',
      source: 'device-rings',
      paint: {
        'line-color': ['get', 'strokeColor'],
        'line-width': 1.5,
        'line-opacity': 0.5,
      },
    });
  }

  if (!map.getSource('player-accuracy')) {
    map.addSource('player-accuracy', { type: 'geojson', data: EMPTY_COLLECTION });
    map.addLayer({
      id: 'player-accuracy-fill',
      type: 'fill',
      source: 'player-accuracy',
      paint: {
        'fill-color': 'rgba(56, 189, 248, 0.18)',
        'fill-opacity': 0.25,
      },
    });
    map.addLayer({
      id: 'player-accuracy-outline',
      type: 'line',
      source: 'player-accuracy',
      paint: {
        'line-color': 'rgba(56, 189, 248, 0.55)',
        'line-width': 1.2,
      },
    });
  }
}

function computeBounds(points) {
  if (!points || !points.length) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  points.forEach(([lng, lat]) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) {
    return null;
  }

  if (minLng === maxLng && minLat === maxLat) {
    const pad = 0.005;
    return [
      [minLng - pad, minLat - pad],
      [maxLng + pad, maxLat + pad],
    ];
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function createMissionMarkerElement() {
  const button = document.createElement('button');
  button.type = 'button';
  button.style.width = '46px';
  button.style.height = '46px';
  button.style.borderRadius = '50%';
  button.style.borderWidth = '2px';
  button.style.borderStyle = 'solid';
  button.style.display = 'grid';
  button.style.placeItems = 'center';
  button.style.fontWeight = '700';
  button.style.fontFamily = 'inherit';
  button.style.cursor = 'pointer';
  button.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
  button.style.color = '#020617';
  button.style.boxShadow = '0 14px 28px rgba(2, 6, 23, 0.45)';
  button.style.background = 'rgba(59, 130, 246, 0.92)';

  const label = document.createElement('span');
  label.style.fontSize = '14px';
  label.style.textShadow = '0 1px 2px rgba(2, 6, 23, 0.4)';
  button.appendChild(label);

  return button;
}

function applyMissionMarkerElement(element, mission) {
  if (!element) return;
  const label = element.querySelector('span');
  if (label) {
    label.textContent = mission.indexLabel || '•';
  }
  element.style.background = mission.palette.fill;
  element.style.borderColor = mission.palette.stroke;
  element.style.boxShadow = mission.isCurrent
    ? '0 0 0 6px rgba(61, 214, 140, 0.35)'
    : '0 14px 28px rgba(2, 6, 23, 0.45)';
  element.style.transform = mission.isCurrent ? 'scale(1.05)' : 'scale(1)';
  element.setAttribute('aria-label', `${mission.title || 'Mission'} — ${mission.palette.label}`);
}

function createDeviceMarkerElement() {
  const wrapper = document.createElement('div');
  wrapper.style.width = '40px';
  wrapper.style.height = '40px';
  wrapper.style.borderRadius = '12px';
  wrapper.style.borderWidth = '2px';
  wrapper.style.borderStyle = 'solid';
  wrapper.style.display = 'grid';
  wrapper.style.placeItems = 'center';
  wrapper.style.fontWeight = '700';
  wrapper.style.fontSize = '12px';
  wrapper.style.color = '#020617';
  wrapper.style.boxShadow = '0 12px 26px rgba(2, 6, 23, 0.4)';
  wrapper.style.background = 'rgba(148, 163, 184, 0.95)';
  wrapper.style.fontFamily = 'inherit';
  wrapper.style.cursor = 'default';

  const label = document.createElement('span');
  label.style.pointerEvents = 'none';
  wrapper.appendChild(label);

  return wrapper;
}

function applyDeviceMarkerElement(element, device) {
  if (!element) return;
  const palette = device.palette || DEVICE_TYPE_STYLES.default;
  element.style.background = palette.fill;
  element.style.borderColor = palette.stroke;
  const label = element.querySelector('span');
  if (label) {
    label.textContent = device.indexLabel || device.typeLabel || 'DEV';
  }
  element.setAttribute('aria-label', device.title || 'Device');
}

function createLocationMarkerElement() {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.transform = 'translateY(8px)';
  wrapper.style.pointerEvents = 'none';

  const dot = document.createElement('div');
  dot.style.width = '18px';
  dot.style.height = '18px';
  dot.style.borderRadius = '50%';
  dot.style.border = '3px solid rgba(56, 189, 248, 0.45)';
  dot.style.background = '#38bdf8';
  dot.style.boxShadow = '0 0 0 6px rgba(56, 189, 248, 0.18)';

  const label = document.createElement('span');
  label.textContent = 'You';
  label.style.marginTop = '4px';
  label.style.padding = '4px 10px';
  label.style.borderRadius = '999px';
  label.style.background = 'rgba(15, 23, 42, 0.85)';
  label.style.border = '1px solid rgba(148, 163, 184, 0.3)';
  label.style.fontSize = '11px';
  label.style.textTransform = 'uppercase';
  label.style.letterSpacing = '0.4px';
  label.style.fontWeight = '600';
  label.style.color = '#e2e8f0';

  wrapper.appendChild(dot);
  wrapper.appendChild(label);

  return wrapper;
}

function loadMapboxGL(token) {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  if (!token) {
    return Promise.reject(new Error('Missing Mapbox access token'));
  }

  if (window.mapboxgl && window.mapboxgl.Map) {
    window.mapboxgl.accessToken = token;
    return Promise.resolve(window.mapboxgl);
  }

  if (window.__mapboxglPromise) {
    return window.__mapboxglPromise;
  }

  window.__mapboxglPromise = new Promise((resolve, reject) => {
    const baseUrl = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_VERSION}`;
    const query = `?access_token=${encodeURIComponent(token)}`;

    if (!document.querySelector('link[data-mapbox-gl]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${baseUrl}/mapbox-gl.css${query}`;
      link.crossOrigin = 'anonymous';
      link.dataset.mapboxGl = 'true';
      document.head.appendChild(link);
    }

    let script = document.querySelector('script[data-mapbox-gl]');
    if (!script) {
      script = document.createElement('script');
      script.async = true;
      script.src = `${baseUrl}/mapbox-gl.js${query}`;
      script.crossOrigin = 'anonymous';
      script.dataset.mapboxGl = 'true';
      document.head.appendChild(script);
    }

    const cleanup = () => {
      delete window.__mapboxglPromise;
    };

    const handleLoad = () => {
      if (window.mapboxgl && window.mapboxgl.Map) {
        window.mapboxgl.accessToken = token;
        resolve(window.mapboxgl);
      } else {
        cleanup();
        reject(new Error('Mapbox GL JS loaded but window.mapboxgl is unavailable'));
      }
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Failed to load Mapbox GL JS assets'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
  });

  return window.__mapboxglPromise;
}

export default function MissionMap({
  missions = [],
  devices = [],
  currentId,
  answers,
  onSelect,
  currentLocation,
  children,
}) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const missionMarkersRef = useRef(new Map());
  const deviceMarkersRef = useRef(new Map());
  const locationMarkerRef = useRef(null);
  const fitAppliedRef = useRef(false);
  const lastLocationPresenceRef = useRef(false);
  const [mapStatus, setMapStatus] = useState(
    (typeof window !== 'undefined' && window.__MAPBOX_ACCESS_TOKEN) || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
      ? 'idle'
      : 'missing-token',
  );

  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const normalized = useMemo(() => {
    const missionList = [];
    const deviceList = [];

    missions.forEach((mission, index) => {
      if (!mission) return;
      const lat = sanitizeCoordinate(mission.lat ?? mission?.content?.lat);
      const lng = sanitizeCoordinate(mission.lng ?? mission?.content?.lng);
      if (lat === null || lng === null) return;

      const radiusMeters = sanitizeRadius(
        mission.radiusMeters ?? mission?.content?.radiusMeters ?? mission.radius ?? 0,
      );

      const entry = getAnswerEntry(answers, mission.id);
      const statusKey = entry ? (entry.correct ? 'complete' : 'attempted') : 'pending';
      const palette = STATUS_STYLES[statusKey] || STATUS_STYLES.pending;

      missionList.push({
        ...mission,
        id: mission.id || `mission-${index + 1}`,
        index,
        lat,
        lng,
        radiusMeters,
        status: statusKey,
        palette,
        indexLabel: mission.indexLabel || String(index + 1).padStart(2, '0'),
        isCurrent: mission.id === currentId,
      });
    });

    devices.forEach((device, index) => {
      if (!device) return;
      const lat = sanitizeCoordinate(device.lat ?? device.latitude ?? device?.location?.lat);
      const lng = sanitizeCoordinate(device.lng ?? device.longitude ?? device?.location?.lng);
      if (lat === null || lng === null) return;

      const typeKey = String(device.type || '').toLowerCase();
      const palette = DEVICE_TYPE_STYLES[typeKey] || DEVICE_TYPE_STYLES.default;
      const radiusMeters = sanitizeRadius(
        device.radiusMeters ?? device.pickupRadius ?? device.rangeMeters ?? 0,
      );

      deviceList.push({
        ...device,
        id: device.id || `device-${index + 1}`,
        lat,
        lng,
        radiusMeters,
        palette,
        indexLabel: (typeKey || 'device').slice(0, 3).toUpperCase(),
        typeLabel: typeKey,
      });
    });

    let locationPoint = null;
    if (currentLocation) {
      const lat = sanitizeCoordinate(currentLocation.lat);
      const lng = sanitizeCoordinate(currentLocation.lng);
      if (lat !== null && lng !== null) {
        locationPoint = {
          lat,
          lng,
          accuracy: clampAccuracy(currentLocation.accuracy),
        };
      }
    }

    return { missions: missionList, devices: deviceList, location: locationPoint };
  }, [missions, devices, answers, currentId, currentLocation]);

  const mapboxToken =
    (typeof window !== 'undefined' && window.__MAPBOX_ACCESS_TOKEN) ||
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    '';

  useEffect(() => {
    if (!mapNodeRef.current) return undefined;
    if (mapRef.current) return undefined;
    if (!mapboxToken) {
      setMapStatus('missing-token');
      return undefined;
    }

    let cancelled = false;
    setMapStatus('loading');

    let styleHandler;

    loadMapboxGL(mapboxToken)
      .then((mapbox) => {
        if (cancelled || !mapNodeRef.current) {
          return;
        }

        const map = new mapbox.Map({
          container: mapNodeRef.current,
          style: MAPBOX_STYLE,
          center: [0, 0],
          zoom: 2,
          attributionControl: true,
        });

        mapRef.current = map;

        map.addControl(new mapbox.NavigationControl({ showCompass: false }), 'top-right');

        map.once('load', () => {
          if (cancelled) return;
          ensureMapLayers(map);
          map.resize();
          setMapStatus('ready');
        });

        styleHandler = () => ensureMapLayers(map);
        map.on('styledata', styleHandler);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to initialize Mapbox map', error);
        setMapStatus(error.message === 'Missing Mapbox access token' ? 'missing-token' : 'error');
      });

    return () => {
      cancelled = true;
      const map = mapRef.current;
      if (map && styleHandler) {
        map.off('styledata', styleHandler);
      }
      if (map) {
        map.remove();
      }
      mapRef.current = null;
      missionMarkersRef.current.forEach((marker) => marker.remove());
      missionMarkersRef.current.clear();
      deviceMarkersRef.current.forEach((marker) => marker.remove());
      deviceMarkersRef.current.clear();
      if (locationMarkerRef.current) {
        locationMarkerRef.current.remove();
        locationMarkerRef.current = null;
      }
      fitAppliedRef.current = false;
    };
  }, [mapboxToken]);

  useEffect(() => {
    const hadLocation = lastLocationPresenceRef.current;
    const hasLocation = Boolean(normalized.location);
    if (hadLocation !== hasLocation) {
      fitAppliedRef.current = false;
    }
    lastLocationPresenceRef.current = hasLocation;
  }, [normalized.location]);

  useEffect(() => {
    fitAppliedRef.current = false;
  }, [normalized.missions.length, normalized.devices.length]);

  useEffect(() => {
    const map = mapRef.current;
    const mapbox = typeof window !== 'undefined' ? window.mapboxgl : null;
    if (!map || mapStatus !== 'ready' || !mapbox || !mapbox.Marker) return;

    const missionSource = map.getSource('mission-rings');
    if (missionSource) {
      const missionFeatures = normalized.missions
        .map((mission) =>
          circleFeature(
            { lat: mission.lat, lng: mission.lng },
            mission.radiusMeters,
            {
              id: mission.id,
              fillColor: mission.palette.fill,
              strokeColor: mission.palette.stroke,
            },
          ),
        )
        .filter(Boolean);
      missionSource.setData({ type: 'FeatureCollection', features: missionFeatures });
    }

    const deviceSource = map.getSource('device-rings');
    if (deviceSource) {
      const deviceFeatures = normalized.devices
        .map((device) =>
          circleFeature(
            { lat: device.lat, lng: device.lng },
            device.radiusMeters,
            {
              id: device.id,
              fillColor: device.palette.fill,
              strokeColor: device.palette.stroke,
            },
          ),
        )
        .filter(Boolean);
      deviceSource.setData({ type: 'FeatureCollection', features: deviceFeatures });
    }

    const accuracySource = map.getSource('player-accuracy');
    if (accuracySource) {
      const features = normalized.location && normalized.location.accuracy > 0
        ? [
            circleFeature(
              { lat: normalized.location.lat, lng: normalized.location.lng },
              normalized.location.accuracy,
              {},
            ),
          ].filter(Boolean)
        : [];
      accuracySource.setData({ type: 'FeatureCollection', features });
    }

    const missionIds = new Set();
    normalized.missions.forEach((mission) => {
      missionIds.add(mission.id);
      if (!Number.isFinite(mission.lat) || !Number.isFinite(mission.lng)) return;

      let marker = missionMarkersRef.current.get(mission.id);
      if (!marker) {
        const element = createMissionMarkerElement();
        element.addEventListener('click', () => {
          if (mission.id && onSelectRef.current) {
            onSelectRef.current(mission.id);
          }
        });
        marker = new mapbox.Marker({ element, anchor: 'center' })
          .setLngLat([mission.lng, mission.lat])
          .addTo(map);
        missionMarkersRef.current.set(mission.id, marker);
      } else {
        marker.setLngLat([mission.lng, mission.lat]);
      }
      applyMissionMarkerElement(marker.getElement(), mission);
    });

    Array.from(missionMarkersRef.current.keys()).forEach((id) => {
      if (!missionIds.has(id)) {
        const marker = missionMarkersRef.current.get(id);
        if (marker) marker.remove();
        missionMarkersRef.current.delete(id);
      }
    });

    const deviceIds = new Set();
    normalized.devices.forEach((device) => {
      deviceIds.add(device.id);
      if (!Number.isFinite(device.lat) || !Number.isFinite(device.lng)) return;

      let marker = deviceMarkersRef.current.get(device.id);
      if (!marker) {
        const element = createDeviceMarkerElement();
        marker = new mapbox.Marker({ element, anchor: 'center' })
          .setLngLat([device.lng, device.lat])
          .addTo(map);
        deviceMarkersRef.current.set(device.id, marker);
      } else {
        marker.setLngLat([device.lng, device.lat]);
      }
      applyDeviceMarkerElement(marker.getElement(), device);
    });

    Array.from(deviceMarkersRef.current.keys()).forEach((id) => {
      if (!deviceIds.has(id)) {
        const marker = deviceMarkersRef.current.get(id);
        if (marker) marker.remove();
        deviceMarkersRef.current.delete(id);
      }
    });

    if (normalized.location) {
      if (!locationMarkerRef.current) {
        const element = createLocationMarkerElement();
        locationMarkerRef.current = new mapbox.Marker({ element, anchor: 'bottom' })
          .setLngLat([normalized.location.lng, normalized.location.lat])
          .addTo(map);
      } else {
        locationMarkerRef.current.setLngLat([normalized.location.lng, normalized.location.lat]);
      }
    } else if (locationMarkerRef.current) {
      locationMarkerRef.current.remove();
      locationMarkerRef.current = null;
    }
  }, [mapStatus, normalized]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== 'ready') return;
    if (fitAppliedRef.current) return;

    const points = [];
    normalized.missions.forEach((mission) => {
      if (Number.isFinite(mission.lng) && Number.isFinite(mission.lat)) {
        points.push([mission.lng, mission.lat]);
      }
    });
    normalized.devices.forEach((device) => {
      if (Number.isFinite(device.lng) && Number.isFinite(device.lat)) {
        points.push([device.lng, device.lat]);
      }
    });
    if (normalized.location) {
      points.push([normalized.location.lng, normalized.location.lat]);
    }

    const bounds = computeBounds(points);
    if (!bounds) return;

    fitAppliedRef.current = true;
    map.fitBounds(bounds, {
      padding: { top: 200, bottom: 320, left: 96, right: 96 },
      maxZoom: 16,
      duration: 850,
    });
  }, [mapStatus, normalized]);

  const hasGeodata =
    normalized.missions.length > 0 || normalized.devices.length > 0 || Boolean(normalized.location);

  let overlayMessage = '';
  if (mapStatus === 'missing-token') {
    overlayMessage = 'Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to enable the live mission map.';
  } else if (mapStatus === 'error') {
    overlayMessage = 'Map failed to load. Check your network connection and Mapbox token.';
  } else if (mapStatus === 'ready' && !hasGeodata) {
    overlayMessage = 'Mission coordinates are unavailable for this game.';
  }

  return (
    <div style={container}>
      <div ref={mapNodeRef} style={mapCanvas} aria-hidden="true" />
      <div style={scrimLayer} />
      {overlayMessage ? <div style={emptyState}>{overlayMessage}</div> : null}
      {children}
    </div>
  );
}

const container = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
  color: '#e2e8f0',
  background: '#020617',
};

const mapCanvas = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
};

const scrimLayer = {
  position: 'absolute',
  inset: 0,
  background: 'radial-gradient(circle at 20% 20%, rgba(30, 64, 175, 0.35), rgba(2, 6, 23, 0.82))',
  pointerEvents: 'none',
  zIndex: 1,
};

const emptyState = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  background: 'rgba(15, 23, 42, 0.88)',
  border: '1px solid rgba(148, 163, 184, 0.28)',
  borderRadius: 14,
  padding: '16px 24px',
  fontSize: 15,
  zIndex: 5,
  textAlign: 'center',
  width: 'min(360px, 80vw)',
  boxShadow: '0 18px 36px rgba(2, 6, 23, 0.5)',
};
