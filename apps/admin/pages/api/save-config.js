// CHORE(codex): Honor channel=draft|published for saving just the config (settings.json).
import { createClient } from '@supabase/supabase-js';

function normalizeChannel(value, fallback = 'draft') {
  const raw = Array.isArray(value) ? value[0] : value;
  const c = String(raw ?? fallback ?? 'draft').trim().toLowerCase();
  return c === 'published' ? 'published' : 'draft';
}

function rewriteDraftToPublished(obj) {
  try {
    const s = JSON.stringify(obj);
    const out = s
      .replaceAll('/draft/mediapool/', '/published/mediapool/')
      .replaceAll('draft/mediapool/', 'published/mediapool/')
      .replaceAll('mediapool/draft/', 'published/mediapool/');
    return JSON.parse(out);
  } catch {
    return obj;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ ok: false, error: 'Missing Supabase env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' });
    }

    const DATA_BUCKET = process.env.SUPABASE_DATA_BUCKET || 'admin-data';
    const DATA_PREFIX = (process.env.SUPABASE_DATA_PREFIX || 'data/')
      .replace(/^\/+|\/+$/g, '') + '/';

    const supa = createClient(url, key, { auth: { persistSession: false } });

    const slug = String(req.query.slug || '').trim() || 'default';
    const channel = normalizeChannel(
      req.query.channel || req.body?.channel || process.env.NEXT_PUBLIC_DEFAULT_CHANNEL
    );
    const wantsPublished = channel === 'published';

    let { config = {} } = (req.body || {});
    if (wantsPublished) config = rewriteDraftToPublished(config);

    const base = `${channel}/${DATA_PREFIX}${slug}/`; // e.g. published/data/demo/
    const enc = new TextEncoder();
    const blob = new Blob([enc.encode(JSON.stringify(config, null, 2))], { type: 'application/json' });

    const path = `${base}settings.json`.replace(/\/+/g, '/');
    const { error } = await supa.storage.from(DATA_BUCKET).upload(path, blob, {
      upsert: true,
      contentType: 'application/json',
    });
    if (error) throw new Error(error.message);

    if (wantsPublished) {
      const rel = {
        channel: 'published',
        slug,
        releasedAt: new Date().toISOString(),
      };
      const rblob = new Blob([enc.encode(JSON.stringify(rel, null, 2))], { type: 'application/json' });
      await supa.storage.from(DATA_BUCKET).upload(
        `releases/${slug}.json`,
        rblob,
        { upsert: true, contentType: 'application/json' }
      );
    }

    return res.json({ ok: true, channel, path });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
