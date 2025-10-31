import { upsertGameRow } from '../../../lib/games/persistGame';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { slug, channel = 'draft', snapshot } = req.body || {};
    if (!slug || !snapshot) {
      return res.status(400).json({ ok: false, error: 'Missing slug or snapshot' });
    }

    await upsertGameRow({ slug, channel, snapshot });

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}

