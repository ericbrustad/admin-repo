import { serverClient } from '../../../lib/supabaseClient';

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

  let supabase;
  try {
    supabase = serverClient();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Supabase configuration missing' });
  }

  try {
    const slugParam = req.query?.slug;
    const channel = req.query?.channel || 'published';
    const slug = normalizeSlug(slugParam);

    const { data: draftGame, error: draftGameError } = await supabase
      .from('games')
      .select('*')
      .eq('slug', slug)
      .eq('channel', 'draft')
      .maybeSingle();
    if (draftGameError) {
      throw draftGameError;
    }

    const keyColumn = draftGame?.id ? 'game_id' : 'game_slug';
    const keyValue = draftGame?.id || slug;

    const { data: draftMissions, error: draftMissionsError } = await supabase
      .from('missions')
      .select('*')
      .eq(keyColumn, keyValue)
      .eq('channel', 'draft')
      .maybeSingle();
    if (draftMissionsError) {
      throw draftMissionsError;
    }

    const now = new Date().toISOString();
    const draftItems = Array.isArray(draftMissions?.items) ? draftMissions.items : [];
    const gameId = draftGame?.id || null;

    const missionPayload = {
      game_slug: slug,
      channel,
      items: draftItems,
      updated_at: now,
    };
    if (gameId) missionPayload.game_id = gameId;

    const { error: publishError } = await supabase
      .from('missions')
      .upsert(missionPayload, { onConflict: 'game_slug,channel' })
      .select();
    if (publishError) {
      throw publishError;
    }

    const draftGameData = draftGame || {};
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

    const { error: gameError } = await supabase
      .from('games')
      .upsert(gamePayload, { onConflict: 'slug,channel' })
      .select();
    if (gameError) {
      throw gameError;
    }

    return res.status(200).json({ ok: true, slug, channel, updated_at: now, missions: draftItems.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to publish game' });
  }
}
