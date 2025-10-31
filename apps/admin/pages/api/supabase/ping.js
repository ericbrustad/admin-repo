export default async function handler(req, res) {
  const debug = req.query.debug === '1';
  try {
    const rawUrl = process.env.SUPABASE_URL || '';
    const baseUrl = rawUrl.trim().replace(/\/+$/, '');
    const srk = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!baseUrl || !srk) {
      return res.status(400).json({
        ok: false,
        error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        ...(debug ? {
          hasUrl: !!baseUrl,
          hasSrk: !!srk,
          srkLen: srk.length || 0,
          rawUrl
        } : {})
      });
    }

    const m = /^https:\/\/([^.]+)\.supabase\.co(?:\/.*)?$/.exec(baseUrl);
    const projectRef = m ? m[1] : null;

    // 1) Auth health (public)
    let authHealth = null;
    try {
      const r = await fetch(`${baseUrl}/auth/v1/health`);
      authHealth = r.ok ? await r.json() : { status: 'down', code: r.status, text: await r.text() };
    } catch (e) {
      authHealth = { status: 'error', message: e.message };
    }

    // 2) Buckets (service role)
    let buckets = null, bucketsError = null;
    try {
      const r = await fetch(`${baseUrl}/storage/v1/bucket`, {
        headers: { Authorization: `Bearer ${srk}`, apikey: srk }
      });
      if (r.ok) buckets = await r.json();
      else bucketsError = { status: r.status, text: await r.text() };
    } catch (e) {
      bucketsError = { message: e.message };
    }

    return res.status(200).json({
      ok: true,
      projectRef,
      authHealth,
      buckets,
      bucketsError,
      ...(debug ? { baseUrl } : {})
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, ...(debug ? { stack: e.stack } : {}) });
  }
}
