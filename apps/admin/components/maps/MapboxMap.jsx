import React, { useEffect, useRef } from 'react';
import * as turf from '@turf/turf';

const STYLE = 'mapbox://styles/mapbox/streets-v12';

export default function MapboxMap({
  center = [44.98, -93.26],
  zoom = 13,
  height = 320,
  markers = [],
  circlesMeters = [],
  onReady,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let cleanup = () => {};

    (async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: STYLE,
          center: [center[1], center[0]],
          zoom,
        });
        mapRef.current = map;

        if (onReady) {
          onReady({
            getCenterZoom: () => {
              const c = map.getCenter();
              return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
            },
          });
        }

        markers.forEach((marker) => {
          const el = document.createElement('div');
          el.style.width = '14px';
          el.style.height = '14px';
          el.style.borderRadius = '50%';
          el.style.background = '#111827';
          el.style.boxShadow = '0 0 0 3px rgba(17, 24, 39, 0.25)';
          new mapboxgl.Marker(el).setLngLat([marker.lng, marker.lat]).addTo(map);
        });

        const features = circlesMeters.map((circle) =>
          turf.circle([circle.lng, circle.lat], Number(circle.meters) || 0, { steps: 64, units: 'meters' }),
        );
        if (features.length) {
          const sourceId = 'range-circles';
          const collection = turf.featureCollection(features);
          map.on('load', () => {
            if (!map.getSource(sourceId)) {
              map.addSource(sourceId, { type: 'geojson', data: collection });
              map.addLayer({
                id: 'range-circles-fill',
                type: 'fill',
                source: sourceId,
                paint: { 'fill-color': '#60A5FA', 'fill-opacity': 0.15 },
              });
              map.addLayer({
                id: 'range-circles-line',
                type: 'line',
                source: sourceId,
                paint: { 'line-color': '#2563EB', 'line-width': 2 },
              });
            } else {
              map.getSource(sourceId).setData(collection);
            }
          });
        }

        cleanup = () => {
          try {
            map.remove();
          } catch {
            // ignore
          }
        };
      } catch {
        cleanup = () => {};
      }
    })();

    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify({ center, zoom, markers, circlesMeters })]);

  return <div ref={containerRef} style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', height }} />;
}
