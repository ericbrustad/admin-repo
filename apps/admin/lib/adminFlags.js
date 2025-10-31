import { useCallback, useEffect, useState } from 'react';

export async function fetchFlags() {
  const res = await fetch('/api/admin/flags', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Unable to load project flags');
  }
  const body = await res.json().catch(() => ({}));
  return body?.flags || {};
}

export async function saveFlags(partial) {
  const res = await fetch('/api/admin/flags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  if (!res.ok) {
    throw new Error('Failed to save flags');
  }
}

export function useAdminFlags() {
  const [flags, setFlags] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const next = await fetchFlags();
      setFlags(next);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }, []);

  const update = useCallback(async (partial) => {
    setBusy(true);
    setError('');
    try {
      await saveFlags(partial);
      setFlags((prev) => ({ ...(prev || {}), ...partial }));
    } catch (err) {
      setError(String(err?.message || err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { flags, busy, error, refresh, update };
}
