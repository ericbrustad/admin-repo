// pages/api/publish-debug.js
// Simple debug endpoint to show the exact GitHub Contents API URL and response
// Usage: GET /api/publish-debug?slug=<slug>

export default async function handler(req, res) {
  try {
    const slug = String((req.query.slug || '').trim());
    if (!slug) return res.status(400).json({ ok:false, error: 'Missing ?slug=...' });

    const OWNER = process.env.REPO_OWNER || '';
    const REPO  = process.env.REPO_NAME  || '';
    const BRANCH = process.env.GITHUB_BRANCH || 'main';
    // IMPORTANT: Admin is at repo root → BASE_DIR is usually empty string.
    const BASE_DIR = (process.env.GITHUB_BASE_DIR || '').replace(/^\/+|\/+$/g, '');

    const token = process.env.GITHUB_TOKEN || null;
    const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

    const join = (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/');

    const draftPath = join(BASE_DIR, 'public/games', slug, 'draft', 'config.json');
    const pubPath   = join(BASE_DIR, 'public/games', slug, 'config.json');
    const listGamesPath = join(BASE_DIR, 'public/games');

    const urls = {
      draftUrl: `https://api.github.com/repos/${OWNER}/${REPO}/contents/${draftPath}?ref=${encodeURIComponent(BRANCH)}`,
      pubUrl:   `https://api.github.com/repos/${OWNER}/${REPO}/contents/${pubPath}?ref=${encodeURIComponent(BRANCH)}`,
      listGamesUrl: `https://api.github.com/repos/${OWNER}/${REPO}/contents/${listGamesPath}?ref=${encodeURIComponent(BRANCH)}`
    };

    // small helper to fetch and return status + first 2000 chars of body
    async function probe(url) {
      const r = await fetch(url, { headers: { 'User-Agent': 'esxape-admin', Accept: 'application/vnd.github+json', ...authHeader }, cache: 'no-store' });
      const text = await r.text();
      return { status: r.status, ok: r.ok, bodyPreview: text ? text.slice(0, 2000) : '' };
    }

    const draftRes = await probe(urls.draftUrl);
    const pubRes   = await probe(urls.pubUrl);
    const listRes  = await probe(urls.listGamesUrl);

    return res.status(200).json({
      ok: true,
      env: {
        REPO_OWNER: !!OWNER,
        REPO_NAME: !!REPO,
        GITHUB_BRANCH: BRANCH,
        GITHUB_BASE_DIR: BASE_DIR === '' ? '(empty)' : BASE_DIR,
        HAS_TOKEN: !!token
      },
      attempted: { draftPath, pubPath, listGamesPath, urls },
      results: { draftRes, pubRes, listRes }
    });
  } catch (err) {
    return res.status(500).json({ ok:false, error: String(err?.message || err) });
  }
}
