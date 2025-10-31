// components/map-kit.jsx
import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_ICONS } from '../lib/admin-shared';

/* ---------- Overview (missions + devices) ---------- */
export function MapOverview({
  missions = [], devices = [], icons = DEFAULT_ICONS, showRings = true,
  interactive = false, draftDevice = null, selectedDevIdx = null,
  onDraftChange = null, onMoveSelected = null, onMoveNearest = null,
}) {
  const divRef = useRef(null);
  const [leafletReady, setLeafletReady] = useState(!!(typeof window !== 'undefined' && window.L));

  function getMissionPos(m){
    const c=m?.content||{}; const lat=Number(c.lat), lng=Number(c.lng);
    if(!isFinite(lat)||!isFinite(lng))return null; if(!(c.geofenceEnabled||Number(c.radiusMeters)>0))return null; return [lat,lng];
  }
  function getDevicePos(d){ const lat=Number(d?.lat),lng=Number(d?.lng); if(!isFinite(lat)||!isFinite(lng))return null; return [lat,lng]; }
  function iconUrl(kind,key){ if(!key)return''; const list=icons?.[kind]||[]; const it=list.find(x=>x.key===key); return it?(it.url||''):''; }
  function numberedIcon(number, imgUrl, color='#60a5fa', highlight=false){
    const img = imgUrl
      ? `<img src="${imgUrl}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:2px solid ${highlight?'#22c55e':'white'};box-shadow:0 0 0 2px #1f2937"/>`
      : `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:2px solid ${highlight?'#22c55e':'white'};box-shadow:0 0 0 2px #1f2937"></div>`;
    return window.L.divIcon({
      className:'num-pin',
      html:`<div style="position:relative;display:grid;place-items:center">${img}<div style="position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);font-weight:700;font-size:12px;color:#fff;text-shadow:0 1px 2px #000">${number}</div></div>`,
      iconSize:[24,28], iconAnchor:[12,12]
    });
  }

  useEffect(()=>{ if(typeof window==='undefined')return;
    if(window.L){ setLeafletReady(true); return; }
    const link=document.createElement('link'); link.rel='stylesheet'; link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    const s=document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.async=true; s.onload=()=>setLeafletReady(true); document.body.appendChild(s);
  },[]);

  useEffect(()=>{
    if(!leafletReady || !divRef.current || typeof window==='undefined') return;
    const L = window.L; if (!L) return;

    if(!divRef.current._leaflet_map){
      const map=L.map(divRef.current,{ center:[44.9778,-93.2650], zoom:13 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19, attribution:'© OpenStreetMap contributors' }).addTo(map);
      divRef.current._leaflet_map=map;
    }
    const map=divRef.current._leaflet_map;

    if(!map._layerGroup) map._layerGroup=L.layerGroup().addTo(map);
    map._layerGroup.clearLayers();
    const layer=map._layerGroup;
    const bounds=L.latLngBounds([]);

    (missions||[]).forEach((m,idx)=>{
      const pos=getMissionPos(m); if(!pos) return;
      const url=iconUrl('missions', m.iconKey);
      L.marker(pos,{icon:numberedIcon(idx+1,url,'#60a5fa',false)}).addTo(layer);
      const rad=Number(m.content?.radiusMeters||0);
      if(showRings && rad>0) L.circle(pos,{ radius:rad, color:'#60a5fa', fillOpacity:0.08 }).addTo(layer);
      bounds.extend(pos);
    });

    (devices||[]).forEach((d,idx)=>{
      const pos=getDevicePos(d); if(!pos) return;
      const url=iconUrl('devices', d.iconKey);
      const hl = (selectedDevIdx===idx);
      L.marker(pos,{icon:numberedIcon(`D${idx+1}`,url,'#f59e0b',hl)}).addTo(layer);
      const rad=Number(d.pickupRadius||0);
      if(showRings && rad>0) L.circle(pos,{ radius:rad, color:'#f59e0b', fillOpacity:0.08 }).addTo(layer);
      bounds.extend(pos);
    });

    if(draftDevice && typeof draftDevice.lat==='number' && typeof draftDevice.lng==='number'){
      const pos=[draftDevice.lat, draftDevice.lng];
      const mk=L.marker(pos,{ icon:numberedIcon('D+','', '#34d399',true), draggable:true }).addTo(layer);
      if(showRings && Number(draftDevice.radius)>0){
        const c=L.circle(pos,{ radius:Number(draftDevice.radius), color:'#34d399', fillOpacity:0.08 }).addTo(layer);
        mk.on('drag',()=>c.setLatLng(mk.getLatLng()));
      }
      mk.on('dragend',()=>{ const p=mk.getLatLng(); onDraftChange && onDraftChange(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))); });
      bounds.extend(pos);
    }

    // CLICK: place draft / move selected / move nearest
    if (map._clickHandler) map.off('click', map._clickHandler);
    map._clickHandler = (e) => {
      const lat=e.latlng.lat, lng=e.latlng.lng;
      if (interactive && onDraftChange) { onDraftChange(Number(lat.toFixed(6)), Number(lng.toFixed(6))); return; }
      if (selectedDevIdx!=null && onMoveSelected) { onMoveSelected(Number(lat.toFixed(6)), Number(lng.toFixed(6))); return; }

      // move nearest
      if (!onMoveNearest) return;
      const candidates=[];
      (missions||[]).forEach((m,idx)=>{ const c=m?.content||{}; const p=(c.geofenceEnabled||Number(c.radiusMeters)>0)&&isFinite(c.lat)&&isFinite(c.lng)?[c.lat,c.lng]:null; if(p) candidates.push({ kind:'mission', idx, lat:p[0], lng:p[1] }); });
      (devices||[]).forEach((d,idx)=>{ const p=(isFinite(d.lat)&&isFinite(d.lng))?[d.lat,d.lng]:null; if(p) candidates.push({ kind:'device', idx, lat:p[0], lng:p[1] }); });
      if(candidates.length===0) return;

      let best=null, bestDist=Infinity;
      candidates.forEach(c=>{ const d=map.distance([c.lat,c.lng], e.latlng); if(d<bestDist){bestDist=d; best=c;} });
      if(best) onMoveNearest(best.kind, best.idx, lat, lng);
    };
    map.on('click', map._clickHandler);

    if(bounds.isValid()) map.fitBounds(bounds.pad(0.2));
  },[leafletReady, missions, devices, icons, showRings, interactive, draftDevice, selectedDevIdx, onDraftChange, onMoveSelected, onMoveNearest]);

  return (
    <div>
      {!leafletReady && <div style={{ color:'#9fb0bf', marginBottom:8 }}>Loading map…</div>}
      <div ref={divRef} style={{ height:560, borderRadius:12, border:'1px solid #22303c', background:'#0b1116' }}/>
    </div>
  );
}

