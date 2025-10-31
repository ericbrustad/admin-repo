// pages/api/list-media.js
// Canonical listing of media for the Admin inventory.
// Prefers Admin public assets; falls back to Game only if Admin doesn't have it.
// De-duplicates by filename (case-insensitive).

import fs from 'fs';
import path from 'path';
import { GAME_ENABLED } from '../../lib/game-switch.js';
import { readManifest, getManifestDebugInfo } from '../../lib/media-manifest.js';
import { listSupabaseMedia, isSupabaseMediaEnabled } from '../../lib/supabase-storage.js';

const EXTS = {
  image: /\.(png|jpg|jpeg|webp|svg|bmp|tif|tiff|avif|heic|heif)$/i,
  gif: /\.(gif)$/i,
  video: /\.(mp4|webm|mov)$/i,
  audio: /\.(mp3|wav|ogg|m4a|aiff|aif)$/i,
  ar: /\.(glb|gltf|usdz|reality|vrm|fbx|obj)$/i,
};

function classify(name) {
  if (EXTS.gif.test(name)) return 'gif';
  if (EXTS.image.test(name)) return 'image';
  if (EXTS.video.test(name)) return 'video';
  if (EXTS.audio.test(name)) return 'audio';
  if (EXTS.ar.test(name)) return 'ar';
  return 'other';
}

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildMediaSlug({ folder = '', type = '', name = '' }) {
  const typeSlug = slugify(type) || 'media';
  const folderSlug = slugify(folder.split('/').slice(-1)[0] || '');
  const base = slugify(String(name || '').replace(/\.[^.]+$/, '')) || 'asset';
  const parts = [typeSlug];
  if (folderSlug && folderSlug !== typeSlug) parts.push(folderSlug);
  parts.push(base);
  return parts.filter(Boolean).join('-').replace(/-+/g, '-').slice(0, 80);
}

const CATEGORY_INFO = {
  audio: {
    label: 'Audio',
    folder: 'Audio',
    type: 'audio',
    baseTags: ['audio'],
  },
  video: {
    label: 'Video',
    folder: 'Video',
    type: 'video',
    baseTags: ['video'],
  },
  'ar-target': {
    label: 'AR Target',
    folder: 'AR Target',
    type: 'ar-target',
    baseTags: ['ar', 'ar-target'],
  },
  'ar-overlay': {
    label: 'AR Overlay',
    folder: 'AR Overlay',
    type: 'ar-overlay',
    baseTags: ['ar', 'ar-overlay'],
  },
  images: {
    label: 'Images',
    folder: 'Images',
    type: 'image',
    baseTags: ['image'],
  },
  gif: {
    label: 'Gif',
    folder: 'Gif',
    type: 'gif',
    baseTags: ['gif'],
  },
  other: {
    label: 'Other',
    folder: 'Other',
    type: 'other',
    baseTags: ['other'],
  },
};

const SEGMENT_ALIASES = {
  audio: 'Audio',
  video: 'Video',
  'ar-target': 'AR Target',
  'ar-overlay': 'AR Overlay',
  images: 'Images',
  gif: 'Gif',
  gifs: 'Gif',
  other: 'Other',
};

const DIR_ALIASES = {
  '': 'mediapool',
  mediapool: 'mediapool',
  all: 'mediapool',
  audio: 'mediapool/Audio',
  video: 'mediapool/Video',
  'ar-target': 'mediapool/AR Target',
  'ar-overlay': 'mediapool/AR Overlay',
  images: 'mediapool/Images',
  gif: 'mediapool/Gif',
  gifs: 'mediapool/Gif',
  other: 'mediapool/Other',
  bundles: 'mediapool/Images/bundles',
  icons: 'mediapool/Images/icons',
  covers: 'mediapool/Images/covers',
  uploads: 'mediapool/Images/uploads',
};

