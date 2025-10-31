// pages/api/upload.js
// JSON body: {
//   fileName?: string,
//   folder?: string,
//   path?: string,
//   contentBase64?: string,
//   remoteUrl?: string,
//   sizeBytes?: number
// }
// Registers media metadata in public/media/manifest.json. Binary payloads must
// be hosted externally; this endpoint only records references so uploads remain
// hidden from Git history.

import { readManifest, writeManifest, getManifestDebugInfo } from '../../lib/media-manifest.js';
import { uploadSupabaseMedia, isSupabaseMediaEnabled } from '../../lib/supabase-storage.js';

const EXTS = {
  image: /\.(png|jpg|jpeg|webp|svg|bmp|tif|tiff|avif|heic|heif)$/i,
  gif: /\.(gif)$/i,
  video: /\.(mp4|webm|mov)$/i,
  audio: /\.(mp3|wav|ogg|m4a|aiff|aif)$/i,
  ar: /\.(glb|gltf|usdz|reality|vrm|fbx|obj)$/i,
};

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function classify(name = '') {
  if (EXTS.gif.test(name)) return 'gif';
  if (EXTS.image.test(name)) return 'image';
  if (EXTS.video.test(name)) return 'video';
  if (EXTS.audio.test(name)) return 'audio';
  if (EXTS.ar.test(name)) return 'ar-overlay';
  return 'other';
}

