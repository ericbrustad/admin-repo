// CODEX NOTE: Global bridge so Settings menu actions work on all pages.
export const HIDE_LABELS = new Set([
  'new game',
  'save game',
  'publish game',
  'new draft',
  'open draft',
  'save draft',
  'save & publish draft',
]);

function hideLegacyButtons() {
  try {
    const nodes = document.querySelectorAll('button, [role="button"]');
    nodes.forEach((el) => {
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (HIDE_LABELS.has(txt)) el.style.display = 'none';
    });
  } catch {}
}

export function installGlobalSettingsBridge(router) {
  if (typeof window === 'undefined') return () => {};
  const w = window;

  // 1) Hide legacy buttons (initial + future DOM changes)
  hideLegacyButtons();
  const mo = new MutationObserver(hideLegacyButtons);
  try {
    mo.observe(document.body, { childList: true, subtree: true });
  } catch {}

  // 2) Event handlers
  async function onSavePublish(ev) {
    try {
      const detail = ev?.detail || {};
      const slug = detail.slug || router?.query?.game || 'default';
      await fetch('/api/games/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
    } catch {
      /* swallow */
    }
  }

  function onOpenGame(ev) {
    try {
      const { slug, channel = 'published' } = ev?.detail || {};
      if (!slug) return;
      const query = { ...router.query, game: slug, channel };
      router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
    } catch {
      /* swallow */
    }
  }

  // 3) Attach global listeners
  w.addEventListener('erix:save-publish-game', onSavePublish);
  w.addEventListener('erix:open-game', onOpenGame);
  // Expose for debugging if needed
  w.__esxSettingsBridge = { onSavePublish, onOpenGame };

  // 4) Cleanup on route change / unmount
  return () => {
    try {
      mo.disconnect();
      w.removeEventListener('erix:save-publish-game', onSavePublish);
      w.removeEventListener('erix:open-game', onOpenGame);
      delete w.__esxSettingsBridge;
    } catch {}
  };
}
