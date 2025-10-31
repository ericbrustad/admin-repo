import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clearDefaultGeo, getDefaultGeo, setDefaultGeo } from '../../lib/geo/defaultGeo.js';

export default function GlobalLocationSelector({
  initial,
  useAsDefault = false,
  onUpdate,
  onUseAsDefaultChange,
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  const [enabled, setEnabled] = useState(() => Boolean(initial));
  const [lat, setLat] = useState(() => initial?.lat ?? 44.9778);
  const [lng, setLng] = useState(() => initial?.lng ?? -93.265);
  const [persistNew, setPersistNew] = useState(() => {
    if (typeof useAsDefault === 'boolean') return useAsDefault;
    return Boolean(getDefaultGeo());
  });
  const [updating, setUpdating] = useState(false);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (typeof useAsDefault === 'boolean') {
      setPersistNew(useAsDefault);
    }
  }, [useAsDefault]);

  useEffect(() => {
    if (initial && Number.isFinite(initial.lat) && Number.isFinite(initial.lng)) {
      setLat(initial.lat);
      setLng(initial.lng);
      setEnabled(true);
    }
  }, [initial?.lat, initial?.lng]);

  useEffect(() => {
    if (!enabled || !token) return undefined;

    (async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/streets-v11',
          center: [lng, lat],
          zoom: 12,
        });
        const marker = new mapboxgl.Marker({ draggable: true })
          .setLngLat([lng, lat])
          .addTo(map);

        marker.on('dragend', () => {
          const point = marker.getLngLat();
          setLat(Number(point.lat.toFixed(6)));
          setLng(Number(point.lng.toFixed(6)));
        });
        map.on('click', (event) => {
          marker.setLngLat(event.lngLat);
          setLat(Number(event.lngLat.lat.toFixed(6)));
          setLng(Number(event.lngLat.lng.toFixed(6)));
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
      } catch (error) {
        console.warn('Mapbox unavailable, falling back to manual inputs', error);
      }
    })();

    return () => {
      markerRef.current = null;
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null;
      }
    };
  }, [enabled, token]);

  useEffect(() => {
    if (!enabled) return;
    if (token && markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    }
    if (token && mapInstanceRef.current) {
      try { mapInstanceRef.current.setCenter([lng, lat]); } catch {}
    }
  }, [lat, lng, enabled, token]);

  const coordinateValid = useMemo(() => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)), [lat, lng]);

  const handleUpdateAllPins = async () => {
    if (!coordinateValid) return;
    if (persistNew) {
      setDefaultGeo(lat, lng);
    } else {
      clearDefaultGeo();
    }
    if (typeof onUseAsDefaultChange === 'function') {
      try {
        const maybe = onUseAsDefaultChange(persistNew);
        if (maybe && typeof maybe.then === 'function') {
          maybe.catch((error) => {
            console.error('Failed to persist location default flag', error);
          });
        }
      } catch (error) {
        console.error('Failed to persist location default flag', error);
      }
    }
    if (!onUpdate) return;
    try {
      const maybePromise = onUpdate(Number(lat), Number(lng));
      if (maybePromise && typeof maybePromise.then === 'function') {
        setUpdating(true);
        await maybePromise;
      }
    } catch (error) {
      console.error('Failed to update all pins', error);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: 8,
        padding: 12,
        border: '1px solid rgba(15,23,42,0.12)',
        borderRadius: 12,
        background: 'white',
      }}
    >
      <div style={{ fontWeight: 700, color: '#0f172a' }}>Global Location</div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        <span>Enable map location selector (updates all pins)</span>
      </label>

      {enabled && (
        <>
          {token ? (
            <div ref={mapContainerRef} style={{ height: 220, borderRadius: 10, overflow: 'hidden' }} />
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="number"
                step="0.000001"
                value={lat}
                onChange={(event) => setLat(Number(event.target.value))}
                placeholder="Latitude"
                style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)', width: 180 }}
              />
              <input
                type="number"
                step="0.000001"
                value={lng}
                onChange={(event) => setLng(Number(event.target.value))}
                placeholder="Longitude"
                style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)', width: 180 }}
              />
            </div>
          )}

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={persistNew}
              onChange={(event) => {
                const checked = event.target.checked;
                setPersistNew(checked);
                if (checked) {
                  setDefaultGeo(lat, lng);
                } else {
                  clearDefaultGeo();
                }
                if (typeof onUseAsDefaultChange === 'function') {
                  try {
                    const maybe = onUseAsDefaultChange(checked);
                    if (maybe && typeof maybe.then === 'function') {
                      maybe.catch((error) => {
                        console.error('Failed to persist location default flag', error);
                      });
                    }
                  } catch (error) {
                    console.error('Failed to persist location default flag', error);
                  }
                }
              }}
            />
            <span>Use this as default for new Missions / Devices (Draft &amp; Live forms)</span>
          </label>

          <div>
            <button
              type="button"
              onClick={handleUpdateAllPins}
              disabled={!coordinateValid || updating}
              style={{
                fontSize: 13,
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid rgba(34,197,94,0.45)',
                background: 'rgba(34,197,94,0.12)',
                fontWeight: 700,
                color: '#166534',
                cursor: updating ? 'wait' : 'pointer',
                opacity: !coordinateValid || updating ? 0.6 : 1,
                transition: 'opacity 0.2s ease',
              }}
            >
              {updating ? 'Updating…' : 'Update All Pins'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