function deriveFolderMeta(folder = '', fallbackType = 'other') {
  const normalized = String(folder || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const segments = normalized.split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const defaultInfo = {
    category: 'images',
    categoryLabel: 'Images',
    type: fallbackType,
    tags: ['image'],
  };

  if (!segments.length) {
    return { ...defaultInfo, type: fallbackType === 'ar' ? 'ar-overlay' : fallbackType };
  }

  let categoryKey = 'images';
  if (segments[0].toLowerCase() === 'mediapool') {
    const second = slugify(segments[1] || 'images');
    if (['audio', 'video', 'gif', 'gifs', 'other', 'ar-target', 'ar-overlay', 'images'].includes(second)) {
      categoryKey = second === 'gifs' ? 'gif' : second;
    }
  }

  const baseTags = new Set(['category:' + categoryKey]);
  let type = fallbackType;
  switch (categoryKey) {
    case 'audio':
      type = 'audio';
      baseTags.add('audio');
      break;
    case 'video':
      type = 'video';
      baseTags.add('video');
      break;
    case 'gif':
      type = 'gif';
      baseTags.add('gif');
      break;
    case 'ar-target':
      type = 'ar-target';
      baseTags.add('ar');
      baseTags.add('ar-target');
      break;
    case 'ar-overlay':
      type = 'ar-overlay';
      baseTags.add('ar');
      baseTags.add('ar-overlay');
      break;
    case 'other':
      type = fallbackType;
      baseTags.add('other');
      break;
    default:
      type = fallbackType === 'ar' ? 'ar-overlay' : fallbackType;
      baseTags.add('image');
      break;
  }

  if (categoryKey === 'images') {
    const third = slugify(segments[2] || '');
    if (third === 'icons') baseTags.add('icon');
    if (third === 'covers') baseTags.add('cover');
    if (third === 'bundles') baseTags.add('bundle');
    if (third === 'uploads') baseTags.add('upload');
  }

  const labelMap = {
    audio: 'Audio',
    video: 'Video',
    gif: 'Gif',
    'ar-target': 'AR Target',
    'ar-overlay': 'AR Overlay',
    other: 'Other',
    images: 'Images',
  };

  return {
    category: categoryKey,
    categoryLabel: labelMap[categoryKey] || 'Images',
    type,
    tags: Array.from(baseTags),
  };
}

function buildMediaSlug({ fileName = '', type = 'media', folder = '' }) {
  const base = slugify(String(fileName || '').replace(/\.[^.]+$/, '')) || 'media';
  const prefix = slugify(type) || 'media';
  const folderHint = slugify(folder.split('/').slice(-1)[0] || '');
  const parts = [prefix];
  if (folderHint && folderHint !== prefix) parts.push(folderHint);
  parts.push(base);
  return parts.filter(Boolean).join('-').replace(/-+/g, '-').slice(0, 80);
}

function resolveFolder(input = '') {
  const trimmed = String(input || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\\/g, '/');
  if (!trimmed) return 'mediapool/Other';
  if (trimmed.toLowerCase() === 'mediapool') return 'mediapool';
  if (trimmed.startsWith('mediapool/')) return trimmed;
  return `mediapool/${trimmed}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

    const {
      fileName,
      folder,
      path: explicitPath,
      remoteUrl,
      sizeBytes,
      contentBase64,
    } = req.body || {};

    const derivedNameFromPath = explicitPath ? explicitPath.split('/').pop() : '';
    const safeName = (fileName || derivedNameFromPath || 'upload')
      .toString()
      .replace(/[^\w.\-]+/g, '_');

    let derivedFolder = '';
    if (typeof folder === 'string' && folder.trim()) {
      derivedFolder = folder;
    } else if (explicitPath) {
      const normalizedPath = explicitPath.replace(/\\/g, '/');
      const marker = 'public/media/';
      const index = normalizedPath.indexOf(marker);
      if (index >= 0) {
        const afterMarker = normalizedPath.slice(index + marker.length);
        derivedFolder = afterMarker.split('/').slice(0, -1).join('/');
      }
    }

    const resolvedFolder = resolveFolder(derivedFolder);
    const { manifest } = readManifest();

    const type = classify(safeName);
    const repoPath = `public/media/${resolvedFolder}/${safeName}`.replace(/\\/g, '/');
    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const folderMeta = deriveFolderMeta(resolvedFolder, type);
    const entryType = folderMeta.type || type;
    const tagSet = new Set([entryType, ...folderMeta.tags, `folder:${slugify(resolvedFolder)}`]);
    const entrySlug = buildMediaSlug({ fileName: safeName, type: entryType, folder: resolvedFolder });
    if (entrySlug) tagSet.add(`slug:${entrySlug}`);

    const entry = {
      id: entryId,
      name: safeName.replace(/\.[^.]+$/, ''),
      fileName: safeName,
      folder: resolvedFolder,
      path: repoPath,
      type: entryType,
      url: remoteUrl || '',
      status: remoteUrl ? 'external' : 'pending-external',
      notes: remoteUrl
        ? 'External media registered.'
        : 'Upload recorded. Provide an external URL to activate this asset.',
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : undefined,
      createdAt: new Date().toISOString(),
      tags: Array.from(tagSet),
      category: folderMeta.category,
      categoryLabel: folderMeta.categoryLabel,
      kind: entryType,
      slug: entrySlug,
    };

    let supabaseUpload = null;
    if (isSupabaseMediaEnabled() && contentBase64) {
      try {
        supabaseUpload = await uploadSupabaseMedia({
          folder: resolvedFolder,
          fileName: safeName,
          contentBase64,
          sizeBytes,
        });
        if (supabaseUpload?.ok) {
          entry.url = supabaseUpload.publicUrl || entry.url;
          entry.status = 'supabase';
          entry.notes = 'Uploaded to Supabase storage.';
          entry.supabase = {
            bucket: supabaseUpload.bucket,
            path: supabaseUpload.path,
            publicUrl: supabaseUpload.publicUrl,
            sizeBytes: supabaseUpload.sizeBytes,
          };
          entry.sizeBytes = supabaseUpload.sizeBytes;
        } else if (supabaseUpload && !supabaseUpload.skipped) {
          entry.notes = supabaseUpload.error || supabaseUpload.reason || 'Supabase upload failed.';
          entry.status = 'error-supabase';
        }
      } catch (error) {
        entry.status = 'error-supabase';
        entry.notes = error?.message || 'Supabase upload threw unexpectedly.';
      }
    }

    manifest.items = Array.isArray(manifest.items) ? manifest.items : [];
    manifest.items.push(entry);
    manifest.updatedAt = new Date().toISOString();

    const writeResult = writeManifest(manifest);

    const debug = getManifestDebugInfo();

    return res.status(200).json({
      ok: true,
      item: entry,
      manifestPath: writeResult.path,
      manifestFallback: writeResult.fallback,
      storage: {
        manifestPath: writeResult.path,
        fallbackUsed: writeResult.fallback,
        debug,
        supabase: supabaseUpload,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}
