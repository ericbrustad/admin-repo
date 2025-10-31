import { serverClient } from '../../../lib/supabaseClient';
import { upsertReturning } from '../../../lib/supabase/upsertReturning.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { slug, channel = 'draft', snapshot } = req.body || {};
    if (!slug || !snapshot) {
      return res.status(400).json({ ok: false, error: 'Missing slug or snapshot' });
    }

    const supabase = serverClient();
    const payload = {
      slug,
      channel: String(channel).toLowerCase() === 'published' ? 'published' : 'draft',
      data: snapshot,
      updated_at: new Date().toISOString(),
    };

    await upsertReturning(supabase, 'games', payload, { onConflict: 'slug' });

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}

