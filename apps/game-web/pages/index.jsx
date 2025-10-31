import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import PhotoCapture from '../components/PhotoCapture';
import OutcomeModal from '../components/OutcomeModal';
import BackpackButton from '../components/BackpackButton';
import BackpackDrawer from '../components/BackpackDrawer';
import MissionMap from '../components/MissionMap';
import {
  initBackpack,
  addPhoto,
  addReward,
  addUtility,
  addClue,
  addPoints,
  recordAnswer,
  onBackpackChange,
  getBackpackMap,
} from '../lib/backpack';
import { fetchGameBundle } from '../lib/supabase/client.js';
import { createMediaIndex, createMissionMap } from '../lib/mmaps';

const DEFAULT_SLUG = process.env.NEXT_PUBLIC_DEFAULT_GAME_SLUG || 'default';
const DEFAULT_CHANNEL = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL || 'published';

function firstString(value) {
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <pre style={{ maxWidth: 560, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </main>
      );
    }

    return this.props.children;
  }
}

function GameApp() {
  const router = useRouter();
  const [suite, setSuite] = useState(null);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState('Loading…');
  const [idx, setIdx] = useState(0);
  const [showPhoto, setShowPhoto] = useState(null); // { overlayUrl, title }
  const [outcome, setOutcome] = useState(null);   // outcome config snapshot
  const [backpackOpen, setBackpackOpen] = useState(false);
  const [points, setPoints] = useState(0);
  const [answers, setAnswers] = useState(() => new Map());
  const [backpackSummary, setBackpackSummary] = useState({});
  const [answerDraft, setAnswerDraft] = useState('');
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('pending');

  const slugParam = firstString(router?.query?.slug);
  const gameParam = firstString(router?.query?.game);
  const channelParam = firstString(router?.query?.channel);

  const slug = slugParam || gameParam || (router?.isReady ? DEFAULT_SLUG : '');
  const channel = channelParam || DEFAULT_CHANNEL;

  useEffect(() => {
    if (!router?.isReady) return;

    const canonicalSlug = slugParam || gameParam;
    const canonicalChannel = channelParam || DEFAULT_CHANNEL;

    const nextQuery = { ...router.query };
    let changed = false;

    if (!canonicalSlug) {
      nextQuery.slug = DEFAULT_SLUG;
      if (nextQuery.game) {
        delete nextQuery.game;
      }
      changed = true;
    } else {
      if (firstString(nextQuery.slug) !== canonicalSlug) {
        nextQuery.slug = canonicalSlug;
        changed = true;
      }
      if (nextQuery.game) {
        delete nextQuery.game;
        changed = true;
      }
    }

    if (firstString(nextQuery.channel) !== canonicalChannel) {
      nextQuery.channel = canonicalChannel;
      changed = true;
    }

    if (changed) {
      router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
    }
  }, [router, slugParam, gameParam, channelParam]);

  useEffect(() => {
    if (!slug) return;
    initBackpack(slug);
  }, [slug]);

  useEffect(() => {
    if (!slug) return undefined;
    const update = () => {
      const map = getBackpackMap(slug);
      setPoints(Number(map.get('points')) || 0);
      const answersMap = map.get('answers');
      if (answersMap instanceof Map) {
        setAnswers(new Map(answersMap));
      } else if (answersMap && typeof answersMap === 'object') {
        setAnswers(new Map(Object.entries(answersMap)));
      } else {
        setAnswers(new Map());
      }
      const pockets = ['photos', 'videos', 'audios', 'rewards', 'utilities', 'clues'];
      const summary = {};
      pockets.forEach((key) => {
        const items = map.get(key);
        summary[key] = Array.isArray(items) ? items.length : 0;
      });
      setBackpackSummary(summary);
    };
    update();
    return onBackpackChange(slug, update);
  }, [slug]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setLocationStatus('unsupported');
      return undefined;
    }

    let cancelled = false;

    const handleSuccess = (position) => {
      if (cancelled) return;
      const { coords, timestamp } = position || {};
      if (!coords) return;
      setLocation({
        lat: Number(coords.latitude),
        lng: Number(coords.longitude),
        accuracy: Number(coords.accuracy ?? 0),
        timestamp: timestamp || Date.now(),
      });
      setLocationStatus('ready');
    };

    const handleError = (error) => {
      if (cancelled) return;
      if (error && error.code === error.PERMISSION_DENIED) {
        setLocationStatus('denied');
      } else {
        setLocationStatus('error');
      }
    };

    try {
      navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 1000,
      });
    } catch (error) {
      handleError(error);
    }

    let watchId;
    try {
      watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 2000,
      });
    } catch (error) {
      handleError(error);
    }

    return () => {
      cancelled = true;
      if (
        watchId != null &&
        typeof navigator !== 'undefined' &&
        navigator.geolocation &&
        typeof navigator.geolocation.clearWatch === 'function'
      ) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSuite(null);
    setConfig(null);
    setStatus('Loading…');
    setIdx(0);

    (async () => {
      if (!slug) {
        setStatus('Loading default game…');
        return;
      }

      const loadStaticBundle = async () => {
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
      };

      const loadSupabaseBundle = async () => {
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
      };

      try {
        if (SUPABASE_ENABLED) {
          try {
            await loadSupabaseBundle();
            return;
          } catch (supabaseError) {
            if (cancelled) return;
            console.warn('Supabase bundle fetch failed, falling back to cached files', supabaseError);
            setStatus('Supabase unavailable, loading cached bundle…');
          }
        }

        await loadStaticBundle();
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to load game bundle', e);
        setStatus('Failed to load game.');
      }
    })();

    return () => { cancelled = true; };
  }, [slug, channel]);

  const missionMemo = useMemo(() => {
    const map = createMissionMap(suite?.missions || []);
    return { map, order: Array.from(map.keys()) };
  }, [suite?.missions]);

  const missionMap = missionMemo.map;
  const missionOrder = missionMemo.order;
  const missionIndexMap = useMemo(() => {
    const indexMap = new Map();
    missionOrder.forEach((id, index) => {
      indexMap.set(id, index);
    });
    return indexMap;
  }, [missionOrder]);
  const missionCount = missionOrder.length;
  const missionId = missionOrder[idx] || null;
  const mission = missionId ? missionMap.get(missionId) : null;

  useEffect(() => {
    setAnswerDraft('');
  }, [missionId]);

  useEffect(() => {
    if (!missionCount) {
      setIdx(0);
      return;
    }
    setIdx((current) => Math.min(current, missionCount - 1));
  }, [missionCount]);

  const rewardIndex = useMemo(
    () => createMediaIndex(config?.media?.rewards || []),
    [config],
  );
  const punishmentIndex = useMemo(
    () => createMediaIndex(config?.media?.punishments || []),
    [config],
  );
  const deviceIndex = useMemo(
    () => createMediaIndex(config?.devices || [], [
      (item) => item.key,
      (item) => item.id,
      (item) => item.type,
    ]),
    [config],
  );
  const overlayIndex = useMemo(
    () => createMediaIndex(config?.media?.overlays || [], [
      (item) => item.key,
      (item) => item.name,
    ]),
    [config],
  );

  if (!suite || !config) {
    return (
      <main style={BASE_OUTER_STYLE}>
        <div style={loadingState}>{status}</div>
      </main>
    );
  }

  const pageAppearance = config?.appearance || {};
  const outerStyle = gameBackgroundStyle(pageAppearance);

  function next() { setIdx((i) => Math.min(i + 1, Math.max(missionOrder.length - 1, 0))); }
  function prev() { setIdx((i) => Math.max(i - 1, 0)); }

  function resolveOverlayUrl(overlayKey, overlayUrl) {
    if (overlayUrl) return toDirect(overlayUrl);
    if (!overlayKey) return '';
    const found = overlayIndex.get(String(overlayKey));
    return found && found.url ? toDirect(found.url) : '';
  }

  function applyOutcome(o, wasCorrect) {
    if (!o || !o.enabled) return next();
    if (wasCorrect && typeof mission?.rewards?.points === 'number') addPoints(slug, mission.rewards.points);

    if (o.rewardKey) {
      const rewardRow = rewardIndex.get(String(o.rewardKey));
      if (rewardRow) addReward(slug, { key: rewardRow.key || o.rewardKey, name: rewardRow.name || 'Reward', thumbUrl: rewardRow.thumbUrl || '' });
    }

    const utilKey = o.punishmentKey || o.deviceKey;
    if (utilKey) {
      const source = punishmentIndex.get(String(utilKey)) || deviceIndex.get(String(utilKey));
      addUtility(slug, {
        key: utilKey,
        name: source?.name || source?.title || 'Utility',
        thumbUrl: source?.thumbUrl || '',
      });
    }

    if (o.clueText) addClue(slug, o.clueText);

    setOutcome({
      title: wasCorrect ? 'Correct!' : 'Try Again',
      message: o.message,
      mediaUrl: o.mediaUrl ? toDirect(o.mediaUrl) : '',
      audioUrl: o.audioUrl ? toDirect(o.audioUrl) : '',
    });
  }

  function handleMC(answerIdx) {
    const ci = Number(mission?.content?.correctIndex);
    const ok = Number(answerIdx) === ci;
    recordAnswer(slug, mission?.id, { correct: ok, value: answerIdx });
    applyOutcome(ok ? mission?.onCorrect : mission?.onWrong, ok);
  }

  function handleSA(text) {
    const ans = (mission?.content?.answer || '').trim().toLowerCase();
    const acceptable = (mission?.content?.acceptable || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const normalized = String(text || '').trim().toLowerCase();
    const ok = [ans, ...acceptable].includes(normalized);
    recordAnswer(slug, mission?.id, { correct: ok, value: text });
    applyOutcome(ok ? mission?.onCorrect : mission?.onWrong, ok);
  }

  function handleStatementAck() {
    recordAnswer(slug, mission?.id, { correct: true, value: 'ack' });
    applyOutcome(mission?.onCorrect, true);
  }

  function renderMission() {
    if (!mission) return <div>Game complete!</div>;
    const appearance = mission.appearanceOverrideEnabled ? (mission.appearance || {}) : (config.appearance || {});
    const bodyStyle = missionBodyStyle(appearance);
    const labelBackground = `rgba(${hex(appearance.textBgColor || '#000')}, ${appearance.textBgOpacity ?? 0})`;
    const labelColor = appearance.fontColor || '#fff';
    const labelShadow = appearance.textShadow || 'none';
    const label = (s) => (
      <div
        style={{
          ...labelStyle,
          textAlign: appearance.textAlign,
          background: labelBackground,
          color: labelColor,
          textShadow: labelShadow,
        }}
      >
        {s}
      </div>
    );

    switch (mission.type) {
      case 'multiple_choice': {
        const ch = mission.content?.choices || [];
        return (
          <div style={bodyStyle}>
            {label(mission.content?.question || '')}
            <div style={{ display:'grid', gap:8 }}>
              {ch.map((c, i)=>(
                <button key={i} style={btn} onClick={()=>handleMC(i)}>{c}</button>
              ))}
            </div>
          </div>
        );
      }
      case 'short_answer': {
        return (
          <div style={bodyStyle}>
            {label(mission.content?.question || '')}
            <input
              style={input}
              value={answerDraft}
              onChange={(e)=>setAnswerDraft(e.target.value)}
              placeholder="Type your answer…"
            />
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button style={btn} onClick={()=>handleSA(answerDraft)}>Submit</button>
              <button style={btn} onClick={prev}>Back</button>
            </div>
          </div>
        );
      }
      case 'statement': {
        return (
          <div style={bodyStyle}>
            {label(mission.content?.text || '')}
            <div style={{ textAlign:'right', marginTop:8 }}>
              <button style={btn} onClick={handleStatementAck}>✕ Acknowledge</button>
            </div>
          </div>
        );
      }
      case 'photo_opportunity': {
        const overlayUrl = resolveOverlayUrl(mission.content?.overlayKey, mission.content?.overlayUrl);
        return (
          <div style={bodyStyle}>
            {label(mission.content?.text || 'Photo Opportunity')}
            <button style={btn} onClick={()=>setShowPhoto({ overlayUrl, title: 'Capture' })}>Open Camera</button>
          </div>
        );
      }
      default:
        return (
          <div style={bodyStyle}>
            {label('Unsupported mission type')}
            <div style={{ color:'#9fb0bf' }}>Type: {mission.type}</div>
          </div>
        );
    }
  }

  const missionsForMap = useMemo(() => {
    return missionOrder.map((id, index) => {
      const row = missionMap.get(id) || {};
      const content = row?.content || {};
      return {
        id,
        index,
        indexLabel: String(index + 1).padStart(2, '0'),
        title: row.title || row.name || `Mission ${index + 1}`,
        subtitle: row.type ? row.type.replace(/_/g, ' ') : 'mission',
        lat: Number(content.lat),
        lng: Number(content.lng),
        radiusMeters: Number(content.radiusMeters),
        type: row.type,
      };
    });
  }, [missionOrder, missionMap]);

  const devicesForMap = useMemo(() => {
    const list = Array.isArray(config?.devices) ? config.devices : [];
    return list.map((device, index) => {
      const lat = device?.location?.lat ?? device?.lat ?? device?.latitude;
      const lng = device?.location?.lng ?? device?.lng ?? device?.longitude;
      return {
        id: device?.id || `device-${index + 1}`,
        title: device?.title || device?.name || `Device ${index + 1}`,
        type: device?.type || '',
        lat: Number(lat),
        lng: Number(lng),
        radiusMeters: Number(
          device?.radiusMeters ?? device?.pickupRadius ?? device?.rangeMeters ?? 0,
        ),
      };
    });
  }, [config?.devices]);

  const totalBackpackItems = useMemo(() => {
    return Object.values(backpackSummary || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
  }, [backpackSummary]);

  const summaryEntries = useMemo(() => {
    return Object.entries(backpackSummary || {}).filter(([, count]) => Number(count) > 0);
  }, [backpackSummary]);

  const completedCount = useMemo(() => {
    return missionOrder.reduce((sum, id) => {
      const entry =
        answers instanceof Map
          ? answers.get(id)
          : answers && typeof answers === 'object'
          ? answers[id]
          : null;
      return sum + (entry && entry.correct ? 1 : 0);
    }, 0);
  }, [missionOrder, answers]);

  const missionTypeLabel = mission?.type
    ? mission.type.replace(/_/g, ' ')
    : mission
    ? 'mission'
    : 'complete';
  const missionTitleText = mission?.title || (missionCount ? config.game?.title || 'Mission' : 'Game complete');
  const missionMediaUrl = mission?.content?.mediaUrl ? toDirect(mission.content.mediaUrl) : '';

  const missionHint = useMemo(() => {
    if (!mission) return '';
    const content = mission.content || {};
    if (mission.type === 'statement') return '';
    if (mission.type === 'photo_opportunity') {
      return content.text || content.hint || '';
    }
    return content.hint || '';
  }, [mission]);

  const missionStatusLabel = useMemo(() => {
    if (!mission?.id) {
      if (!missionCount) return 'Pending';
      return idx >= missionCount ? 'Complete' : 'Pending';
    }
    const entry =
      answers instanceof Map
        ? answers.get(mission.id)
        : answers && typeof answers === 'object'
        ? answers[mission.id]
        : null;
    if (!entry) return 'Pending';
    return entry.correct ? 'Complete' : 'Attempted';
  }, [mission, answers, missionCount, idx]);

  const locationMessage = useMemo(() => {
    switch (locationStatus) {
      case 'pending':
        return 'Locating…';
      case 'unsupported':
        return 'Location unavailable on this device';
      case 'denied':
        return 'Enable location to show your position';
      case 'error':
        return 'Unable to determine location';
      case 'ready':
      default:
        return '';
    }
  }, [locationStatus]);

  return (
    <main style={outerStyle}>
      <MissionMap
        missions={missionsForMap}
        currentId={missionId}
        answers={answers}
        onSelect={(id) => {
          if (!missionIndexMap.has(id)) return;
          setIdx(missionIndexMap.get(id));
        }}
        currentLocation={location}
      >
        <div style={mapTopBar}>
          <div style={progressCardStyle}>
            <div style={cardHeadingStyle}>Progress</div>
            <div style={progressValues}>
              <span style={progressPrimary}>{completedCount}</span>
              <span style={progressSecondary}>/ {missionCount}</span>
            </div>
            {summaryEntries.length > 0 && (
              <div style={summaryChipRow}>
                {summaryEntries.map(([key, count]) => (
                  <span key={key} style={summaryChip}>
                    <strong>{count}</strong>
                    <span style={summaryLabel}>{key}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={pointsCardStyle}>
            <div style={cardHeadingStyle}>Points</div>
            <div style={pointsValueStyle}>{points}</div>
            <div style={pointsMetaStyle}>
              {totalBackpackItems} item{totalBackpackItems === 1 ? '' : 's'} in backpack
            </div>
          </div>
        </div>

        {locationMessage ? <div style={locationBadgeStyle}>{locationMessage}</div> : null}

        <section style={missionSheetStyle}>
          <header style={missionSheetHeader}>
            <div style={missionHeadingStyle}>
              <span style={missionMetaLabelStyle}>
                Mission {missionCount ? idx + 1 : 0} / {missionCount}
              </span>
              <span style={missionTitleStyle}>{missionTitleText}</span>
            </div>
            <div style={missionMetaRowStyle}>
              <span style={missionMetaValueStyle}>{missionTypeLabel}</span>
              <span style={missionMetaValueStyle}>{missionStatusLabel}</span>
            </div>
          </header>

          {missionHint ? <p style={missionHintStyle}>{missionHint}</p> : null}

          {missionMediaUrl ? (
            <div style={missionMediaBox}>
              <img alt="" src={missionMediaUrl} style={missionMediaImage} />
            </div>
          ) : null}

          <div style={missionContentWrap}>{renderMission()}</div>
        </section>
      </MissionMap>

      <BackpackButton onClick={() => setBackpackOpen(true)} itemCount={totalBackpackItems} />
      <BackpackDrawer slug={slug} open={backpackOpen} onClose={() => setBackpackOpen(false)} />

      {showPhoto && (
        <PhotoCapture
          overlayUrl={showPhoto.overlayUrl}
          onCancel={() => setShowPhoto(null)}
          onSave={(dataUrl) => {
            addPhoto(slug, { dataUrl, title: 'Captured' });
            setShowPhoto(null);
            recordAnswer(slug, mission?.id, { correct: true, value: 'photo' });
            applyOutcome(mission?.onCorrect, true);
          }}
        />
      )}

      <OutcomeModal open={!!outcome} outcome={outcome} onClose={() => { setOutcome(null); next(); }} />
    </main>
  );
}

export default function Home() {
  return (
    <ErrorBoundary>
      <GameApp />
    </ErrorBoundary>
  );
}

function missionBodyStyle(a) {
  const fontFamily = a.fontFamily || 'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  const fontSize = (a.fontSizePx || 22) + 'px';
  const textBg = `rgba(${hex(a.textBgColor || '#000')}, ${a.textBgOpacity ?? 0})`;
  const overlay = clamp01(a.screenBgOpacity ?? 0);
  const overlayLayer = `rgba(0,0,0,${overlay})`;
  const hasImage = a.screenBgImage && (a.screenBgImageEnabled !== false);
  const screenBg = hasImage
    ? `linear-gradient(${overlayLayer}, ${overlayLayer}), url(${toDirect(a.screenBgImage)}) center/cover no-repeat`
    : `linear-gradient(${overlayLayer}, ${overlayLayer}), ${a.screenBgColor || '#000'}`;

  return {
    background: screenBg,
    padding: 12,
    minHeight: 260,
    display: 'grid',
    alignContent: a.textVertical === 'center' ? 'center' : 'start',
    color: a.fontColor || '#fff',
    fontFamily,
    fontSize,
    textShadow: a.textShadow || 'none',
    backdropFilter: textBg.includes('rgba') ? 'blur(1px)' : undefined,
  };
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(Math.max(number, 0), 1);
}

function gameBackgroundStyle(a) {
  const base = { ...BASE_OUTER_STYLE };
  const overlay = clamp01(a.screenBgOpacity ?? 0);
  const overlayLayer = `rgba(0,0,0,${clamp01(overlay * 0.85)})`;
  const hasImage = a.screenBgImage && (a.screenBgImageEnabled !== false);
  const fallbackColor = a.screenBgColor || base.background || '#020b12';

  if (hasImage) {
    base.background = `linear-gradient(${overlayLayer}, ${overlayLayer}), url(${toDirect(a.screenBgImage)})`;
    base.backgroundSize = 'cover';
    base.backgroundRepeat = 'no-repeat';
    base.backgroundPosition = 'center';
  } else {
    base.background = `linear-gradient(${overlayLayer}, ${overlayLayer}), ${fallbackColor}`;
    base.backgroundSize = 'cover';
    base.backgroundRepeat = 'no-repeat';
    base.backgroundPosition = 'center';
  }

  base.color = a.fontColor || base.color;
  base.fontFamily = a.fontFamily || base.fontFamily;

  return base;
}

function hex(h){try{const s=h.replace('#','');const b=s.length===3?s.split('').map(c=>c+c).join(''):s;return `${parseInt(b.slice(0,2),16)}, ${parseInt(b.slice(2,4),16)}, ${parseInt(b.slice(4,6),16)}`;}catch{return'0,0,0';}}

const BASE_OUTER_STYLE = {
  position: 'relative',
  minHeight: '100vh',
  width: '100%',
  color: '#e9eef2',
  background: '#020b12',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
  overflow: 'hidden',
  transition: 'background 0.6s ease, color 0.3s ease, font-family 0.3s ease',
};

const loadingState = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  background: 'rgba(15, 23, 42, 0.85)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 16,
  padding: '18px 26px',
  fontSize: 16,
  boxShadow: '0 24px 48px rgba(2, 6, 23, 0.5)',
};

const mapTopBar = {
  position: 'absolute',
  top: 16,
  left: 16,
  right: 16,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  justifyContent: 'space-between',
  alignItems: 'stretch',
  zIndex: 30,
  pointerEvents: 'none',
};

const overlayCardBase = {
  pointerEvents: 'auto',
  background: 'rgba(9, 16, 24, 0.82)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 18,
  padding: '14px 16px',
  boxShadow: '0 18px 36px rgba(2, 6, 23, 0.45)',
  backdropFilter: 'blur(10px)',
};

const progressCardStyle = {
  ...overlayCardBase,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 240,
  flex: '1 1 280px',
};

const pointsCardStyle = {
  ...overlayCardBase,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 6,
  minWidth: 180,
  maxWidth: 240,
};

const cardHeadingStyle = {
  fontSize: 12,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  color: '#94a3b8',
};

const progressValues = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
};

const progressPrimary = {
  fontSize: 28,
  fontWeight: 700,
};

const progressSecondary = {
  fontSize: 16,
  color: '#94a3b8',
};

const summaryChipRow = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const summaryChip = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 4,
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(79, 209, 197, 0.12)',
  border: '1px solid rgba(79, 209, 197, 0.35)',
  fontSize: 12,
};

const summaryLabel = {
  opacity: 0.75,
  textTransform: 'capitalize',
};

const pointsValueStyle = {
  fontSize: 28,
  fontWeight: 700,
};

const pointsMetaStyle = {
  fontSize: 12,
  color: '#94a3b8',
};

const locationBadgeStyle = {
  position: 'absolute',
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '6px 16px',
  borderRadius: 999,
  background: 'rgba(9, 16, 24, 0.88)',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  fontSize: 13,
  zIndex: 35,
  backdropFilter: 'blur(8px)',
};

const missionSheetStyle = {
  position: 'absolute',
  left: '50%',
  bottom: 24,
  transform: 'translateX(-50%)',
  width: 'min(680px, 94vw)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  background: 'rgba(8, 15, 23, 0.9)',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 24,
  padding: 20,
  boxShadow: '0 24px 48px rgba(2, 6, 23, 0.5)',
  backdropFilter: 'blur(12px)',
  zIndex: 40,
  pointerEvents: 'auto',
};

const missionSheetHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  flexWrap: 'wrap',
};

const missionHeadingStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 220,
};

const missionMetaLabelStyle = {
  fontSize: 12,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: '#94a3b8',
};

const missionTitleStyle = {
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1.2,
};

const missionMetaRowStyle = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  fontSize: 12,
  color: '#9fb0bf',
  textTransform: 'capitalize',
};

const missionMetaValueStyle = {
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 999,
  padding: '4px 10px',
  textTransform: 'uppercase',
  letterSpacing: 0.7,
  fontWeight: 600,
};

const missionHintStyle = {
  margin: 0,
  fontSize: 14,
  color: '#d1def8',
  lineHeight: 1.5,
};

const missionMediaBox = {
  borderRadius: 18,
  overflow: 'hidden',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  maxHeight: 260,
  boxShadow: '0 20px 40px rgba(2, 6, 23, 0.45)',
};

const missionMediaImage = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const missionContentWrap = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const labelStyle = { padding: '6px 10px', borderRadius: 8, marginBottom: 8, display: 'inline-block' };
const btn = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #2a323b',
  background: '#1a2027',
  color: '#e9eef2',
  cursor: 'pointer',
};
const input = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #2a323b',
  background: '#0b0c10',
  color: '#e9eef2',
  width: '100%',
};
