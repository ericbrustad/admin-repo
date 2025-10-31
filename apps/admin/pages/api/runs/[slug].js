// pages/api/runs/[slug].js
// Stores a run record. If body.session is present => partial save to runs/sessions/<session>.json
// If no session => final run to runs/<timestamp>.json (also mirrored to game/ for production reads)
import { GAME_ENABLED } from '../../../lib/game-switch.js';

export const config = { api: { bodyParser: true } };

const {
  REPO_OWNER,
  REPO_NAME,
  GITHUB_TOKEN,
  GITHUB_BRANCH = 'main',
  GITHUB_BASE_DIR = '',
  NEXT_PUBLIC_GAME_ORIGIN, // for CORS (optional)
} = process.env;

const GH_ROOT = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

function normBaseDir(s) { if (!s || s === '(empty)') return ''; return s.replace(/^\/+|\/+$/g, ''); }
const BASE_DIR = normBaseDir(GITHUB_BASE_DIR);
function joinPath(p) { const clean = p.replace(/^\/+/, ''); return BASE_DIR ? `${BASE_DIR}/${clean}` : clean; }

function cors(res) {
  const allow = NEXT_PUBLIC_GAME_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function getFileSha(path) {
  const url = `${GH_ROOT}/${encodeURIComponent(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept:'application/vnd.github+json', 'User-Agent':'esx-admin' } });
  if (r.ok) { const j = await r.json(); return j.sha || null; }
  return null;
}
async function putFile(path, contentText, message) {
  const sha = await getFileSha(path);
  const body = {
    message,
    content: Buffer.from(contentText, 'utf8').toString('base64'),
    branch: GITHUB_BRANCH,
    ...(sha ? { sha } : {}),
  };
  const url = `${GH_ROOT}/${encodeURIComponent(path)}`;
  const r = await fetch(url, {
    method:'PUT',
    headers:{ Authorization:`Bearer ${GITHUB_TOKEN}`, Accept:'application/vnd.github+json', 'Content-Type':'application/json', 'User-Agent':'esx-admin' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GitHub PUT failed: ${r.status} ${t}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'POST only' });

  try {
    const slug = String(req.query.slug || '').trim();
    if (!slug) return res.status(400).json({ ok:false, error:'Missing slug' });

    const { answers, score, player, meta, session } = req.body || {};
    if (!answers) return res.status(400).json({ ok:false, error:'Missing answers map' });

    const ts = new Date();
    const iso = ts.toISOString();
    const stamp = iso.replace(/[-:.TZ]/g,'').slice(0,14); // YYYYMMDDHHMMSS

    const run = {
      slug,
      score: Number(score || 0),
      answers,         // { m01: "...", m02: "..." }
      player: player || {},
      meta:   meta   || {},
      savedAt: iso,
      version: 1,
      status: session ? 'partial' : 'complete',
      session: session || undefined,
    };
    const text = JSON.stringify(run, null, 2);

    const wrote = [];

    const gameRepoBase = 'apps/game-web/public';
    if (session) {
      // Partial: write to runs/sessions/<session>.json (mirrored to game/)
      const rootPath = joinPath(`public/games/${slug}/runs/sessions/${session}.json`);
      await putFile(rootPath, text, `run(partial ${slug}): ${session}`); wrote.push(rootPath);
      if (GAME_ENABLED) {
        const gamePath = joinPath(`${gameRepoBase}/games/${slug}/runs/sessions/${session}.json`);
        await putFile(gamePath, text, `run(partial ${slug} game): ${session}`); wrote.push(gamePath);
      }
    } else {
      // Final: write to runs/<timestamp>.json (mirrored to game/)
      const rootPath = joinPath(`public/games/${slug}/runs/${stamp}.json`);
      await putFile(rootPath, text, `run(${slug}): ${stamp}`); wrote.push(rootPath);
      if (GAME_ENABLED) {
        const gamePath = joinPath(`${gameRepoBase}/games/${slug}/runs/${stamp}.json`);
        await putFile(gamePath, text, `run(${slug} game): ${stamp}`); wrote.push(gamePath);
      }
    }

    return res.json({ ok:true, slug, wrote, id: session || stamp });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}
