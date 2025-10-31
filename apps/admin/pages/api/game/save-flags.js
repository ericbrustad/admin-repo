// Next.js API route — saves boolean/radio flags reliably
// POST /api/game/save-flags  { gameId | {slug, tag}, patch: {...} }

import { createClient } from '@supabase/supabase-js';

function serverClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration (URL or KEY).');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// 'published' | 'draft' only
function normalizeChannel(value, fallback = 'draft') {
  const raw =
    typeof value === 'string'
      ? value
      : Array.isArray(value)
      ? value[0]
      : fallback;
  const v = String(raw || fallback).trim().toLowerCase();
  return v === 'published' || v === 'live' ? 'published' : 'draft';
}

// robust boolean coercion for switches
function toBool(v, def = false) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(s);
  }
  return def;
}

// merge (shallow) JSON without clobbering unrelated settings
function mergeSettings(current = {}, patch = {}) {
  const out = { ...(current || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch {}
  }

  const { gameId, slug, tag, patch } = body || {};
  if (!gameId && !(slug && tag)) {
    return res.status(400).json({
      ok: false,
      error: 'Provide gameId OR {slug, tag}.',
    });
  }
  if (!patch || typeof patch !== 'object') {
    return res.status(400).json({ ok: false, error: 'Missing patch object.' });
  }

  // Normalize incoming flags
  const normalized = {};
  if ('gameEnabled' in patch) {
    normalized.gameEnabled = toBool(patch.gameEnabled);
  }
  if ('defaultChannel' in patch) {
    normalized.defaultChannel = normalizeChannel(patch.defaultChannel);
  }
  if ('useLocationAsDefault' in patch) {
    normalized.useLocationAsDefault = toBool(patch.useLocationAsDefault);
  }
  if ('overwriteOriginalDefault' in patch) {
    normalized.overwriteOriginalDefault = toBool(patch.overwriteOriginalDefault);
  }
  if ('globalLocation' in patch && patch.globalLocation) {
    const lat = Number(patch.globalLocation.lat);
    const lng = Number(patch.globalLocation.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res
        .status(400)
        .json({ ok: false, error: 'Invalid globalLocation (lat/lng).' });
    }
    normalized.globalLocation = { lat, lng };
  }

  const supabase = serverClient();

  // 1) Fetch the game
  let q = supabase
    .from('games')
    .select('id, slug, tag, default_channel, game_enabled, settings')
    .limit(1);

  if (gameId) q = q.eq('id', gameId);
  else q = q.eq('slug', slug).eq('tag', tag);

  const { data: rows, error: fetchErr } = await q;
  if (fetchErr) {
    return res.status(500).json({ ok: false, error: fetchErr.message || String(fetchErr) });
  }
  const game = rows?.[0];
  if (!game) {
    return res.status(404).json({ ok: false, error: 'Game not found.' });
  }

  // 2) Build DB update
  const update = {};
  let settingsPatch = {};

  if ('gameEnabled' in normalized) update.game_enabled = normalized.gameEnabled;
  if ('defaultChannel' in normalized) update.default_channel = normalized.defaultChannel;

  // Store aux flags into JSON settings so we don’t need schema changes
  const settingsKeys = ['useLocationAsDefault', 'overwriteOriginalDefault', 'globalLocation'];
  for (const k of settingsKeys) {
    if (k in normalized) settingsPatch[k] = normalized[k];
  }
  if (Object.keys(settingsPatch).length) {
    update.settings = mergeSettings(game.settings, settingsPatch);
  }

  // 3) Save (single row update)
  const { data: saved, error: updErr } = await supabase
    .from('games')
    .update(update)
    .eq('id', game.id)
    .select()
    .single();

  if (updErr) {
    return res.status(500).json({ ok: false, error: updErr.message || String(updErr) });
  }

  return res.status(200).json({ ok: true, saved });
}
