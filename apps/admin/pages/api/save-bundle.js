// CHORE(codex): Honor channel=draft|published for saving a full bundle (missions, config, devices).
// On publish, rewrite any draft media paths to published.
import { createClient } from '@supabase/supabase-js';

function normalizeChannel(value, fallback = 'draft') {
  const raw = Array.isArray(value) ? value[0] : value;
  const c = String(raw ?? fallback ?? 'draft').trim().toLowerCase();
  return c === 'published' ? 'published' : 'draft';
}

function rewriteDraftToPublished(obj) {
  try {
    const s = JSON.stringify(obj);
    // Handle both channel-first and legacy shapes.
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

    let {
      missions = [],
      config = {},
      devices = [],
    } = (req.body || {});

    if (wantsPublished) {
      missions = rewriteDraftToPublished(missions);
      config = rewriteDraftToPublished(config);
      devices = rewriteDraftToPublished(devices);
    }

    const base = `${channel}/${DATA_PREFIX}${slug}/`; // e.g. published/data/demo/
    const enc = new TextEncoder();

    async function putJSON(name, body) {
      const path = `${base}${name}`.replace(/\/+/g, '/');
      const blob = new Blob([enc.encode(JSON.stringify(body, null, 2))], { type: 'application/json' });
      const { error } = await supa.storage.from(DATA_BUCKET).upload(path, blob, {
        upsert: true,
        contentType: 'application/json',
      });
      if (error) throw new Error(`${name}: ${error.message}`);
      return { path };
    }

    const results = {};
    results.missions = await putJSON('missions.json', missions);
    results.config  = await putJSON('settings.json', config);
    results.devices = await putJSON('devices.json', devices);

    // Optional pointer used by clients/admin to know what is "live" now.
    if (wantsPublished) {
      const rel = {
        channel: 'published',
        slug,
        releasedAt: new Date().toISOString(),
      };
      const blob = new Blob(
        [enc.encode(JSON.stringify(rel, null, 2))],
        { type: 'application/json' }
      );
      await supa.storage.from(DATA_BUCKET).upload(
        `releases/${slug}.json`,
        blob,
        { upsert: true, contentType: 'application/json' }
      );
    }

    return res.json({ ok: true, channel, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

