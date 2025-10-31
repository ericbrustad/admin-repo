// pages/api/media/list.js
// List files under public/media/<folder> (default 'mediapool') using GitHub Contents API.

export const config = { api: { bodyParser: true } };

const {
  REPO_OWNER,
  REPO_NAME,
  GITHUB_TOKEN,
  GITHUB_BRANCH = 'main',
  GITHUB_BASE_DIR = '',
} = process.env;

const GH_ROOT = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

function normBaseDir(s) { if (!s || s === '(empty)') return ''; return s.replace(/^\/+|\/+$/g, ''); }
const BASE_DIR = normBaseDir(GITHUB_BASE_DIR || '');
function joinPath(p) { const clean = p.replace(/^\/+/, ''); return BASE_DIR ? `${BASE_DIR}/${clean}` : clean; }

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'GET only' });

    const folder = (req.query.folder || 'mediapool').toString().replace(/[^a-z0-9_\-]/gi,'');
    const relDir = `public/media/${folder}`;
    const path = joinPath(relDir);

    const url = `${GH_ROOT}/${encodeURIComponent(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
    const r = await fetch(url, { headers: { Authorization:`Bearer ${GITHUB_TOKEN}`, Accept:'application/vnd.github+json' } });

    if (r.status === 404) {
      // no folder yet — return empty list
      return res.json({ ok:true, folder, files: [] });
    }
    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ ok:false, error: t || 'List failed' });
    }

    const j = await r.json();
    const files = (Array.isArray(j) ? j : [])
      .filter(x => x.type === 'file')
      .map(x => ({
        name: x.name,
        path: x.path,      // e.g. public/media/mediapool/foo.png
        url: `/${x.path.replace(/^public\//,'')}`, // served by Next statically
        size: x.size,
        sha: x.sha,
      }));
    return res.json({ ok:true, folder, files });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}
