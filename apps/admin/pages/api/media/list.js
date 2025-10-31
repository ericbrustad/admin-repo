// [Codex note] Lists media from Supabase storage using channel-aware prefix.
import { serverClient } from '../../../lib/supabaseClient';
import { MEDIA_BUCKET, mediaPoolPrefix } from '../../../lib/mediaPool';

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

function normalizeFolder(channel, rawPath = '') {
  const base = mediaPoolPrefix(channel).replace(/\/+$/, '');
  const trimmed = String(rawPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!trimmed) return base;

  const segments = trimmed.split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const filtered = [];
  for (const segment of segments) {
    const lower = segment.toLowerCase();
    if (!filtered.length && (lower === 'draft' || lower === 'public' || lower === 'published')) {
      continue;
    }
    if (!filtered.length && lower === 'mediapool') {
      continue;
    }
    filtered.push(segment);
  }

  const suffix = filtered.join('/');
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

  const channel = String(req.query.channel || 'draft').toLowerCase();
  const path = req.query.path ? String(req.query.path) : '';

  try {
    const supabase = serverClient();
    const bucket = MEDIA_BUCKET || 'media';
    const listPrefix = normalizeFolder(channel, path);
    const listPath = listPrefix.replace(/\/+$/, '');

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
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      const publicUrl = publicData?.publicUrl || '';
      const type = classify(entry.name);
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
