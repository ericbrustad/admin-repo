import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';

const MapCanvas = dynamic(() => import('./MapCanvas'), { ssr: false });

export default function SettingsMapPreview({ gameConfig, height = 320, onReady }) {
  const center = useMemo(() => {
    const c = gameConfig?.map?.center
      || gameConfig?.geofence?.center
      || gameConfig?.game?.start?.location
      || null;
    const lat = Number(c?.lat ?? c?.latitude ?? 44.98);
    const lng = Number(c?.lng ?? c?.longitude ?? -93.26);
    return [lat, lng];
  }, [gameConfig]);

  const zoom = Number(gameConfig?.map?.zoom ?? 13);
  const title = gameConfig?.game?.title || 'Location';

  return (
    <MapCanvas
      center={center}
      zoom={zoom}
      height={height}
      markers={[{ lat: center[0], lng: center[1], title }]}
      circlesMeters={[]}
      onReady={onReady}
    />
  );
}
