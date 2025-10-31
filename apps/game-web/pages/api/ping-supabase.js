import { createClient } from '../../lib/supabase-lite.js';

export default async function handler(_req, res) {
  try {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return res.status(500).json({ ok: false, error: 'Missing NEXT_PUBLIC_SUPABASE_URL or ANON key' });
    }

    const supabase = createClient(url, anon);

    // ⬇️ Pick ONE small table you expect the client to read
    // Example 1: games(id, slug)
    const { data, error } = await supabase
      .from('games')
      .select('id,slug')
      .limit(1);

    if (error) return res.status(500).json({ ok: false, error });
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
