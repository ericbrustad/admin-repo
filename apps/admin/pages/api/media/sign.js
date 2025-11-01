import { MEDIA_BUCKET, buildKey } from '../../../lib/storage/keys.js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function sanitizeChannel(value) {
  return String(value || '').toLowerCase().trim() || 'draft';
}

function normalizePath(input = '') {
  return String(input || '').replace(/^\/+/, '').trim();
}

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end('ok');
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const contentType = typeof body.contentType === 'string' && body.contentType
      ? body.contentType
      : 'application/octet-stream';
    const channel = sanitizeChannel(body.channel || process.env.NEXT_PUBLIC_DEFAULT_CHANNEL || 'draft');
    const subpath = normalizePath(body.subpath || '');
    const rawPath = normalizePath(body.path || '');

    const bucket = MEDIA_BUCKET;
    const key = rawPath && !/^media\//i.test(rawPath)
      ? rawPath
      : buildKey({ channel, subpath });

    if (!key) {
      return res.status(400).json({ ok: false, error: 'Missing target path' });
    }

    const baseUrl = SUPABASE_URL.replace(/\/+$/, '');
    const encodedBucket = encodeURIComponent(bucket);
    const encodedKey = encodeURIComponent(key);
    const target = `${baseUrl}/storage/v1/object/upload/sign/${encodedBucket}/${encodedKey}`;

    const response = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        'content-type': 'application/json',
        'x-client-info': 'esx-admin/1.0',
      },
      body: JSON.stringify({ contentType }),
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const message = (payload && payload.error) || text || 'Unable to sign upload URL';
      return res.status(response.status).json({ ok: false, error: message });
    }

    return res.status(200).json(payload || { ok: true, bucket, key });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ ok: false, error: message });
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
