import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';

const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then((m) => m.Popup), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then((m) => m.Circle), { ssr: false });
const UseMap = dynamic(() => import('react-leaflet').then((m) => m.useMap), { ssr: false });

function MapReady({ onReady }) {
  const map = UseMap();

  useEffect(() => {
    if (!map || !onReady) return;
    onReady({
      getCenterZoom: () => ({
        lat: map.getCenter().lat,
        lng: map.getCenter().lng,
        zoom: map.getZoom(),
      }),
    });
  }, [map, onReady]);

  return null;
}

export default function LeafletMap({
  center = [44.98, -93.26],
  zoom = 13,
  height = 320,
  markers = [],
  circlesMeters = [],
  onReady,
}) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'leaflet-css';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = (await import('leaflet')).default;
        const icon = L.icon({
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
        });
        if (!cancelled) {
          L.Marker.prototype.options.icon = icon;
        }
      } catch {
        // ignore load failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (typeof window === 'undefined') return null;

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', height }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <MapReady onReady={onReady} />
        {markers.map((marker, index) => (
          <Marker key={index} position={[marker.lat, marker.lng]}>
            {marker.title && <Popup>{marker.title}</Popup>}
          </Marker>
        ))}
        {circlesMeters.map((circle, index) => (
          <Circle
            key={index}
            center={[circle.lat, circle.lng]}
            radius={Number(circle.meters) || 0}
            pathOptions={{ color: '#2563EB', fillColor: '#60A5FA', fillOpacity: 0.15 }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
