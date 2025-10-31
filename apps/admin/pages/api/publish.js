import { serverClient } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = String(req.query.slug || req.body?.slug || '').trim();
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'missing slug' });
  }

  let supabase;
  try {
    supabase = serverClient();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Supabase configuration missing' });
  }

  try {
    const { error } = await supabase.rpc('publish_game', { p_slug: slug });
    if (error) {
      throw error;
    }
    return res.status(200).json({ ok: true, slug, channel: 'published' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to publish game' });
  }
}
