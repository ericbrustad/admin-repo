// CODEX NOTE: Installs the global bridge (for hiding legacy buttons).
// No global Settings menu is rendered here.
import '../styles/globals.css';
import React from 'react';
import { useRouter } from 'next/router';
import { installGlobalSettingsBridge } from '../lib/settingsBridge';

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

  componentDidMount() {
    // Capture filename/line from runtime error events too
    this._onErr = (e) => {
      try {
        reportClient(e.error || e.message || 'window.error', {
          from: 'window.error',
          filename: e?.filename,
          lineno: e?.lineno,
          colno: e?.colno,
        });
      } catch {}
    };
    this._onRej = (e) => {
      try {
        const reason = e?.reason || 'unhandledrejection';
        reportClient(reason, { from: 'unhandledrejection' });
      } catch {}
    };
    window.addEventListener('error', this._onErr);
    window.addEventListener('unhandledrejection', this._onRej);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this._onErr);
    window.removeEventListener('unhandledrejection', this._onRej);
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

// Client-safe loader for the Map engine.
// If importing the provider throws (e.g., circular import / TDZ), we log and fall back gracefully.
function ClientMapProvider({ children }) {
  const [Impl, setImpl] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('../components/maps/EngineProvider');
        const Cmp = mod.MapEngineProvider || mod.default || React.Fragment;
        if (!cancelled) setImpl(() => Cmp);
      } catch (err) {
        console.error('[EngineProvider import failed]', err);
        reportClient(err, { where: 'EngineProvider dynamic import' });
        if (!cancelled) setImpl(() => React.Fragment); // fallback: render children directly
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const Provider = Impl || React.Fragment;
  return <Provider>{children}</Provider>;
}

export default function App({ Component, pageProps }) {
  const router = useRouter();

  React.useEffect(() => {
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
      <ClientMapProvider>
        <Component {...pageProps} />
      </ClientMapProvider>
    </RootErrorBoundary>
  );
}
