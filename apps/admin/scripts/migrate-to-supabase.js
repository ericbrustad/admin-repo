#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

async function loadSupabase() {
  try {
    const mod = await import('../lib/supabase/server.js');
    return mod.supaService();
  } catch (error) {
    throw new Error(`Failed to initialize Supabase client: ${error?.message || error}`);
  }
}

function readJson(filePath, fallback) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

function normalizeSlug(input) {
  const slug = String(input || '').trim();
  if (!slug) return 'default';
  if (slug === 'root' || slug === 'legacy-root') return 'default';
  return slug;
}

async function upsertGame(supa, slug, config, missionsDraft, missionsPublished) {
  const devices = Array.isArray(config?.devices)
    ? config.devices
    : Array.isArray(config?.powerups)
      ? config.powerups
      : [];
  const now = new Date().toISOString();

  const results = await Promise.all([
    supa.from('games').upsert({
      slug,
      title: config?.game?.title || slug,
      status: 'draft',
      theme: config?.appearance || {},
      map: config?.map || {},
      config,
      updated_at: now,
    }),
    supa.from('missions').upsert({
      game_slug: slug,
      channel: 'draft',
      items: missionsDraft,
      updated_at: now,
    }),
    supa.from('missions').upsert({
      game_slug: slug,
      channel: 'published',
      items: missionsPublished,
      updated_at: now,
    }),
    supa.from('devices').upsert({
      game_slug: slug,
      items: devices,
      updated_at: now,
    }),
  ]);

  const failure = results.find((result) => result?.error);
  if (failure && failure.error) {
    throw failure.error;
  }
}

async function main() {
  const supa = await loadSupabase();
  const root = path.join(process.cwd(), 'public', 'games');
  if (!fs.existsSync(root)) {
    console.error('No public/games directory found.');
    return;
  }

  const entries = fs.readdirSync(root);
  for (const entry of entries) {
    const slug = normalizeSlug(entry);
    const baseDir = path.join(root, entry);
    if (!fs.statSync(baseDir).isDirectory()) continue;

    const draftConfig = readJson(path.join(baseDir, 'draft', 'config.json'), readJson(path.join(baseDir, 'config.json'), {}));
    const draftMissions = readJson(path.join(baseDir, 'draft', 'missions.json'), []);
    const publishedMissions = readJson(path.join(baseDir, 'missions.json'), []);

    await upsertGame(supa, slug, draftConfig, Array.isArray(draftMissions?.missions) ? draftMissions.missions : draftMissions, Array.isArray(publishedMissions?.missions) ? publishedMissions.missions : publishedMissions);
    console.log(`Migrated ${slug}`);
  }

  console.log('Migration complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
