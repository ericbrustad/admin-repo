// CODEx note: Simple page to edit default game selections.
import React from 'react';
import dynamic from 'next/dynamic';

const DefaultGameControls = dynamic(() => import('../components/DefaultGameControls'), { ssr: false });

const styles = {
  page: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '32px 24px',
    display: 'grid',
    gap: 24,
    color: 'var(--admin-body-color)',
  },
  heading: { fontSize: 28, fontWeight: 600, margin: 0 },
  intro: { fontSize: 14, color: 'var(--admin-muted)', lineHeight: 1.6 },
  tip: { fontSize: 12, color: 'var(--admin-muted)' },
  metaWrap: {
    borderTop: '1px solid var(--admin-border-soft)',
    paddingTop: 16,
    display: 'grid',
    gap: 6,
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  metaNote: { fontSize: 11, color: 'var(--admin-muted)', opacity: 0.8 },
  link: { color: 'var(--admin-link-color)', textDecoration: 'underline' },
};

function readEnv(key) {
  if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
  if (typeof window !== 'undefined' && window.__ENV__ && window.__ENV__[key]) return window.__ENV__[key];
  return '';
}

function initialMeta() {
  const vercelHost = readEnv('VERCEL_URL');
  const normalizedVercel = vercelHost ? (vercelHost.startsWith('http') ? vercelHost : `https://${vercelHost}`) : '';
  return {
    repo: readEnv('REPO_NAME') || readEnv('VERCEL_GIT_REPO_SLUG') || '',
    branch: readEnv('REPO_BRANCH') || readEnv('VERCEL_GIT_COMMIT_REF') || '',
    commit: readEnv('VERCEL_GIT_COMMIT_SHA') || readEnv('GITHUB_SHA') || '',
    deploymentUrl:
      readEnv('DEPLOYMENT_URL') ||
      readEnv('VERCEL_DEPLOYMENT_URL') ||
      readEnv('VERCEL_PROJECT_PRODUCTION_URL') ||
      readEnv('VERCEL_BRANCH_URL') ||
      normalizedVercel,
    vercelUrl: normalizedVercel,
    deploymentState: readEnv('DEPLOYMENT_STATE') || readEnv('VERCEL_ENV') || '',
    fetchedAt: '',
  };
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch (error) {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }
}

export default function SettingsDefaultsPage() {
  const fallbackRef = React.useRef(initialMeta());
  const [meta, setMeta] = React.useState(() => ({ ...fallbackRef.current }));
  const [metaNote, setMetaNote] = React.useState('');
  const [renderedAt, setRenderedAt] = React.useState(() => new Date().toISOString());

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin-meta');
        if (!active) return;
        if (res.ok) {
          const payload = await res.json();
          if (!active) return;
          if (payload && payload.ok !== false) {
            setMeta({
              repo: payload.repo || fallbackRef.current.repo || '',
              branch: payload.branch || fallbackRef.current.branch || '',
              commit: payload.commit || fallbackRef.current.commit || '',
              deploymentUrl: payload.deploymentUrl || fallbackRef.current.deploymentUrl || '',
              vercelUrl: payload.vercelUrl || fallbackRef.current.vercelUrl || '',
              deploymentState: payload.deploymentState || fallbackRef.current.deploymentState || '',
              fetchedAt: payload.fetchedAt || new Date().toISOString(),
            });
            setMetaNote('');
          } else {
            setMeta(prev => ({
              ...prev,
              fetchedAt: payload?.fetchedAt || prev.fetchedAt || new Date().toISOString(),
            }));
            setMetaNote('Admin metadata endpoint returned an error. Showing fallbacks.');
          }
        } else {
          setMeta(prev => ({
            ...prev,
            fetchedAt: prev.fetchedAt || new Date().toISOString(),
          }));
          setMetaNote(`Failed to fetch admin metadata (status ${res.status}). Showing fallbacks.`);
        }
      } catch (error) {
        if (!active) return;
        setMeta(prev => ({
          ...fallbackRef.current,
          fetchedAt: prev.fetchedAt || new Date().toISOString(),
        }));
        setMetaNote('Failed to fetch admin metadata. Showing environment fallbacks.');
      } finally {
        if (active) setRenderedAt(new Date().toISOString());
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Game Defaults</h1>
      <p style={styles.intro}>
        Choose the <strong>Default Game</strong> (all games) and the <strong>Default Published Game</strong> (only published).
      </p>
      <DefaultGameControls />
      <div style={styles.tip}>
        Tip: Add <code>NEXT_PUBLIC_DEFAULT_GAME_SLUG</code> and{' '}
        <code>NEXT_PUBLIC_DEFAULT_PUBLISHED_GAME_SLUG</code> to env for sensible fallbacks.
      </div>
      <div style={styles.metaWrap}>
        <div>
          <strong>Repository:</strong> {meta.repo || '—'} • <strong>Branch:</strong> {meta.branch || '—'} •{' '}
          <strong>Commit:</strong> {meta.commit || '—'}
        </div>
        <div>
          <strong>Deployment:</strong>{' '}
          {meta.deploymentUrl ? (
            <a style={styles.link} href={meta.deploymentUrl} target="_blank" rel="noreferrer">
              {meta.deploymentUrl}
            </a>
          ) : '—'}
          {meta.vercelUrl ? (
            <>
              {' '}
              • <strong>Vercel:</strong>{' '}
              <a style={styles.link} href={meta.vercelUrl} target="_blank" rel="noreferrer">
                {meta.vercelUrl}
              </a>
            </>
          ) : null}
          {meta.deploymentState ? ` • ${meta.deploymentState}` : ''}
        </div>
        <div>
          Snapshot fetched {formatDateTime(meta.fetchedAt)} • Rendered {formatDateTime(renderedAt)}
        </div>
        {metaNote ? <div style={styles.metaNote}>{metaNote}</div> : null}
      </div>
    </div>
  );
}
