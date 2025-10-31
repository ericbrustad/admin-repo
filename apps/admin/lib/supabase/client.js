export function supaClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or anon key');
  }
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  async function request(path, { method = 'GET', params = {}, body = null } = {}) {
    const target = new URL(path.replace(/^\/+/, ''), `${base}/`);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      target.searchParams.append(key, value);
    });
    const res = await fetch(target.toString(), {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        ...(method !== 'GET' && method !== 'HEAD' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
    if (!res.ok) {
      const error = new Error(data?.message || data?.error || text || 'Supabase client request failed');
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  }
  return { request };
}
