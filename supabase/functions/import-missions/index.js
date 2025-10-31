// supabase/functions/import-missions/index.js
// Loads a CSV or JSON file from Supabase Storage and upserts missions for a game.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { parse } from 'https://deno.land/std@0.224.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MEDIA_BUCKET = Deno.env.get('SUPABASE_MEDIA_BUCKET') ?? 'media';
const IMPORTS_BUCKET = Deno.env.get('SUPABASE_IMPORTS_BUCKET') ?? 'imports';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials for import function');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function parseBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildGeo(row) {
  const lat = parseNumber(row.lat ?? row.latitude);
  const lng = parseNumber(row.lng ?? row.lon ?? row.longitude);
  const radius = parseNumber(row.radius ?? row.range ?? row.radius_meters);
  if (lat == null || lng == null) return null;
  return {
    lat,
    lng,
    radius: radius ?? 0,
  };
}

async function loadFile(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(error?.message || 'Unable to download import file');
  }
  const arrayBuffer = await data.arrayBuffer();
  const text = new TextDecoder().decode(arrayBuffer);
  return text;
}

function parseCsvText(text) {
  const rows = parse(text.trim(), { skipFirstRow: false });
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const header = rows[0]?.map?.((col) => String(col || '').trim()) ?? [];
  const items = [];
  for (let i = 1; i < rows.length; i += 1) {
    const raw = rows[i];
    if (!raw) continue;
    const entry = {};
    header.forEach((column, idx) => {
      entry[column] = String(raw[idx] ?? '').trim();
    });
    const hasContent = Object.values(entry).some((value) => value);
    if (hasContent) items.push(entry);
  }
  return items;
}

function parseJsonText(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.missions)) return data.missions;
  return [];
}

function safeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
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
    const gameId = String(body.gameId || body.game_id || '').trim();
    const filePath = String(body.filePath || body.path || '').replace(/^\/+/, '');
    const bucket = String(body.bucket || IMPORTS_BUCKET);

    if (!gameId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing gameId' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    if (!filePath) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing filePath' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const allowedBuckets = new Set([IMPORTS_BUCKET]);
    if (!allowedBuckets.has(bucket)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Bucket not allowed' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, slug, title')
      .eq('id', gameId)
      .maybeSingle();

    if (gameError || !game) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Game not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const text = await loadFile(bucket, filePath);
    const lower = filePath.toLowerCase();
    const rows = lower.endsWith('.json') ? parseJsonText(text) : parseCsvText(text);

    const { data: existingMissions } = await supabase
      .from('missions')
      .select('id, slug')
      .eq('game_id', gameId);

    const missionIndex = new Map();
    (existingMissions ?? []).forEach((mission) => {
      missionIndex.set(mission.slug, mission.id);
    });

    const report = {
      ok: true,
      gameId,
      filePath,
      total: rows.length,
      added: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    const mediaToLink = [];

    for (let i = 0; i < rows.length; i += 1) {
      const raw = rows[i] ?? {};
      const slug = String(raw.slug || raw.mission_slug || '').trim();
      if (!slug) {
        report.skipped += 1;
        report.errors.push({ row: i + 2, slug: '', error: 'Missing slug' });
        continue;
      }

      const payload = {
        game_id: gameId,
        slug,
        title: String(raw.title || raw.name || slug),
        type: String(raw.type || raw.kind || 'statement'),
        description: raw.description ? String(raw.description) : null,
        geo: buildGeo(raw),
        triggers: safeJson(raw.triggers),
        config: safeJson(raw.config),
        order_index: parseNumber(raw.order_index ?? raw.sort ?? i) ?? i,
        is_active: parseBoolean(raw.is_active ?? raw.active ?? true),
      };

      const { data: upserted, error } = await supabase
        .from('missions')
        .upsert(payload, { onConflict: 'game_id,slug' })
        .select()
        .maybeSingle();

      if (error || !upserted) {
        report.errors.push({ row: i + 2, slug, error: error?.message || 'Unable to upsert mission' });
        report.skipped += 1;
        continue;
      }

      const existed = missionIndex.has(slug);
      if (existed) {
        report.updated += 1;
      } else {
        report.added += 1;
        missionIndex.set(slug, upserted.id);
      }

      const mediaPath = String(raw.media_path || raw.cover || '').trim();
      if (mediaPath) {
        mediaToLink.push({ missionSlug: slug, mediaPath, role: 'cover' });
      }
    }

    if (mediaToLink.length > 0) {
      for (const entry of mediaToLink) {
        const missionId = missionIndex.get(entry.missionSlug);
        if (!missionId) continue;
        const { data: mediaRecord } = await supabase
          .from('media')
          .select('id')
          .eq('path', entry.mediaPath)
          .eq('bucket', MEDIA_BUCKET)
          .maybeSingle();
        if (!mediaRecord) continue;
        await supabase
          .from('mission_media')
          .upsert({ mission_id: missionId, media_id: mediaRecord.id, role: entry.role })
          .select();
      }
    }

    await supabase
      .from('import_jobs')
      .insert({ game_id: gameId, file_path: filePath, status: 'completed', report })
      .select();

    return new Response(
      JSON.stringify({ ok: true, report }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('import-missions error', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
