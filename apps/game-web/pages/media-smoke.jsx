import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabase-lite.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function MediaSmoke() {
  // Defaults — change to match your setup
  const [bucket, setBucket] = useState('media');               // e.g. 'media'
  const [path, setPath] = useState('mediapool/test.jpg');      // e.g. 'mediapool/test.jpg'
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // Allow overrides via query: /media-smoke?bucket=media&path=mediapool/test.jpg
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const qb = q.get('bucket');
    const qp = q.get('path');
    if (qb) setBucket(qb);
    if (qp) setPath(qp);
  }, []);

  async function fetchSigned() {
    try {
      setLoading(true);
      setErr('');
      setUrl('');
      if (!bucket || !path) throw new Error('Bucket and path are required.');
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
      if (error) throw error;
      setUrl(data.signedUrl);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Auto-load once on first render after any query override is applied
  useEffect(() => {
    // small delay so query overrides can set state first
    const t = setTimeout(fetchSigned, 0);
    return () => clearTimeout(t);
  }, [bucket, path]);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', lineHeight: 1.4 }}>
      <h1>Media Smoke</h1>

      <div style={{ display: 'grid', gap: 8, maxWidth: 520, marginBottom: 16 }}>
        <label>
          <div>Bucket</div>
          <input
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            placeholder="media"
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 8 }}
          />
        </label>
        <label>
          <div>Path (object key)</div>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="mediapool/test.jpg"
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 8 }}
          />
        </label>
        <button
          onClick={fetchSigned}
          disabled={loading}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ccc', cursor: 'pointer' }}
        >
          {loading ? 'Fetching…' : 'Fetch signed URL (60s)'}
        </button>
      </div>

      {err && (
        <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap', marginBottom: 16 }}>
          {err}
        </pre>
      )}

      {url ? (
        <>
          <div style={{ marginBottom: 8 }}>
            <strong>Signed URL:</strong>
            <div style={{ fontSize: 12, wordBreak: 'break-all' }}>{url}</div>
          </div>
          <img
            src={url}
            alt="Supabase test"
            style={{ maxWidth: 420, border: '1px solid #ddd', borderRadius: 8 }}
          />
        </>
      ) : (
        !loading && <p>Enter a valid bucket & path, then click “Fetch signed URL”.</p>
      )}
    </main>
  );
}
