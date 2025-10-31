// CODEx note (2025-10-28): Runtime guard that hides legacy "Open ..." buttons anywhere on the page.
// Targets common labels: "Open Default", "Open Published", "Open Game", "Open Games".
import React from 'react';

const MATCHERS = [
  /open\s*default/i,
  /open\s*published/i,
  /open\s*game(?!s?\s*settings)/i,
  /open\s*games/i,
];

function shouldHide(el) {
  if (!el) return false;
  if (el.dataset && el.dataset.esxRole === 'keep-visible') return false;
  const text = (el.textContent || '').trim();
  return MATCHERS.some((rx) => rx.test(text));
}

function hideEl(el) {
  if (!el || el.dataset?.esxHiddenBySettingsMenu === '1') return;
  el.style.display = 'none';
  el.dataset.esxHiddenBySettingsMenu = '1';
}

function sweep(root = document) {
  const candidates = root.querySelectorAll('button, a[role="button"], .btn, .Button, [data-button]');
  for (const el of candidates) {
    if (shouldHide(el)) hideEl(el);
  }
}

export default function HideLegacyButtons() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    // Initial sweep
    sweep(document);
    // Observe future renders
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) sweep(node);
          });
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
