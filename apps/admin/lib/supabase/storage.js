import { promises as fs } from 'fs';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_MEDIA_BUCKET = 'media',
} = process.env;

function ensureStorageConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for storage');
  }
}

function encodePath(path = '') {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function storageBaseUrl() {
  ensureStorageConfig();
  return `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1`;
}

export async function uploadBufferToStorage({ path, buffer, contentType = 'application/octet-stream', upsert = false }) {
  ensureStorageConfig();
  const base = storageBaseUrl();
  const encodedBucket = encodeURIComponent(SUPABASE_MEDIA_BUCKET);
  const encodedPath = encodePath(path);
  const target = `${base}/object/${encodedBucket}/${encodedPath}${upsert ? '?upsert=true' : ''}`;

  const res = await fetch(target, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
      'x-client-info': 'esx-admin/1.0',
    },
    body: buffer,
  });

  if (!res.ok) {
    const text = await res.text();
    const error = new Error(`Supabase storage upload failed: ${res.status} ${text}`);
    error.status = res.status;
    throw error;
  }

  const publicUrl = `${base}/object/public/${encodedBucket}/${encodedPath}`;
  return {
    bucket: SUPABASE_MEDIA_BUCKET,
    path,
    publicUrl,
  };
}

export async function uploadFileToStorage({ filePath, targetPath, contentType, upsert = false }) {
  const buffer = await fs.readFile(filePath);
  return uploadBufferToStorage({ path: targetPath, buffer, contentType, upsert });
}
