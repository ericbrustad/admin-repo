export const MAP_ENGINE_KEY = 'admin.map.engine';
export const MAP_PREVIEW_KEY = 'admin.map.previewOpen';

export function getStoredEngine() {
  if (typeof window === 'undefined') return 'leaflet';
  return localStorage.getItem(MAP_ENGINE_KEY) || 'leaflet';
}

export function setStoredEngine(value) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MAP_ENGINE_KEY, value);
  window.dispatchEvent(new CustomEvent('AdminMapEngineChanged', { detail: value }));
}

export function getPreviewOpen() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(MAP_PREVIEW_KEY) === 'true';
}

export function setPreviewOpen(value) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MAP_PREVIEW_KEY, String(value));
}
