import React, { useEffect, useRef, useState } from 'react';
import { useMapEngine } from '../maps/EngineProvider';
import { getPreviewOpen, setPreviewOpen } from '../../lib/mapEngine';

export default function MapEngineToggle({ onSetCenter, onUseCurrentViewRequest, onPreviewChange }) {
  const { engine, setEngine } = useMapEngine();
  const [showPreview, setShowPreview] = useState(false);
  const [lockLayout, setLockLayout] = useState(true);
  const lockRef = useRef(true);

  useEffect(() => {
    setShowPreview(getPreviewOpen());
  }, []);

  useEffect(() => {
    lockRef.current = lockLayout;
  }, [lockLayout]);

  function toggleEngine(next) {
    setEngine(next);
  }

  function togglePreview(value) {
    setShowPreview(value);
    setPreviewOpen(value);
    onPreviewChange?.(value);
  }

  function setFromMyLocation() {
    if (!navigator?.geolocation) {
      alert('Geolocation not available.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onSetCenter?.({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          lockLayout: lockRef.current,
        });
      },
      (error) => {
        alert(error?.message || 'Failed to get location.');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div style={{ padding: '12px 0', display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>Map Engine (Admin)</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => toggleEngine('leaflet')}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #D1D5DB',
            background: engine === 'leaflet' ? '#111827' : 'transparent',
            color: engine === 'leaflet' ? '#fff' : '#111827',
          }}
        >
          Leaflet (lighter)
        </button>
        <button
          type="button"
          onClick={() => toggleEngine('mapbox')}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #D1D5DB',
            background: engine === 'mapbox' ? '#111827' : 'transparent',
            color: engine === 'mapbox' ? '#fff' : '#111827',
          }}
        >
          Mapbox (current)
        </button>
        <button
          type="button"
          onClick={setFromMyLocation}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', color: '#111827' }}
        >
          Set Center from My Location
        </button>
        <button
          type="button"
          onClick={() => onUseCurrentViewRequest?.(lockRef.current)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', color: '#111827' }}
        >
          Use Current Map View as Center
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={lockLayout} onChange={(event) => setLockLayout(event.target.checked)} />
        <span>Lock layout (offset missions/devices/pins when center changes)</span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}>
        <input type="checkbox" checked={showPreview} onChange={(event) => togglePreview(event.target.checked)} />
        <span>Show Map Preview in Settings</span>
      </label>
    </div>
  );
}
