const CLIENT_HEADER = 'game-web-supabase-lite/1.0.0';

function createError(message, extras = {}) {
  return {
    message,
    ...extras,
  };
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function normalizeBase(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return ensureTrailingSlash(parsed.toString());
  } catch (error) {
    return null;
  }
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

async function toResult(response) {
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'message' in payload && payload.message) ||
      response.statusText ||
      'Request failed';
    return {
      data: null,
      error: createError(message, { status: response.status, details: payload ?? undefined }),
    };
  }

  return { data: payload ?? null, error: null };
}

function createRequest(fetchImpl, headersBase) {
  return async function request(method, target, body, init = {}) {
    try {
      const headers = { ...headersBase, ...(init.headers || {}) };
      const fetchInit = {
        method,
        headers,
      };

      if (init.signal) {
        fetchInit.signal = init.signal;
      }

      const methodUpper = method.toUpperCase();
      if (body !== undefined && methodUpper !== 'GET' && methodUpper !== 'HEAD') {
        if (typeof body === 'string') {
          fetchInit.body = body;
        } else {
          fetchInit.body = JSON.stringify(body);
          if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
          }
        }
      }

      const response = await fetchImpl(target, fetchInit);
      return await toResult(response);
    } catch (error) {
      return { data: null, error: createError(error?.message || String(error)) };
    }
  };
}

function createQueryExecutor(request, resourceUrl, table) {
  const state = {
    select: '*',
    filters: [],
    limit: undefined,
    range: undefined,
    order: undefined,
    signal: undefined,
  };

  const execute = async (method = 'GET', payload) => {
    const url = new URL(`${resourceUrl}/${encodeURIComponent(table)}`);
    url.searchParams.set('select', state.select || '*');

    for (const filter of state.filters) {
      if (filter?.column && filter.value !== undefined && filter.value !== null) {
        url.searchParams.append(filter.column, `${filter.operator}.${encodeURIComponent(filter.value)}`);
      }
    }

    if (typeof state.limit === 'number') {
      url.searchParams.set('limit', String(state.limit));
    }

    if (state.order?.column) {
      url.searchParams.set('order', `${state.order.column}.${state.order.ascending === false ? 'desc' : 'asc'}`);
    }

    const init = {};
    if (state.range && typeof state.range.from === 'number') {
      const end = typeof state.range.to === 'number' ? state.range.to : '';
      init.headers = { Range: `${state.range.from}-${end}` };
    }

    if (state.signal) {
      init.signal = state.signal;
    }

    return request(method, url.toString(), payload, init);
  };

  const builder = {
    select(columns) {
      state.select = columns || '*';
      return builder;
    },
    limit(count) {
      state.limit = Number.isFinite(count) ? Number(count) : undefined;
      return builder;
    },
    range(from, to) {
      state.range = { from, to };
      return builder;
    },
    order(column, options = {}) {
      state.order = { column, ascending: options.ascending !== false };
      return builder;
    },
    eq(column, value) {
      state.filters.push({ column, operator: 'eq', value });
      return builder;
    },
    neq(column, value) {
      state.filters.push({ column, operator: 'neq', value });
      return builder;
    },
    gte(column, value) {
      state.filters.push({ column, operator: 'gte', value });
      return builder;
    },
    lte(column, value) {
      state.filters.push({ column, operator: 'lte', value });
      return builder;
    },
    abort(signal) {
      state.signal = signal;
      return builder;
    },
    insert(values) {
      return execute('POST', values);
    },
    update(values) {
      return execute('PATCH', values);
    },
    delete() {
      return execute('DELETE');
    },
    async maybeSingle() {
      const result = await execute();
      if (!result.error && Array.isArray(result.data)) {
        return { data: result.data[0] ?? null, error: null };
      }
      return result;
    },
    async single() {
      const result = await execute();
      if (result.error) return result;
      if (Array.isArray(result.data)) {
        if (result.data.length === 1) {
          return { data: result.data[0], error: null };
        }
        return { data: null, error: createError('Expected a single row', { details: result.data }) };
      }
      return { data: result.data, error: null };
    },
    then(resolve, reject) {
      return execute().then(resolve, reject);
    },
    catch(onRejected) {
      return execute().catch(onRejected);
    },
    finally(onFinally) {
      return execute().finally(onFinally);
    },
  };

  return builder;
}

