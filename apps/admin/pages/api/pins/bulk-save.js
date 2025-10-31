import { serverClient } from '../../../lib/supabaseClient';

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

function normalizeChannel(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw || 'draft').toLowerCase();
  return normalized === 'published' ? 'published' : 'draft';
}

function clone(value, fallback = undefined) {
  if (value === null || value === undefined) return fallback;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch {}
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const payload = parseBody(req.body);
  const slug = String(payload.slug || '').trim();
  const channel = normalizeChannel(payload.channel);
  const pins = Array.isArray(payload.pins) ? payload.pins : null;
  const configPatch = payload.config && typeof payload.config === 'object' ? payload.config : null;

  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Missing slug' });
  }
  if (!pins) {
    return res.status(400).json({ ok: false, error: 'pins must be an array' });
  }

  try {
    const supabase = serverClient();
    const { data: existing, error: fetchError } = await supabase
      .from('games')
      .select('config')
      .eq('slug', slug)
      .eq('channel', channel)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({ ok: false, error: fetchError.message || 'fetch failed', details: fetchError });
    }

    const currentConfig = existing?.config && typeof existing.config === 'object'
      ? clone(existing.config, {})
      : {};

    const mergedConfig = { ...currentConfig, ...(configPatch || {}) };
    mergedConfig.pins = clone(pins, []);
    mergedConfig.updatedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('games')
      .update({ config: mergedConfig, updated_at: new Date().toISOString() })
      .eq('slug', slug)
      .eq('channel', channel);

    if (updateError) {
      return res.status(500).json({ ok: false, error: updateError.message || 'save failed', details: updateError });
    }

    return res.status(200).json({ ok: true, pins: mergedConfig.pins?.length || 0 });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'save failed' });
  }
}
