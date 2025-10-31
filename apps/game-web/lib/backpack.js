// Simple localStorage-based backpack & progress, now backed by in-memory Maps (“mmaps”).
import {
  cloneBackpackMap,
  createBackpackMap,
  ensureAnswersMap,
  ensurePocket,
  fromBackpackMap,
} from './mmaps';

const SKEY = (slug) => `esx.backpack.${slug || 'default'}`;
const cache = new Map(); // slug -> Map
const listeners = new Map(); // slug -> Set<fn>

function notify(slug) {
  const set = listeners.get(slug);
  if (!set || !set.size) return;
  Array.from(set).forEach((fn) => {
    try { fn(); } catch (err) { console.error('Backpack listener error', err); }
  });
}

function normalize(raw = {}) {
  if (!raw || typeof raw !== 'object') return { points: 0, pockets: {}, answers: {} };
  const pockets = raw.pockets && typeof raw.pockets === 'object' ? raw.pockets : {};
  const answers = raw.answers && typeof raw.answers === 'object' ? raw.answers : {};
  return {
    points: Number.isFinite(Number(raw.points)) ? Number(raw.points) : 0,
    pockets,
    answers,
  };
}

function readRaw(slug) {
  try {
    const stored = localStorage.getItem(SKEY(slug));
    if (!stored) return normalize();
    return normalize(JSON.parse(stored));
  } catch {
    return normalize();
  }
}

function writeRaw(slug, raw) {
  const normalized = normalize(raw);
  localStorage.setItem(SKEY(slug), JSON.stringify(normalized));
  cache.set(slug, createBackpackMap(normalized));
  notify(slug);
}

function ensureMap(slug) {
  if (!cache.has(slug)) {
    cache.set(slug, createBackpackMap(readRaw(slug)));
  }
  return cache.get(slug);
}

function commit(slug) {
  const map = ensureMap(slug);
  const next = fromBackpackMap(map);
  writeRaw(slug, next);
}

export function initBackpack(slug) {
  ensureMap(slug);
  commit(slug);
}

export function getBackpack(slug) {
  return fromBackpackMap(ensureMap(slug));
}

export function getBackpackMap(slug) {
  return cloneBackpackMap(ensureMap(slug));
}

export function onBackpackChange(slug, cb) {
  if (!slug || typeof cb !== 'function') return () => {};
  if (!listeners.has(slug)) listeners.set(slug, new Set());
  const set = listeners.get(slug);
  set.add(cb);
  return () => {
    const bucket = listeners.get(slug);
    if (!bucket) return;
    bucket.delete(cb);
    if (!bucket.size) listeners.delete(slug);
  };
}

export function addPoints(slug, n) {
  const map = ensureMap(slug);
  const current = Number.isFinite(Number(map.get('points'))) ? Number(map.get('points')) : 0;
  map.set('points', current + (Number(n) || 0));
  commit(slug);
  return map.get('points');
}

export function getPoints(slug) {
  const map = ensureMap(slug);
  return Number.isFinite(Number(map.get('points'))) ? Number(map.get('points')) : 0;
}

export function addPhoto(slug, { dataUrl, title }) {
  const map = ensureMap(slug);
  const id = `ph_${Date.now()}`;
  const photos = ensurePocket(map, 'photos');
  photos.unshift({ id, url: dataUrl, title: title || 'Photo', ts: Date.now() });
  commit(slug);
  return id;
}

export function addReward(slug, { key, name, thumbUrl }) {
  const map = ensureMap(slug);
  const id = `rw_${Date.now()}`;
  const rewards = ensurePocket(map, 'rewards');
  rewards.unshift({ id, key, name, thumbUrl, ts: Date.now() });
  commit(slug);
  return id;
}

export function addUtility(slug, { key, name, thumbUrl }) {
  const map = ensureMap(slug);
  const id = `ut_${Date.now()}`;
  const utilities = ensurePocket(map, 'utilities');
  utilities.unshift({ id, key, name, thumbUrl, ts: Date.now() });
  commit(slug);
  return id;
}

export function addClue(slug, text) {
  const map = ensureMap(slug);
  const id = `cl_${Date.now()}`;
  const clues = ensurePocket(map, 'clues');
  clues.unshift({ id, text: String(text || ''), ts: Date.now() });
  commit(slug);
  return id;
}

export function removePocketItem(slug, pocket, id) {
  const map = ensureMap(slug);
  const items = ensurePocket(map, pocket);
  const index = items.findIndex((item) => item && item.id === id);
  if (index >= 0) {
    items.splice(index, 1);
    commit(slug);
  }
}

export function recordAnswer(slug, missionId, { correct, value }) {
  const map = ensureMap(slug);
  const answers = ensureAnswersMap(map);
  answers.set(String(missionId), { correct: !!correct, value, ts: Date.now() });
  commit(slug);
}

export function getProgress(slug) {
  return fromBackpackMap(ensureMap(slug));
}
