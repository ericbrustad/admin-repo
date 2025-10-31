import { serverClient } from '../../lib/supabaseClient';

function normalizeChannel(value, fallback = 'draft') {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : fallback;
  return String(raw || fallback).trim().toLowerCase() === 'published' ? 'published' : 'draft';
}

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return req.body;
}

function mapGameRow(row) {
  if (!row) return null;
  const config = row.config || {};
  const gameMeta = config.game || {};
  const splash = config.splash || {};
  return {
    slug: row.slug,
    title: row.title || gameMeta.title || row.slug,
    channel: row.channel || 'draft',
    status: row.channel === 'published' ? 'published' : 'draft',
    mode: splash.mode || gameMeta.mode || 'single',
    coverImage: gameMeta.coverImage || row.cover_image || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
    config,
  };
}

export default async function handler(req, res) {
  let supabase;
  try {
    supabase = serverClient();
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Supabase configuration missing' });
  }

  // -------- LIST (unchanged) --------
  if (req.method === 'GET') {
    const listFlag = String(req.query.list || '') === '1';
    const requestedChannel = normalizeChannel(req.query.channel, 'draft');
    const slugFilterRaw = req.query.slug;
    const slugFilter = typeof slugFilterRaw === 'string'
      ? slugFilterRaw.trim()
      : Array.isArray(slugFilterRaw) ? (slugFilterRaw[0] || '').trim() : '';

    try {
      if (listFlag) {
        const { data, error } = await supabase
          .from('games')
          .select('slug,title,channel,cover_image,updated_at,created_at,config')
          .order('updated_at', { ascending: false });
        if (error) throw error;

        const bySlug = new Map();
        for (const row of data || []) {
          const s = row.slug;
          if (!s) continue;
          const cur = bySlug.get(s);
          if (!cur) bySlug.set(s, row);
          else if (row.channel === requestedChannel) bySlug.set(s, row);
        }
        let list = Array.from(bySlug.values());
        if (slugFilter) list = list.filter((r) => r.slug === slugFilter);
        return res.status(200).json({ ok: true, games: list.map(mapGameRow).filter(Boolean) });
      }

      let query = supabase
        .from('games')
        .select('*')
        .eq('channel', requestedChannel)
        .order('updated_at', { ascending: false });
      if (slugFilter) query = query.eq('slug', slugFilter);
      const { data, error } = await query;
      if (error) throw error;
      const list = Array.isArray(data) ? data : data ? [data] : [];
      return res.status(200).json({ ok: true, games: list.map(mapGameRow).filter(Boolean) });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error?.message || 'Failed to load games' });
    }
  }

  // -------- SAVE (game + children) --------
  if (req.method === 'POST') {
    const channel = normalizeChannel(req.query.channel, 'draft');
    const replaceFlag = String(req.query.replace || '') === '1';
    const body = parseBody(req);
    const replaceChildren = replaceFlag || Boolean(body.replaceChildren);

    const slug = String(body.slug || '').trim();
    const config = body.config || {};
    if (!slug) return res.status(400).json({ ok: false, error: 'missing slug' });

    const appearance = config.appearance ?? {};
    const appearanceSkin = config.appearanceSkin ?? null;
    const appearanceTone = config.appearanceTone ?? 'light';
    const gameMeta = config.game ?? {};
    const tags = Array.isArray(gameMeta.tags) ? gameMeta.tags : [];

    const gamePayload = {
      slug,
      channel,
      title: body.title ?? gameMeta.title ?? slug,
      type: body.type ?? gameMeta.type ?? null,
      cover_image: gameMeta.coverImage ?? body.coverImage ?? null,
      config,
      map: config?.map || {},
      appearance,
      theme: appearance,
      appearance_skin: appearanceSkin,
      appearance_tone: appearanceTone,
      short_description: body.shortDescription ?? gameMeta.shortDescription ?? null,
      long_description: body.longDescription ?? gameMeta.longDescription ?? null,
      tags,
    };
    const modeValue = body.mode ?? gameMeta.mode ?? null;
    if (modeValue) gamePayload.mode = String(modeValue);

    try {
      const up = await supabase
        .from('games')
        .upsert(gamePayload, { onConflict: 'slug,channel' })
        .select('id, slug, channel')
        .single();
      if (up.error) throw up.error;
      const game = up.data;
      const gameId = game?.id;

      const missionsIn = Array.isArray(body.missions)
        ? body.missions
        : Array.isArray(body?.suite?.missions)
          ? body.suite.missions
          : [];
      const devicesIn = Array.isArray(body.devices)
        ? body.devices
        : Array.isArray(body?.suite?.devices)
          ? body.suite.devices
          : [];
      const powerupsIn = Array.isArray(body.powerups)
        ? body.powerups
        : Array.isArray(body?.suite?.powerups)
          ? body.suite.powerups
          : [];

      const results = {
        missions: { upserted: 0, deleted: 0 },
        devices: { upserted: 0, deleted: 0 },
        powerups: { upserted: 0, deleted: 0 },
      };
      const warnings = [];

      if (!gameId) {
        warnings.push('Game ID missing after upsert; child tables were not updated.');
      } else {
        const deleteMissing = async (table, column, keepValues) => {
          const query = supabase
            .from(table)
            .delete()
            .eq('game_id', gameId)
            .eq('channel', channel);
          if (keepValues.length) {
            const serialized = keepValues.map((value) => JSON.stringify(value)).join(',');
            query.not(column, 'in', `(${serialized})`);
          }
          return query.select(column, { count: 'exact', head: true });
        };

        const chunk = (arr, n = 500) => {
          const out = [];
          for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
          return out;
        };

        if (missionsIn.length) {
          const mapped = missionsIn.map((m, idx) => ({
            game_id: gameId,
            mission_id: String(m.id || m.mission_id || `m-${idx + 1}`),
            title: m.title || null,
            type: m.type || null,
            order_index: Number.isFinite(m.order_index) ? Number(m.order_index) : idx,
            content: m.content || {},
            geofence: m.geofence || {},
            correct: m.correct || {},
            wrong: m.wrong || {},
            appearance: m.appearance || {},
            show_continue: m.showContinue !== false,
            channel,
          }));
          for (const part of chunk(mapped, 500)) {
            const { error, count } = await supabase
              .from('missions')
              .upsert(part, { onConflict: 'game_id,mission_id,channel', ignoreDuplicates: false })
              .select('mission_id', { count: 'exact', head: true });
            if (error) warnings.push(`missions upsert: ${error.message}`);
            else results.missions.upserted += count || part.length;
          }
          if (replaceChildren) {
            const keep = mapped.map((r) => r.mission_id);
            const { error, count } = await deleteMissing('missions', 'mission_id', keep);
            if (error) warnings.push(`missions delete: ${error.message}`);
            else results.missions.deleted += count || 0;
          }
        } else if (replaceChildren) {
          const { error, count } = await deleteMissing('missions', 'mission_id', []);
          if (error) warnings.push(`missions delete: ${error.message}`);
          else results.missions.deleted += count || 0;
        }

        if (devicesIn.length) {
          const mapped = devicesIn.map((d, idx) => ({
            game_id: gameId,
            id: String(d.id || d.key || `d-${idx + 1}`),
            title: d.title || d.name || null,
            type: d.type || null,
            icon_key: d.iconKey || null,
            pickup_radius: Number.isFinite(d.pickupRadius) ? Number(d.pickupRadius) : null,
            effect_seconds: Number.isFinite(d.effectSeconds) ? Number(d.effectSeconds) : null,
            lat: d.lat == null ? null : Number(d.lat),
            lng: d.lng == null ? null : Number(d.lng),
            trigger: d.trigger || {},
            channel,
          }));
          for (const part of chunk(mapped, 500)) {
            const { error, count } = await supabase
              .from('devices')
              .upsert(part, { onConflict: 'game_id,id,channel', ignoreDuplicates: false })
              .select('id', { count: 'exact', head: true });
            if (error) warnings.push(`devices upsert: ${error.message}`);
            else results.devices.upserted += count || part.length;
          }
          if (replaceChildren) {
            const keep = mapped.map((r) => r.id);
            const { error, count } = await deleteMissing('devices', 'id', keep);
            if (error) warnings.push(`devices delete: ${error.message}`);
            else results.devices.deleted += count || 0;
          }
        } else if (replaceChildren) {
          const { error, count } = await deleteMissing('devices', 'id', []);
          if (error) warnings.push(`devices delete: ${error.message}`);
          else results.devices.deleted += count || 0;
        }

        if (powerupsIn.length) {
          const mapped = powerupsIn.map((p, idx) => ({
            game_id: gameId,
            id: String(p.id || p.key || `p-${idx + 1}`),
            title: p.title || p.name || null,
            type: p.type || null,
            icon_key: p.iconKey || null,
            config: p.config || {},
            channel,
          }));
          for (const part of chunk(mapped, 500)) {
            const { error, count } = await supabase
              .from('powerups')
              .upsert(part, { onConflict: 'game_id,id,channel', ignoreDuplicates: false })
              .select('id', { count: 'exact', head: true });
            if (error) warnings.push(`powerups upsert: ${error.message}`);
            else results.powerups.upserted += count || part.length;
          }
          if (replaceChildren) {
            const keep = mapped.map((r) => r.id);
            const { error, count } = await deleteMissing('powerups', 'id', keep);
            if (error) warnings.push(`powerups delete: ${error.message}`);
            else results.powerups.deleted += count || 0;
          }
        } else if (replaceChildren) {
          const { error, count } = await deleteMissing('powerups', 'id', []);
          if (error) warnings.push(`powerups delete: ${error.message}`);
          else results.powerups.deleted += count || 0;
        }
      }

      return res.status(200).json({
        ok: true,
        game,
        slug: game?.slug || slug,
        channel,
        results,
        warnings,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error?.message || 'Failed to upsert game + children' });
    }
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
