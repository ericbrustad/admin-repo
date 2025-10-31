import { useEffect } from 'react';
import '../styles/globals.css';

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    function handleError(event) {
      // eslint-disable-next-line no-console
      console.log('window.onerror:', event.error || event.message || event);
    }

    function handleRejection(event) {
      // eslint-disable-next-line no-console
      console.log('unhandledrejection:', event.reason);
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return <Component {...pageProps} />;
}
