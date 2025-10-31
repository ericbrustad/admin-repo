import fs from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_MANIFEST_RELATIVE = ['public', 'media', 'manifest.json'];
const DEFAULT_TEMP_ROOT = process.env.TMPDIR
  || process.env.TEMP
  || process.env.TEMPDIR
  || os.tmpdir();
const DEFAULT_FALLBACK_DIR = path.join(DEFAULT_TEMP_ROOT, 'admin-media');

let runtimeManifestPath = process.env.MEDIA_MANIFEST_RUNTIME_PATH || '';

function resolvePrimaryPath() {
  if (process.env.MEDIA_MANIFEST_PATH) {
    return path.resolve(process.env.MEDIA_MANIFEST_PATH);
  }
  return path.join(process.cwd(), ...DEFAULT_MANIFEST_RELATIVE);
}

function resolveFallbackPath() {
  if (process.env.MEDIA_MANIFEST_FALLBACK_PATH) {
    return path.resolve(process.env.MEDIA_MANIFEST_FALLBACK_PATH);
  }
  const root = process.env.MEDIA_STORAGE_ROOT
    ? path.resolve(process.env.MEDIA_STORAGE_ROOT)
    : DEFAULT_FALLBACK_DIR;
  return path.join(root, 'manifest.json');
}

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readFirstAvailable(paths) {
  for (const candidate of paths) {
    if (!candidate) continue;
    try {
      const contents = fs.readFileSync(candidate, 'utf8');
      runtimeManifestPath = candidate;
      return { path: candidate, data: JSON.parse(contents) };
    } catch (error) {
      if (error?.code === 'ENOENT') {
        // continue to next candidate
        continue;
      }
      // Surface non-ENOENT errors once we exhaust the list
      if (candidate === paths[paths.length - 1]) {
        throw error;
      }
    }
  }
  return null;
}

export function readManifest() {
  const primary = resolvePrimaryPath();
  const fallback = resolveFallbackPath();
  const seen = new Set();
  const searchPaths = [];
  if (runtimeManifestPath && !seen.has(runtimeManifestPath)) {
    seen.add(runtimeManifestPath);
    searchPaths.push(runtimeManifestPath);
  }
  if (!seen.has(primary)) {
    seen.add(primary);
    searchPaths.push(primary);
  }
  if (!seen.has(fallback)) {
    seen.add(fallback);
    searchPaths.push(fallback);
  }

  const found = readFirstAvailable(searchPaths);
  if (found) {
    const manifest = found.data && typeof found.data === 'object' ? found.data : {};
    manifest.items = Array.isArray(manifest.items) ? manifest.items : [];
    return { manifest, path: found.path };
  }

  const empty = { version: 1, updatedAt: new Date().toISOString(), items: [] };
  return { manifest: empty, path: primary };
}

export function writeManifest(manifest) {
  const payload = `${JSON.stringify(manifest, null, 2)}\n`;
  const primary = resolvePrimaryPath();
  const fallback = resolveFallbackPath();
  let lastError = null;

  try {
    ensureDirFor(primary);
    fs.writeFileSync(primary, payload, 'utf8');
    runtimeManifestPath = primary;
    return { path: primary, fallback: false };
  } catch (error) {
    lastError = error;
    if (!['EROFS', 'EACCES', 'EPERM'].includes(error?.code)) {
      throw error;
    }
  }

  ensureDirFor(fallback);
  fs.writeFileSync(fallback, payload, 'utf8');
  runtimeManifestPath = fallback;
  return { path: fallback, fallback: true, error: lastError };
}

export function getManifestDebugInfo() {
  return {
    runtime: runtimeManifestPath,
    primary: resolvePrimaryPath(),
    fallback: resolveFallbackPath(),
  };
}
