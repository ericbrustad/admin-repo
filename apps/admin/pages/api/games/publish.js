import { serverClient } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const id = body.id ? String(body.id) : null;
    const slug = body.slug ? String(body.slug) : null;

    if (!id && !slug) {
      return res.status(400).json({ ok: false, error: 'Provide id or slug' });
    }

    const supabase = serverClient();
    let query = supabase
      .from('games')
      .update({
        channel: 'published',
        updated_at: new Date().toISOString(),
      });

    if (id) query = query.eq('id', id);
    if (!id && slug) query = query.eq('slug', slug);

    const { error } = await query;
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error?.message || String(error);
    return res.status(500).json({ ok: false, error: message });
  }
}
