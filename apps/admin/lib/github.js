// lib/github.js
const API = process.env.GITHUB_API || 'https://api.github.com';

export function joinPath(...parts) {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function env() {
  const OWNER = required('REPO_OWNER');
  const REPO = required('REPO_NAME');
  const TOKEN = required('GITHUB_TOKEN');
  const BRANCH = process.env.GITHUB_BRANCH || 'main';
  const BASE_DIR = (process.env.GITHUB_BASE_DIR || '').replace(/^\/+|\/+$/g, '');
  return { OWNER, REPO, TOKEN, BRANCH, BASE_DIR };
}

function headers() {
  const { TOKEN } = env();
  return {
    Authorization: `Bearer ${TOKEN}`,
    'User-Agent': 'esxape-admin',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function readJson(relPath) {
  const { OWNER, REPO, BRANCH, BASE_DIR } = env();
  const path = joinPath(BASE_DIR, relPath);
  const url = `${API}/repos/${OWNER}/${REPO}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET ${path} failed: ${r.status} ${await r.text()}`);
  const data = await r.json();
  const buff = Buffer.from(data.content || '', 'base64');
  try { return JSON.parse(buff.toString('utf8')); } catch { return null; }
}

export async function listDirs(relPath) {
  const { OWNER, REPO, BRANCH, BASE_DIR } = env();
  const path = joinPath(BASE_DIR, relPath);
  const url = `${API}/repos/${OWNER}/${REPO}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`GitHub list ${path} failed: ${r.status} ${await r.text()}`);
  const data = await r.json();
  return Array.isArray(data) ? data.filter(x => x.type === 'dir').map(x => x.name) : [];
}

/**
 * bulkCommitMixed(files, message)
 * - files: [{ path: 'public/games/slug/file.json', content: '...', repoPath: 'apps/game-web/public/games/slug/file.json' }]
 * - will write `path` relative to BASE_DIR and `repoPath` as repo-root path.
 *
 * This implementation is robust to concurrent commits: if updating the ref fails (422),
 * it will retry a few times against the latest HEAD.
 */
export async function bulkCommitMixed(files, message) {
  const { OWNER, REPO, BRANCH, BASE_DIR } = env();

  const refUrl = `${API}/repos/${OWNER}/${REPO}/git/refs/heads/${encodeURIComponent(BRANCH)}`;

  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // 1) Read HEAD ref (fresh every attempt)
    const refRes = await fetch(refUrl, { headers: headers() });
    if (!refRes.ok) throw new Error(`GET ref failed: ${refRes.status} ${await refRes.text()}`);
    const ref = await refRes.json();
    const baseCommitSha = ref.object.sha;

    // 2) Load base commit to get base_tree
    const commitRes = await fetch(`${API}/repos/${OWNER}/${REPO}/git/commits/${baseCommitSha}`, { headers: headers() });
    if (!commitRes.ok) throw new Error(`GET commit failed: ${commitRes.status} ${await commitRes.text()}`);
    const baseCommit = await commitRes.json();
    const baseTreeSha = baseCommit.tree.sha;

    // 3) Build tree entries
    const tree = files.map(f => {
      const repoPath = f.repoPath ? joinPath(f.repoPath) : joinPath(BASE_DIR, f.path);
      return { path: repoPath, mode: '100644', type: 'blob', content: f.content };
    });

    // 4) Create new tree using base_tree
    const treeRes = await fetch(`${API}/repos/${OWNER}/${REPO}/git/trees`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: baseTreeSha, tree }),
    });
    if (!treeRes.ok) {
      const txt = await treeRes.text();
      throw new Error(`POST tree failed: ${treeRes.status} ${txt}`);
    }
    const newTree = await treeRes.json();

    // 5) Create commit with parent = baseCommitSha
    const newCommitRes = await fetch(`${API}/repos/${OWNER}/${REPO}/git/commits`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message || 'Update', tree: newTree.sha, parents: [baseCommitSha] }),
    });
    if (!newCommitRes.ok) {
      const txt = await newCommitRes.text();
      throw new Error(`POST commit failed: ${newCommitRes.status} ${txt}`);
    }
    const newCommit = await newCommitRes.json();

    // 6) Try to update the ref (non-force). If it fails with 422, retry with latest HEAD.
    const updateRes = await fetch(refUrl, {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });

    if (updateRes.ok) {
      // Success!
      return { sha: newCommit.sha, htmlUrl: `https://github.com/${OWNER}/${REPO}/commit/${newCommit.sha}` };
    }

    // Read body for debugging
    const updateText = await updateRes.text();

    // Retry on 422 (reference moved / cannot be updated because HEAD changed).
    if (updateRes.status === 422 && attempt < MAX_RETRIES - 1) {
      console.warn(`bulkCommitMixed: PATCH ref failed (attempt ${attempt + 1}/${MAX_RETRIES}) - will retry. details: ${updateText}`);
      // loop will re-fetch HEAD and retry
      continue;
    }

    // If not recoverable or out of retries, throw
    throw new Error(`PATCH ref failed: ${updateRes.status} ${updateText}`);
  }

  // If somehow we exit loop, throw
  throw new Error('bulkCommitMixed reached unexpected state (retries exhausted)');
}
