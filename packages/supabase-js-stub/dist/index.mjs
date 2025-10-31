function createClient(url = '', key = '', options = {}) {
  const log = (...args) => {
    if (typeof console !== 'undefined') {
      console.warn('[supabase-js stub]', ...args);
    }
  };

  log('createClient called with URL:', url || '(none)');

  const wrap = (result = { data: null, error: null }) => async () => result;

  const tableOps = () => ({
    select: wrap({ data: [], error: null }),
    insert: wrap({ data: null, error: null }),
    upsert: wrap({ data: null, error: null }),
    update: wrap({ data: null, error: null }),
    delete: wrap({ data: null, error: null }),
    eq: () => tableOps(),
    match: () => tableOps(),
    single: wrap({ data: null, error: null }),
  });

  return {
    url,
    key,
    options,
    from() {
      log('from() invoked on stub client');
      return tableOps();
    },
    storage: {
      from() {
        log('storage.from() invoked on stub client');
        return {
          upload: wrap({ data: null, error: null }),
          list: wrap({ data: [], error: null }),
          remove: wrap({ data: null, error: null }),
          getPublicUrl: () => ({ data: { publicUrl: '' } }),
        };
      },
    },
    auth: {
      getSession: wrap({ data: { session: null }, error: null }),
      signInWithPassword: wrap({ data: null, error: new Error('Supabase auth not available in stub') }),
      signOut: wrap({ error: null }),
    },
    functions: {
      invoke: wrap({ data: null, error: new Error('Supabase functions not available in stub') }),
    },
    rpc: () => tableOps(),
  };
}

export { createClient };
export default { createClient };
