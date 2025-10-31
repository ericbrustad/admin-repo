import { slugifyLoose } from '../util/slugifyLoose.js';

export async function createNewGame({ title, slug, channel = 'draft', config = {} }) {
  const targetSlug = slugifyLoose(slug || title || 'new-game');
  const safeTitle = title && title.trim() ? title.trim() : targetSlug || 'new-game';
  const normalizedChannel = channel === 'published' ? 'published' : 'draft';

  const snapshot = {
    meta: {
      slug: targetSlug,
      title: safeTitle,
      channel: normalizedChannel,
    },
    data: {
      config: {
        ...(config || {}),
        game: {
          ...(config?.game || {}),
          title: safeTitle,
          slug: targetSlug,
        },
      },
      missions: [],
      devices: [],
    },
  };

  const endpoint = normalizedChannel === 'published'
    ? '/api/games/save-and-publish'
    : '/api/games/save-full';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: targetSlug, channel: normalizedChannel, snapshot }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Failed to create game');
  }

  return targetSlug;
}
