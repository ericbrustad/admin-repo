// Admin — unified games list (Supabase + filesystem fallback)
import { serverClient } from '../../../lib/supabaseClient.js';
import { findGames as findLocalGames } from '../../../lib/find-games.js';

function normalizeChannel(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'published') return 'published';
  if (s === 'draft') return 'draft';
  return 'other';
}

function sortGames(list) {
  const order = { published: 0, draft: 1, other: 2 };
  return list.sort((a, b) => {
    const cat = (order[a.channel] ?? 9) - (order[b.channel] ?? 9);
    if (cat !== 0) return cat;
    const t = (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' });
    if (t !== 0) return t;
    return a.slug.localeCompare(b.slug, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const out = [];
  const seen = new Set();

  // 1) Supabase rows
  try {
    const supabase = serverClient(); // throws if env missing
    const { data, error } = await supabase
      .from('games')
      .select('slug,title,channel,config')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    for (const row of data || []) {
      const slug = String(row.slug || '').trim();
      if (!slug) continue;
      const channel = normalizeChannel(row.channel);
      const title = row.title || row?.config?.game?.title || slug;
      const key = `${slug}::${channel}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ slug, title, channel, source: 'supabase' });
      }
    }
  } catch {
    // No Supabase? Ignore and rely on filesystem.
  }

  // 2) Filesystem (public/games/**) via existing helper
  try {
    const local = (findLocalGames?.() || {}).games || [];
    for (const g of local) {
      const channel = normalizeChannel(g.channel);
      const key = `${g.slug}::${channel}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ slug: g.slug, title: g.title || g.slug, channel, source: 'fs' });
      }
    }
  } catch {
    // ignore
  }

  // 3) Always offer "Default" as Draft
  if (![...seen].some(k => k.startsWith('default::'))) {
    out.push({ slug: 'default', title: 'Default', channel: 'draft', source: 'virtual' });
  }

  return res.status(200).json({ ok: true, games: sortGames(out) });
}
