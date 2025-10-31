// [Codex note] Upsert a game row { slug, channel, title, config } with sanity checks.
import { upsertGameRow } from '../../../lib/games/persistGame';

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const payload = parseBody(req.body);

  try {
    const saved = await upsertGameRow(payload);
    return res.status(200).json({ ok: true, game: saved });
  } catch (error) {
    const message = error?.message || 'save failed';
    const status = /missing slug/i.test(message) ? 400 : 500;
    return res.status(status).json({ ok: false, error: message, details: error });
  }
}
