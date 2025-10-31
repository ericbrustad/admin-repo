import React from 'react';
import dynamic from 'next/dynamic';
import { useMapEngine } from './EngineProvider';

const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });
const MapboxMap = dynamic(() => import('./MapboxMap'), { ssr: false });

export default function MapCanvas(props) {
  const { engine } = useMapEngine();
  return engine === 'mapbox' ? <MapboxMap {...props} /> : <LeafletMap {...props} />;
}
