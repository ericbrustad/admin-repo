/*
  Robust Draft/Publish/Live sync for Admin → Supabase Storage (no new deps).
  Endpoints:
    POST ?op=save        -> saves a DRAFT snapshot and updates pointers
    POST ?op=publish     -> saves PUBLISHED snapshot, updates pointers, optional mirror
    POST ?op=make-live   -> flips index.liveChannel to "published"

  Storage layout (bucket: game-config):
    game-config/<slug>/index.json
    game-config/<slug>/draft/current.json
    game-config/<slug>/published/current.json
    game-config/<slug>/versions/<versionId>.json

  index.json example:
    {
      "schemaVersion": 1,
      "slug": "demo",
      "title": "Demo Game",
      "channels": {
        "draft": { "currentVersionId": "v4-uuid", "path": "draft/current.json" },
        "published": { "currentVersionId": "v4-uuid", "path": "published/current.json" }
      },
      "liveChannel": "draft" | "published",
      "flags": { "GAME_ENABLED": true },
      "updatedAt": "2025-11-01T00:00:00.000Z"
    }
*/

import { createClient } from '@supabase/supabase-js';

/** @typedef {'draft' | 'published'} Channel */

function assertEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function serverClient() {
  const url = assertEnv('SUPABASE_URL');
  const key = assertEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * @param {any} value
 * @param {Channel} [fallback='draft']
 * @returns {Channel}
 */
function normalizeChannel(value, fallback = 'draft') {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : fallback;
  return String(raw || fallback).trim().toLowerCase() === 'published' ? 'published' : 'draft';
}

async function ensureBucket(supabase, bucket) {
  const { data: existing } = await supabase.storage.getBucket(bucket);
  if (existing) return;
  // public bucket so game-web can fetch directly by URL if desired (RLS still enforced for writes)
  await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: '50mb' });
}

async function putJSON(supabase, bucket, path, obj) {
  const bytes = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    upsert: true,
    contentType: 'application/json; charset=utf-8',
  });
  if (error) throw error;
}

async function getJSON(supabase, bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) return null;
  const text = await data.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    console.warn('[game-sync] Failed to parse JSON at %s: %s', path, err?.message || err);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const op = String(req.query.op || 'save').toLowerCase();

  try {
    const supabase = serverClient();
    const BUCKET = 'game-config';
    await ensureBucket(supabase, BUCKET);

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    // Basic validation
    const slug = String(body.slug || '').trim().toLowerCase();
    if (!slug) return res.status(400).json({ ok: false, error: 'Missing slug' });

    const title = String(body.title || slug);
    const flags = { GAME_ENABLED: !!(body.flags && body.flags.GAME_ENABLED) };
    const defaultChannel = normalizeChannel(body.defaultChannel, 'draft');
    /** @type {Channel} */
    const channel = op === 'publish' ? 'published' : normalizeChannel(body.channel || defaultChannel);

    // Snapshot payload the game-web needs
    const snapshot = {
      schemaVersion: 1,
      slug,
      title,
      channel,
      flags,
      defaultChannel,
      settings: body.settings ?? {},
      missions: Array.isArray(body.missions) ? body.missions : [],
      devices: Array.isArray(body.devices) ? body.devices : [],
      media: body.media ?? {},
      updatedAt: new Date().toISOString(),
    };

    const versionId =
      body.versionId ||
      (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

    // Load existing index
    const indexPath = `${slug}/index.json`;
    const index =
      (await getJSON(supabase, BUCKET, indexPath)) ?? {
        schemaVersion: 1,
        slug,
        title,
        channels: {},
        liveChannel: defaultChannel,
        flags,
        updatedAt: new Date().toISOString(),
      };

    if (op === 'make-live') {
      index.liveChannel = 'published';
      index.updatedAt = new Date().toISOString();
      await putJSON(supabase, BUCKET, indexPath, index);
      return res
        .status(200)
        .json({ ok: true, op, slug, liveChannel: index.liveChannel, hint: 'index.json updated' });
    }

    // Write versioned snapshot
    const versionPath = `${slug}/versions/${versionId}.json`;
    await putJSON(supabase, BUCKET, versionPath, snapshot);

    // Update channel pointers
    const channelCurrentPath = `${slug}/${channel}/current.json`;
    await putJSON(supabase, BUCKET, channelCurrentPath, { versionId, path: versionPath, snapshot });

    if (!index.channels) index.channels = {};
    index.title = title;
    index.flags = flags;
    index.channels[channel] = { currentVersionId: versionId, path: `${channel}/current.json` };
    // If this is the first thing ever saved, keep liveChannel sensible
    if (!index.liveChannel) index.liveChannel = defaultChannel;
    index.updatedAt = new Date().toISOString();

    await putJSON(supabase, BUCKET, indexPath, index);

    // Mirror to "public pointer" for game-web if enabled and we're publishing
    if (flags.GAME_ENABLED && channel === 'published') {
      // Simple public mirror path (same bucket) that game-web can fetch without walking pointers.
      // You can point game-web to this URL directly if you want:
      //   /storage/v1/object/public/game-config/<slug>/published/current.json
      const mirrorPath = `${slug}/live/current.json`;
      await putJSON(supabase, BUCKET, mirrorPath, {
        versionId,
        path: versionPath,
        snapshot,
        mirroredFrom: 'published',
      });
    }

    return res.status(200).json({
      ok: true,
      op,
      slug,
      channel,
      versionId,
      paths: {
        index: indexPath,
        version: versionPath,
        current: channelCurrentPath,
        live: flags.GAME_ENABLED && channel === 'published' ? `${slug}/live/current.json` : null,
      },
    });
  } catch (err) {
    const message = (err?.message || String(err)).slice(0, 800);
    return res.status(500).json({
      ok: false,
      error: message,
      tip: [
        'Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set for this environment.',
        'Ensure Storage bucket "game-config" can be created (first run) or already exists.',
        'Check request body includes { slug } and your data is JSON-serializable.',
      ],
    });
  }
}

