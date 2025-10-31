// apps/game-web/lib/mmaps.js
// Lightweight Map helpers (“mmaps”) used to index missions, media, and backpack state.

const DEFAULT_POCKETS = ['photos', 'videos', 'audios', 'rewards', 'utilities', 'clues'];

export function createMissionMap(missions = []) {
  const map = new Map();
  if (!Array.isArray(missions)) return map;
  missions.forEach((mission, index) => {
    if (!mission || typeof mission !== 'object') {
      return;
    }
    const key = mission.id != null && mission.id !== '' ? String(mission.id) : `mission-${index + 1}`;
    map.set(key, { ...mission, id: key });
  });
  return map;
}

export function createMediaIndex(list = [], selectors = []) {
  const items = Array.isArray(list) ? list : [];
  const hooks = Array.isArray(selectors) && selectors.length
    ? selectors
    : [
        (item) => item.key,
        (item) => item.id,
        (item) => item.slug,
        (item) => item.name,
      ];

  const map = new Map();
  items.forEach((item, index) => {
    hooks.forEach((select) => {
      if (typeof select !== 'function') return;
      const candidate = select(item, index);
      if (candidate === undefined || candidate === null || candidate === '') return;
      map.set(String(candidate), item);
    });
  });
  return map;
}

export function createBackpackMap(state = {}) {
  const map = new Map();
  const pockets = state && typeof state === 'object' ? state.pockets || {} : {};
  const answers = state && typeof state === 'object' ? state.answers || {} : {};

  map.set('points', Number.isFinite(Number(state.points)) ? Number(state.points) : 0);

  const keys = new Set([...Object.keys(pockets || {}), ...DEFAULT_POCKETS]);
  keys.forEach((key) => {
    const items = pockets && Array.isArray(pockets[key]) ? pockets[key] : [];
    map.set(key, items.map((item) => (item && typeof item === 'object' ? { ...item } : item))); // shallow clone items
  });

  const answersMap = new Map();
  Object.entries(answers || {}).forEach(([missionId, entry]) => {
    if (!missionId) return;
    const normalized = entry && typeof entry === 'object' ? { ...entry } : { value: entry };
    normalized.correct = Boolean(normalized.correct);
    normalized.ts = Number.isFinite(Number(normalized.ts)) ? Number(normalized.ts) : 0;
    answersMap.set(String(missionId), normalized);
  });
  map.set('answers', answersMap);

  return map;
}

export function ensurePocket(map, pocket) {
  if (!map.has(pocket) || !Array.isArray(map.get(pocket))) {
    map.set(pocket, []);
  }
  return map.get(pocket);
}

export function ensureAnswersMap(map) {
  const existing = map.get('answers');
  if (existing instanceof Map) return existing;
  const next = new Map();
  if (existing && typeof existing === 'object') {
    Object.entries(existing).forEach(([missionId, entry]) => {
      next.set(String(missionId), { ...(entry || {}) });
    });
  }
  map.set('answers', next);
  return next;
}

export function fromBackpackMap(map) {
  const pockets = {};
  map.forEach((value, key) => {
    if (key === 'points' || key === 'answers') return;
    pockets[key] = Array.isArray(value) ? value.map((item) => (item && typeof item === 'object' ? { ...item } : item)) : [];
  });

  const answersMap = map.get('answers');
  const answers = answersMap instanceof Map
    ? Object.fromEntries(
        Array.from(answersMap.entries()).map(([missionId, entry]) => [
          String(missionId),
          {
            correct: Boolean(entry && entry.correct),
            value: entry ? entry.value : undefined,
            ts: Number.isFinite(Number(entry && entry.ts)) ? Number(entry.ts) : 0,
          },
        ]),
      )
    : {};

  return {
    points: Number.isFinite(Number(map.get('points'))) ? Number(map.get('points')) : 0,
    pockets,
    answers,
  };
}

export function cloneBackpackMap(map) {
  return createBackpackMap(fromBackpackMap(map));
}

export const POCKET_KEYS = DEFAULT_POCKETS;
