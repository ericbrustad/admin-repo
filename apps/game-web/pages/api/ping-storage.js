import { createClient } from '../../lib/supabase-lite.js';

export default async function handler(_req, res) {
  try {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return res.status(500).json({ ok: false, error: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY' });
    }

    // ⬇️ Set these to match your setup
    const BUCKET = 'media';              // e.g., 'media'
    const PATH   = 'mediapool/test.jpg'; // e.g., 'mediapool/test.jpg' (must exist in the bucket)

    const s = createClient(url, anon);

    // Public URL (works only if bucket/object is publicly readable)
    const { data: pub } = s.storage.from(BUCKET).getPublicUrl(PATH);

    // Signed URL (works even if bucket is private)
    const { data: signed, error: signErr } = await s.storage
      .from(BUCKET)
      .createSignedUrl(PATH, 60); // 60s validity

    const result = {
      ok: !signErr,                 // true if we could create a signed URL
      bucket: BUCKET,
      path: PATH,
      publicUrl: pub?.publicUrl || null,
      signedUrl: signed?.signedUrl || null,
      error: signErr || null,
    };

    return res.status(signErr ? 500 : 200).json(result);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
