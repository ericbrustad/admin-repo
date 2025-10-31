import React, { useEffect, useMemo, useState } from 'react';
import PhotoCapture from '../components/PhotoCapture';
import OutcomeModal from '../components/OutcomeModal';
import BackpackButton from '../components/BackpackButton';
import BackpackDrawer from '../components/BackpackDrawer';
import {
  initBackpack, getBackpack, addPhoto, addReward, addUtility, addClue,
  addPoints, recordAnswer
} from '../lib/backpack';
import { fetchGameBundle } from '../lib/supabase/client.js';

const SUPABASE_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function toDirect(u){ try{
  const url=new URL(u); const host=url.host.toLowerCase();
  if(host.endsWith('dropbox.com')){ url.host='dl.dropboxusercontent.com'; url.searchParams.delete('dl'); if(!url.searchParams.has('raw')) url.searchParams.set('raw','1'); return url.toString(); }
  if(host.endsWith('drive.google.com')){ let id=''; if(url.pathname.startsWith('/file/d/')){ id=url.pathname.split('/')[3]||''; } else if(url.pathname==='/open'){ id=url.searchParams.get('id')||''; } if(id) return `https://drive.google.com/uc?export=view&id=${id}`; }
  return u;
}catch{return u;}}

export default function Game() {
  const [suite, setSuite] = useState(null);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState('Loading…');
  const [idx, setIdx] = useState(0);

  const [showPhoto, setShowPhoto] = useState(null); // { overlayUrl, title }
  const [outcome, setOutcome]   = useState(null);   // object from mission.onCorrect/onWrong
  const [backpackOpen, setBackpackOpen] = useState(false);

  const { slug, channel } = useMemo(() => {
    if (typeof window === 'undefined') {
      return { slug: '', channel: 'published' };
    }
    try {
      const u = new URL(window.location.href);
      return { slug: u.searchParams.get('slug') || '', channel: u.searchParams.get('channel') || 'published' };
    } catch {
      return { slug: '', channel: 'published' };
    }
  }, []);

  useEffect(() => { initBackpack(slug); }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setSuite(null);
    setConfig(null);
    setStatus('Loading…');

    (async () => {
      if (!slug) {
        setStatus('Missing game slug.');
        return;
      }

      try {
        if (SUPABASE_ENABLED) {
          const bundle = await fetchGameBundle({ slug, channel });
          if (cancelled) return;
          const missions = Array.isArray(bundle?.missions) ? bundle.missions : [];
          const devices = Array.isArray(bundle?.devices) ? bundle.devices : [];
          const configFromSupabase = bundle?.config && typeof bundle.config === 'object'
            ? { ...bundle.config }
            : {};
          if (!Array.isArray(configFromSupabase.devices)) {
            configFromSupabase.devices = devices;
          }
          if (!Array.isArray(configFromSupabase.powerups) && Array.isArray(devices)) {
            configFromSupabase.powerups = configFromSupabase.powerups || [];
          }
          setSuite({ missions });
          setConfig(configFromSupabase);
          setStatus('');
          return;
        }

        const base = channel === 'published' ? 'published' : 'draft';
        const missionsRes = await fetch(`/games/${encodeURIComponent(slug)}/${base}/missions.json`, { cache: 'no-store' });
        if (!missionsRes.ok) throw new Error(`missions ${missionsRes.status}`);
        const ms = await missionsRes.json();
        const cfg = await fetch(`/games/${encodeURIComponent(slug)}/${base}/config.json`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({}));
        if (cancelled) return;
        setSuite(ms);
        setConfig(cfg);
        setStatus('');
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to load game bundle', e);
        setStatus('Failed to load game.');
      }
    })();

    return () => { cancelled = true; };
  }, [slug, channel]);

  if (!suite || !config) {
    return <main style={outer}><div style={card}>{status}</div></main>;
  }

  const missions = suite.missions || [];
  const m = missions[idx];

  function next() { setIdx(i => Math.min(i + 1, missions.length - 1)); }
  function prev() { setIdx(i => Math.max(i - 1, 0)); }

  function applyOutcome(o, wasCorrect) {
    if (!o || !o.enabled) return next();
    // Apply points?
    if (wasCorrect && typeof m?.rewards?.points === 'number') addPoints(slug, m.rewards.points);

    // Map rewards/punishments to backpack when configured
    if (o.rewardKey) {
      const row = (config.media?.rewards||[]).find(r => r.key === o.rewardKey);
      if (row) addReward(slug, { key: row.key, name: row.name || 'Reward', thumbUrl: row.thumbUrl || '' });
    }
    if (o.punishmentKey || o.deviceKey) {
      const key = o.punishmentKey || o.deviceKey;
      const all = [...(config.media?.punishments||[]), ...(config.devices||[])];
      const row = all.find(r => r.key === key || r.id === key || r.type === key);
      addUtility(slug, { key, name: row?.name || row?.title || 'Utility', thumbUrl: row?.thumbUrl || '' });
    }
    if (o.clueText) addClue(slug, o.clueText);

    // Show visual outcome
    setOutcome({
      title: wasCorrect ? 'Correct!' : 'Try Again',
      message: o.message,
      mediaUrl: o.mediaUrl ? toDirect(o.mediaUrl) : '',
      audioUrl: o.audioUrl ? toDirect(o.audioUrl) : ''
    });
  }

  function handleMC(answerIdx) {
    const ci = Number(m.content?.correctIndex);
    const ok = Number(answerIdx) === ci;
    recordAnswer(slug, m.id, { correct: ok, value: answerIdx });
    applyOutcome(ok ? m.onCorrect : m.onWrong, ok);
  }
  function handleSA(text) {
    const ans = (m.content?.answer || '').trim().toLowerCase();
    const acceptable = (m.content?.acceptable || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    const ok = [ans, ...acceptable].includes(String(text||'').trim().toLowerCase());
    recordAnswer(slug, m.id, { correct: ok, value: text });
    applyOutcome(ok ? m.onCorrect : m.onWrong, ok);
  }
  function handleStatementAck() {
    recordAnswer(slug, m.id, { correct: true, value: 'ack' });
    applyOutcome(m.onCorrect, true);
  }

  function renderMission() {
    if (!m) return <div>Game complete!</div>;
    const a = m.appearanceOverrideEnabled ? (m.appearance || {}) : (config.appearance || {});
    const bodyStyle = missionBodyStyle(a);
    const label = (s) => <div style={{ ...labelStyle, textAlign:a.textAlign }}>{s}</div>;

    switch (m.type) {
      case 'multiple_choice': {
        const ch = (m.content?.choices || []);
        return (
          <div style={bodyStyle}>
            {label(m.content?.question || '')}
            <div style={{ display:'grid', gap:8 }}>
              {ch.map((c, i)=>(
                <button key={i} style={btn} onClick={()=>handleMC(i)}>{c}</button>
              ))}
            </div>
          </div>
        );
      }
      case 'short_answer': {
        let val='';
        return (
          <div style={bodyStyle}>
            {label(m.content?.question || '')}
            <input style={input} onChange={(e)=>{ val=e.target.value; }} placeholder="Type your answer…"/>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button style={btn} onClick={()=>handleSA(val)}>Submit</button>
              <button style={btn} onClick={prev}>Back</button>
            </div>
          </div>
        );
      }
      case 'statement': {
        return (
          <div style={bodyStyle}>
            {label(m.content?.text || '')}
            <div style={{ textAlign:'right', marginTop:8 }}>
              <button style={btn} onClick={handleStatementAck}>✕ Acknowledge</button>
            </div>
          </div>
        );
      }
      case 'photo_opportunity': {
        const overlayUrl = resolveOverlayUrl(config, m.content?.overlayKey, m.content?.overlayUrl);
        return (
          <div style={bodyStyle}>
            {label(m.content?.text || 'Photo Opportunity')}
            <button style={btn} onClick={()=>setShowPhoto({ overlayUrl, title: 'Capture' })}>Open Camera</button>
          </div>
        );
      }
      default:
        return (
          <div style={bodyStyle}>
            {label('Unsupported mission type')}
            <div style={{ color:'#9fb0bf' }}>Type: {m.type}</div>
          </div>
        );
    }
  }

  return (
    <main style={outer}>

      {/* Backpack */}
      <BackpackButton onClick={()=>setBackpackOpen(true)} />
      <BackpackDrawer slug={slug} open={backpackOpen} onClose={()=>setBackpackOpen(false)} />

      {/* Mission */}
      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div><b>{config.game?.title || 'Game'}</b> — <span style={{ color:'#9fb0bf' }}>Mission {idx+1} / {missions.length}</span></div>
          <div style={{ color:'#9fb0bf' }}>Points: {getBackpack(slug).points || 0}</div>
        </div>
        {renderMission()}
      </div>

      {/* Photo overlay capture */}
      {showPhoto && (
        <PhotoCapture
          overlayUrl={showPhoto.overlayUrl}
          onCancel={()=>setShowPhoto(null)}
          onSave={(dataUrl)=>{
            addPhoto(slug, { dataUrl, title:'Captured' });
            setShowPhoto(null);
            recordAnswer(slug, m.id, { correct:true, value:'photo' });
            applyOutcome(m.onCorrect, true);
          }}
        />
      )}

      {/* Outcome modal */}
      <OutcomeModal open={!!outcome} outcome={outcome} onClose={()=>{ setOutcome(null); next(); }} />
    </main>
  );
}