/* ---------- Small Picker for mission editor ---------- */
export function MapPicker({ lat, lng, radius, onChange }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const circleRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [r, setR] = useState(radius || 25);
  const defaultPos = [typeof lat === 'number' ? lat : 44.9778, typeof lng === 'number' ? lng : -93.265];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.L) { setReady(true); return; }
    const link = document.createElement('link'); link.rel='stylesheet';
    link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    const s = document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.async=true; s.onload=()=>setReady(true); document.body.appendChild(s);
  }, []);
  useEffect(() => {
    if (!ready || !divRef.current || typeof window === 'undefined') return;
    const L = window.L; if (!L) return;
    if (!mapRef.current) {
      mapRef.current = L.map(divRef.current).setView(defaultPos, (typeof lat === 'number' && typeof lng === 'number') ? 16 : 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap' }).addTo(mapRef.current);
      markerRef.current = L.marker(defaultPos, { draggable:true }).addTo(mapRef.current);
      circleRef.current = L.circle(markerRef.current.getLatLng(), { radius: r || 25, color:'#33a8ff' }).addTo(mapRef.current);
      const sync = () => { const p=markerRef.current.getLatLng(); circleRef.current.setLatLng(p); circleRef.current.setRadius(Number(r||25)); onChange(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)), Number(r||25)); };
      markerRef.current.on('dragend', sync);
      mapRef.current.on('click', (e)=>{ markerRef.current.setLatLng(e.latlng); sync(); });
      sync();
    } else {
      const p=defaultPos; markerRef.current.setLatLng(p); circleRef.current.setLatLng(p); circleRef.current.setRadius(Number(r||25));
    }
  }, [ready]); // eslint-disable-line
  useEffect(()=>{ setR(radius || 25); },[radius]);
  useEffect(() => {
    if (circleRef.current && markerRef.current) {
      circleRef.current.setRadius(Number(r || 25));
      const p = markerRef.current.getLatLng();
      onChange(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)), Number(r || 25));
    }
  }, [r]); // eslint-disable-line

  return (
    <div>
      <div ref={divRef} style={{ width:'100%', height:320, borderRadius:12, overflow:'hidden', border:'1px solid #2a323b', marginBottom:8 }} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
        <input type="range" min={5} max={2000} step={5} value={r} onChange={(e)=>setR(Number(e.target.value))}/>
        <code style={{ color:'#9fb0bf' }}>{r} m</code>
      </div>
    </div>
  );
}
