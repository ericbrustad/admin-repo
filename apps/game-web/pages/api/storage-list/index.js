import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return res.status(500).json({ ok:false, error:'Missing envs' });
    }

    const s = createClient(url, anon);

    const bucket = (req.query.bucket || 'media').toString();
    // folder/prefix to list, no leading slash
    let prefix   = (req.query.prefix || 'mediapool').toString();
    // normalize prefix (no leading slash; end with slash for “folder”)
    prefix = prefix.replace(/^\/+/, '');
    if (prefix && !prefix.endsWith('/')) prefix += '/';

    const limit  = Number(req.query.limit || 100);
    const offset = Number(req.query.offset || 0);

    const { data, error } = await s.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    });

    return res.status(error ? 500 : 200).json({
      ok: !error,
      bucket,
      prefix,
      items: data || [],
      error
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}
