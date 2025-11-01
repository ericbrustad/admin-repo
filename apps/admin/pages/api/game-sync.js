/*
  Robust Draft/Publish/Live sync for Admin → Supabase Storage (no new deps).
  Endpoints:
    GET  ?op=selftest  -> verifies env + storage write access
    POST ?op=save      -> saves a DRAFT snapshot and updates pointers
    POST ?op=publish   -> saves PUBLISHED snapshot, updates pointers, optional mirror
    POST ?op=make-live -> flips index.liveChannel to "published"

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

export const config = {
  api: {
    // Drafts with many missions can exceed 1MB and cause a 500. Give us headroom.
    bodyParser: { sizeLimit: '8mb' },
  },
};

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
  if (!existing) {
    const { error } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: '50mb',
    });
    if (error) throw new Error(`createBucket(${bucket}) failed: ${error.message}`);
  }
}

async function putJSON(supabase, bucket, path, obj) {
  const bytes = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    upsert: true,
    contentType: 'application/json; charset=utf-8',
  });
  if (error) throw new Error(`upload ${path} failed: ${error.message}`);
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

function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, ...data });
}

function fail(res, message, detail, status = 500) {
  const out = { ok: false, error: message };
  if (detail) out.detail = `${detail}`.slice(0, 800);
  return res.status(status).json(out);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return fail(res, 'Method Not Allowed', null, 405);
  }

  const op = String(req.query.op || 'save').toLowerCase();
  const BUCKET = process.env.GAME_CONFIG_BUCKET || 'game-config';

  try {
    // ── Self-test: quick browser check for env + storage access ────────────────
    if (op === 'selftest') {
      const supabase = serverClient();
      const report = { env: {}, storage: {} };

      for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
        report.env[key] = !!process.env[key];
      }

      try {
        await ensureBucket(supabase, BUCKET);
        report.storage.bucket = BUCKET;
        const probe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await putJSON(supabase, BUCKET, '_health/ok.json', { probe, t: new Date().toISOString() });
        report.storage.write = true;
      } catch (error) {
        return fail(res, 'Selftest storage failed', error?.message || error, 500);
      }

      return ok(res, { op, report });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const slug = String(body.slug || req.query.slug || '').trim().toLowerCase();
    if (!slug) return fail(res, 'Missing slug', null, 400);

    const supabase = serverClient();
    await ensureBucket(supabase, BUCKET);

    const title = String(body.title || slug);
    const flags = { GAME_ENABLED: !!(body.flags && body.flags.GAME_ENABLED) };
    const defaultChannel = normalizeChannel(body.defaultChannel, 'draft');
    /** @type {Channel} */
    const channel = op === 'publish' ? 'published' : normalizeChannel(body.channel || defaultChannel);

    if (op === 'make-live') {
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
      index.liveChannel = 'published';
      index.updatedAt = new Date().toISOString();
      await putJSON(supabase, BUCKET, indexPath, index);
      return ok(res, { op, slug, liveChannel: index.liveChannel });
    }

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

    const versionPath = `${slug}/versions/${versionId}.json`;
    await putJSON(supabase, BUCKET, versionPath, snapshot);

    const channelCurrentPath = `${slug}/${channel}/current.json`;
    await putJSON(supabase, BUCKET, channelCurrentPath, { versionId, path: versionPath, snapshot });

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

    if (!index.channels) index.channels = {};
    index.title = title;
    index.flags = flags;
    index.channels[channel] = { currentVersionId: versionId, path: `${channel}/current.json` };
    if (!index.liveChannel) index.liveChannel = defaultChannel;
    index.updatedAt = new Date().toISOString();
    await putJSON(supabase, BUCKET, indexPath, index);

    if (flags.GAME_ENABLED && channel === 'published') {
      const mirrorPath = `${slug}/live/current.json`;
      await putJSON(supabase, BUCKET, mirrorPath, {
        versionId,
        path: versionPath,
        snapshot,
        mirroredFrom: 'published',
      });
    }

    return ok(res, {
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
    return fail(res, err?.message || String(err));
  }
}
