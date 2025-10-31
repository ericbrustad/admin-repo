// [Codex note] Uploads a file into channel-aware media pool.
import { channelBucket, mediaKey, normalizeChannel, sanitizeSlug } from '../../../lib/mediaPool';
import { serverClient } from '../../../lib/supabaseClient';

export const config = { api: { bodyParser: false } };

function normalizeFilename(raw = '') {
  const cleaned = String(raw || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]+/g, '_'))
    .join('/');
  return cleaned || `upload_${Date.now()}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    res.setHeader('Allow', 'POST, PUT');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const channel = normalizeChannel(req.query.channel);
  const slug = sanitizeSlug(req.query.slug || req.query.game || 'default');
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
        const headers = rawHeaders.split('\r\n').map((line) => line.trim());
        const disposition = headers.find((line) => /^content-disposition/i.test(line)) || '';
        if (!/name="file"/i.test(disposition)) continue;
        const filenameMatch = disposition.match(/filename="([^"]*)"/i);
        if (filenameMatch && !filename) {
          filename = filenameMatch[1];
        }
        const typeHeader = headers.find((line) => /^content-type/i.test(line));
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
    }

    if (!filename) {
      return res.status(400).json({ ok: false, error: 'Missing filename' });
    }

    if (!bytes || !bytes.length) {
      return res.status(400).json({ ok: false, error: 'Empty payload' });
    }

    const supabase = serverClient();
    const bucket = channelBucket(channel);
    const safeName = normalizeFilename(filename);
    const key = mediaKey(slug, safeName, channel);

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(key, bytes, { upsert: true, contentType });

    if (uploadError) {
      return res.status(500).json({
        ok: false,
        error: `upload failed: ${uploadError.message}`,
        code: uploadError.statusCode || uploadError.name || null,
      });
    }

    if (bucket === 'media-pub') {
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(key);
      const publicUrl = publicData?.publicUrl || null;
      return res.status(200).json({
        ok: true,
        bucket,
        key,
        url: publicUrl,
        publicUrl,
        visibility: 'public',
        channel,
      });
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(key, 60 * 60);

    if (signedError) {
      return res.status(500).json({ ok: false, error: signedError.message || 'unable to sign url' });
    }

    const signedUrl = signedData?.signedUrl || null;
    return res.status(200).json({
      ok: true,
      bucket,
      key,
      url: signedUrl,
      publicUrl: signedUrl,
      visibility: 'signed',
      channel,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'upload failed' });
  }
}
