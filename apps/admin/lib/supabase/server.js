const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

function ensureConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable');
  }
}

function restBaseUrl() {
  ensureConfig();
  return `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`;
}

function buildHeaders({ method = 'GET', prefer } = {}) {
  ensureConfig();
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: 'application/json',
  };
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }
  if (prefer) {
    headers.Prefer = prefer;
  }
  return headers;
}

async function request(table, { method = 'GET', params = {}, body = null, prefer } = {}) {
  const base = restBaseUrl();
  const url = new URL(`${base}/${encodeURIComponent(table)}`);
  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.append(key, value);
    });
  }

  const res = await fetch(url.toString(), {
    method,
    headers: buildHeaders({ method, prefer }),
    body: body == null ? undefined : JSON.stringify(body),
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
    return { data: null, error };
  }

  return { data, error: null };
}

function encodeFilterValue(value) {
  if (value === null) return 'is.null';
  if (typeof value === 'boolean') return `eq.${value ? 'true' : 'false'}`;
  if (value instanceof Date) return `eq.${value.toISOString()}`;
  if (typeof value === 'number') return `eq.${value}`;
  const stringValue = Array.isArray(value) ? value.join(',') : `${value}`;
  return `eq.${stringValue}`;
}

async function select(table, { columns = '*', filters = {}, single = false, order = null, limit = null } = {}) {
  const params = { select: columns };
  Object.entries(filters || {}).forEach(([column, value]) => {
    if (Array.isArray(value)) {
      const list = value.map((v) => `"${v}"`).join(',');
      params[column] = `in.(${list})`;
    } else {
      params[column] = encodeFilterValue(value);
    }
  });
  if (order && order.column) {
    params.order = `${order.column}.${order.ascending === false ? 'desc' : 'asc'}`;
  }
  if (Number.isFinite(limit) && limit > 0) {
    params.limit = String(limit);
  }

  const { data, error } = await request(table, { method: 'GET', params });
  if (error) return { data: null, error };

  if (single) {
    if (Array.isArray(data)) {
      return { data: data[0] || null, error: null };
    }
    return { data: data || null, error: null };
  }

  return { data: Array.isArray(data) ? data : [], error: null };
}

async function upsert(table, payload = {}) {
  const arrayPayload = Array.isArray(payload) ? payload : [payload];
  return request(table, {
    method: 'POST',
    body: arrayPayload,
    prefer: 'return=representation,resolution=merge-duplicates',
  });
}

async function update(table, payload = {}, filters = {}) {
  const params = {};
  Object.entries(filters || {}).forEach(([column, value]) => {
    params[column] = encodeFilterValue(value);
  });
  return request(table, {
    method: 'PATCH',
    params,
    body: payload,
    prefer: 'return=representation',
  });
}

async function insert(table, payload = {}) {
  const arrayPayload = Array.isArray(payload) ? payload : [payload];
  return request(table, {
    method: 'POST',
    body: arrayPayload,
    prefer: 'return=representation',
  });
}

async function remove(table, filters = {}) {
  const params = {};
  Object.entries(filters || {}).forEach(([column, value]) => {
    params[column] = encodeFilterValue(value);
  });
  return request(table, {
    method: 'DELETE',
    params,
    prefer: 'return=representation',
  });
}

export function supaService() {
  ensureConfig();
  return {
    from(table) {
      return {
        select: (columns = '*', options = {}) => select(table, { columns, ...(options || {}) }),
        selectSingle: (filters = {}, options = {}) => select(table, { ...(options || {}), filters, single: true }),
        upsert: (payload) => upsert(table, payload),
        update: (payload, filters = {}) => update(table, payload, filters),
        insert: (payload) => insert(table, payload),
        delete: (filters = {}) => remove(table, filters),
      };
    },
    raw: {
      select,
      upsert,
      update,
      insert,
      delete: remove,
    },
  };
}

export async function supaSelect(table, options) {
  return select(table, options);
}

export async function supaUpsert(table, payload) {
  return upsert(table, payload);
}

export async function supaUpdate(table, payload, filters) {
  return update(table, payload, filters);
}

export async function supaInsert(table, payload) {
  return insert(table, payload);
}

export async function supaDelete(table, filters) {
  return remove(table, filters);
}
