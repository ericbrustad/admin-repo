const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function ensureConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables');
  }
}

function buildHeaders(method = 'GET', prefer) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
  };
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }
  if (prefer) headers.Prefer = prefer;
  return headers;
}

function buildUrl(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table.replace(/^\/+/, '')}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    url.searchParams.append(key, value);
  });
  return url.toString();
}

async function request(table, { method = 'GET', params = {}, body = null, prefer } = {}) {
  ensureConfig();
  const res = await fetch(buildUrl(table, params), {
    method,
    headers: buildHeaders(method, prefer),
    body: body == null ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!res.ok) {
    const error = new Error(data?.message || data?.hint || data?.error || text || 'Supabase request failed');
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function fetchGameBundle({ slug, channel = 'draft' }) {
  const normalizedSlug = String(slug || '').trim().toLowerCase() || 'default';
  const normalizedChannel = channel === 'published' ? 'published' : 'draft';

  const [gameRows, missionsRows, devicesRows] = await Promise.all([
    request('games', {
      params: {
        select: 'slug,title,status,config,theme,map,updated_at',
        slug: `eq.${normalizedSlug}`,
        limit: '1',
      },
    }),
    request('missions', {
      params: {
        select: 'items,updated_at',
        game_slug: `eq.${normalizedSlug}`,
        channel: `eq.${normalizedChannel}`,
        limit: '1',
        order: 'updated_at.desc',
      },
    }),
    request('devices', {
      params: {
        select: 'items,updated_at',
        game_slug: `eq.${normalizedSlug}`,
        limit: '1',
      },
    }),
  ]);

  const game = Array.isArray(gameRows) ? gameRows[0] : gameRows;
  const missions = Array.isArray(missionsRows) ? missionsRows[0] : missionsRows;
  const devices = Array.isArray(devicesRows) ? devicesRows[0] : devicesRows;

  return {
    slug: normalizedSlug,
    channel: normalizedChannel,
    config: game?.config || null,
    missions: Array.isArray(missions?.items) ? missions.items : [],
    devices: Array.isArray(devices?.items) ? devices.items : Array.isArray(devices?.items?.items) ? devices.items.items : [],
    meta: {
      game,
      missions,
      devices,
    },
  };
}

export async function fetchPublishedBundle(options) {
  return fetchGameBundle({ ...(options || {}), channel: 'published' });
}

export default {
  fetchGameBundle,
  fetchPublishedBundle,
};
