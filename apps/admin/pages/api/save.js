import { supaService } from '../../lib/supabase/server.js';
import { upsertReturning } from '../../lib/supabase/upsertReturning.js';

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
    const {
      slug: bodySlug,
      missions: missionsInput,
      config: configInput,
      devices: devicesInput,
    } = req.body || {};

    const slug = normalizeSlug(bodySlug || querySlug);
    if (!slug) {
      return res.status(400).json({ ok: false, error: 'Missing slug' });
    }

    const config = configInput || {};
    const missions = Array.isArray(missionsInput)
      ? missionsInput
      : Array.isArray(missionsInput?.missions)
        ? missionsInput.missions
        : [];
    const devices = Array.isArray(devicesInput)
      ? devicesInput
      : Array.isArray(config?.devices)
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

    const now = new Date().toISOString();

    const gameResult = await upsertReturning(supa, 'games', {
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

    const gameRow = Array.isArray(gameResult) ? gameResult[0] : gameResult;
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

    await Promise.all([
      upsertReturning(supa, 'missions', missionPayload),
      upsertReturning(supa, 'devices', devicePayload),
    ]);

    try {
      await upsertReturning(supa, 'powerups', powerupPayload);
    } catch (powerupError) {
      // Historical installs may not have a powerups table; ignore errors to keep parity.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Powerups upsert failed (ignored):', powerupError);
      }
    }

    return res.status(200).json({ ok: true, slug, updated_at: now });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to save game data' });
  }
}
