// [Codex note] Uploads a file into channel-aware media pool.
import { MEDIA_BUCKET, ensureMediaBucket, mediaPoolPrefix } from '../../../lib/mediaPool';

export const config = { api: { bodyParser: false } };

function normalizeFilename(raw = '') {
  const cleaned = String(raw || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const parts = cleaned
    .split('/')
    .map((segment) => segment.trim().replace(/[^a-zA-Z0-9._-]+/g, '_'))
    .filter(Boolean);
  const joined = parts.join('/');
  return joined.replace(/^(draft|public|published)\//i, '').replace(/^mediapool\//i, '') || `upload_${Date.now()}`;
}

function normalizeChannel(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw || 'draft').toLowerCase();
  return normalized === 'published' ? 'published' : 'draft';
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    res.setHeader('Allow', 'POST, PUT');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const channel = normalizeChannel(req.query.channel);
  let filename = String(req.query.filename || req.query.name || '').trim();
  let contentType = req.headers['content-type'] || 'application/octet-stream';
  let bytes = null;

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    bytes = Buffer.concat(chunks);

    if (contentType.startsWith('multipart/form-data')) {
      const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
      if (!boundaryMatch) {
        return res.status(400).json({ ok: false, error: 'Invalid multipart payload' });
      }
      const boundary = `--${boundaryMatch[1]}`;
      const bodyString = bytes.toString('binary');
      const parts = bodyString.split(boundary).filter((part) => part.trim() && part.trim() !== '--');
      let found = null;
      for (const part of parts) {
        const [rawHeaders, rawBody] = part.split('\r\n\r\n');
        if (!rawHeaders || rawBody === undefined) continue;
        const headers = rawHeaders.split('\r\n').map((line) => line.trim().toLowerCase());
        const disposition = headers.find((line) => line.startsWith('content-disposition')) || '';
        if (!/name="file"/i.test(disposition)) continue;
        const filenameMatch = disposition.match(/filename="([^"]*)"/i);
        if (filenameMatch && !filename) {
          filename = filenameMatch[1];
        }
        const typeHeader = headers.find((line) => line.startsWith('content-type'));
        if (typeHeader) {
          const typeMatch = typeHeader.match(/content-type:\s*(.*)/i);
          if (typeMatch && typeMatch[1]) {
            contentType = typeMatch[1].trim();
          }
        }
        const body = rawBody.replace(/\r\n--$/g, '').replace(/\r\n$/, '');
        found = Buffer.from(body, 'binary');
        break;
      }
      if (!found) {
        return res.status(400).json({ ok: false, error: 'Missing file field' });
      }
      bytes = found;
      if (!filename) {
        filename = `upload_${Date.now()}`;
      }
    }

    if (!filename) {
      return res.status(400).json({ ok: false, error: 'Missing filename' });
    }

    if (!bytes || !bytes.length) {
      return res.status(400).json({ ok: false, error: 'Empty payload' });
    }

    const supabase = await ensureMediaBucket();

    const safeName = normalizeFilename(filename);
    const key = `${mediaPoolPrefix(channel)}${safeName}`.replace(/\/+/g, '/');

    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(key, bytes, { upsert: true, contentType });

    if (uploadError) {
      return res.status(500).json({
        ok: false,
        error: `upload failed: ${uploadError.message}`,
        code: uploadError.statusCode || uploadError.name || null,
      });
    }

    const { data: publicData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(key);
    return res.status(200).json({
      ok: true,
      bucket: MEDIA_BUCKET,
      key,
      publicUrl: publicData?.publicUrl || null,
      channel,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'upload failed' });
  }
}
