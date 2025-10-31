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

  const persist = async (targetChannel) => {
    const response = await fetch('/api/games/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: targetSlug,
        channel: targetChannel,
        title: safeTitle,
        config: snapshot.data.config,
        suite: snapshot.data.suite,
        snapshot,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const message = payload?.error || `Failed to create game (${response.status})`;
      throw new Error(message);
    }
  };

  await persist('draft');
  if (normalizedChannel === 'published') {
    await persist('published');
  }

  return targetSlug;
}
