// components/TestLauncher.jsx
export default function TestLauncher({ slug, channel='draft', preferPretty=false, popup=false }) {
  const base =
    (typeof window !== 'undefined'
      ? (window.__GAME_ORIGIN__ || process.env.NEXT_PUBLIC_GAME_ORIGIN)
      : process.env.NEXT_PUBLIC_GAME_ORIGIN) || '';

  if (!base || !slug) {
    return <button disabled style={{ opacity: 0.6, cursor: 'not-allowed' }}>Open full window</button>;
  }

  const pretty = `${base}/${encodeURIComponent(slug)}?channel=${encodeURIComponent(channel)}&preview=1`;
  const query  = `${base}/?slug=${encodeURIComponent(slug)}&channel=${encodeURIComponent(channel)}&preview=1`;
  const href   = preferPretty ? pretty : query;

  const common = { target: '_blank', rel: 'noreferrer', style: { textDecoration: 'none' } };
  return (
    <a href={href} {...common}>
      <button style={{ padding:'10px 14px', borderRadius:10, border:'1px solid #2a323b', background:'#1a2027', color:'#e9eef2', cursor:'pointer' }}>
        Open full window
      </button>
    </a>
  );
}
