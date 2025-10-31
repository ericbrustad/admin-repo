// supabase/functions/publish-game/index.js
// Aggregates the latest game data into the published snapshot table.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials for publish function');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const gameId = String(body.gameId || body.game_id || '').trim();

    if (!gameId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing gameId' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, slug, title, status, splash_mode, map_center, geofence_defaults, settings')
      .eq('id', gameId)
      .maybeSingle();

    if (gameError || !game) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Game not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const [{ data: missions }, { data: devices }, { data: missionMedia }, { data: media }] = await Promise.all([
      supabase
        .from('missions')
        .select('id, slug, title, type, description, geo, config, triggers, order_index, is_active')
        .eq('game_id', game.id),
      supabase
        .from('devices')
        .select('id, slug, title, kind, state, geo, config, is_active, order_index')
        .eq('game_id', game.id),
      supabase
        .from('mission_media')
        .select('mission_id, media_id, role, order_index'),
      supabase
        .from('media')
        .select('id, slug, bucket, path, mime_type, size_bytes, tags, metadata'),
    ]);

    const mediaIndex = new Map();
    (media ?? []).forEach((item) => {
      mediaIndex.set(item.id, {
        id: item.id,
        slug: item.slug,
        bucket: item.bucket,
        path: item.path,
        mimeType: item.mime_type,
        sizeBytes: item.size_bytes,
        tags: item.tags ?? [],
        metadata: item.metadata ?? null,
        publicUrl: `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${item.bucket}/${encodeURIComponent(item.path).replace(/%2F/g, '/')}`,
      });
    });

    const missionMediaIndex = new Map();
    (missionMedia ?? []).forEach((row) => {
      const list = missionMediaIndex.get(row.mission_id) ?? [];
      list.push(row);
      missionMediaIndex.set(row.mission_id, list);
    });

    const missionsPayload = (missions ?? [])
      .filter((mission) => mission.is_active)
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((mission) => {
        const attachments = (missionMediaIndex.get(mission.id) ?? [])
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .map((link) => ({
            role: link.role,
            media: mediaIndex.get(link.media_id) ?? null,
          }))
          .filter((entry) => entry.media);
        return {
          id: mission.id,
          slug: mission.slug,
          title: mission.title,
          type: mission.type,
          description: mission.description,
          geo: mission.geo,
          config: mission.config ?? null,
          triggers: mission.triggers ?? null,
          order: mission.order_index ?? 0,
          media: attachments,
        };
      });

    const devicesPayload = (devices ?? [])
      .filter((device) => device.is_active)
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((device) => ({
        id: device.id,
        slug: device.slug,
        title: device.title,
        kind: device.kind,
        state: device.state,
        geo: device.geo,
        config: device.config ?? null,
      }));

    const publishedAt = new Date().toISOString();
    const payload = {
      id: game.id,
      slug: game.slug,
      title: game.title,
      status: 'published',
      splashMode: game.splash_mode ?? null,
      settings: game.settings ?? {},
      mapCenter: game.map_center ?? null,
      geofenceDefaults: game.geofence_defaults ?? null,
      missions: missionsPayload,
      devices: devicesPayload,
      media: missionsPayload.flatMap((mission) => mission.media?.map((entry) => entry.media) ?? []),
      publishedAt,
    };

    const { error: upsertError } = await supabase
      .from('published_games')
      .upsert({ game_id: game.id, slug: game.slug, payload, published_at: publishedAt }, { onConflict: 'game_id' });

    if (upsertError) {
      return new Response(
        JSON.stringify({ ok: false, error: upsertError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    await supabase
      .from('games')
      .update({ status: 'published', published_at: publishedAt })
      .eq('id', game.id);

    return new Response(
      JSON.stringify({
        ok: true,
        slug: game.slug,
        counts: {
          missions: missionsPayload.length,
          devices: devicesPayload.length,
        },
        publishedAt,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('publish-game error', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
