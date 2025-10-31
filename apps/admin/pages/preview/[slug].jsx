import Head from 'next/head';

export const getServerSideProps = async ({ params, query }) => {
  const slug = String(params?.slug || '').trim();
  const channel = String(query?.channel || 'draft').toLowerCase() === 'published' ? 'published' : 'draft';
  const originEnv = process.env.NEXT_PUBLIC_GAME_ORIGIN || process.env.GAME_ORIGIN || '';
  const gameOrigin = originEnv.replace(/\/+$/, '');

  const hasSlug = Boolean(slug);
  const hasOrigin = Boolean(gameOrigin);

  let iframeUrl = null;
  if (hasSlug && hasOrigin) {
    const search = new URLSearchParams({ slug, channel, preview: '1' });
    iframeUrl = `${gameOrigin}/?${search.toString()}`;
  }

  return {
    props: {
      slug,
      channel,
      gameOrigin,
      iframeUrl,
    },
  };
};

export default function PreviewPage({ slug, channel, gameOrigin, iframeUrl }) {
  const hasSlug = Boolean(slug);
  const hasOrigin = Boolean(gameOrigin);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0b0c10',
        color: '#e9eef2',
        padding: '32px 24px',
        boxSizing: 'border-box',
      }}
    >
      <Head>
        <title>{slug ? `Preview ${slug}` : 'Preview'}</title>
      </Head>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 4px 0', fontSize: 28 }}>Game Preview</h1>
          <p style={{ margin: 0, color: '#9fb0bf' }}>
            {hasSlug ? `Slug: ${slug}` : 'Provide a slug in the URL to load a game.'}
            {' · '}
            Channel: {channel}
          </p>
        </header>

        {!hasOrigin && (
          <div
            style={{
              background: '#201d2a',
              border: '1px solid #3a3f4b',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              color: '#f5a623',
            }}
          >
            Set <code>NEXT_PUBLIC_GAME_ORIGIN</code> for the Admin project to enable the live preview iframe.
          </div>
        )}

        {iframeUrl ? (
          <iframe
            src={iframeUrl}
            title={`Preview ${slug}`}
            style={{
              width: '100%',
              minHeight: '70vh',
              border: '1px solid #2a323b',
              borderRadius: 16,
              background: '#000',
            }}
            allow="camera; microphone"
          />
        ) : (
          <div
            style={{
              background: '#131722',
              border: '1px dashed #2a323b',
              borderRadius: 16,
              padding: 40,
              textAlign: 'center',
              color: '#9fb0bf',
            }}
          >
            {hasSlug
              ? 'Preview unavailable — configure NEXT_PUBLIC_GAME_ORIGIN to embed the game.'
              : 'Add a slug (e.g. /preview/demo-game) to load the preview.'}
          </div>
        )}

        {hasSlug && hasOrigin && (
          <div style={{ marginTop: 24 }}>
            <a
              href={`${gameOrigin}/${encodeURIComponent(slug)}?channel=${encodeURIComponent(channel)}&preview=1`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                gap: 8,
                alignItems: 'center',
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid #2a323b',
                background: '#1a2027',
                color: '#e9eef2',
                textDecoration: 'none',
              }}
            >
              Open full game window ↗
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