/* helpers */

function missionBodyStyle(a) {
  const fontFamily = a.fontFamily || 'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  const fontSize   = (a.fontSizePx || 22) + 'px';
  const textBg     = `rgba(${hex(a.textBgColor||'#000')}, ${a.textBgOpacity ?? 0})`;
  const screenBg   = a.screenBgImage
    ? `linear-gradient(rgba(0,0,0,${a.screenBgOpacity??0}), rgba(0,0,0,${a.screenBgOpacity??0})), url(${toDirect(a.screenBgImage)}) center/cover no-repeat`
    : `linear-gradient(rgba(0,0,0,${a.screenBgOpacity??0}), rgba(0,0,0,${a.screenBgOpacity??0})), ${a.screenBgColor||'#000'}`;

  return {
    background: screenBg, padding:12, minHeight:260, display:'grid',
    alignContent: a.textVertical === 'center' ? 'center' : 'start',
    color: a.fontColor || '#fff', fontFamily, fontSize
  };
}
function hex(h){try{const s=h.replace('#','');const b=s.length===3?s.split('').map(c=>c+c).join(''):s;return `${parseInt(b.slice(0,2),16)}, ${parseInt(b.slice(2,4),16)}, ${parseInt(b.slice(4,6),16)}`;}catch{return'0,0,0';}}
const outer = { maxWidth: 960, margin:'0 auto', padding:12, minHeight:'100vh', background:'#0b0c10', color:'#e9eef2', fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif' };
const card  = { background:'#12181d', border:'1px solid #1f262d', borderRadius:12, padding:12, marginTop:12 };
const labelStyle = { background:'rgba(0,0,0,.25)', padding:'6px 10px', borderRadius:8, marginBottom:8 };
const btn   = { padding:'10px 12px', borderRadius:10, border:'1px solid #2a323b', background:'#1a2027', color:'#e9eef2', cursor:'pointer' };
const input = { padding:'10px 12px', borderRadius:10, border:'1px solid #2a323b', background:'#0b0c10', color:'#e9eef2', width:'100%' };

function resolveOverlayUrl(config, overlayKey, overlayUrl) {
  if (overlayUrl) return toDirect(overlayUrl);
  const list = config?.media?.overlays || [];
  const found = list.find(o => o.key === overlayKey || o.name === overlayKey);
  return found ? toDirect(found.url) : '';
}
