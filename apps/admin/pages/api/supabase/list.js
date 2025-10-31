export default async function handler(req, res) {
  const debug = req.query.debug === '1';
  try {
    const rawUrl = process.env.SUPABASE_URL || '';
    const baseUrl = rawUrl.trim().replace(/\/+$/, '');
    const srk = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const bucket = (req.query.bucket || process.env.SUPABASE_MEDIA_BUCKET || '').toString().trim();
    const prefix = (req.query.prefix || process.env.SUPABASE_MEDIA_PREFIX || '').toString();

    if (!baseUrl || !srk) {
      return res.status(400).json({
        ok: false,
        error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        ...(debug ? { hasUrl: !!baseUrl, hasSrk: !!srk, srkLen: srk.length || 0, rawUrl } : {})
      });
    }
    if (!bucket) return res.status(400).json({ ok: false, error: 'Provide ?bucket= or set SUPABASE_MEDIA_BUCKET' });

    try {
      const r = await fetch(`${baseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${srk}`,
          apikey: srk,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prefix, limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } })
      });

      const text = await r.text();
      const data = text
        ? (() => {
            try {
              return JSON.parse(text);
            } catch {
              return null;
            }
          })()
        : null;

      if (!r.ok) {
        return res.status(200).json({
          ok: false,
          error: text || `HTTP ${r.status}`,
          bucket,
          prefix,
          ...(debug ? { baseUrl } : {})
        });
      }

      return res.status(200).json({ ok: true, bucket, prefix, count: data?.length || 0, files: data, ...(debug ? { baseUrl } : {}) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message, ...(debug ? { bucket, prefix, baseUrl } : {}) });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, ...(debug ? { stack: e.stack } : {}) });
  }
}
