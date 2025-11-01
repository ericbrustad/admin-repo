// CHORE(codex): Centralize media key building (channel-first).
// Bucket stays "media"; keys are "draft/mediapool/..." or "published/mediapool/...".
export const MEDIA_BUCKET =
  process.env.SUPABASE_MEDIA_BUCKET || 'media';
const BASE = (process.env.SUPABASE_MEDIA_PREFIX || 'mediapool/')
  .replace(/^\/+|\/+$/g, '') + '/';

export function buildKey({ channel = 'draft', subpath = '' } = {}) {
  const c = String(channel).toLowerCase().trim() || 'draft';
  const s = String(subpath || '').replace(/^\/+/, '');
  return `${c}/${BASE}${s}`.replace(/\/+/g, '/').replace(/^\/+/, '');
}

export function prefixFor(channel = 'draft') {
  const c = String(channel).toLowerCase().trim() || 'draft';
  return `${c}/${BASE}`.replace(/\/+/g, '/');
}

// Optional back-compat for legacy "mediapool/draft/..." (pre channel-first).
export function legacyCandidates(subpath = '') {
  const s = String(subpath || '').replace(/^\/+/, '');
  return [
    `draft/${BASE}${s}`,
    `mediapool/draft/${s}`, // legacy
  ].map(p => p.replace(/\/+/g, '/'));
}
