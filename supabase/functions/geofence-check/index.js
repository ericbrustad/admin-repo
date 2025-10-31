// supabase/functions/geofence-check/index.js
// Returns missions and devices within range of the provided coordinates.

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
  console.error('Missing Supabase credentials for geofence function');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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
    const lat = Number(body.lat ?? body.latitude);
    const lng = Number(body.lng ?? body.lon ?? body.longitude);
    const gameId = body.gameId ? String(body.gameId) : null;
    const gameSlug = body.gameSlug ? String(body.gameSlug) : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing coordinates' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    let gameFilterId = gameId;
    if (!gameFilterId && gameSlug) {
      const { data: gameBySlug } = await supabase
        .from('games')
        .select('id')
        .eq('slug', gameSlug)
        .maybeSingle();
      gameFilterId = gameBySlug?.id ?? null;
    }

    if (!gameFilterId) {
      const { data: gamePublished } = await supabase
        .from('games')
        .select('id')
        .eq('status', 'published')
        .limit(1)
        .maybeSingle();
      gameFilterId = gamePublished?.id ?? null;
    }

    if (!gameFilterId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Game not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const [{ data: missions }, { data: devices }] = await Promise.all([
      supabase
        .from('missions')
        .select('id, slug, title, type, geo, is_active, order_index')
        .eq('game_id', gameFilterId),
      supabase
        .from('devices')
        .select('id, slug, title, kind, geo, is_active, order_index')
        .eq('game_id', gameFilterId),
    ]);

    const evaluate = (items, type) => {
      const eligible = [];
      const distances = [];
      for (const item of items ?? []) {
        if (!item?.is_active) continue;
        const geo = item.geo ?? {};
        const targetLat = Number(geo.lat ?? geo.latitude);
        const targetLng = Number(geo.lng ?? geo.lon ?? geo.longitude);
        if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) continue;
        const radius = Number(geo.radius ?? geo.range ?? geo.radius_meters ?? 0);
        const distance = haversineMeters(lat, lng, targetLat, targetLng);
        const within = radius > 0 ? distance <= radius : false;
        if (within) {
          eligible.push({
            id: item.id,
            slug: item.slug,
            title: item.title,
            type: type === 'mission' ? item.type : item.kind,
            distance,
            radius,
          });
        }
        distances.push({
          id: item.id,
          slug: item.slug,
          title: item.title,
          distance,
          radius,
        });
      }
      eligible.sort((a, b) => a.distance - b.distance);
      distances.sort((a, b) => a.distance - b.distance);
      return { eligible, distances };
    };

    const missionsResult = evaluate(missions ?? [], 'mission');
    const devicesResult = evaluate(devices ?? [], 'device');

    return new Response(
      JSON.stringify({
        ok: true,
        gameId: gameFilterId,
        origin: { lat, lng },
        missions: missionsResult,
        devices: devicesResult,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('geofence-check error', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
