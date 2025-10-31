// [Codex note] Shared helpers for persisting games into Supabase.
import { serverClient } from '../supabaseClient';

function cloneValue(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch {}
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function normalizeChannel(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw || 'draft').trim().toLowerCase();
  return normalized === 'published' ? 'published' : 'draft';
}

function ensureObject(input, fallback = {}) {
  if (!input || typeof input !== 'object') return { ...fallback };
  return { ...fallback, ...input };
}

export function buildGameRow(payload = {}) {
  const slug = String(payload.slug || '').trim();
  if (!slug) {
    throw new Error('Missing slug');
  }

  const channel = normalizeChannel(payload.channel);
  const snapshot = payload.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : null;
  const providedConfig = payload.config && typeof payload.config === 'object' ? payload.config : null;
  const snapshotConfig = snapshot?.data?.config && typeof snapshot.data.config === 'object'
    ? snapshot.data.config
    : null;
  const configSource = providedConfig || snapshotConfig || {};
  const config = ensureObject(cloneValue(configSource));

  const suiteSource = payload.suite
    || snapshot?.data?.suite
    || snapshot?.data?.missions
    || null;
  if (suiteSource && typeof config === 'object') {
    config.suite = cloneValue(suiteSource);
  }

  const title = String(
    payload.title
    || snapshot?.meta?.title
    || config?.game?.title
    || slug
  ).trim() || slug;

  if (config.game && typeof config.game === 'object') {
    config.game = { ...config.game, title };
  }

  return {
    slug,
    channel,
    title,
    config,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertGameRow(payload = {}) {
  const supabase = serverClient();
  const row = buildGameRow(payload);
  const { data, error } = await supabase
    .from('games')
    .upsert(row, { onConflict: 'slug,channel' })
    .select()
    .limit(1);

  if (error) {
    throw error;
  }

  return Array.isArray(data) && data.length ? data[0] : row;
}
