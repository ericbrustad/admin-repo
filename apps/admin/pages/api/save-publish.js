// pages/api/save-publish.js
import { GAME_ENABLED } from '../../lib/game-switch.js';
import { syncSupabaseJson } from '../../lib/supabase-storage.js';

export const config = { api: { bodyParser: true } };

const {
  REPO_OWNER,
  REPO_NAME,
  GITHUB_TOKEN,
  GITHUB_BRANCH,
  GITHUB_BASE_DIR = '',
  REPO_BRANCH,
  VERCEL_GIT_COMMIT_REF,
  COMMIT_REF,
} = process.env;

const TARGET_BRANCH = REPO_BRANCH || GITHUB_BRANCH || VERCEL_GIT_COMMIT_REF || COMMIT_REF || 'main';

const GH_ROOT = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

function normBaseDir(s) {
  if (!s || s === '(empty)') return '';
  return s.replace(/^\/+|\/+$/g, '');
}
const BASE_DIR = normBaseDir(GITHUB_BASE_DIR);
function joinPath(p) {
  const clean = p.replace(/^\/+/, '');
  return BASE_DIR ? `${BASE_DIR}/${clean}` : clean;
}

async function getFileSha(path) {
  const url = `${GH_ROOT}/${encodeURIComponent(path)}?ref=${encodeURIComponent(TARGET_BRANCH)}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'esx-admin',
      Accept: 'application/vnd.github+json',
    },
  });
  if (r.status === 200) {
    const j = await r.json();
    return j.sha || null;
  }
  return null;
}

async function putFileWithRetry(path, contentText, message, attempts = 3) {
  const base = {
    message,
    content: Buffer.from(contentText, 'utf8').toString('base64'),
    branch: TARGET_BRANCH,
  };
  for (let i = 1; i <= attempts; i++) {
    const sha = await getFileSha(path);
    const body = sha ? { ...base, sha } : base;
    const url = `${GH_ROOT}/${encodeURIComponent(path)}`;
    const r = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'esx-admin',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (r.ok) return r.json();
    if (r.status === 409 && i < attempts) {
      await new Promise((res) => setTimeout(res, 150 * i));
      continue;
    }
    const txt = await r.text();
    throw new Error(`GitHub PUT failed: ${r.status} ${txt}`);
  }
  throw new Error(`GitHub PUT failed after ${attempts} attempts (409)`);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('POST only');

    const slug = String(req.query.slug || '').trim();
    const missions = req.body?.missions;
    const configObj = req.body?.config;

    if (!slug) return res.status(400).json({ ok: false, error: 'Missing slug' });
    if (!missions || !configObj) return res.status(400).json({ ok: false, error: 'Missing missions/config' });

    const missionsText = typeof missions === 'string' ? missions : JSON.stringify(missions, null, 2);
    const configText = typeof configObj === 'string' ? configObj : JSON.stringify(configObj, null, 2);
    let missionsPayload;
    let configPayload;
    try { missionsPayload = typeof missions === 'string' ? JSON.parse(missions) : missions; } catch { missionsPayload = null; }
    try { configPayload = typeof configObj === 'string' ? JSON.parse(configObj) : configObj; } catch { configPayload = null; }

    const wrote = [];
    const isDefault = slug === 'default';

    // Draft (Admin root)
    const rootDraftM = joinPath(`public/games/${slug}/draft/missions.json`);
    const rootDraftC = joinPath(`public/games/${slug}/draft/config.json`);
    await putFileWithRetry(rootDraftM, missionsText, `save+publish(draft missions): ${slug}`);
    wrote.push(rootDraftM);
    await putFileWithRetry(rootDraftC, configText, `save+publish(draft config): ${slug}`);
    wrote.push(rootDraftC);

    // Draft (Game) for TEST channel + PUBLISHED (Game live) — only when GAME_ENABLED
    const gameRepoBase = 'apps/game-web/public';
    if (GAME_ENABLED) {
      const gameDraftM = joinPath(`${gameRepoBase}/games/${slug}/draft/missions.json`);
      const gameDraftC = joinPath(`${gameRepoBase}/games/${slug}/draft/config.json`);
      await putFileWithRetry(gameDraftM, missionsText, `save+publish(game draft missions): ${slug}`);
      wrote.push(gameDraftM);
      await putFileWithRetry(gameDraftC, configText, `save+publish(game draft config): ${slug}`);
      wrote.push(gameDraftC);

      const gamePubM = joinPath(`${gameRepoBase}/games/${slug}/missions.json`);
      const gamePubC = joinPath(`${gameRepoBase}/games/${slug}/config.json`);
      await putFileWithRetry(gamePubM, missionsText, `publish(${slug}): game missions.json`);
      wrote.push(gamePubM);
      await putFileWithRetry(gamePubC, configText, `publish(${slug}): game config.json`);
      wrote.push(gamePubC);
    }

    // If default slug, also write legacy locations (admin + legacy public), and legacy game copies if GAME_ENABLED
    if (isDefault) {
      const legacyDraftM = joinPath('public/draft/missions.json');
      const legacyDraftC = joinPath('public/draft/config.json');

      await putFileWithRetry(legacyDraftM, missionsText, 'save+publish(legacy draft missions): default');
      wrote.push(legacyDraftM);
      await putFileWithRetry(legacyDraftC, configText, 'save+publish(legacy draft config): default');
      wrote.push(legacyDraftC);

      const legacyPubM = joinPath('public/missions.json');
      const legacyPubC = joinPath('public/config.json');
      await putFileWithRetry(legacyPubM, missionsText, 'publish(legacy missions.json): default');
      wrote.push(legacyPubM);
      await putFileWithRetry(legacyPubC, configText, 'publish(legacy config.json): default');
      wrote.push(legacyPubC);

      if (GAME_ENABLED) {
        const legacyGameDraftM = joinPath(`${gameRepoBase}/draft/missions.json`);
        const legacyGameDraftC = joinPath(`${gameRepoBase}/draft/config.json`);
        const legacyGamePubM = joinPath(`${gameRepoBase}/missions.json`);
        const legacyGamePubC = joinPath(`${gameRepoBase}/config.json`);

        await putFileWithRetry(legacyGameDraftM, missionsText, 'save+publish(legacy game draft missions): default');
        wrote.push(legacyGameDraftM);
        await putFileWithRetry(legacyGameDraftC, configText, 'save+publish(legacy game draft config): default');
        wrote.push(legacyGameDraftC);
        await putFileWithRetry(legacyGamePubM, missionsText, 'publish(legacy game missions.json): default');
        wrote.push(legacyGamePubM);
        await putFileWithRetry(legacyGamePubC, configText, 'publish(legacy game config.json): default');
        wrote.push(legacyGamePubC);
      }
    }

    let version = '';
    try { version = JSON.parse(missionsText)?.version || ''; } catch {}

    const supabase = {};
    try {
      if (missionsPayload) {
        supabase.missions = await syncSupabaseJson('missions', slug || 'default', missionsPayload);
      } else {
        supabase.missions = { ok: false, error: 'Unable to parse missions payload', kind: 'missions', slug: slug || 'default' };
      }
    } catch (error) {
      supabase.missions = { ok: false, error: error?.message || String(error), kind: 'missions', slug: slug || 'default' };
    }

    try {
      if (configPayload) {
        supabase.settings = await syncSupabaseJson('settings', slug || 'default', configPayload);
      } else {
        supabase.settings = { ok: false, error: 'Unable to parse config payload', kind: 'settings', slug: slug || 'default' };
      }
    } catch (error) {
      supabase.settings = { ok: false, error: error?.message || String(error), kind: 'settings', slug: slug || 'default' };
    }

    try {
      const devicesPayload = Array.isArray(configPayload?.devices)
        ? configPayload.devices
        : Array.isArray(configPayload?.powerups)
          ? configPayload.powerups
          : [];
      supabase.devices = await syncSupabaseJson('devices', slug || 'default', devicesPayload);
    } catch (error) {
      supabase.devices = { ok: false, error: error?.message || String(error), kind: 'devices', slug: slug || 'default' };
    }

    res.json({ ok: true, slug, wrote, version, supabase });
  } catch (e) {
    res.status(500).send(String(e?.message || e));
  }
}
