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
    const { config: configInput } = req.body || {};
    if (!configInput) {
      return res.status(400).json({ ok: false, error: 'Missing config payload' });
    }

    const slug = normalizeSlug(querySlug);
    const devices = Array.isArray(configInput?.devices)
      ? configInput.devices
      : Array.isArray(configInput?.powerups)
        ? configInput.powerups
        : [];
    const powerups = Array.isArray(configInput?.powerups) ? configInput.powerups : devices;
    const now = new Date().toISOString();

    const gameMeta = configInput?.game ?? {};
    const appearance = configInput?.appearance ?? {};
    const appearanceSkin = configInput?.appearanceSkin ?? null;
    const appearanceTone = configInput?.appearanceTone ?? 'light';
    const tags = Array.isArray(gameMeta?.tags) ? gameMeta.tags : [];
    const mode = configInput?.splash?.mode || gameMeta.mode || null;

    const gameResult = await supa.from('games').upsert({
      slug,
      channel: 'draft',
      title: gameMeta?.title || slug,
      type: gameMeta?.type || null,
      cover_image: gameMeta?.coverImage || null,
      config: configInput,
      map: configInput?.map || {},
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

    const [devicesResult, powerupsResult] = await Promise.all([
      supa.from('devices').upsert(devicePayload),
      supa.from('powerups').upsert(powerupPayload).catch(() => ({ error: null })),
    ]);

    const failure = [devicesResult, powerupsResult].find((result) => result?.error);
    if (failure && failure.error) {
      throw failure.error;
    }

    return res.status(200).json({ ok: true, slug, updated_at: now });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to save config' });
  }
}
