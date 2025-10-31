// CODEX NOTE: Installs the global bridge (for hiding legacy buttons).
// No global Settings menu is rendered here.
import '../styles/globals.css';
import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { installGlobalSettingsBridge } from '../lib/settingsBridge';

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    const cleanup = installGlobalSettingsBridge(router);
    return cleanup;
  }, [router.asPath]);

  return <Component {...pageProps} />;
}
