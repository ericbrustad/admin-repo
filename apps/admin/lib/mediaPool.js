// [Codex note] Centralized media path conventions for Supabase Storage.
import { serverClient } from './supabaseClient';

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

// Ensure the media bucket exists before attempting writes. Compatible with
// both Supabase JS v1 and v2 (createBucket is only available in v2).
export async function ensureMediaBucket() {
  const supabase = serverClient();
  try {
    const { data: buckets } = await supabase.storage.listBuckets?.() ?? {};
    const exists = Array.isArray(buckets) && buckets.some((bucket) => bucket.name === MEDIA_BUCKET);
    if (!exists && typeof supabase.storage.createBucket === 'function') {
      await supabase.storage.createBucket(MEDIA_BUCKET, { public: true }).catch(() => {});
    }
  } catch (error) {
    if (error?.message && /Function listBuckets is not a function/i.test(error.message)) {
      // Older SDK without listBuckets; best effort noop.
    } else {
      throw error;
    }
  }
  return supabase;
}
