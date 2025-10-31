import { supaService } from '../../../lib/supabase/server.js';

function normalizeSlug(value) {
  const slug = String(value || '').trim();
  if (!slug) return 'default';
  if (slug === 'root' || slug === 'legacy-root') return 'default';
  return slug;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  let supa;
  try {
    supa = supaService();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Supabase configuration missing' });
  }

  try {
    const slugParam = req.query?.slug;
    const channel = req.query?.channel || 'published';
    const slug = normalizeSlug(slugParam);

    const [draft, draftGame] = await Promise.all([
      supa.from('missions').select('*', {
        filters: { game_slug: slug, channel: 'draft' },
        single: true,
      }),
      supa.from('games').select('*', { filters: { slug, channel: 'draft' }, single: true }),
    ]);
    if (draft.error) {
      throw draft.error;
    }

    const now = new Date().toISOString();
    const draftItems = Array.isArray(draft.data?.items) ? draft.data.items : [];
    const gameId = draftGame?.data?.id || null;

    const missionPayload = {
      game_slug: slug,
      channel,
      items: draftItems,
      updated_at: now,
    };
    if (gameId) missionPayload.game_id = gameId;

    const publishResult = await supa.from('missions').upsert(missionPayload);
    if (publishResult.error) {
      throw publishResult.error;
    }

    const draftGameData = draftGame?.data || {};
    const gamePayload = {
      slug,
      channel,
      status: channel === 'published' ? 'published' : 'draft',
      title: draftGameData?.title || slug,
      type: draftGameData?.type || null,
      cover_image: draftGameData?.cover_image || null,
      config: draftGameData?.config || {},
      map: draftGameData?.map || {},
      appearance: draftGameData?.appearance || draftGameData?.theme || {},
      theme: draftGameData?.theme || draftGameData?.appearance || {},
      appearance_skin: draftGameData?.appearance_skin ?? null,
      appearance_tone: draftGameData?.appearance_tone ?? 'light',
      mode: draftGameData?.mode ?? null,
      short_description: draftGameData?.short_description ?? null,
      long_description: draftGameData?.long_description ?? null,
      tags: Array.isArray(draftGameData?.tags) ? draftGameData.tags : [],
      updated_at: now,
    };
    if (gameId) gamePayload.id = gameId;

    const gameUpdate = await supa.from('games').upsert(gamePayload);
    if (gameUpdate.error) {
      throw gameUpdate.error;
    }

    return res.status(200).json({ ok: true, slug, channel, updated_at: now, missions: draftItems.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to publish game' });
  }
}
