import { supaService } from '../../lib/supabase/server.js';

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
    const { slug: querySlug } = req.query || {};
    const { slug: bodySlug, missions: missionsInput, config: configInput } = req.body || {};

    if (!missionsInput || !configInput) {
      return res.status(400).json({ ok: false, error: 'Missing missions or config payload' });
    }

    const slug = normalizeSlug(bodySlug || querySlug);
    const now = new Date().toISOString();

    const missions = Array.isArray(missionsInput)
      ? missionsInput
      : Array.isArray(missionsInput?.missions)
        ? missionsInput.missions
        : [];
    const config = configInput || {};
    const devices = Array.isArray(config?.devices)
      ? config.devices
      : Array.isArray(config?.powerups)
        ? config.powerups
        : [];
    const powerups = Array.isArray(config?.powerups) ? config.powerups : devices;

    const gameMeta = config?.game ?? {};
    const appearance = config?.appearance ?? {};
    const appearanceSkin = config?.appearanceSkin ?? null;
    const appearanceTone = config?.appearanceTone ?? 'light';
    const tags = Array.isArray(gameMeta?.tags) ? gameMeta.tags : [];
    const mode = config?.splash?.mode || gameMeta.mode || null;

    const gameResult = await supa.from('games').upsert({
      slug,
      channel: 'draft',
      title: gameMeta?.title || slug,
      type: gameMeta?.type || null,
      cover_image: gameMeta?.coverImage || null,
      config,
      map: config?.map || {},
      appearance,
      theme: appearance,
      appearance_skin: appearanceSkin,
      appearance_tone: appearanceTone,
      mode,
      short_description: gameMeta?.shortDescription || null,
      long_description: gameMeta?.longDescription || null,
      tags,
      status: 'draft',
      updated_at: now,
    });

    if (gameResult?.error) {
      throw gameResult.error;
    }

    const gameRow = Array.isArray(gameResult?.data) ? gameResult.data[0] : gameResult?.data;
    const gameId = gameRow?.id || null;

    const missionPayload = {
      game_slug: slug,
      channel: 'draft',
      items: missions,
      updated_at: now,
    };
    if (gameId) missionPayload.game_id = gameId;

    const devicePayload = {
      game_slug: slug,
      channel: 'draft',
      items: devices,
      updated_at: now,
    };
    if (gameId) devicePayload.game_id = gameId;

    const powerupPayload = {
      game_slug: slug,
      channel: 'draft',
      items: powerups,
      updated_at: now,
    };
    if (gameId) powerupPayload.game_id = gameId;

    const [missionsResult, devicesResult, powerupsResult] = await Promise.all([
      supa.from('missions').upsert(missionPayload),
      supa.from('devices').upsert(devicePayload),
      supa.from('powerups').upsert(powerupPayload).catch(() => ({ error: null })),
    ]);

    const failure = [missionsResult, devicesResult, powerupsResult].find((result) => result?.error);
    if (failure && failure.error) {
      throw failure.error;
    }

    return res.status(200).json({ ok: true, slug, updated_at: now });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to save bundle' });
  }
}
