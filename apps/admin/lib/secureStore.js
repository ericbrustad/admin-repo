// Utilities for CORS, GitHub commits, and AES-GCM encryption of PII

import crypto from 'crypto';

const OWNER = process.env.REPO_OWNER;
const REPO  = process.env.REPO_NAME;
const TOKEN = process.env.GITHUB_TOKEN;
const BRANCH = (
  process.env.REPO_BRANCH ||
  process.env.GITHUB_BRANCH ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.COMMIT_REF ||
  'main'
);
const ENC_B64 = process.env.ENCRYPTION_KEY || ''; // base64 32 bytes for AES-256-GCM

// ---------- CORS ----------
export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ---------- Encryption (AES-256-GCM) ----------
function getKey() {
  if (!ENC_B64) throw new Error('ENCRYPTION_KEY missing');
  const raw = Buffer.from(ENC_B64, 'base64');
  if (raw.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes base64');
  return raw;
}
export async function encryptPII(obj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64'); // [12 iv][16 tag][N data]
}
export async function decryptPII(b64) {
  const key = getKey();
  const buf = Buffer.from(b64, 'base64');
  const iv  = buf.subarray(0,12);
  const tag = buf.subarray(12,28);
  const data= buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

// ---------- GitHub contents API ----------
const GH = 'https://api.github.com';
async function gh(path, init={}) {
  const r = await fetch(`${GH}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'esx-admin',
      ...(init.headers||{})
    }
  });
  return r;
}
export async function getJsonFromRepo(path) {
  const r = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(BRANCH)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET failed ${r.status}`);
  const j = await r.json();
  const content = Buffer.from((j.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  try { return JSON.parse(content); } catch { return null; }
}
async function getSha(path) {
  const r = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(BRANCH)}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.sha || null;
}
export async function commitJsonIfAbsent(path, obj, message) {
  const sha = await getSha(path);
  if (sha) return false; // already exists
  const content = Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64');
  const r = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content, branch: BRANCH })
  });
  if (!r.ok) throw new Error(`GitHub PUT failed ${r.status}`);
  return true;
}
export async function commitJsonWithMerge(path, obj, message) {
  const sha = await getSha(path);
  const content = Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64');
  const body = sha ? { message, content, sha, branch: BRANCH } : { message, content, branch: BRANCH };
  const r = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`GitHub PUT failed ${r.status}`);
  return true;
}
