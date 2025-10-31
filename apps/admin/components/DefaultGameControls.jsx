// CODEx note: Default game selectors (all vs published-only) with localStorage + server KV fallback.
import React from 'react';

const LS_KEYS = {
  any: 'esx_default_game_slug',
  pub: 'esx_default_published_game_slug',
};

function envDefault(key, fallback = null) {
  if (typeof window !== 'undefined' && window.__ENV__) {
    return window.__ENV__[key] || fallback;
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || fallback;
  }
  return fallback;
}

function labelFor(game) {
  return `${game.title} (${game.channel})`;
}

const styles = {
  wrap: { display: 'grid', gap: 16 },
  group: { display: 'grid', gap: 6 },
  label: { fontWeight: 600 },
  select: {
    width: '100%',
    borderRadius: 12,
    border: '1px solid var(--admin-border-soft)',
    padding: '10px 12px',
    background: 'var(--admin-input-bg)',
    color: 'var(--admin-body-color)',
  },
  helper: { fontSize: 12, color: 'var(--admin-muted)' },
  actions: { display: 'flex', alignItems: 'center', gap: 12 },
  button: {
    borderRadius: 12,
    padding: '8px 16px',
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--admin-panel-bg)',
    color: 'var(--admin-body-color)',
    cursor: 'pointer',
    boxShadow: '0 14px 28px rgba(15, 23, 42, 0.35)',
  },
  note: { fontSize: 12, color: 'var(--admin-muted)' },
};

export default function DefaultGameControls() {
  const [games, setGames] = React.useState([]);
  const [gamesLoading, setGamesLoading] = React.useState(true);
  const [settingsLoading, setSettingsLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [note, setNote] = React.useState('');

  const [anySlug, setAnySlug] = React.useState(
    typeof window !== 'undefined'
      ? localStorage.getItem(LS_KEYS.any)
        || envDefault('NEXT_PUBLIC_DEFAULT_GAME_SLUG')
        || ''
      : ''
  );

  const [pubSlug, setPubSlug] = React.useState(
    typeof window !== 'undefined'
      ? localStorage.getItem(LS_KEYS.pub)
        || envDefault('NEXT_PUBLIC_DEFAULT_PUBLISHED_GAME_SLUG')
        || ''
      : ''
  );

  const loading = gamesLoading || settingsLoading;

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        setGamesLoading(true);
        const r = await fetch('/api/games/list');
        const j = await r.json();
        if (!active) return;
        setGames(Array.isArray(j.games) ? j.games : []);
      } catch {
        if (!active) return;
        setGames([]);
      } finally {
        if (active) setGamesLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        setSettingsLoading(true);
        const res = await fetch('/api/app-settings');
        if (!active) return;
        if (res.ok) {
          const payload = await res.json();
          if (!active) return;
          if (typeof payload.defaultGameSlug === 'string') {
            setAnySlug(payload.defaultGameSlug);
          } else if (payload.defaultGameSlug === null) {
            setAnySlug('');
          }
          if (typeof payload.defaultPublishedGameSlug === 'string') {
            setPubSlug(payload.defaultPublishedGameSlug);
          } else if (payload.defaultPublishedGameSlug === null) {
            setPubSlug('');
          }
        } else if (res.status === 404) {
          setNote('Server defaults unavailable (table missing). Using local storage only.');
        } else {
          const text = await res.text();
          setNote(`Failed to load server defaults: ${text}`);
        }
      } catch {
        if (!active) return;
        setNote('Failed to load server defaults (network). Using local storage only.');
      } finally {
        if (active) setSettingsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (anySlug) localStorage.setItem(LS_KEYS.any, anySlug); else localStorage.removeItem(LS_KEYS.any);
    if (pubSlug) localStorage.setItem(LS_KEYS.pub, pubSlug); else localStorage.removeItem(LS_KEYS.pub);
  }, [anySlug, pubSlug]);

  async function saveToServerOrLocal() {
    setSaving(true);
    setNote('');
    try {
      const res = await fetch('/api/app-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          defaultGameSlug: anySlug || null,
          defaultPublishedGameSlug: pubSlug || null,
        }),
      });
      if (res.status === 404) {
        setNote('Saved (local only). Add table app_settings to persist for everyone.');
      } else if (res.ok) {
        setNote('Saved.');
      } else {
        const t = await res.text();
        setNote('Save failed: ' + t);
      }
    } catch (e) {
      setNote('Save failed (network). Using local only.');
    } finally {
      setSaving(false);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('esx:defaults:updated'));
    }
  }

  const publishedGames = games.filter(g => g.published);

  return (
    <div style={styles.wrap}>
      <div style={styles.group}>
        <div style={styles.label}>Default Game (all)</div>
        <select
          style={{ ...styles.select, opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}
          value={anySlug || ''}
          onChange={e => setAnySlug(e.target.value)}
          disabled={loading}
        >
          <option value="">— none —</option>
          {games.map(g => (
            <option key={g.slug} value={g.slug}>
              {labelFor(g)}
            </option>
          ))}
        </select>
        <div style={styles.helper}>
          Lists <em>all</em> games with labels <code>(draft)</code> or <code>(published)</code>.
        </div>
      </div>

      <div style={styles.group}>
        <div style={styles.label}>Default Published Game</div>
        <select
          style={{ ...styles.select, opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}
          value={pubSlug || ''}
          onChange={e => setPubSlug(e.target.value)}
          disabled={loading}
        >
          <option value="">— none —</option>
          {publishedGames.map(g => (
            <option key={g.slug} value={g.slug}>
              {g.title}
            </option>
          ))}
        </select>
        <div style={styles.helper}>
          Only truly <strong>published</strong> games appear here (no drafts).
        </div>
      </div>

      <div style={styles.actions}>
        <button
          onClick={saveToServerOrLocal}
          disabled={saving}
          style={{
            ...styles.button,
            opacity: saving ? 0.65 : 1,
            cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {note ? <span style={styles.note}>{note}</span> : null}
      </div>
    </div>
  );
}
