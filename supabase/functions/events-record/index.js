// supabase/functions/events-record/index.js
// Records a gameplay event for analytics.

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
  console.error('Missing Supabase credentials for events function');
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
    const eventType = String(body.eventType || body.type || '').trim();
    const missionId = body.missionId ? String(body.missionId) : null;
    const deviceId = body.deviceId ? String(body.deviceId) : null;
    const actorId = body.actorId ? String(body.actorId) : null;
    const payload = body.payload ?? body.data ?? null;
    const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();

    if (!gameId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing gameId' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    if (!eventType) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing eventType' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const { data: game } = await supabase
      .from('games')
      .select('id')
      .eq('id', gameId)
      .maybeSingle();

    if (!game) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Game not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const { error } = await supabase.from('game_events').insert({
      game_id: gameId,
      event_type: eventType,
      mission_id: missionId,
      device_id: deviceId,
      actor_id: actorId,
      payload: payload ?? null,
      recorded_at: recordedAt.toISOString(),
    });

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('events-record error', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
