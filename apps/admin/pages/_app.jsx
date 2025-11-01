// CODEX NOTE: Installs the global bridge (for hiding legacy buttons).
// No global Settings menu is rendered here.
import '../styles/globals.css';
import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { installGlobalSettingsBridge } from '../lib/settingsBridge';

// Load map engine on the client only to avoid SSR/hydration crashes
const MapEngineProvider = dynamic(
  () =>
    import('../components/maps/EngineProvider').then(
      (m) => m.MapEngineProvider || m.default
    ),
  { ssr: false }
);

function reportClient(err, info) {
  try {
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: String(err),
        stack: err && err.stack ? String(err.stack) : undefined,
        info,
      }),
    }).catch(() => {});
  } catch {}
}

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportClient(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ padding: 24, fontFamily: 'ui-sans-serif, system-ui' }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ marginBottom: 12 }}>
            A client-side error occurred. It’s been logged.
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              background: '#111',
              color: '#0f0',
              padding: 12,
              borderRadius: 8,
            }}
          >
            {String(this.state.error)}
          </pre>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    let cleanup = () => {};
    try {
      cleanup = installGlobalSettingsBridge(router) || (() => {});
    } catch (err) {
      console.error('[settingsBridge]', err);
      reportClient(err, { where: 'installGlobalSettingsBridge' });
    }
    return () => {
      try {
        cleanup && cleanup();
      } catch (err) {
        console.error('[settingsBridge cleanup]', err);
      }
    };
  }, [router.asPath]);

  return (
    <RootErrorBoundary>
      <MapEngineProvider>
        <Component {...pageProps} />
      </MapEngineProvider>
    </RootErrorBoundary>
  );
}
