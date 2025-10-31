const KEY = 'erix.defaultGeoLocation';

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    if (!window.localStorage) return null;
  } catch {
    return null;
  }
  return window.localStorage;
}

export function getDefaultGeo() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const lat = Number(parsed?.lat);
    const lng = Number(parsed?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  } catch {}
  return null;
}

export function setDefaultGeo(lat, lng) {
  const storage = getStorage();
  if (!storage) return;
  if (lat == null || lng == null || lat === '' || lng === '') {
    try { storage.removeItem(KEY); } catch {}
    return;
  }
  const LAT = Number(lat);
  const LNG = Number(lng);
  if (!Number.isFinite(LAT) || !Number.isFinite(LNG)) {
    try { storage.removeItem(KEY); } catch {}
    return;
  }
  try {
    storage.setItem(KEY, JSON.stringify({ lat: LAT, lng: LNG }));
  } catch {}
}

export function clearDefaultGeo() {
  const storage = getStorage();
  if (!storage) return;
  try { storage.removeItem(KEY); } catch {}
}

