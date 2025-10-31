import { supaService } from '../../lib/supabase/server.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  let supa;
  try {
    supa = supaService();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Supabase configuration missing' });
  }

  try {
    const { game_slug, kind = 'event', payload = {} } = req.body || {};
    if (!game_slug) {
      return res.status(400).json({ ok: false, error: 'Missing game_slug' });
    }

    const safePayload = typeof payload === 'object' && payload !== null ? payload : { value: payload };
    const { error } = await supa.from('feedback').insert({ game_slug, kind, payload: safePayload });
    if (error) {
      throw error;
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to record feedback' });
  }
}
