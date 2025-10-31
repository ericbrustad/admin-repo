import { upsertGameRow } from '../../../lib/games/persistGame';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { slug, snapshot } = req.body || {};
    if (!slug || !snapshot) {
      return res.status(400).json({ ok: false, error: 'Missing slug or snapshot' });
    }

    await upsertGameRow({ slug, channel: 'published', snapshot });

    return res.status(200).json({ ok: true, published: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}

