import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

// Expect these to come from env
// NEXT_PUBLIC_MAPBOX_TOKEN must be set
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function approxEqual(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function sameLngLat(a = [], b = [], eps = 1e-6) {
  return a && b && a.length === 2 && approxEqual(a[0], b[0], eps) && approxEqual(a[1], b[1], eps);
}

function applyCamera(map, cam) {
  if (!map || !cam) return;

  const {
    center, // [lng, lat]
    zoom, // number
    bearing, // number
    pitch, // number
    bounds, // [[minLng, minLat],[maxLng,maxLat]]
    padding, // number | {top,right,bottom,left}
    animate = false, // boolean
  } = cam;

  if (bounds && Array.isArray(bounds) && bounds.length === 2) {
    map.fitBounds(bounds, { padding: padding ?? 40, animate });
    return;
  }

  const target = {
    center: center ?? map.getCenter().toArray(),
    zoom: typeof zoom === 'number' ? zoom : map.getZoom(),
    bearing: typeof bearing === 'number' ? bearing : map.getBearing(),
    pitch: typeof pitch === 'number' ? pitch : map.getPitch(),
  };

  const curr = {
    center: map.getCenter().toArray(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };

  const unchanged =
    sameLngLat(target.center, curr.center) &&
    approxEqual(target.zoom, curr.zoom) &&
    approxEqual(target.bearing, curr.bearing) &&
    approxEqual(target.pitch, curr.pitch);

  if (!unchanged) {
    (animate ? map.easeTo : map.jumpTo)({
      center: target.center,
      zoom: target.zoom,
      bearing: target.bearing,
      pitch: target.pitch,
    });
  }
}

function onStyleReady(map, fn) {
  if (!map) return;
  if (map.isStyleLoaded && map.isStyleLoaded()) {
    fn();
  } else {
    const once = () => {
      map.off('styledata', once);
      // Wait one idle to ensure sources/layers are ready
      map.once('idle', fn);
    };
    map.on('styledata', once);
  }
}

export default function MissionMap({
  mission,
  styleUrl, // optional override; else from mission.initialMap?.style
  className,
  onMapReady,
  height = 420,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const styleRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  const initialMap = mission?.initialMap || {};
  const memoStyle = styleUrl || initialMap?.style || 'mapbox://styles/mapbox/streets-v12';

  // Create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: memoStyle,
      center: Array.isArray(initialMap.center) ? initialMap.center : [-93.265, 44.9778], // Minneapolis fallback ;)
      zoom: typeof initialMap.zoom === 'number' ? initialMap.zoom : 12,
      pitch: typeof initialMap.pitch === 'number' ? initialMap.pitch : 0,
      bearing: typeof initialMap.bearing === 'number' ? initialMap.bearing : 0,
      attributionControl: true,
      preserveDrawingBuffer: false,
      cooperativeGestures: true,
      dragRotate: true,
      doubleClickZoom: true,
      touchZoomRotate: true,
    });

    mapRef.current = map;
    styleRef.current = memoStyle;

    map.on('load', () => {
      // Respect bounds if provided on first load
      if (initialMap.bounds) {
        map.fitBounds(initialMap.bounds, { padding: 40, animate: false });
      }
      onMapReady?.(map);
      setMounted(true);
    });

    // Clean up on unmount
    return () => {
      try {
        map.remove();
      } catch (e) {
        // ignore
      }
      mapRef.current = null;
      styleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the style changes (from mission or props), update style & reapply camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const needsStyleSwap = typeof memoStyle === 'string' && memoStyle && memoStyle !== styleRef.current;

    if (needsStyleSwap) {
      styleRef.current = memoStyle;
      map.setStyle(memoStyle);
      onStyleReady(map, () => applyCamera(map, { ...initialMap, animate: false }));
    } else if (mounted) {
      // camera-only changes (center/zoom/bearing/pitch/bounds)
      onStyleReady(map, () => applyCamera(map, { ...initialMap, animate: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    memoStyle,
    mounted,
    initialMap?.center?.[0],
    initialMap?.center?.[1],
    initialMap?.zoom,
    initialMap?.bearing,
    initialMap?.pitch,
    // fitBounds path
    JSON.stringify(initialMap?.bounds),
  ]);

  // Defensive: resize when container becomes visible or size changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let raf = requestAnimationFrame(() => map.resize());
    const onVis = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => map.resize());
    };
    window.addEventListener('resize', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onVis);
    };
  }, [mounted]);

  return (
    <div
      className={className}
      ref={containerRef}
      style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }}
      data-mission-id={mission?.id || mission?.slug}
    />
  );
}

