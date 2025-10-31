// Simple localStorage-based backpack & progress, namespaced by slug.
const SKEY = (slug) => `esx.backpack.${slug || 'default'}`;

function read(slug) {
  try { return JSON.parse(localStorage.getItem(SKEY(slug))) || {}; } catch { return {}; }
}
function write(slug, data) {
  localStorage.setItem(SKEY(slug), JSON.stringify(data || {}));
}

export function initBackpack(slug) {
  const cur = read(slug);
  const base = {
    points: 0,
    pockets: {
      photos: [],   // {id, url, title, ts}
      videos: [],   // future
      audios: [],   // future
      rewards: [],  // {id, key, name, thumbUrl, ts}
      utilities: [],// {id, key, name, thumbUrl, ts}
      clues: [],    // {id, text, ts}
    },
    answers: {},    // { [missionId]: { correct, value, ts } }
  };
  write(slug, { ...base, ...cur, pockets: { ...base.pockets, ...(cur.pockets || {}) } });
}

export function getBackpack(slug) { return read(slug); }
export function addPoints(slug, n) {
  const s = read(slug); s.points = (s.points || 0) + (Number(n)||0); write(slug, s); return s.points;
}
export function getPoints(slug) { return (read(slug).points || 0); }

export function addPhoto(slug, { dataUrl, title }) {
  const s = read(slug); const id = `ph_${Date.now()}`;
  s.pockets = s.pockets || {}; s.pockets.photos = s.pockets.photos || [];
  s.pockets.photos.unshift({ id, url: dataUrl, title: title || 'Photo', ts: Date.now() });
  write(slug, s);
  return id;
}
export function addReward(slug, { key, name, thumbUrl }) {
  const s = read(slug); const id = `rw_${Date.now()}`;
  s.pockets.rewards = s.pockets.rewards || [];
  s.pockets.rewards.unshift({ id, key, name, thumbUrl, ts: Date.now() });
  write(slug, s);
  return id;
}
export function addUtility(slug, { key, name, thumbUrl }) {
  const s = read(slug); const id = `ut_${Date.now()}`;
  (s.pockets.utilities = s.pockets.utilities || []).unshift({ id, key, name, thumbUrl, ts: Date.now() });
  write(slug, s);
  return id;
}
export function addClue(slug, text) {
  const s = read(slug); const id = `cl_${Date.now()}`;
  (s.pockets.clues = s.pockets.clues || []).unshift({ id, text: String(text || ''), ts: Date.now() });
  write(slug, s);
  return id;
}
export function removePocketItem(slug, pocket, id) {
  const s = read(slug); const arr = (s.pockets && s.pockets[pocket]) || [];
  const i = arr.findIndex(x => x.id === id); if (i >= 0) arr.splice(i, 1);
  write(slug, s);
}
export function recordAnswer(slug, missionId, { correct, value }) {
  const s = read(slug); s.answers = s.answers || {};
  s.answers[String(missionId)] = { correct: !!correct, value, ts: Date.now() };
  write(slug, s);
}
export function getProgress(slug) { const s = read(slug); return { points: s.points||0, answers: s.answers||{}, pockets: s.pockets||{} }; }
