import React, { useEffect } from 'react';

/**
 * Hides legacy top-left Draft/Published toggle buttons without altering
 * the rest of the UI. Runs on mount in the browser only.
 */
export default function HideLegacyStatusToggles() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    try {
      const headerRoot =
        document.getElementById('AdminHeaderBar') ||
        document.querySelector('[data-ui="headerbar"]');
      const isInHeader = (el) => (headerRoot ? headerRoot.contains(el) : false);

      const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (const el of candidates) {
        if (isInHeader(el)) continue; // never hide new header controls
        const text = (el.textContent || '').trim().toLowerCase();
        if (!text) continue;
        const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
        if (!rect) continue;
        const nearTop = rect.top >= 0 && rect.top < 140;
        const nearLeft = rect.left >= 0 && rect.left < 300;
        const isLegacy = text === 'draft' || text === 'published';
        if (nearTop && nearLeft && isLegacy) {
          el.style.display = 'none';
          el.setAttribute('data-hidden-by', 'HideLegacyStatusToggles');
        }
      }
    } catch (error) {
      console.warn('HideLegacyStatusToggles failed', error);
    }
  }, []);

  return null;
}