function resolveDir(input = '') {
  const trimmed = String(input || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!trimmed) return DIR_ALIASES[''];
  const slug = slugify(trimmed);
  if (DIR_ALIASES[slug]) return DIR_ALIASES[slug];

  const segments = trimmed.split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) return DIR_ALIASES[''];

  if (segments[0].toLowerCase() === 'mediapool') {
    const normalizedSegments = ['mediapool'];
    for (let i = 1; i < segments.length; i += 1) {
      const seg = segments[i];
      const segSlug = slugify(seg);
      if (SEGMENT_ALIASES[segSlug]) {
        normalizedSegments.push(SEGMENT_ALIASES[segSlug]);
      } else {
        normalizedSegments.push(seg);
      }
    }
    return normalizedSegments.join('/');
  }

  const rootSlug = slugify(segments[0]);
  if (DIR_ALIASES[rootSlug]) {
    const resolved = DIR_ALIASES[rootSlug];
    if (segments.length === 1) return resolved;
    return `${resolved}/${segments.slice(1).join('/')}`;
  }

  return trimmed;
}

function listFiles(absDir, prefix = '') {
  try {
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nextPrefix = prefix ? path.posix.join(prefix, entry.name) : entry.name;
        files.push(...listFiles(path.join(absDir, entry.name), nextPrefix));
      } else if (entry.isFile()) {
        const baseName = entry.name.toLowerCase();
        if (baseName === 'index.json' || baseName === '.ds_store') {
          // Skip metadata files so the Media Pool only surfaces real assets.
          // eslint-disable-next-line no-continue
          continue;
        }
        const rel = prefix ? path.posix.join(prefix, entry.name) : entry.name;
        files.push(rel);
      }
    }
    return files;
  } catch {
    return [];
  }
}

