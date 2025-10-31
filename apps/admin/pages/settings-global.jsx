// CODEX NOTE: Settings (Global) page – hosts the inline settings, including
// the "Saved Games" dropdown that lists ALL games.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import SavedGamesSelect from '../components/SavedGamesSelect';
import RepoSnapshotFooter from '../components/RepoSnapshotFooter';
import MapEngineToggle from '../components/Settings/MapEngineToggle';
import { getPreviewOpen } from '../lib/mapEngine';

const SettingsMapPreview = dynamic(() => import('../components/maps/SettingsMapPreview'), { ssr: false });

const styles = {
  page: { padding: 24 },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 16 },
  section: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 },
  status: { fontSize: 12, fontWeight: 600, color: '#065f46' },
  statusBusy: { fontSize: 12, fontWeight: 600, color: '#1d4ed8' },
  error: { fontSize: 12, fontWeight: 600, color: '#b91c1c' },
  previewFrame: { display: 'grid', gap: 10 },
};

function normalizeChannel(value) {
  const v = String(value || 'draft').toLowerCase();
  return v === 'published' ? 'published' : 'draft';
}

function cloneConfig(config) {
  if (!config || typeof config !== 'object') return {};
  if (typeof structuredClone === 'function') {
    try { return structuredClone(config); } catch { /* ignore */ }
  }
  try {
    return JSON.parse(JSON.stringify(config));
  } catch {
    return { ...config };
  }
}

export default function SettingsGlobalPage() {
  const router = useRouter();
  const slugParam = useMemo(() => {
    const raw = router.query?.game;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return 'default';
  }, [router.query?.game]);
  const channelParam = useMemo(() => normalizeChannel(router.query?.channel), [router.query?.channel]);

  const [gameConfig, setGameConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const mapApiRef = useRef(null);

  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    setError('');
    try {
      const url = `/api/games/one?slug=${encodeURIComponent(slugParam)}&channel=${encodeURIComponent(channelParam)}`;
      const response = await fetch(url, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || json?.ok === false) {
        throw new Error(json?.error || 'Unable to load game config');
      }
      const cfg = json?.game?.config || {};
      setGameConfig(cfg);
    } catch (err) {
      setGameConfig(null);
      setError(err?.message || 'Unable to load game config');
    } finally {
      setLoadingConfig(false);
    }
  }, [slugParam, channelParam]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handle = (event) => {
      const detail = event?.detail || {};
      const eventSlug = detail?.slug || 'default';
      const eventChannel = normalizeChannel(detail?.channel);
      if (eventSlug === slugParam && eventChannel === channelParam && detail?.config) {
        setGameConfig(detail.config);
      }
    };
    window.addEventListener('AdminGameSelected', handle);
    return () => {
      window.removeEventListener('AdminGameSelected', handle);
    };
  }, [slugParam, channelParam]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setShowPreview(getPreviewOpen());
  }, []);

  const reloadConfig = useCallback(async () => {
    await fetchConfig();
  }, [fetchConfig]);

  const persistCenter = useCallback(
    async ({ lat, lng, lockLayout }) => {
      const numericLat = Number(lat);
      const numericLng = Number(lng);
      if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) {
        alert('Invalid coordinates.');
        return false;
      }
      setSaving(true);
      setStatus('Saving map center…');
      setError('');
      const slug = slugParam;
      const channel = channelParam;
      try {
        if (lockLayout) {
          const response = await fetch('/api/games/recenter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slug,
              channel,
              newCenter: { lat: numericLat, lng: numericLng },
            }),
          });
          const json = await response.json();
          if (!response.ok || json?.ok === false) {
            throw new Error(json?.error || 'Recenter failed');
          }
          setStatus('Center updated with layout lock.');
        } else {
          const nextConfig = cloneConfig(gameConfig || {});
          const nextMap = { ...(nextConfig.map || {}), center: { lat: numericLat, lng: numericLng } };
          nextConfig.map = nextMap;
          const title = nextConfig?.game?.title || slug;
          const response = await fetch('/api/games/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slug,
              channel,
              title,
              config: nextConfig,
            }),
          });
          const json = await response.json();
          if (!response.ok || json?.ok === false) {
            throw new Error(json?.error || 'Save failed');
          }
          setStatus('Center updated.');
        }
        await reloadConfig();
        return true;
      } catch (err) {
        setError(err?.message || 'Failed to update center');
        setStatus('');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [channelParam, gameConfig, reloadConfig, slugParam],
  );

  const handleMapReady = useCallback((api) => {
    mapApiRef.current = api || null;
  }, []);

  const useCurrentView = useCallback(
    async (lockLayout) => {
      if (!mapApiRef.current?.getCenterZoom) {
        alert('Open the map preview first.');
        return;
      }
      const { lat, lng } = mapApiRef.current.getCenterZoom();
      await persistCenter({ lat, lng, lockLayout });
    },
    [persistCenter],
  );

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>Settings</h1>
      <section style={styles.section}>
        <SavedGamesSelect />
        <MapEngineToggle
          onSetCenter={persistCenter}
          onUseCurrentViewRequest={useCurrentView}
          onPreviewChange={setShowPreview}
        />
        {status && !saving && <div style={styles.status}>{status}</div>}
        {saving && <div style={styles.statusBusy}>Saving map center…</div>}
        {error && <div style={styles.error}>{error}</div>}
        {showPreview && (
          <div style={styles.previewFrame}>
            {loadingConfig && <div style={{ fontSize: 12, color: '#6b7280' }}>Loading map preview…</div>}
            {!loadingConfig && gameConfig && (
              <SettingsMapPreview gameConfig={gameConfig} height={340} onReady={handleMapReady} />
            )}
            {!loadingConfig && !gameConfig && (
              <div style={{ fontSize: 12, color: '#6b7280' }}>No map data available for this game.</div>
            )}
          </div>
        )}
      </section>
      <RepoSnapshotFooter />
    </div>
  );
}
