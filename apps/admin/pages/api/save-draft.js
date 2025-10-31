import { supaService } from '../../lib/supabase/server.js';

function normalizeSlug(value) {
  const slug = String(value || '').trim();
  if (!slug) return 'default';
  if (slug === 'root' || slug === 'legacy-root') return 'default';
  return slug;
}

function extractMissions(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.missions)) return input.missions;
  return [];
}

function extractDevices(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.devices)) return input.devices;
  if (Array.isArray(input?.powerups)) return input.powerups;
  return [];
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
    const { slug: rawSlug, missions: missionsInput, config: configInput, devices: devicesInput } = req.body || {};
    const slug = normalizeSlug(rawSlug);
    if (!slug) {
      return res.status(400).json({ ok: false, error: 'Missing slug' });
    }

    const missionsProvided = missionsInput !== undefined;
    const devicesProvided = devicesInput !== undefined;
    const config = configInput && typeof configInput === 'object' ? configInput : null;

    const missions = missionsProvided ? extractMissions(missionsInput) : [];
    const devices = devicesProvided
      ? extractDevices(devicesInput)
      : config && Array.isArray(config.devices)
        ? extractDevices(config.devices)
        : [];
    const powerups = config && Array.isArray(config.powerups) ? extractDevices(config.powerups) : devices;

    const gameMeta = config?.game ?? {};
    const appearance = config?.appearance ?? {};
    const appearanceSkin = config?.appearanceSkin ?? null;
    const appearanceTone = config?.appearanceTone ?? 'light';
    const tags = Array.isArray(gameMeta?.tags) ? gameMeta.tags : [];
    const mode = config?.splash?.mode || gameMeta.mode || null;

    if (!config && !missionsProvided && !devicesProvided) {
      return res.status(400).json({ ok: false, error: 'No draft payload provided' });
    }

    const now = new Date().toISOString();

    let gameId = null;
    if (config) {
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
      const row = Array.isArray(gameResult?.data) ? gameResult.data[0] : gameResult?.data;
      gameId = row?.id || null;
    }

    const tasks = [];
    if (missionsProvided) {
      const payload = {
        game_slug: slug,
        channel: 'draft',
        items: missions,
        updated_at: now,
      };
      if (gameId) payload.game_id = gameId;
      tasks.push(supa.from('missions').upsert(payload));
    }

    if (devicesProvided || (config && Array.isArray(config.devices))) {
      const payload = {
        game_slug: slug,
        channel: 'draft',
        items: devices,
        updated_at: now,
      };
      if (gameId) payload.game_id = gameId;
      tasks.push(supa.from('devices').upsert(payload));
    }

    if (config && Array.isArray(config.powerups)) {
      const payload = {
        game_slug: slug,
        channel: 'draft',
        items: powerups,
        updated_at: now,
      };
      if (gameId) payload.game_id = gameId;
      tasks.push(supa.from('powerups').upsert(payload).catch(() => ({ error: null })));
    }

    if (tasks.length) {
      const results = await Promise.all(tasks);
      const failure = results.find((result) => result?.error);
      if (failure && failure.error) {
        throw failure.error;
      }
    }

    return res.status(200).json({ ok: true, slug, updated_at: now });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to save draft' });
  }
}
