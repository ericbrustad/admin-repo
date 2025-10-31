import fs from 'fs';
import path from 'path';
import { readManifest, writeManifest } from '../../../lib/media-manifest.js';
import { deleteSupabaseMedia, isSupabaseMediaEnabled } from '../../../lib/supabase-storage.js';

export const config = { api: { bodyParser: true } };

function assertAllowedPath(rel) {
  if (!rel) return;
  const normalized = rel.replace(/\\/g, '/');
  if (!normalized.startsWith('public/media/')) {
    throw new Error('Only media files can be deleted');
  }
  if (!normalized.startsWith('public/media/mediapool/')) {
    throw new Error('Only Media Pool files can be deleted through this route');
  }
  if (normalized.includes('..')) {
    throw new Error('Illegal path');
  }
}

function deleteLocalFile(rel) {
  if (!rel) return false;
  const absolute = path.join(process.cwd(), rel);
  if (!fs.existsSync(absolute)) return false;
  fs.unlinkSync(absolute);
  return true;
}

function removeFromManifest({ path: targetPath, supabasePath, id }) {
  const { manifest } = readManifest();
  const items = Array.isArray(manifest.items) ? manifest.items : [];
  const nextItems = items.filter((entry) => {
    const entryPath = (entry.path || '').replace(/\\/g, '/');
    const entrySupabase = entry?.supabase?.path || '';
    const matchesPath = targetPath && entryPath === targetPath.replace(/\\/g, '/');
    const matchesSupabase = supabasePath && entrySupabase === supabasePath;
    const matchesId = id && entry.id === id;
    return !(matchesPath || matchesSupabase || matchesId);
  });
  const removed = items.length - nextItems.length;
  if (removed > 0) {
    manifest.items = nextItems;
    manifest.updatedAt = new Date().toISOString();
    writeManifest(manifest);
  }
  return removed;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  try {
    const { path: relPath = '', supabase: supabaseMeta = null, id = '' } = req.body || {};

    if (!relPath && !(supabaseMeta && supabaseMeta.path)) {
      return res.status(400).json({ ok: false, error: 'Missing path or supabase target' });
    }

    if (relPath) {
      assertAllowedPath(relPath);
    }

    let supabaseResult = { ok: false };
    if (supabaseMeta?.path && isSupabaseMediaEnabled()) {
      try {
        supabaseResult = await deleteSupabaseMedia({ bucket: supabaseMeta.bucket, path: supabaseMeta.path });
      } catch (error) {
        supabaseResult = { ok: false, error: error?.message || 'Supabase delete failed' };
      }
    }

    let localDeleted = false;
    if (relPath) {
      try {
        localDeleted = deleteLocalFile(relPath);
      } catch (error) {
        return res.status(500).json({ ok: false, error: error?.message || 'Unable to delete file locally' });
      }
    }

    let removed = 0;
    if (!supabaseMeta?.path || supabaseResult?.ok) {
      removed = removeFromManifest({ path: relPath, supabasePath: supabaseMeta?.path, id });
    }

    return res.status(200).json({
      ok: true,
      removed,
      supabase: {
        attempted: Boolean(supabaseMeta?.path),
        deleted: Boolean(supabaseResult?.ok),
        error: supabaseResult?.error || null,
      },
      filesystem: {
        attempted: Boolean(relPath),
        deleted: localDeleted,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Delete failed' });
  }
}
