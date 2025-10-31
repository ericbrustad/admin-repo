import { uploadBufferToStorage } from '../../../lib/supabase/storage.js';

export const config = { api: { bodyParser: true } };

function sanitizeName(name = '') {
  return String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || `upload_${Date.now()}`;
}

function guessContentType(fileName = '', fallback = 'application/octet-stream') {
  const ext = String(fileName || '').toLowerCase().split('.').pop();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    default: return fallback;
  }
}

function decodeBase64(input = '') {
  const trimmed = String(input || '').trim();
  const commaIndex = trimmed.indexOf(',');
  const payload = trimmed.startsWith('data:') && commaIndex >= 0
    ? trimmed.slice(commaIndex + 1)
    : trimmed;
  return Buffer.from(payload, 'base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const {
      game = 'shared',
      fileName,
      contentBase64,
      contentType,
    } = req.body || {};

    if (!fileName || !contentBase64) {
      return res.status(400).json({ ok: false, error: 'Missing fileName or contentBase64' });
    }

    const safeName = sanitizeName(fileName);
    const buffer = decodeBase64(contentBase64);
    const type = contentType || guessContentType(safeName);
    const objectPath = `${sanitizeName(game)}/${Date.now()}_${safeName}`;

    const upload = await uploadBufferToStorage({ path: objectPath, buffer, contentType: type });

    return res.status(200).json({
      ok: true,
      key: upload.path,
      url: upload.publicUrl,
      bucket: upload.bucket,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Upload failed' });
  }
}
