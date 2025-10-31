import supabaseStub from '../../../packages/supabase-js-stub/dist/index.cjs';

const createClient =
  typeof supabaseStub?.createClient === 'function'
    ? supabaseStub.createClient
    : typeof supabaseStub?.default?.createClient === 'function'
    ? supabaseStub.default.createClient
    : null;

if (typeof createClient !== 'function') {
  throw new Error('Supabase client stub is unavailable');
}

export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/ANON_KEY');
  return createClient(url, anon);
}

export function serverClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

