// [Codex note] Media buckets split between private drafts and public publishes.

export const MEDIA_BUCKET_DRAFT = 'media-priv';
export const MEDIA_BUCKET_PUB = 'media-pub';

export function normalizeChannel(value = 'draft') {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || 'draft').toLowerCase() === 'published' ? 'published' : 'draft';
}

export function sanitizeSlug(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const cleaned = String(raw || 'default').trim().toLowerCase();
  return cleaned || 'default';
}

export function channelBucket(channel = 'draft') {
  return normalizeChannel(channel) === 'published' ? MEDIA_BUCKET_PUB : MEDIA_BUCKET_DRAFT;
}

export function mediaPrefix(slug = 'default', channel = 'draft') {
  const safeSlug = sanitizeSlug(slug).replace(/[^a-z0-9-_]+/g, '-');
  const normalized = normalizeChannel(channel);
  const base = normalized === 'published' ? 'games' : 'drafts';
  return `${base}/${safeSlug}/mediapool/`.replace(/\/+/g, '/');
}

export function mediaKey(slug, filename, channel = 'draft') {
  const safeSlug = sanitizeSlug(slug);
  const normalizedName = String(filename || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]+/g, '_'))
    .join('/');
  const trimmedName = normalizedName || `upload_${Date.now()}`;
  return `${mediaPrefix(safeSlug, channel)}${trimmedName}`.replace(/\/+/g, '/');
}

// Backwards compatibility helpers for legacy callers expecting the older API.
export const MEDIA_BUCKET = MEDIA_BUCKET_DRAFT;
export function mediaPoolPrefix(channel = 'draft', slug = 'default') {
  return mediaPrefix(slug, channel);
}
