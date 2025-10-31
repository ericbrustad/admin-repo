import { Buffer } from 'node:buffer';

const {
  SUPABASE_URL = '',
  SUPABASE_ANON_KEY = '',
  SUPABASE_SERVICE_ROLE_KEY = '',
  SUPABASE_MEDIA_BUCKET = 'media',
  SUPABASE_MEDIA_PREFIX = 'mediapool',
  SUPABASE_DATA_BUCKET,
  SUPABASE_DATA_PREFIX = 'admin-data',
} = process.env;

const supabaseBaseUrl = (SUPABASE_URL || '').replace(/\/+$/, '');
const storageBaseUrl = supabaseBaseUrl ? `${supabaseBaseUrl}/storage/v1` : '';

function hasSupabaseUrl() {
  return Boolean(storageBaseUrl);
}

function getAuthKey(preferService = true) {
  if (preferService && SUPABASE_SERVICE_ROLE_KEY) return SUPABASE_SERVICE_ROLE_KEY;
  if (SUPABASE_ANON_KEY) return SUPABASE_ANON_KEY;
  return '';
}

export function isSupabaseMediaEnabled() {
  return hasSupabaseUrl() && Boolean(SUPABASE_MEDIA_BUCKET) && Boolean(getAuthKey(true));
}

export function isSupabaseDataEnabled() {
  return hasSupabaseUrl() && Boolean(SUPABASE_DATA_BUCKET || SUPABASE_MEDIA_BUCKET) && Boolean(getAuthKey(true));
}

