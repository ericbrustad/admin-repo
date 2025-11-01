export default function handler(_req, res) {
  const have = (v) => Boolean(v && String(v).trim().length > 0);
  res.status(200).json({
    ok: true,
    env: {
      NEXT_PUBLIC_MAPBOX_TOKEN: have(process.env.NEXT_PUBLIC_MAPBOX_TOKEN),
      SUPABASE_URL: have(process.env.SUPABASE_URL),
      SUPABASE_ANON_KEY: have(process.env.SUPABASE_ANON_KEY),
      SUPABASE_SERVICE_ROLE_KEY: have(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    ts: new Date().toISOString(),
  });
}
