// Global wiring for Admin app with crash capture + client-only map provider + Supabase request logging
import '../styles/globals.css';
import React from 'react';
import { useRouter } from 'next/router';
import { installGlobalSettingsBridge } from '../lib/settingsBridge';

// ---------- client error reporting ----------
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
        reportClient(e?.reason || 'unhandledrejection', { from: 'unhandledrejection' });
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
          <p style={{ marginBottom: 12 }}>A client-side error occurred. It’s been logged.</p>
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

// ---------- map engine provider (client-only safe loader) ----------
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
        if (!cancelled) setImpl(() => React.Fragment);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const Provider = Impl || React.Fragment;
  return <Provider>{children}</Provider>;
}

// ---------- supabase request logger (browser) ----------
function installSupabaseRequestLogger(projectUrl) {
  if (typeof window === 'undefined' || !projectUrl) return () => {};
  try {
    const prefix = String(projectUrl).replace(/\/+$/, '');
    const originalFetch = window.fetch.bind(window);
    const headersToObject = (hdrs) => {
      const out = {};
      try {
        if (!hdrs) return out;
        if (hdrs instanceof Headers) {
          hdrs.forEach((v, k) => {
            out[k] = v;
          });
        } else if (Array.isArray(hdrs)) {
          for (const [k, v] of hdrs) out[k] = v;
        } else if (typeof hdrs === 'object') {
          Object.assign(out, hdrs);
        }
      } catch {}
      return out;
    };
    const redactHeaders = (h) => {
      const out = {};
      for (const k of Object.keys(h)) {
        const low = k.toLowerCase();
        out[k] = low === 'authorization' || low === 'apikey' ? '[REDACTED]' : String(h[k]);
      }
      return out;
    };

    window.fetch = async (input, init = {}) => {
      try {
        const url = typeof input === 'string' ? input : input?.url || '';
        const isSupabase = url && url.startsWith(prefix);
        const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
        if (isSupabase && !url.includes('/api/client-errors')) {
          const rawHeaders = init?.headers || (typeof input === 'object' && input?.headers) || {};
          const safeHeaders = redactHeaders(headersToObject(rawHeaders));
          let body = null;
          if (init?.body) {
            try {
              body = JSON.parse(init.body);
            } catch {
              body = String(init.body);
            }
          }
          const payload = {
            kind: 'supabase-request',
            url,
            path: (() => {
              try {
                return new URL(url).pathname;
              } catch {
                return url;
              }
            })(),
            method,
            headers: safeHeaders,
            body,
          };
          try {
            console.groupCollapsed(`↗️ Supabase ${method} ${payload.path}`);
            console.log(payload);
            console.groupEnd();
          } catch {}
          try {
            fetch('/api/client-errors', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            }).catch(() => {});
          } catch {}
        }
      } catch {}
      return originalFetch(input, init);
    };

    return () => {
      try {
        window.fetch = originalFetch;
      } catch {}
    };
  } catch {
    return () => {};
  }
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

  React.useEffect(() => {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null;
    return installSupabaseRequestLogger(supabaseUrl);
  }, []);

  return (
    <RootErrorBoundary>
      <ClientMapProvider>
        <Component {...pageProps} />
      </ClientMapProvider>
    </RootErrorBoundary>
  );
}
