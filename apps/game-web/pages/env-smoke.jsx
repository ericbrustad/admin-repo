export default function EnvSmoke() {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const mask = (s) => (s ? s.slice(0, 4) + '…' + s.slice(-4) : '(empty)');

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Env Smoke</h1>
      <p><strong>NEXT_PUBLIC_SUPABASE_URL</strong>: {URL ? 'present' : 'MISSING'}</p>
      <p><strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong>: {ANON ? 'present' : 'MISSING'}</p>
      <hr />
      <p>Preview (masked):</p>
      <pre>URL  = {URL ? mask(URL) : '(empty)'}</pre>
      <pre>ANON = {ANON ? mask(ANON) : '(empty)'}</pre>
    </main>
  );
}
