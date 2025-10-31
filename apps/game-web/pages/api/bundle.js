import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const DEFAULT_SLUG = process.env.NEXT_PUBLIC_DEFAULT_GAME_SLUG || 'demo';
const DEFAULT_CHANNEL = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL || 'published';
const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || process.env.NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET || 'media';
const MEDIA_PREFIX = (process.env.SUPABASE_MEDIA_PREFIX || process.env.NEXT_PUBLIC_SUPABASE_MEDIA_PREFIX || 'mediapool')
  .replace(/^\/+|\/+$/g, '');
const SIGNED_URL_TTL = Number.isFinite(Number(process.env.GAME_BUNDLE_MEDIA_TTL_SECONDS))
  ? Number(process.env.GAME_BUNDLE_MEDIA_TTL_SECONDS)
  : 3600;

const STORAGE_OBJECT_REGEX = /\/storage\/v1\/object\/(public\/)?([^/]+)\/(.+)/i;
const PUBLIC_SEGMENT_REGEX = /(^|\/)public(\/|$)/i;

function normalizeChannel(value) {
  return String(value || '').trim().toLowerCase() === 'draft' ? 'draft' : 'published';
}

function ensureClient() {
  if (!SUPABASE_URL || !KEY) {
    throw new Error('Missing Supabase environment variables');
  }
  return createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
}

function buildStoragePath(relativePath) {
  const cleanRelative = String(relativePath || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
  if (!cleanRelative) return '';
  const prefix = MEDIA_PREFIX ? `${MEDIA_PREFIX}/` : '';
  return `${prefix}${cleanRelative}`.replace(/\/{2,}/g, '/');
}

function registerRef(map, bucket, path, meta = {}) {
  const cleanBucket = String(bucket || '').trim();
  const cleanPath = String(path || '').trim().replace(/^\/+/, '');
  if (!cleanBucket || !cleanPath) return null;
  const key = `${cleanBucket}::${cleanPath}`;
  let entry = map.get(key);
  if (!entry) {
    entry = {
      bucket: cleanBucket,
      path: cleanPath,
      isPublic: Boolean(meta.isPublic),
      originalUrls: new Set(),
      lookupKeys: new Set(),
      sources: new Set(),
    };
    map.set(key, entry);
  } else if (meta.isPublic) {
    entry.isPublic = true;
  }
  if (meta.originalUrl) entry.originalUrls.add(String(meta.originalUrl));
  if (meta.lookupKey) entry.lookupKeys.add(String(meta.lookupKey));
  if (meta.source) entry.sources.add(meta.source);
  return entry;
}
function registerStringReference(raw, map) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return;
  const match = trimmed.match(STORAGE_OBJECT_REGEX);
  if (match) {
    const [, publicSegment, bucketPart, pathPart] = match;
    const bucket = decodeURIComponent(bucketPart);
    const path = pathPart
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
    const entry = registerRef(map, bucket, path, {
      originalUrl: trimmed,
      lookupKey: trimmed,
      source: 'url',
      isPublic: Boolean(publicSegment) || PUBLIC_SEGMENT_REGEX.test(path),
    });
    if (entry) {
      const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
      if (withoutOrigin) entry.lookupKeys.add(withoutOrigin);
    }
    return;
  }

  const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, '').trim();
  const normalized = withoutOrigin.replace(/^\/+/, '');
  if (/^(draft|public)\//i.test(normalized)) {
    const entry = registerRef(map, MEDIA_BUCKET, buildStoragePath(normalized), {
      originalUrl: trimmed,
      lookupKey: normalized,
      source: 'channel-path',
      isPublic: normalized.toLowerCase().startsWith('public/'),
    });
    if (entry) {
      entry.lookupKeys.add(normalized);
    }
    return;
  }

  if (MEDIA_PREFIX && normalized.toLowerCase().startsWith(`${MEDIA_PREFIX.toLowerCase()}/`)) {
    registerRef(map, MEDIA_BUCKET, buildStoragePath(normalized), {
      originalUrl: trimmed,
      lookupKey: normalized,
      source: 'prefix-path',
      isPublic: PUBLIC_SEGMENT_REGEX.test(normalized),
    });
  }
}

function collectFromValue(value, map, seen) {
  if (value == null) return;
  if (typeof value === 'string') {
    registerStringReference(value, map);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectFromValue(item, map, seen));
    return;
  }
  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (value.supabase && typeof value.supabase === 'object') {
    const supa = value.supabase;
    const entry = registerRef(map, supa.bucket || MEDIA_BUCKET, supa.path, {
      originalUrl: supa.publicUrl || value.url || '',
      lookupKey: supa.publicUrl || value.url || '',
      source: 'supabase',
      isPublic: PUBLIC_SEGMENT_REGEX.test(String(supa.path || '')),
    });
    if (entry && value.url) entry.lookupKeys.add(String(value.url));
  }

  if (value.bucket && value.path && typeof value.bucket === 'string' && typeof value.path === 'string') {
    registerRef(map, value.bucket, value.path, {
      originalUrl: value.url || '',
      lookupKey: value.url || value.path,
      source: 'bucket-path',
      isPublic: PUBLIC_SEGMENT_REGEX.test(String(value.path || '')),
    });
  }

  Object.values(value).forEach((nested) => collectFromValue(nested, map, seen));
}

function collectSupabaseAssets(...sources) {
  const refs = new Map();
  const seen = new WeakSet();
  const visit = (value) => collectFromValue(value, refs, seen);
  sources.forEach(visit);
  return refs;
}

