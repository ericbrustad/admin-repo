// [Codex note] Unified games list (Supabase + filesystem fallback)
import { serverClient } from '../../../lib/supabaseClient';
import { findGames as findLocalGames } from '../../../lib/find-games';

function ch(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'published') return 'published';
  if (s === 'draft') return 'draft';
  return 'other';
}

function sortGames(list) {
  const order = { published: 0, draft: 1, other: 2 };
  return list.sort((a, b) => {
    const c = (order[a.channel] ?? 9) - (order[b.channel] ?? 9);
    if (c) return c;
    const t = (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' });
    if (t) return t;
    return a.slug.localeCompare(b.slug, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const out = [];
  const seen = new Set();

  // 1) Supabase
  try {
    const supabase = serverClient();
    const { data, error } = await supabase
      .from('games')
      .select('slug,title,channel,config,updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    for (const row of data || []) {
      const slug = String(row.slug || '').trim();
      if (!slug) continue;
      const channel = ch(row.channel);
      const title = row.title || row?.config?.game?.title || slug;
      const key = `${slug}::${channel}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ slug, title, channel, source: 'supabase' });
      }
    }
  } catch (e) {
    // [Codex note] Supabase env might be missing in Preview; safe to fall back silently.
  }

  // 2) Filesystem fallback
  try {
    const local = (findLocalGames?.() || {}).games || [];
    for (const g of local) {
      const channel = ch(g.channel);
      const key = `${g.slug}::${channel}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ slug: g.slug, title: g.title || g.slug, channel, source: 'fs' });
      }
    }
  } catch (e) {}

  // 3) Ensure "Default"
  if (![...seen].some((k) => k.startsWith('default::'))) {
    out.push({ slug: 'default', title: 'Default', channel: 'draft', source: 'virtual' });
  }

  return res.status(200).json({ ok: true, games: sortGames(out) });
}