function normalizeFolder(folder = '') {
  return String(folder || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    || 'mediapool';
}

const PLACEHOLDER_BASE_PATH = 'public/media/placeholders';
const PLACEHOLDER_BASE_URL = '/media/placeholders';
const PLACEHOLDER_RULES = [
  {
    file: 'ar-overlay.svg',
    kind: 'ar-overlay',
    match: (folder, type) => folder.includes('ar overlay') || type === 'ar-overlay' || type === 'ar',
  },
  {
    file: 'ar-target.svg',
    kind: 'ar-target',
    match: (folder, type) => folder.includes('ar target') || type === 'ar-target',
  },
  {
    file: 'bundle.svg',
    kind: 'bundle',
    match: (folder) => folder.includes('bundles'),
  },
  {
    file: 'cover.svg',
    kind: 'cover',
    match: (folder) => folder.includes('covers'),
  },
  {
    file: 'icon.svg',
    kind: 'icon',
    match: (folder) => folder.includes('icons'),
  },
  {
    file: 'upload.svg',
    kind: 'upload',
    match: (folder) => folder.includes('uploads'),
  },
  {
    file: 'audio.svg',
    kind: 'audio',
    match: (_, type) => type === 'audio',
  },
  {
    file: 'video.svg',
    kind: 'video',
    match: (_, type) => type === 'video',
  },
];

function resolvePlaceholder(folder = '', type = '') {
  const folderLower = String(folder || '').toLowerCase();
  const typeLower = String(type || '').toLowerCase();
  for (const rule of PLACEHOLDER_RULES) {
    if (rule.match(folderLower, typeLower)) {
      const pathRel = `${PLACEHOLDER_BASE_PATH}/${rule.file}`;
      const url = `${PLACEHOLDER_BASE_URL}/${rule.file}`;
      return { ...rule, path: pathRel, url };
    }
  }
  const fallbackFile = folderLower.includes('video')
    ? 'video.svg'
    : folderLower.includes('audio')
      ? 'audio.svg'
      : 'image.svg';
  const fallbackKind = folderLower.includes('video')
    ? 'video'
    : folderLower.includes('audio')
      ? 'audio'
      : 'image';
  const pathRel = `${PLACEHOLDER_BASE_PATH}/${fallbackFile}`;
  return {
    file: fallbackFile,
    kind: fallbackKind,
    path: pathRel,
    url: `${PLACEHOLDER_BASE_URL}/${fallbackFile}`,
  };
}

function folderMatchesTarget(folder = '', target = '') {
  const normalizedFolder = normalizeFolder(folder).toLowerCase();
  const normalizedTarget = normalizeFolder(target).toLowerCase();
  if (!normalizedTarget || normalizedTarget === 'mediapool') return true;
  if (normalizedFolder === normalizedTarget) return true;
  return normalizedFolder.startsWith(`${normalizedTarget}/`);
}

function buildUrlFromPath(repoPath = '') {
  const normalized = String(repoPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!normalized) return '';
  if (normalized.startsWith('public/')) {
    return `/${normalized.replace(/^public\//, '')}`;
  }
  if (normalized.startsWith('public\\')) {
    return `/${normalized.replace(/^public\\/, '')}`;
  }
  if (normalized.startsWith('media/')) {
    return `/${normalized}`;
  }
  if (normalized.startsWith('/')) return normalized;
  return `/${normalized}`;
}

function enrichMeta(relativePath = '') {
  const normalized = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const segments = normalized.split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  let categoryKey = '';
  let categoryInfo = null;
  if (segments[0] && slugify(segments[0]) === 'mediapool') {
    const rawCategory = segments[1] || 'Images';
    const slug = slugify(rawCategory);
    categoryKey = slug;
    categoryInfo = CATEGORY_INFO[slug] || CATEGORY_INFO.images;
  } else {
    categoryKey = 'images';
    categoryInfo = CATEGORY_INFO.images;
  }

  const tags = new Set(categoryInfo.baseTags || []);
  let extraType = categoryInfo.type || classify(relativePath);

  if (categoryKey === 'images') {
    const subFolder = slugify(segments[2] || '');
    if (subFolder === 'icons') {
      tags.add('icon');
    } else if (subFolder === 'covers') {
      tags.add('cover');
    } else if (subFolder === 'bundles') {
      tags.add('bundle');
    } else if (subFolder === 'uploads') {
      tags.add('upload');
    }
  }

  if (categoryKey === 'ar-target') extraType = 'ar-target';
  if (categoryKey === 'ar-overlay') extraType = 'ar-overlay';

  const label = CATEGORY_INFO[categoryKey]?.label || CATEGORY_INFO.images.label;

  return {
    category: categoryKey,
    categoryLabel: label,
    type: extraType,
    tags: Array.from(tags),
  };
}

export default async function handler(req, res) {
  try {
    const dirParam = (req.query.dir || 'mediapool').toString();
    const dir = resolveDir(dirParam);
    const cwd = process.cwd();
    const { manifest, path: manifestPath } = readManifest();
    const manifestItems = manifest.items || [];
    const seenKeys = new Set();
    const out = [];

    manifestItems
      .filter((entry) => folderMatchesTarget(entry.folder || '', dir))
      .forEach((entry) => {
        const folder = normalizeFolder(entry.folder || dir);
        const hasExplicitPath = Object.prototype.hasOwnProperty.call(entry, 'path');
        const repoPath = hasExplicitPath
          ? (entry.path || '')
          : path.posix.join('public', 'media', folder, entry.fileName || '').replace(/\\/g, '/');
        const meta = enrichMeta(path.posix.join(folder, entry.fileName || entry.name || ''));
        const detectedType = entry.type || entry.kind || meta.type || classify(entry.fileName || entry.url || entry.name || '');
        const type = String(detectedType || '').toLowerCase();
        const slug = entry.slug || buildMediaSlug({ folder, type, name: entry.fileName || entry.name || entry.url });
        const mergedTags = new Set([
          ...(Array.isArray(entry.tags) ? entry.tags : []),
          ...(meta.tags || []),
          type,
          `folder:${slugify(folder)}`,
        ]);
        if (slug) mergedTags.add(`slug:${slug}`);
        let placeholderPath = entry.placeholderPath || entry.placeholder?.path || '';
        let placeholderUrl = entry.placeholderUrl || entry.placeholder?.url || '';
        let placeholder = entry.placeholder || null;
        if (!placeholderPath || !placeholderUrl || !placeholder) {
          const derived = resolvePlaceholder(folder, type);
          if (!placeholderPath) placeholderPath = derived.path;
          if (!placeholderUrl) placeholderUrl = derived.url;
          if (!placeholder) {
            placeholder = { kind: derived.kind, path: derived.path, url: derived.url };
          } else {
            placeholder = { ...derived, ...placeholder };
            if (!placeholder.path) placeholder.path = derived.path;
            if (!placeholder.url) placeholder.url = derived.url;
            if (!placeholder.kind) placeholder.kind = derived.kind;
          }
        }
        const url = entry.url || (repoPath ? buildUrlFromPath(repoPath) : '') || placeholderUrl;
        const thumbUrl = entry.thumbUrl || placeholderUrl || (placeholderPath ? buildUrlFromPath(placeholderPath) : '');
        const key = (entry.id || repoPath || entry.url || `${folder}/${entry.fileName || entry.name || ''}`).toLowerCase();
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        if (repoPath) seenKeys.add(repoPath.toLowerCase());
        if (url) seenKeys.add(url.toLowerCase());
        const absolute = repoPath ? path.join(cwd, repoPath) : '';
        const existsOnDisk = absolute ? fs.existsSync(absolute) : false;
        out.push({
          id: entry.id || key,
          name: entry.name || entry.fileName || entry.url,
          fileName: entry.fileName || '',
          url,
          path: repoPath,
          folder,
          type,
          source: 'manifest',
          category: meta.category,
          categoryLabel: meta.categoryLabel,
          tags: Array.from(mergedTags),
          kind: type,
          status: entry.status || (existsOnDisk ? 'available' : url ? 'external' : 'missing'),
          notes: entry.notes || '',
          existsOnDisk,
          supabase: entry.supabase || null,
          thumbUrl,
          placeholder: placeholder,
          slug,
        });
      });

    if (isSupabaseMediaEnabled()) {
      try {
        const supabaseItems = await listSupabaseMedia(dir);
        for (const item of supabaseItems) {
          const name = item.name || item.supabasePath?.split('/')?.pop() || '';
          const supabaseKeySource = item.supabasePath || item.publicUrl || name;
          const key = `supabase://${(supabaseKeySource || '').toLowerCase()}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          if (item.publicUrl) seenKeys.add(item.publicUrl.toLowerCase());
          const relative = path.posix.join(dir, name || '');
          const meta = enrichMeta(relative);
          const placeholder = resolvePlaceholder(dir, meta.type || classify(name || item.supabasePath));
          const placeholderUrl = placeholder.url;
          const type = (meta.type || classify(name || item.supabasePath)).toLowerCase();
          const slug = buildMediaSlug({ folder: dir, type, name });
          const tags = new Set([
            ...(meta.tags || []),
            type,
            `folder:${slugify(dir)}`,
            item.supabasePath ? `supabase:${slugify(item.supabasePath)}` : null,
          ].filter(Boolean));
          if (slug) tags.add(`slug:${slug}`);
          out.push({
            id: key,
            name: name || item.supabasePath,
            fileName: name,
            url: item.publicUrl || '',
            path: '',
            folder: dir,
            type,
            source: 'supabase',
            category: meta.category,
            categoryLabel: meta.categoryLabel,
            tags: Array.from(tags),
            kind: meta.type,
            status: 'available',
            notes: 'Supabase storage object',
            existsOnDisk: false,
            supabase: {
              bucket: item.bucket,
              path: item.supabasePath,
              size: item.size,
              updatedAt: item.updatedAt,
            },
            thumbUrl: item.publicUrl || placeholderUrl,
            placeholder,
            slug,
          });
        }
      } catch (error) {
        out.push({
          id: `supabase-error-${dir}`,
          name: 'Supabase listing failed',
          fileName: '',
          url: '',
          path: '',
          folder: dir,
          type: 'other',
          source: 'supabase-error',
          category: 'other',
          categoryLabel: 'Other',
          tags: ['error'],
          kind: 'other',
          status: 'error',
          notes: error?.message || 'Unable to list Supabase storage objects.',
          existsOnDisk: false,
        });
      }
    }

    const adminRoot = path.join(cwd, 'public', 'media', dir);
    const adminFiles = listFiles(adminRoot);
    for (const name of adminFiles) {
      const folder = dir;
      const repoPath = path.posix.join('public', 'media', folder, name).replace(/\\/g, '/');
      const key = repoPath.toLowerCase();
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const publicUrl = buildUrlFromPath(repoPath);
      if (publicUrl) seenKeys.add(publicUrl.toLowerCase());
      const meta = enrichMeta(path.posix.join(folder, name));
      const isPlaceholderFile = name.toLowerCase() === '.gitkeep';
      const normalizedMeta = isPlaceholderFile
        ? {
            category: 'placeholder',
            categoryLabel: 'Placeholder',
            type: 'placeholder',
            tags: ['placeholder'],
          }
        : meta;
      const type = (normalizedMeta.type || classify(name)).toLowerCase();
      const slug = isPlaceholderFile
        ? ['placeholder', slugify(folder) || 'mediapool'].filter(Boolean).join('-')
        : buildMediaSlug({ folder, type, name });
      const tags = new Set([
        ...(normalizedMeta.tags || []),
        `folder:${slugify(folder)}`,
      ]);
      if (!isPlaceholderFile) tags.add(type);
      if (isPlaceholderFile) {
        tags.add('gitkeep');
        tags.add('keepalive');
      }
      if (slug) tags.add(`slug:${slug}`);
      const placeholderInfo = isPlaceholderFile ? resolvePlaceholder(folder, type) : null;
      const placeholderUrl = placeholderInfo?.url || '';
      out.push({
        id: key,
        name: isPlaceholderFile ? 'Placeholder (.gitkeep)' : name,
        fileName: name,
        url: publicUrl,
        path: repoPath,
        folder,
        type,
        source: 'filesystem',
        category: normalizedMeta.category,
        categoryLabel: normalizedMeta.categoryLabel,
        tags: Array.from(tags),
        kind: normalizedMeta.type,
        status: isPlaceholderFile ? 'placeholder' : 'available',
        notes: isPlaceholderFile
          ? 'Git placeholder file — keeps this folder tracked without storing media.'
          : '',
        existsOnDisk: true,
        thumbUrl: placeholderUrl,
        placeholder: placeholderInfo,
        slug,
      });
    }

    if (GAME_ENABLED) {
      const gameRoot = path.join(cwd, '..', 'game-web', 'public', 'media', dir);
      const gameFiles = listFiles(gameRoot);
      for (const name of gameFiles) {
        const folder = dir;
        const relative = path.posix.join(folder, name);
        const key = `game://${relative.toLowerCase()}`;
        if (seenKeys.has(key)) continue;
        const meta = enrichMeta(relative);
        const type = (meta.type || classify(name)).toLowerCase();
        const slug = buildMediaSlug({ folder, type, name });
        const tags = new Set([
          ...(meta.tags || []),
          type,
          `folder:${slugify(folder)}`,
        ]);
        if (slug) tags.add(`slug:${slug}`);
        out.push({
          id: key,
          name,
          fileName: name,
          url: `/media/${relative}`,
          path: '',
          folder,
          type,
          source: 'game',
          category: meta.category,
          categoryLabel: meta.categoryLabel,
          tags: Array.from(tags),
          kind: meta.type,
          status: 'game-fallback',
          notes: 'Served from game bundle',
          existsOnDisk: false,
          slug,
        });
        seenKeys.add(key);
      }
    }

    out.sort((a, b) => {
      return (a.name || '').toString().toLowerCase().localeCompare((b.name || '').toString().toLowerCase());
    });

    const debug = getManifestDebugInfo();

    return res.status(200).json({ ok: true, dir, items: out, manifestPath, manifestDebug: debug });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
