// [Codex note] Centralized media path conventions for Supabase Storage.
export const MEDIA_BUCKET = 'media';

// Drafts are default; published can be toggled later.
export function mediaPoolPrefix(channel = 'draft') {
  const normalized = String(channel || 'draft').toLowerCase();
  return normalized === 'published' ? 'published/mediapool/' : 'draft/mediapool/';
}

// Optional helper to build a full key
export function mediaKey(filename, channel = 'draft') {
  const safeName = String(filename || '').replace(/^\/+|\/+$/g, '');
  const prefix = mediaPoolPrefix(channel).replace(/\/+$/, '');
  const key = `${prefix}/${safeName}`;
  return key.replace(/\/+/g, '/');
}
