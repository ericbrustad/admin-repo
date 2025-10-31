import { serverClient } from '../../lib/supabaseClient';

async function trySelectKV(supabase) {
  if (!supabase) return { ok: false, reason: 'missing_supabase' };
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key,value')
      .in('key', ['defaultGameSlug', 'defaultPublishedGameSlug']);
    if (error) throw error;
    const out = Object.fromEntries((data || []).map(r => [r.key, r.value]));
    return { ok: true, settings: out };
  } catch (e) {
    return { ok: false, reason: 'missing_table_or_rls', error: String(e?.message || e) };
  }
}

async function tryUpsertKV(supabase, payload) {
  if (!supabase) return { ok: false, reason: 'missing_supabase' };
  const kv = [];
  if (Object.prototype.hasOwnProperty.call(payload, 'defaultGameSlug')) {
    const value = typeof payload.defaultGameSlug === 'string' && payload.defaultGameSlug
      ? payload.defaultGameSlug
      : null;
    kv.push({ key: 'defaultGameSlug', value });
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'defaultPublishedGameSlug')) {
    const value = typeof payload.defaultPublishedGameSlug === 'string' && payload.defaultPublishedGameSlug
      ? payload.defaultPublishedGameSlug
      : null;
    kv.push({ key: 'defaultPublishedGameSlug', value });
  }
  if (!kv.length) return { ok: true };
  try {
    const { error } = await supabase.from('app_settings').upsert(kv);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'missing_table_or_rls', error: String(e?.message || e) };
  }
}

export default async function handler(req, res) {
  const supabase = serverClient();

  if (req.method === 'GET') {
    const got = await trySelectKV(supabase);
    if (!got.ok) {
      return res.status(404).json({ ok: false, reason: got.reason });
    }
    return res.status(200).json({
      ok: true,
      defaultGameSlug: got.settings.defaultGameSlug || null,
      defaultPublishedGameSlug: got.settings.defaultPublishedGameSlug || null,
    });
  }

  if (req.method === 'PUT') {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}));
    const saved = await tryUpsertKV(supabase, body);
    if (!saved.ok) {
      return res.status(404).json({ ok: false, reason: saved.reason });
    }
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
