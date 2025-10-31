// [Codex note] Uploads a file into channel-aware media pool.
import { serverClient } from '../../../lib/supabaseClient';
import { MEDIA_BUCKET, mediaPoolPrefix } from '../../../lib/mediaPool';

export const config = { api: { bodyParser: false } };

function normalizeSegment(segment = '') {
  const safe = String(segment || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe || null;
}

function normalizeFilename(raw = '') {
  const cleaned = String(raw || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const segments = cleaned.split('/')
    .map(normalizeSegment)
    .filter(Boolean);
  if (!segments.length) return `upload_${Date.now()}`;
  const joined = segments.join('/');
  // Remove duplicated mediapool or channel prefixes if present.
  return joined.replace(/^(draft|public|published)\//i, '')
    .replace(/^mediapool\//i, '')
    || `upload_${Date.now()}`;
}

function resolveChannel(input) {
  const value = String(input || 'draft').toLowerCase();
  return value === 'published' || value === 'public' ? 'published' : 'draft';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const channel = resolveChannel(req.query.channel);
    const fileNameParam = req.query.filename || req.query.name || '';
    const normalizedName = normalizeFilename(fileNameParam);
    if (!normalizedName) {
      return res.status(400).json({ ok: false, error: 'Missing filename' });
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    if (!body.length) {
      return res.status(400).json({ ok: false, error: 'Empty payload' });
    }

    const bucket = MEDIA_BUCKET || 'media';
    const prefix = mediaPoolPrefix(channel);
    const key = `${prefix}${normalizedName}`.replace(/\/+/g, '/');
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    const supabase = serverClient();
    const { data, error } = await supabase.storage.from(bucket).upload(key, body, {
      upsert: true,
      contentType,
    });

    if (error) throw error;

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(key);
    const publicUrl = publicData?.publicUrl || '';

    return res.status(200).json({ ok: true, bucket, key: data?.path || key, publicUrl, channel });
  } catch (error) {
    return res.status(200).json({ ok: false, error: error?.message || 'upload failed' });
  }
}
