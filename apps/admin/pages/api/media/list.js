// [Codex note] Lists media from Supabase storage using channel-aware prefix.
import { serverClient } from '../../../lib/supabaseClient';
import { channelBucket, mediaPrefix, normalizeChannel, sanitizeSlug } from '../../../lib/mediaPool';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|tif|tiff|avif|heic|heif)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aiff?)$/i;
const AR_EXT = /\.(glb|gltf|usdz|reality|vrm|fbx|obj)$/i;

function classify(name = '') {
  const value = String(name || '').toLowerCase();
  if (/\.gitkeep$/.test(value)) return 'placeholder';
  if (IMAGE_EXT.test(value)) return 'image';
  if (VIDEO_EXT.test(value)) return 'video';
  if (AUDIO_EXT.test(value)) return 'audio';
  if (AR_EXT.test(value)) return 'ar-overlay';
  return 'other';
}

function resolvePrefix(slug, channel, rawPath = '') {
  const base = mediaPrefix(slug, channel).replace(/\/+$/, '');
  const trimmed = String(rawPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!trimmed) return base;

  const segments = trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length && segments[0].toLowerCase() === 'mediapool') {
    segments.shift();
  }

  const suffix = segments.join('/');
  if (!suffix) return base;
  return `${base}/${suffix}`.replace(/\/+/g, '/');
}

function buildFolderLabel(objectPath = '') {
  const segments = String(objectPath || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.slice(0, -1).join('/');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const channel = normalizeChannel(req.query.channel);
  const slug = sanitizeSlug(req.query.slug || req.query.game || 'default');
  const path = req.query.path ? String(req.query.path) : '';

  try {
    const supabase = serverClient();
    const bucket = channelBucket(channel);
    const listPath = resolvePrefix(slug, channel, path).replace(/\/+$/, '');

    const { data, error } = await supabase.storage
      .from(bucket)
      .list(listPath, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

    if (error) throw error;

    const files = Array.isArray(data) ? data : [];
    const prefixWithSlash = `${listPath.replace(/\/+$/, '')}/`.replace(/\/+/g, '/');

    const items = await Promise.all(files.map(async (entry) => {
      const isFolder = !entry?.id;
      if (isFolder) return null;
      const objectPath = `${prefixWithSlash}${entry.name}`.replace(/\/+/g, '/');
      const type = classify(entry.name);

      if (bucket === 'media-pub') {
        const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
        const publicUrl = publicData?.publicUrl || '';
        return {
          id: objectPath,
          name: entry.name,
          fileName: entry.name,
          bucket,
          channel,
          path: objectPath,
          folder: buildFolderLabel(objectPath),
          url: publicUrl,
          thumbUrl: publicUrl,
          publicUrl,
          visibility: 'public',
          size: entry?.metadata?.size || entry?.size || 0,
          updatedAt: entry?.updated_at || entry?.last_accessed_at || null,
          type,
          kind: type,
          category: '',
          categoryLabel: '',
          tags: [],
          source: 'supabase',
        };
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(objectPath, 60 * 30);
      if (signedError) {
        return {
          id: objectPath,
          name: entry.name,
          fileName: entry.name,
          bucket,
          channel,
          path: objectPath,
          folder: buildFolderLabel(objectPath),
          url: '',
          thumbUrl: '',
          publicUrl: '',
          visibility: 'signed',
          size: entry?.metadata?.size || entry?.size || 0,
          updatedAt: entry?.updated_at || entry?.last_accessed_at || null,
          type,
          kind: type,
          category: '',
          categoryLabel: '',
          tags: [],
          source: 'supabase',
          error: signedError.message,
        };
      }
      const signedUrl = signedData?.signedUrl || '';
      return {
        id: objectPath,
        name: entry.name,
        fileName: entry.name,
        bucket,
        channel,
        path: objectPath,
        folder: buildFolderLabel(objectPath),
        url: signedUrl,
        thumbUrl: signedUrl,
        publicUrl: signedUrl,
        visibility: 'signed',
        size: entry?.metadata?.size || entry?.size || 0,
        updatedAt: entry?.updated_at || entry?.last_accessed_at || null,
        type,
        kind: type,
        category: '',
        categoryLabel: '',
        tags: [],
        source: 'supabase',
      };
    }));

    return res.status(200).json({
      ok: true,
      bucket,
      prefix: prefixWithSlash,
      items: items.filter(Boolean),
      files: items.filter(Boolean),
    });
  } catch (error) {
    return res.status(200).json({ ok: false, error: error?.message || 'list failed' });
  }
}
