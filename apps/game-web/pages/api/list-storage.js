import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return res.status(500).json({ ok:false, error:'Missing envs' });

  const s = createClient(url, anon);

  const bucket = (req.query.bucket || 'media').toString();
  // prefix = folder path; example: 'mediapool' (no leading slash)
  const prefix = (req.query.prefix || 'mediapool').toString();
  const limit  = Number(req.query.limit || 100);
  const token  = req.query.token || undefined; // for pagination

  // One-level listing (folders + files under prefix)
  const { data, error } = await s.storage.from(bucket).list(prefix, {
    limit,
    token,      // pass back `response.token` to fetch next page
  });

  res.status(error ? 500 : 200).json({ ok: !error, bucket, prefix, items: data || [], error });
}
