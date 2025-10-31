import React, { useMemo } from 'react';

function normalizeChannel(channel) {
  const value = String(channel || '').toLowerCase();
  if (value === 'published') return 'published';
  if (value === 'draft') return 'draft';
  if (value === 'default') return 'default';
  return 'draft';
}

export default function GameSelect({
  games = [],
  currentSlug = 'default',
  currentChannel = 'draft',
  onOpen = () => {},
  onDelete = () => {},
  onRefresh = () => {},
  refreshing = false,
}) {
  const normalizedChannel = normalizeChannel(currentChannel);
  const normalizedSlug = currentSlug || 'default';

  const active = useMemo(() => {
    const direct = games.find(
      (entry) => entry && entry.slug === normalizedSlug && normalizeChannel(entry.channel) === normalizedChannel,
    );
    if (direct) return direct;
    return games.find((entry) => entry && entry.slug === normalizedSlug) || null;
  }, [games, normalizedSlug, normalizedChannel]);

  const publishedGames = useMemo(
    () => games.filter((entry) => normalizeChannel(entry.channel) === 'published'),
    [games],
  );
  const draftGames = useMemo(
    () => games.filter((entry) => normalizeChannel(entry.channel) === 'draft'),
    [games],
  );
  const defaultEntry = useMemo(
    () => games.find((entry) => normalizeChannel(entry.channel) === 'default') || null,
    [games],
  );

  const selectStyle = styles.select;
  const buttonStyle = styles.button;

  return (
    <div style={styles.wrap}>
      <div style={styles.group}>
        <label style={styles.label}>Open Game</label>
        <div style={styles.row}>
          <select
            style={selectStyle}
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              if (value === '__default__' && defaultEntry) {
                onOpen(defaultEntry.slug, 'default');
                return;
              }
              const [slug, channel] = value.split('::');
              onOpen(slug, channel);
              event.target.value = '';
            }}
          >
            <option value="" disabled>
              {publishedGames.length ? 'Select published game…' : 'No published games'}
            </option>
            {defaultEntry ? (
              <option value="__default__">{defaultEntry.label || 'Default Game'}</option>
            ) : null}
            {publishedGames.map((entry) => (
              <option key={`${entry.slug}::${entry.channel}`} value={`${entry.slug}::${entry.channel}`}>
                {entry.label || `${entry.slug} (published)`}
              </option>
            ))}
          </select>
          <button type="button" style={buttonStyle} onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={styles.group}>
        <label style={styles.label}>Open Drafts</label>
        <select
          style={selectStyle}
          defaultValue=""
          onChange={(event) => {
            const value = event.target.value;
            if (!value) return;
            const [slug, channel] = value.split('::');
            onOpen(slug, channel);
            event.target.value = '';
          }}
        >
          <option value="" disabled>
            {draftGames.length ? 'Select draft…' : 'No drafts available'}
          </option>
          {draftGames.map((entry) => (
            <option key={`${entry.slug}::${entry.channel}`} value={`${entry.slug}::${entry.channel}`}>
              {entry.label || `${entry.slug} (draft)`}
            </option>
          ))}
        </select>
      </div>

      {active && normalizeChannel(active.channel) !== 'default' ? (
        <div style={styles.group}>
          <button type="button" style={{ ...buttonStyle, ...styles.dangerButton }} onClick={() => onDelete(active)}>
            Delete “{active.label || active.slug}”
          </button>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  row: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--admin-muted, #475569)',
  },
  select: {
    flex: 1,
    minWidth: 0,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft, rgba(148, 163, 184, 0.6))',
    background: 'transparent',
    color: 'var(--appearance-font-color, var(--admin-body-color, #0f172a))',
  },
  button: {
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft, rgba(148, 163, 184, 0.6))',
    background: 'transparent',
    color: 'var(--appearance-font-color, var(--admin-body-color, #0f172a))',
    cursor: 'pointer',
  },
  dangerButton: {
    borderColor: 'rgba(239, 68, 68, 0.45)',
    color: 'rgba(220, 38, 38, 1)',
  },
};
