export function updateAllPinsInSnapshot(snapshot, lat, lng) {
  if (!snapshot) return snapshot;
  const LAT = Number(lat);
  const LNG = Number(lng);
  if (!Number.isFinite(LAT) || !Number.isFinite(LNG)) return snapshot;

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if ('lat' in node && 'lng' in node) {
      const a = Number(node.lat);
      const b = Number(node.lng);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        node.lat = LAT;
        node.lng = LNG;
      }
    }
    if (Array.isArray(node)) {
      for (const it of node) walk(it);
    } else {
      for (const k of Object.keys(node)) walk(node[k]);
    }
  }

  const collections = [
    snapshot.data?.missions,
    snapshot.data?.devices,
    snapshot.data?.suite,
    snapshot.data?.config?.devices,
    snapshot.data?.config?.powerups,
    snapshot.data?.config?.missions,
  ];
  for (const target of collections) {
    try { walk(target); } catch {}
  }

  try {
    if (snapshot.data?.config?.map) {
      snapshot.data.config.map.centerLat = LAT;
      snapshot.data.config.map.centerLng = LNG;
    }
  } catch {}

  return snapshot;
}

export function deriveInitialGeo(snapshot) {
  const m = snapshot?.data?.config?.map || {};
  const lat = Number(m.centerLat);
  const lng = Number(m.centerLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
}

