import React from 'react';

/**
 * SavedGamesPicker
 * Expects games = [{ id, slug, title, channel: 'published'|'draft' }]
 * value format suggestion: `${slug}:${channel}`
 */
export default function SavedGamesPicker({ games = [], value, onChange, defaultSlug }) {
  const published = games.filter(g => (g.channel || '').toLowerCase() === 'published');
  const drafts = games.filter(g => (g.channel || '').toLowerCase() !== 'published');

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 700, letterSpacing: 0.2 }}>Game Settings</div>
      <label style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>Saved Games</label>
      <select
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          padding: '8px 10px',
          borderRadius: 10,
          border: '1px solid rgba(15,23,42,0.12)',
          background: 'white',
          fontSize: 13,
          color: '#0f172a',
        }}
      >
        <optgroup label="Published">
          {published.map(g => (
            <option key={`${g.slug}:published`} value={`${g.slug}:published`}>
              {(g.title || g.slug)} (Published{g.slug === defaultSlug ? ', Default' : ''})
            </option>
          ))}
        </optgroup>
        <optgroup label="Drafts">
          {drafts.map(g => (
            <option key={`${g.slug}:draft`} value={`${g.slug}:draft`}>
              {(g.title || g.slug)} (Draft{g.slug === defaultSlug ? ', Default' : ''})
            </option>
          ))}
        </optgroup>
      </select>
      <div style={{ fontSize: 12, color: '#0f172a' }}>
        Contains all games (Published and Draft).
      </div>
    </div>
  );
}
