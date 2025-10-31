// Unified "Saved Games" dropdown (Published / Drafts / Other) + Default
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

const S = {
  label: { display:'block', fontSize:12, fontWeight:600, marginBottom:6 },
  help: { fontSize:12, opacity:0.7, marginTop:6 },
  select: {
    width:'100%', maxWidth:760, border:'1px solid #D1D5DB', borderRadius:10,
    padding:'10px 12px', background:'transparent', outline:'none'
  },
};

export default function SavedGamesSelect() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/games/all');
        const j = await r.json();
        if (!cancelled && j?.ok && Array.isArray(j.games)) setItems(j.games);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const g = { published: [], draft: [], other: [] };
    for (const it of items) (g[it.channel] || g.other).push(it);
    return g;
  }, [items]);

  function openGame(slug, channel) {
    const q = { ...router.query, game: slug };
    if (channel) q.channel = channel; else delete q.channel;
    delete q.mission; // avoid stale mission selection on switch
    router.push({ pathname: router.pathname, query: q }, undefined, { shallow: true });
  }

  return (
    <div data-codex="SavedGamesSelect">
      <label style={S.label}>Saved Games</label>
      <select
        style={S.select}
        defaultValue=""
        disabled={loading || items.length === 0}
        onChange={(e) => {
          const val = e.target.value;
          if (!val) return;
          if (val === '__default__') return openGame('default','draft');
          const [slug, channel] = val.split('::');
          openGame(slug, channel || 'draft');
        }}
      >
        <option value="" disabled>{loading ? 'Loading…' : 'Select a game'}</option>
        <option value="__default__">Default (reset)</option>

        {grouped.published.length > 0 && (
          <optgroup label="Published">
            {grouped.published.map(g => (
              <option key={`${g.slug}:published`} value={`${g.slug}::published`}>
                {(g.title || g.slug)} (published)
              </option>
            ))}
          </optgroup>
        )}

        {grouped.draft.length > 0 && (
          <optgroup label="Drafts">
            {grouped.draft.map(g => (
              <option key={`${g.slug}:draft`} value={`${g.slug}::draft`}>
                {(g.title || g.slug)} (draft)
              </option>
            ))}
          </optgroup>
        )}

        {grouped.other.length > 0 && (
          <optgroup label="Other">
            {grouped.other.map(g => (
              <option key={`${g.slug}:other`} value={`${g.slug}::other`}>
                {(g.title || g.slug)} (other)
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <div style={S.help}>
        Switch to another saved escape ride. Use the “+ New Game” control in the top navigation to add a title.
      </div>
    </div>
  );
}