async function signSupabaseAssets(supabase, refs) {
  const replacements = new Map();
  const media = [];

  for (const ref of refs.values()) {
    const storage = supabase.storage.from(ref.bucket);
    let publicUrl = null;
    let signedUrl = null;
    let errorMessage = null;

    try {
      const { data } = storage.getPublicUrl(ref.path);
      if (data?.publicUrl) publicUrl = data.publicUrl;
    } catch {}

    if (!ref.isPublic) {
      try {
        const { data, error } = await storage.createSignedUrl(ref.path, SIGNED_URL_TTL);
        if (error) {
          errorMessage = error.message || String(error);
        } else if (data?.signedUrl) {
          signedUrl = data.signedUrl;
        }
      } catch (error) {
        errorMessage = error?.message || String(error);
      }
    }

    if (!publicUrl && ref.originalUrls.size) {
      const fallback = Array.from(ref.originalUrls)[0];
      if (fallback && /^https?:\/\//i.test(fallback)) publicUrl = fallback;
    }

    const resolvedUrl = signedUrl || publicUrl || null;

    const lookupKeys = new Set(ref.lookupKeys);
    ref.originalUrls.forEach((url) => lookupKeys.add(url));
    lookupKeys.add(ref.path);
    lookupKeys.add(`/${ref.path}`);

    if (resolvedUrl) {
      const noOrigin = resolvedUrl.replace(/^https?:\/\/[^/]+/i, '');
      lookupKeys.add(noOrigin);
      lookupKeys.add(noOrigin.replace(/^\/+/, ''));
    }

    lookupKeys.forEach((key) => {
      if (!key) return;
      const trimmed = String(key).trim();
      if (!trimmed) return;
      const replacement = resolvedUrl || trimmed;
      replacements.set(trimmed, replacement);
      const noOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, '');
      if (noOrigin && noOrigin !== trimmed) replacements.set(noOrigin, replacement);
      const noLeading = noOrigin.replace(/^\/+/, '');
      if (noLeading && noLeading !== trimmed) replacements.set(noLeading, replacement);
    });

    media.push({
      bucket: ref.bucket,
      path: ref.path,
      url: resolvedUrl,
      signedUrl: signedUrl || null,
      publicUrl: publicUrl || null,
      originalUrls: Array.from(ref.originalUrls),
      isPublic: ref.isPublic,
      error: errorMessage,
      sources: Array.from(ref.sources),
      expiresIn: resolvedUrl && signedUrl ? SIGNED_URL_TTL : null,
    });
  }

  return { replacements, media };
}

function replaceStrings(value, replacements) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceStrings(item, replacements));
  }
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, val] of Object.entries(value)) {
      output[key] = replaceStrings(val, replacements);
    }
    return output;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (replacements.has(trimmed)) return replacements.get(trimmed);
    const noOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, '');
    if (replacements.has(noOrigin)) return replacements.get(noOrigin);
    const noLeading = noOrigin.replace(/^\/+/, '');
    if (replacements.has(noLeading)) return replacements.get(noLeading);
    return value;
  }
  return value;
}
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let supabase;
  try {
    supabase = ensureClient();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Supabase configuration missing' });
  }

  const slug = String(req.query.game || req.query.slug || DEFAULT_SLUG).trim();
  const channel = normalizeChannel(req.query.channel || DEFAULT_CHANNEL);

  try {
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('slug', slug)
      .eq('channel', channel)
      .single();

    if (gameError || !game) {
      const message = gameError?.message || `Game not found for ${slug}@${channel}`;
      return res.status(404).json({ ok: false, error: message });
    }

    const gameId = game?.id || null;
    const missionQuery = supabase
      .from('missions')
      .select('*')
      .eq('channel', channel)
      .order('order_index', { ascending: true });
    const deviceQuery = supabase
      .from('devices')
      .select('*')
      .eq('channel', channel)
      .limit(1000);
    const powerupQuery = supabase
      .from('powerups')
      .select('*')
      .eq('channel', channel)
      .limit(1000);

    if (gameId) {
      missionQuery.eq('game_id', gameId);
      deviceQuery.eq('game_id', gameId);
      powerupQuery.eq('game_id', gameId);
    } else {
      missionQuery.eq('game_slug', slug);
      deviceQuery.eq('game_slug', slug);
      powerupQuery.eq('game_slug', slug);
    }

    const [missionsRes, devicesRes, powerupsRes] = await Promise.all([
      missionQuery,
      deviceQuery,
      powerupQuery.catch(() => ({ data: [], error: null })),
    ]);

    const missions = Array.isArray(missionsRes?.data) ? missionsRes.data : [];
    const devices = Array.isArray(devicesRes?.data) ? devicesRes.data : [];
    const powerups = Array.isArray(powerupsRes?.data) ? powerupsRes.data : [];

    const assetRefs = collectSupabaseAssets(game, missions, devices, powerups);
    let replacements = new Map();
    let mediaEntries = [];

    if (assetRefs.size) {
      const signed = await signSupabaseAssets(supabase, assetRefs);
      replacements = signed.replacements;
      mediaEntries = signed.media;
    }

    const apply = (value) => replaceStrings(value, replacements);

    const responseGame = game ? apply(game) : game;
    const responseMissions = missions.map(apply);
    const responseDevices = devices.map(apply);
    const responsePowerups = powerups.map(apply);

    return res.status(200).json({
      ok: true,
      _meta: { slug, channel, generatedAt: new Date().toISOString() },
      game: responseGame,
      missions: responseMissions,
      devices: responseDevices,
      powerups: responsePowerups,
      media: mediaEntries,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to load bundle' });
  }
}
