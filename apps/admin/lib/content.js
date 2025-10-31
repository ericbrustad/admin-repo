// lib/content.js
/**
 * Content resolver for the Game app.
 * It fetches config.json and missions.json for a given slug + channel.
 *
 * Supports three sources (configure via env vars):
 * 1) Local public folder (default if CONTENT_SOURCE not set):
 *    - Reads /public/games/<slug>[/draft]/(config|missions).json
 * 2) Remote HTTP base URL (CONTENT_BASE_URL):
 *    - Fetches `${CONTENT_BASE_URL}/${slug}/${maybeDraft}/file.json`
 * 3) GitHub repo via Contents API (CONTENT_SOURCE='github'):
 *    - CONTENT_REPO_OWNER, CONTENT_REPO_NAME, CONTENT_BRANCH, CONTENT_BASE_PATH
 *    - Optional CONTENT_GITHUB_TOKEN for private repos
 */

export function buildPaths({ slug, channel }) {
  const draftSuffix = channel === 'draft' ? '/draft' : '';
  const rel = `games/${slug}${draftSuffix}`;
  return { relConfig: `${rel}/config.json`, relMissions: `${rel}/missions.json` };
}

export async function fetchFromLocal({ relConfig, relMissions }) {
  // Local read runs on the server (API route) using fetch against the same host's public folder
  const cfg = await fetch(`http://localhost/__local__/${relConfig}`).catch(() => null);
  return cfg;
}

// Main function used in /api/content
export async function loadContent({ slug, channel }) {
  const source = process.env.CONTENT_SOURCE || (process.env.CONTENT_BASE_URL ? 'remote' : 'local');
  const { relConfig, relMissions } = buildPaths({ slug, channel });

  if (source === 'github') {
    const owner = process.env.CONTENT_REPO_OWNER;
    const repo = process.env.CONTENT_REPO_NAME;
    const branch = process.env.CONTENT_BRANCH || 'main';
    const basePath = (process.env.CONTENT_BASE_PATH || '').replace(/^\/+|\/+$/g, '');
    const token = process.env.CONTENT_GITHUB_TOKEN || '';

    const headers = {
      'User-Agent': 'esx-game',
      'Accept': 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    async function read(path) {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
      const r = await fetch(url, { headers, cache: 'no-store' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`GitHub GET failed: ${r.status} ${await r.text()}`);
      const data = await r.json();
      const buff = Buffer.from(data.content || '', 'base64');
      try { return JSON.parse(buff.toString('utf8')); } catch { return null; }
    }

    const cfg = await read(`${basePath}/${relConfig}`);
    const mis = await read(`${basePath}/${relMissions}`);
    return { config: cfg, missions: mis };
  }

  if (source === 'remote') {
    const base = (process.env.CONTENT_BASE_URL || '').replace(/\/+$/g, '');
    async function read(rel) {
      const url = `${base}/${rel}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      try { return await r.json(); } catch { return null; }
    }
    const cfg = await read(relConfig);
    const mis = await read(relMissions);
    return { config: cfg, missions: mis };
  }

  // Default: local public folder of this Next app
  // On Vercel, we can serve from /public via the same domain. Use `new URL` based on request in API route.
  return { localRelConfig: relConfig, localRelMissions: relMissions };
}
