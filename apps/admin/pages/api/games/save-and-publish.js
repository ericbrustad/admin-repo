import { serverClient } from '../../../lib/supabaseClient';
import { upsertReturning } from '../../../lib/supabase/upsertReturning.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { slug, snapshot } = req.body || {};
    if (!slug || !snapshot) {
      return res.status(400).json({ ok: false, error: 'Missing slug or snapshot' });
    }

    const supabase = serverClient();
    const payload = {
      slug,
      channel: 'published',
      data: snapshot,
      updated_at: new Date().toISOString(),
    };

    await upsertReturning(supabase, 'games', payload, { onConflict: 'slug' });

    return res.status(200).json({ ok: true, published: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}

