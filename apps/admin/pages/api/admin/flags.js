import { supaService } from '../../../lib/supabase/server.js';
import { upsertReturning } from '../../../lib/supabase/upsertReturning.js';

const DEFAULTS = {
  game_enabled: true,
  new_game_default_channel: 'draft',
};

function envBool(name, fallback) {
  const candidates = [
    process.env[name],
    process.env[`NEXT_PUBLIC_${name}`],
  ];
  for (const raw of candidates) {
    if (raw == null || raw === '') continue;
    if (/^(1|true|yes|on)$/i.test(String(raw).trim())) return true;
    if (/^(0|false|no|off)$/i.test(String(raw).trim())) return false;
  }
  return fallback;
}

async function readFlagsFromDb(supa) {
  try {
    const { data, error } = await supa.from('admin_flags').select('key,value');
    if (error) return { ok: false, error };
    const flags = Object.create(null);
    for (const row of data || []) {
      if (!row || !row.key) continue;
      flags[row.key] = row.value;
    }
    return { ok: true, flags };
  } catch (error) {
    return { ok: false, error };
  }
}

async function writeFlagsToDb(supa, partial) {
  const now = new Date().toISOString();
  const rows = Object.entries(partial).map(([key, value]) => ({
    key,
    value,
    updated_at: now,
  }));
  for (const payload of rows) {
    await upsertReturning(supa, 'admin_flags', payload, { onConflict: 'key' });
  }
  return { ok: true };
}

export default async function handler(req, res) {
  let supa = null;
  try {
    supa = supaService();
  } catch (error) {
    if (req.method === 'POST') {
      return res.status(500).json({ ok: false, error: error?.message || 'Supabase not configured' });
    }
  }

  if (req.method === 'GET') {
    let dbFlags = {};
    if (supa) {
      const read = await readFlagsFromDb(supa);
      if (read.ok && read.flags) dbFlags = read.flags;
    }
    const merged = {
      ...DEFAULTS,
      ...dbFlags,
    };
    merged.game_enabled = dbFlags.game_enabled ?? envBool('GAME_ENABLED', DEFAULTS.game_enabled);
    if (typeof merged.game_enabled !== 'boolean') {
      merged.game_enabled = Boolean(merged.game_enabled);
    }
    if (merged.new_game_default_channel !== 'published') {
      merged.new_game_default_channel = 'draft';
    }
    return res.status(200).json({ ok: true, flags: merged });
  }

  if (req.method === 'POST') {
    if (!supa) {
      return res.status(500).json({ ok: false, error: 'Supabase not configured' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const payload = {};
    if (Object.prototype.hasOwnProperty.call(body, 'game_enabled')) {
      payload.game_enabled = Boolean(body.game_enabled);
    }
    if (typeof body.new_game_default_channel === 'string') {
      const normalized = body.new_game_default_channel === 'published' ? 'published' : 'draft';
      payload.new_game_default_channel = normalized;
    }
    if (!Object.keys(payload).length) {
      return res.status(400).json({ ok: false, error: 'No valid flags provided' });
    }
    try {
      await writeFlagsToDb(supa, payload);
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error?.message || 'Failed to save flags' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end('Method Not Allowed');
}
