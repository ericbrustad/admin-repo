// Esxape Ride — Admin component
// Codex (2025-10-30): Populates the Saved Games dropdown by scanning local games folders.
import React from 'react';
import { useRouter } from 'next/router';

export default function GamesDropdown() {
  const router = useRouter();
  const [options, setOptions] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const currentGame =
    (router.query.game || router.query.slug || '').toString();
  const currentChannel = (router.query.channel || '').toString();

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const r = await fetch('/api/games/list');
        const data = await r.json();
        if (!cancelled && data?.ok && Array.isArray(data.games)) {
          setOptions(data.games);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = React.useMemo(() => {
    const g = { published: [], draft: [], other: [] };
    for (const it of options) {
      (g[it.channel] || g.other).push(it);
    }
    return g;
  }, [options]);

  const selectedValue = React.useMemo(() => {
    if (!options.length) return '';
    const slug = currentGame || options[0]?.slug || '';
    if (!slug) return '';
    const directKey = `${slug}::${currentChannel || ''}`;
    if (directKey && options.some((opt) => `${opt.slug}::${opt.channel}` === directKey)) {
      return directKey;
    }
    const match = options.find((opt) => opt.slug === slug);
    return match ? `${match.slug}::${match.channel}` : '';
  }, [currentChannel, currentGame, options]);

  function onChange(e) {
    const value = e.target.value; // "slug::channel"
    const [slug, channel] = value.split('::');
    if (!slug) return;
    const q = { ...router.query, game: slug };
    if (channel) q.channel = channel;
    else delete q.channel;
    // Drop mission when switching games to avoid stale selection
    delete q.mission;
    router.push({ pathname: router.pathname, query: q }, undefined, {
      shallow: true,
    });
  }

  const wrap = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
    flexWrap: 'wrap',
  };
  const selectCss = {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #ccc',
    minWidth: 240,
  };
  const labelCss = { fontWeight: 600, marginRight: 6 };

  return (
    <div style={wrap} data-codex="GamesDropdown">
      <label htmlFor="games-dropdown" style={labelCss}>
        Saved Games
      </label>
      <select
        id="games-dropdown"
        value={selectedValue}
        onChange={onChange}
        disabled={loading || options.length === 0}
        style={selectCss}
      >
        {loading ? (
          <option>Loading…</option>
        ) : options.length === 0 ? (
          <option>No games found</option>
        ) : (
          <>
            <option value="" disabled hidden>
              Select a game…
            </option>
            {grouped.published.length > 0 && (
              <optgroup label="Published">
                {grouped.published.map((g) => (
                  <option
                    key={`${g.slug}::${g.channel}`}
                    value={`${g.slug}::${g.channel}`}
                  >
                    {`${g.title || g.slug} (${g.channel})`}
                  </option>
                ))}
              </optgroup>
            )}
            {grouped.draft.length > 0 && (
              <optgroup label="Drafts">
                {grouped.draft.map((g) => (
                  <option
                    key={`${g.slug}::${g.channel}`}
                    value={`${g.slug}::${g.channel}`}
                  >
                    {`${g.title || g.slug} (${g.channel})`}
                  </option>
                ))}
              </optgroup>
            )}
            {grouped.other.length > 0 && (
              <optgroup label="Other">
                {grouped.other.map((g) => (
                  <option
                    key={`${g.slug}::${g.channel}`}
                    value={`${g.slug}::${g.channel}`}
                  >
                    {`${g.title || g.slug} (${g.channel})`}
                  </option>
                ))}
              </optgroup>
            )}
          </>
        )}
      </select>
    </div>
  );
}

