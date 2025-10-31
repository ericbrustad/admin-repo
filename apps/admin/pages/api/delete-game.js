// pages/api/delete-game.js
import { GAME_ENABLED } from '../../lib/game-switch.js';

const GH = 'https://api.github.com';
const owner  = process.env.REPO_OWNER;
const repo   = process.env.REPO_NAME;
const token  = process.env.GITHUB_TOKEN;
const branch = (
  process.env.REPO_BRANCH ||
  process.env.GITHUB_BRANCH ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.COMMIT_REF ||
  'main'
);

const authHeaders = {
  Authorization: `Bearer ${token}`,
  'User-Agent': 'esx-admin',
  Accept: 'application/vnd.github+json',
};

async function get(path) {
  const url = `${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
  const r = await fetch(url, { headers: authHeaders });
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`);
  return r.json();
}
async function put(path, content, message, sha=null) {
  const url = `${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = { message, content: Buffer.from(content).toString('base64'), branch };
  if (sha) body.sha = sha;
  const r = await fetch(url, { method: 'PUT', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${path} ${r.status}`);
  return r.json();
}
async function del(path, sha, message) {
  const url = `${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const r = await fetch(url, { method: 'DELETE', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, sha, branch }) });
  if (!r.ok) throw new Error(`DELETE ${path} ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const { slug } = req.body || {};
  if (!slug) return res.status(400).json({ ok: false, error: 'Missing slug' });
  const dir = `public/games/${slug}`;
  try {
    // list directory; delete all files inside
    let entries = [];
    try {
      const dirList = await get(dir); // array of files if directory exists
      if (Array.isArray(dirList)) entries = dirList;
    } catch (e) {
      // directory might not exist; continue
    }
    for (const it of entries) {
      if (it.type === 'file' && it.sha && it.path) {
        await del(it.path, it.sha, `chore: delete game ${slug} (${it.name})`);
      }
    }
    // defensive deletes for known files
    for (const name of ['missions.json','config.json']) {
      try {
        const f = await get(`${dir}/${name}`);
        await del(f.path, f.sha, `chore: delete game ${slug} (${name})`);
      } catch {}
    }
    // update index.json
    const idx = await get('public/games/index.json');
    const list = JSON.parse(Buffer.from(idx.content, 'base64').toString('utf-8') || '[]');
    const next = Array.isArray(list) ? list.filter(x => x.slug !== slug) : [];
    await put('public/games/index.json', JSON.stringify(next, null, 2), `chore: update games index (delete ${slug})`, idx.sha);

    return res.json({ ok: true, slug, gameProjectEnabled: GAME_ENABLED });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
