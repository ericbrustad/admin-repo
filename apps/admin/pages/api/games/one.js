// [Codex note] Fetch a single game's full payload (title/images/config) from Supabase, with FS fallback.
import fs from 'fs';
import path from 'path';
import { serverClient } from '../../../lib/supabaseClient';

function clean(s) { return String(s || '').trim(); }
function ch(v) { v = String(v || '').toLowerCase(); return v === 'published' ? 'published' : (v === 'draft' ? 'draft' : 'other'); }

async function fromSupabase(slug, channel) {
  try {
    const supabase = serverClient();
    const { data, error } = await supabase
      .from('games')
      .select('slug,title,channel,config,updated_at')
      .eq('slug', slug)
      .eq('channel', channel)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;

    const cfg = data.config || {};
    const title = data.title || cfg?.game?.title || slug;

    // [Codex note] Try to surface common image fields
    const images = [];
    const add = (v) => { if (v && typeof v === 'string') images.push(v); };
    add(cfg?.game?.coverImage);
    add(cfg?.appearance?.coverImage);
    if (Array.isArray(cfg?.media?.images)) {
      for (const it of cfg.media.images) add(it?.url || it);
    }

    return { slug, channel: ch(channel), title, config: cfg, images };
  } catch {
    return null;
  }
}

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function fromFS(slug, channel) {
  // [Codex note] Common layout: public/games/<slug>/<channel>/game.json
  const base = path.join(process.cwd(), 'public', 'games', slug, channel);
  const file = path.join(base, 'game.json');
  const cfg = readJSON(file) || {};
  const title = cfg?.game?.title || slug;

  const images = [];
  const add = (v) => { if (v && typeof v === 'string') images.push(v); };
  add(cfg?.game?.coverImage);
  add(cfg?.appearance?.coverImage);
  if (Array.isArray(cfg?.media?.images)) {
    for (const it of cfg.media.images) add(it?.url || it);
  }
  return { slug, channel: ch(channel), title, config: cfg, images };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const slug = clean(req.query.slug);
  const channel = ch(req.query.channel || 'draft');
  if (!slug) return res.status(400).json({ ok: false, error: 'Missing slug' });

  const supa = await fromSupabase(slug, channel);
  if (supa) return res.status(200).json({ ok: true, game: supa });

  // Attempt FS draft if requested channel missing
  const fsDraft = fromFS(slug, channel);
  return res.status(200).json({ ok: true, game: fsDraft });
}