function encodeObjectPath(objectPath = '') {
  return String(objectPath || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizePath(...segments) {
  return segments
    .flatMap((segment) => String(segment || '').split('/'))
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function buildMediaPath(folder = '', fileName = '') {
  const prefix = (SUPABASE_MEDIA_PREFIX || '').replace(/^\/+|\/+$/g, '');
  const normalizedFolder = String(folder || '').replace(/^\/+|\/+$/g, '');
  const startsWithPrefix = prefix && normalizedFolder.toLowerCase().startsWith(prefix.toLowerCase());
  if (startsWithPrefix) {
    return normalizePath(normalizedFolder, fileName);
  }
  return normalizePath(prefix, normalizedFolder, fileName);
}

function buildDataPath(kind = '', slug = '') {
  const bucketPrefix = (SUPABASE_DATA_PREFIX || '').replace(/^\/+|\/+$/g, '');
  const safeSlug = String(slug || 'default')
    .trim()
    .replace(/[^a-z0-9-_]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'default';
  return normalizePath(bucketPrefix, kind, `${safeSlug}.json`);
}

function buildObjectUrl(bucket, objectPath, { isPublic = true } = {}) {
  if (!hasSupabaseUrl()) return '';
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = encodeObjectPath(objectPath);
  if (isPublic) {
    return `${storageBaseUrl}/object/public/${encodedBucket}/${encodedPath}`;
  }
  return `${storageBaseUrl}/object/${encodedBucket}/${encodedPath}`;
}

async function uploadObject(bucket, objectPath, body, { contentType = 'application/octet-stream', upsert = false } = {}) {
  if (!hasSupabaseUrl()) {
    return { ok: false, skipped: true, reason: 'SUPABASE_URL missing' };
  }
  const authKey = getAuthKey(true);
  if (!authKey) {
    return { ok: false, skipped: true, reason: 'Supabase key missing' };
  }

  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = encodeObjectPath(objectPath);
  const upsertParam = upsert ? '?upsert=true' : '';
  const targetUrl = `${storageBaseUrl}/object/${encodedBucket}/${encodedPath}${upsertParam}`;

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authKey}`,
      apikey: authKey,
      'Content-Type': contentType,
      'x-client-info': 'esx-admin/1.0',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, skipped: false, error: `Supabase upload failed: ${response.status} ${text}` };
  }

  const publicUrl = buildObjectUrl(bucket, objectPath, { isPublic: true });
  return { ok: true, bucket, path: objectPath, publicUrl };
}

async function listObjects(bucket, prefix, { recursive = true, limit = 1000 } = {}) {
  if (!hasSupabaseUrl()) return { ok: false, skipped: true, items: [] };
  const authKey = getAuthKey(true);
  if (!authKey) return { ok: false, skipped: true, items: [] };

  const encodedBucket = encodeURIComponent(bucket);
  const targetUrl = `${storageBaseUrl}/object/list/${encodedBucket}`;
  const requestBody = {
    prefix,
    limit,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  };

  const headers = {
    Authorization: `Bearer ${authKey}`,
    apikey: authKey,
    'Content-Type': 'application/json',
    'x-client-info': 'esx-admin/1.0',
  };

  const items = [];
  let offset = 0;
  while (true) {
    requestBody.offset = offset;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, skipped: false, error: `Supabase list failed: ${response.status} ${text}`, items };
    }

    const data = await response.json();
    const entries = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    if (!entries.length) break;

    for (const entry of entries) {
      const isFolder = !entry?.id;
      const name = entry?.name || '';
      const entryPath = normalizePath(prefix, name);
      if (isFolder && recursive) {
        const nested = await listObjects(bucket, entryPath, { recursive, limit });
        if (nested.ok && Array.isArray(nested.items)) {
          items.push(...nested.items);
        }
        continue;
      }
      if (isFolder) continue;
      items.push({
        name,
        bucket,
        path: entryPath,
        size: entry?.metadata?.size || entry?.metadata?.content_length || entry?.size || 0,
        updatedAt: entry?.updated_at || entry?.last_accessed_at || null,
      });
    }

    if (entries.length < limit) break;
    offset += limit;
  }

  return { ok: true, items };
}

function decodeBase64Payload(contentBase64 = '') {
  if (!contentBase64) return null;
  const trimmed = String(contentBase64).trim();
  const commaIndex = trimmed.indexOf(',');
  const base64 = trimmed.startsWith('data:') && commaIndex >= 0
    ? trimmed.slice(commaIndex + 1)
    : trimmed;
  try {
    return Buffer.from(base64, 'base64');
  } catch (error) {
    return null;
  }
}

function guessContentType(fileName = '') {
  const ext = String(fileName || '').toLowerCase().split('.').pop();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'svg': return 'image/svg+xml';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'bmp': return 'image/bmp';
    case 'tif':
    case 'tiff': return 'image/tiff';
    case 'avif': return 'image/avif';
    case 'heic':
    case 'heif': return 'image/heif';
    case 'mp4': return 'video/mp4';
    case 'mov': return 'video/quicktime';
    case 'webm': return 'video/webm';
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'm4a': return 'audio/m4a';
    case 'aiff':
    case 'aif': return 'audio/aiff';
    case 'glb': return 'model/gltf-binary';
    case 'gltf': return 'model/gltf+json';
    case 'usdz': return 'model/vnd.usdz+zip';
    case 'fbx': return 'application/octet-stream';
    case 'obj': return 'model/obj';
    case 'json': return 'application/json';
    default: return 'application/octet-stream';
  }
}

export async function uploadSupabaseMedia({ folder, fileName, contentBase64, sizeBytes }) {
  if (!isSupabaseMediaEnabled()) {
    return { ok: false, skipped: true, reason: 'Supabase media disabled' };
  }
  const buffer = decodeBase64Payload(contentBase64);
  if (!buffer) {
    return { ok: false, skipped: true, reason: 'No binary payload decoded' };
  }
  const objectPath = buildMediaPath(folder, fileName);
  const uploadResult = await uploadObject(
    SUPABASE_MEDIA_BUCKET,
    objectPath,
    buffer,
    { contentType: guessContentType(fileName), upsert: true },
  );
  if (!uploadResult.ok) return uploadResult;
  return {
    ...uploadResult,
    ok: true,
    sizeBytes: sizeBytes || buffer.length,
    reason: undefined,
  };
}

export async function listSupabaseMedia(dir) {
  if (!isSupabaseMediaEnabled()) return [];
  const objectPrefix = buildMediaPath(dir, '');
  const listResult = await listObjects(SUPABASE_MEDIA_BUCKET, objectPrefix, { recursive: true });
  if (!listResult.ok) return [];
  return listResult.items.map((item) => ({
    name: item.name,
    supabasePath: item.path,
    bucket: SUPABASE_MEDIA_BUCKET,
    publicUrl: buildObjectUrl(SUPABASE_MEDIA_BUCKET, item.path, { isPublic: true }),
    size: item.size,
    updatedAt: item.updatedAt,
  }));
}

async function deleteSupabaseObject(bucket, objectPath) {
  if (!hasSupabaseUrl()) {
    return { ok: false, skipped: true, reason: 'SUPABASE_URL missing' };
  }
  const authKey = getAuthKey(true);
  if (!authKey) {
    return { ok: false, skipped: true, reason: 'Supabase key missing' };
  }

  const encodedBucket = encodeURIComponent(bucket);
  const targetUrl = `${storageBaseUrl}/object/${encodedBucket}`;
  const response = await fetch(targetUrl, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${authKey}`,
      apikey: authKey,
      'Content-Type': 'application/json',
      'x-client-info': 'esx-admin/1.0',
    },
    body: JSON.stringify({ prefixes: [objectPath] }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, skipped: false, error: `Supabase delete failed: ${response.status} ${text}` };
  }

  return { ok: true };
}

export async function syncSupabaseJson(kind, slug, payload) {
  if (!isSupabaseDataEnabled()) {
    return { ok: false, skipped: true, reason: 'Supabase data disabled' };
  }
  const targetBucket = SUPABASE_DATA_BUCKET || SUPABASE_MEDIA_BUCKET;
  const objectPath = buildDataPath(kind, slug);
  const buffer = Buffer.from(JSON.stringify(payload, null, 2));
  const uploadResult = await uploadObject(
    targetBucket,
    objectPath,
    buffer,
    { contentType: 'application/json', upsert: true },
  );
  if (!uploadResult.ok) return uploadResult;
  return {
    ...uploadResult,
    ok: true,
    kind,
    slug,
  };
}

export function buildSupabasePublicUrl(bucket, objectPath) {
  return buildObjectUrl(bucket, objectPath, { isPublic: true });
}

export async function deleteSupabaseMedia({ bucket = SUPABASE_MEDIA_BUCKET, path }) {
  if (!path) {
    return { ok: false, skipped: true, reason: 'Missing object path' };
  }
  return deleteSupabaseObject(bucket, path);
}
