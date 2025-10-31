const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'media';
const IMPORTS_BUCKET = process.env.SUPABASE_IMPORTS_BUCKET || 'imports';

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const bucket = String(body.bucket || MEDIA_BUCKET);
    const path = normalizePath(body.path || '');
    const contentType = typeof body.contentType === 'string' && body.contentType
      ? body.contentType
      : 'application/octet-stream';
    const upsert = Boolean(body.upsert);

    if (!path) {
      return res.status(400).json({ ok: false, error: 'Missing path' });
    }

    const allowedBuckets = new Set([MEDIA_BUCKET, IMPORTS_BUCKET]);
    if (!allowedBuckets.has(bucket)) {
      return res.status(403).json({ ok: false, error: 'Bucket not allowed' });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    const target = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/sign-upload-url`;
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bucket, path, contentType, upsert }),
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

    return res.status(200).json(payload || { ok: true });
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
