/**
 * CODEx NOTE (2025-10-28): Robust Vercel status checker with API-version fallback.
 * - TOKEN: VERCEL_API_TOKEN or VERCEL_TOKEN
 * - PROJECT: ?projectId=... OR env VERCEL_PROJECT_ID_GAME / VERCEL_PROJECT_ID_ADMIN / VERCEL_PROJECT_ID
 * - TEAM: VERCEL_TEAM_ID or VERCEL_ORG_ID (optional)
 * - Fallbacks API versions: v13 → v12 → v10 → v9 → v8 → v6
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const TOKEN =
    process.env.VERCEL_API_TOKEN ||
    process.env.VERCEL_TOKEN || '';

  const TEAM_ID =
    process.env.VERCEL_TEAM_ID ||
    process.env.VERCEL_ORG_ID || '';

  const hint = String(req.query.project || req.query.p || 'admin').toLowerCase();
  const fromQuery = (req.query.projectId && String(req.query.projectId).trim()) || '';

  const pidGame  = process.env.VERCEL_PROJECT_ID_GAME  || '';
  const pidAdmin = process.env.VERCEL_PROJECT_ID_ADMIN || '';
  const pidAny   = process.env.VERCEL_PROJECT_ID       || '';

  let PROJECT_ID =
    fromQuery ||
    (hint === 'game'  ? (pidGame  || pidAdmin || pidAny) :
     hint === 'admin' ? (pidAdmin || pidAny) : '') ||
    pidAny || pidAdmin || pidGame;

  if (!TOKEN || !PROJECT_ID) {
    return res.status(200).json({
      ok: false,
      error: 'Missing VERCEL_TOKEN (or VERCEL_API_TOKEN) or project id',
      missing: {
        token: !TOKEN,
        projectId: !PROJECT_ID,
        teamId: !TEAM_ID,
        hint, fromQuery: Boolean(fromQuery),
        have: { pidGame: Boolean(pidGame), pidAdmin: Boolean(pidAdmin), pidAny: Boolean(pidAny) }
      }
    });
  }

  const versions = ['v13','v12','v10','v9','v8','v6'];
  const qs = new URLSearchParams({ projectId: PROJECT_ID, limit: '1' });
  if (TEAM_ID) qs.set('teamId', TEAM_ID);

  let lastError = null;
  for (const ver of versions) {
    try {
      const url = `https://api.vercel.com/${ver}/deployments?${qs.toString()}`;
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Accept': 'application/json'
        }
      });

      const isJson = (r.headers.get('content-type') || '').includes('application/json');
      const body = isJson ? (await r.json().catch(() => ({}))) : await r.text();

      const msg = (typeof body === 'string' ? body : (body?.error?.message || body?.message || '')).toLowerCase();
      if (!r.ok && (msg.includes('invalid api version') || r.status === 404)) {
        lastError = { ver, status: r.status, message: body?.error?.message || body?.message || String(body) };
        continue;
      }

      if (!r.ok) {
        return res.status(200).json({
          ok: false,
          error: body?.error?.message || body?.message || `Vercel API ${r.status}`,
          apiStatus: r.status,
          apiVersionTried: ver
        });
      }

      const list = Array.isArray(body?.deployments) ? body.deployments : (Array.isArray(body) ? body : []);
      const latest = list[0] || null;
      const rawUrl = latest?.url || '';
      const finalUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`) : '';

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
      return res.status(200).json({
        ok: true,
        state: latest?.readyState || latest?.state || 'unknown',
        url: finalUrl || null,
        projectId: PROJECT_ID,
        teamId: TEAM_ID || null,
        apiVersion: ver,
        checkedAt: new Date().toISOString()
      });
    } catch (e) {
      lastError = { ver, message: e?.message || String(e) };
    }
  }

  return res.status(200).json({
    ok: false,
    error: 'All API versions failed',
    lastError
  });
}