function createStorageClient(request, baseUrl, defaultHeaders) {
  const bucketEndpoint = `${baseUrl}/bucket`;
  const objectEndpoint = `${baseUrl}/object`;

  async function listBuckets() {
    return request('GET', bucketEndpoint);
  }

  function from(bucket) {
    const encodedBucket = encodeURIComponent(bucket);

    return {
      async list(prefix = '', options = {}) {
        const payload = {
          prefix: prefix ?? '',
          limit: Number.isFinite(options.limit) ? Number(options.limit) : 100,
          offset: Number.isFinite(options.offset) ? Number(options.offset) : 0,
          sortBy: options.sortBy || { column: 'name', order: 'asc' },
          search: options.search,
        };

        const { data, error } = await request(
          'POST',
          `${objectEndpoint}/list/${encodedBucket}`,
          payload,
          { headers: { 'Content-Type': 'application/json' } },
        );

        if (error) return { data: null, error };

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.data)
          ? data.data
          : [];

        return { data: list, error: null };
      },

      async createSignedUrl(path, expiresIn = 60) {
        const payload = { expiresIn, path };
        const { data, error } = await request(
          'POST',
          `${objectEndpoint}/sign/${encodedBucket}`,
          payload,
          { headers: { 'Content-Type': 'application/json' } },
        );

        if (error) return { data: null, error };

        const signed = Array.isArray(data?.signedURLs)
          ? data.signedURLs[0]
          : data?.signedURL
          ? { signedUrl: data.signedURL }
          : data?.signedUrl
          ? { signedUrl: data.signedUrl }
          : data;

        return {
          data: {
            signedUrl: signed?.signedUrl || signed?.signedURL || null,
            path,
            expiresIn,
          },
          error: null,
        };
      },

      getPublicUrl(path) {
        const base = ensureTrailingSlash(baseUrl.replace('/storage/v1', ''));
        const publicUrl = `${base}/storage/v1/object/public/${encodedBucket}/${encodeURI(path || '')}`;
        return { data: { publicUrl }, error: null };
      },
    };
  }

  return { listBuckets, from };
}

function createStubClient(reason) {
  const error = createError(reason || 'Supabase client unavailable');
  const resolved = Promise.resolve({ data: null, error });

  const builder = {
    select() {
      return builder;
    },
    limit() {
      return builder;
    },
    range() {
      return builder;
    },
    order() {
      return builder;
    },
    eq() {
      return builder;
    },
    neq() {
      return builder;
    },
    gte() {
      return builder;
    },
    lte() {
      return builder;
    },
    insert() {
      return resolved;
    },
    update() {
      return resolved;
    },
    delete() {
      return resolved;
    },
    maybeSingle() {
      return resolved;
    },
    single() {
      return resolved;
    },
    then(resolve, reject) {
      return resolved.then(resolve, reject);
    },
    catch(onRejected) {
      return resolved.catch(onRejected);
    },
    finally(onFinally) {
      return resolved.finally(onFinally);
    },
  };

  return {
    from() {
      return builder;
    },
    storage: {
      listBuckets: async () => ({ data: null, error }),
      from() {
        return {
          list: async () => ({ data: [], error }),
          createSignedUrl: async () => ({ data: null, error }),
          getPublicUrl: () => ({ data: { publicUrl: null }, error }),
        };
      },
    },
  };
}

export function createClient(url, key, options = {}) {
  const baseUrl = normalizeBase(url);
  if (!baseUrl) {
    return createStubClient('Invalid Supabase URL');
  }

  if (!key) {
    return createStubClient('Missing Supabase key');
  }

  const fetchImpl = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (typeof fetchImpl !== 'function') {
    return createStubClient('Fetch API is not available');
  }

  const restUrl = options.restUrl || `${baseUrl}/rest/v1`;
  const storageUrl = options.storageUrl || `${baseUrl}/storage/v1`;

  const headersBase = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'X-Client-Info': CLIENT_HEADER,
    ...(options.headers || {}),
  };

  const request = createRequest(fetchImpl, headersBase);

  return {
    from(table) {
      if (!table) throw new Error('Table name is required');
      return createQueryExecutor(request, restUrl, table);
    },
    storage: createStorageClient(request, storageUrl, headersBase),
  };
}

export default { createClient };
