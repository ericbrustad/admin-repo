// [Codex note] Centralized media path conventions for Supabase Storage.
const DEFAULT_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET
  || process.env.SUPABASE_MEDIA_BUCKET
  || 'media';

export const MEDIA_BUCKET = DEFAULT_BUCKET;

// Drafts are default; published can be toggled later.
export function mediaPoolPrefix(channel = 'draft') {
  const normalized = String(channel || 'draft').toLowerCase();
  if (normalized === 'published' || normalized === 'public') {
    return 'published/mediapool/';
  }
  return 'draft/mediapool/';
}

// Optional helper to build a full key
export function mediaKey(filename, channel = 'draft') {
  const safeName = String(filename || '').replace(/^\/+|\/+$/g, '');
  const prefix = mediaPoolPrefix(channel).replace(/\/+$/, '');
  const key = `${prefix}/${safeName}`;
  return key.replace(/\/+/g, '/');
}
