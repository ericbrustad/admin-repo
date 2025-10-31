import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GamesDropdown from '../components/GamesDropdown';
import HeaderBar from '../components/HeaderBar';
import TestLauncher from '../components/TestLauncher';
import HomeDefaultButtons from '../components/HomeDefaultButtons';
import AnswerResponseEditor from '../components/AnswerResponseEditor';
import InlineMissionResponses from '../components/InlineMissionResponses';
import AssignedMediaTab from '../components/AssignedMediaTab';
import SafeBoundary from '../components/SafeBoundary';
import SavedGamesPicker from '../components/Settings/SavedGamesPicker';
import ProjectFlags from '../components/Settings/ProjectFlags.jsx';
import GlobalLocationSelector from '../components/Settings/GlobalLocationSelector.jsx';
import HideLegacyStatusToggles from '../components/HideLegacyStatusToggles';
import { AppearanceEditor } from '../components/ui-kit';
import {
  normalizeTone,
  appearanceBackgroundStyle,
  defaultAppearance,
  surfaceStylesFromAppearance,
  DEFAULT_APPEARANCE_SKIN,
} from '../lib/admin-shared';
import { GAME_ENABLED } from '../lib/game-switch';
import { createNewGame } from '../lib/games/createNewGame.js';
import { nextMissionId, nextDeviceId } from '../lib/ids.js';
import { updateAllPinsInSnapshot, deriveInitialGeo } from '../lib/geo/updateAllPins.js';
import { getDefaultGeo } from '../lib/geo/defaultGeo.js';

/* ───────────────────────── Helpers ───────────────────────── */
async function fetchJsonSafe(url, fallback) {
  try {
    const r = await fetch(url, { cache: 'no-store', credentials: 'include' });
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes('application/json')) return await r.json();
  } catch {}
  return fallback;
}
async function fetchFirstJson(urls, fallback) {
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: 'no-store', credentials: 'include' });
      const ct = r.headers.get('content-type') || '';
      if (r.ok && ct.includes('application/json')) return await r.json();
    } catch {}
  }
  return fallback;
}
function toDirectMediaURL(u) {
  if (!u) return u;
  try {
    const url = new URL(u, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    const host = url.host.toLowerCase();
    if (host.endsWith('dropbox.com')) {
      url.host = 'dl.dropboxusercontent.com';
      url.searchParams.delete('dl');
      if (!url.searchParams.has('raw')) url.searchParams.set('raw', '1');
      return url.toString();
    }
    if (host.endsWith('drive.google.com')) {
      let id = '';
      if (url.pathname.startsWith('/file/d/')) {
        const parts = url.pathname.split('/');
        id = parts[3] || '';
      } else if (url.pathname === '/open') {
        id = url.searchParams.get('id') || '';
      }
      if (id) return `https://drive.google.com/uc?export=view&id=${id}`;
    }
    return u;
  } catch { return u; }
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function hexToRgb(hex) {
  try {
    const h = hex.replace('#','');
    const b = h.length === 3 ? h.split('').map(ch=>ch+ch).join('') : h;
    const r = parseInt(b.slice(0,2),16), g = parseInt(b.slice(2,4),16), bl = parseInt(b.slice(4,6),16);
    return `${r}, ${g}, ${bl}`;
  } catch { return '0,0,0'; }
}
const EXTS = {
  image: /\.(png|jpg|jpeg|webp|bmp|svg|tif|tiff|avif|heic|heif)$/i,
  gif: /\.(gif)$/i,
  video: /\.(mp4|webm|mov)$/i,
  audio: /\.(mp3|wav|ogg|m4a|aiff|aif)$/i, // include AIFF/AIF
  ar: /\.(glb|gltf|usdz|reality|vrm|fbx|obj)$/i,
};
const COVER_SIZE_LIMIT_BYTES = 5 * 1024 * 1024; // 5 MB limit for cover uploads
const MEDIA_WARNING_BYTES = 5 * 1024 * 1024; // warn when media exceeds 5 MB
const ADMIN_META_INITIAL_STATE = {
  branch: '',
  commit: '',
  owner: '',
  repo: '',
  vercelUrl: '',
  deploymentUrl: '',
  deploymentState: '',
  fetchedAt: '',
  error: '',
  runtime: {
    node: '',
    npm: '',
    npmPath: '',
    corepack: '',
    pinnedNode: '',
    pinnedNpm: '',
    pinnedYarn: '',
    packageManager: '',
    environment: '',
    platform: '',
  },
};
function classifyByExt(u) {
  if (!u) return 'other';
  const s = String(u).toLowerCase();
  if (/\.gitkeep(\?|#|$)/.test(s)) return 'placeholder';
  if (EXTS.gif.test(s)) return 'gif';
  if (EXTS.image.test(s)) return 'image';
  if (EXTS.video.test(s)) return 'video';
  if (EXTS.audio.test(s)) return 'audio';
  if (EXTS.ar.test(s)) return 'ar';
  return 'other';
}

const MEDIA_TYPE_DEFS = [
  { key: 'audio', label: 'Audio', title: 'Audio (mp3/wav/aiff)' },
  { key: 'video', label: 'Video', title: 'Video (mp4/mov)' },
  { key: 'image', label: 'Images', title: 'Images (PNG/JPG/SVG)' },
  { key: 'gif', label: 'GIF', title: 'GIF' },
  { key: 'ar-target', label: 'AR Targets', title: 'AR Targets (markers)' },
  { key: 'ar-overlay', label: 'AR Overlays', title: 'AR Overlays (assets)' },
  { key: 'placeholder', label: 'Placeholders', title: 'Placeholder keep-alive markers (.gitkeep)' },
  { key: 'other', label: 'Other', title: 'Other (unclassified)' },
];

const MEDIA_CLASS_TO_TYPE = {
  audio: 'audio',
  video: 'video',
  image: 'image',
  gif: 'gif',
  ar: 'ar-target',
  placeholder: 'placeholder',
  other: 'other',
};

const FOLDER_TO_TYPE = new Map([
  ['audio', 'audio'],
  ['mediapool/audio', 'audio'],
  ['video', 'video'],
  ['mediapool/video', 'video'],
  ['image', 'image'],
  ['images', 'image'],
  ['mediapool/images', 'image'],
  ['images/icons', 'image'],
  ['mediapool/images/icons', 'image'],
  ['images/covers', 'image'],
  ['mediapool/images/covers', 'image'],
  ['images/bundles', 'image'],
  ['mediapool/images/bundles', 'image'],
  ['images/uploads', 'image'],
  ['mediapool/images/uploads', 'image'],
  ['gif', 'gif'],
  ['gifs', 'gif'],
  ['mediapool/gif', 'gif'],
  ['mediapool/gifs', 'gif'],
  ['ar-target', 'ar-target'],
  ['ar target', 'ar-target'],
  ['mediapool/ar-target', 'ar-target'],
  ['mediapool/ar target', 'ar-target'],
  ['ar-overlay', 'ar-overlay'],
  ['ar overlay', 'ar-overlay'],
  ['mediapool/ar-overlay', 'ar-overlay'],
  ['mediapool/ar overlay', 'ar-overlay'],
  ['other', 'other'],
  ['mediapool/other', 'other'],
]);

/** Merge inventory across dirs so uploads show up everywhere */
async function listInventory(dirs = ['mediapool']) {
  const seen = new Set();
  const out = [];
  const baseDirs = Array.isArray(dirs) && dirs.length ? dirs : ['mediapool'];
  const targets = [];

  const normalize = (value) => String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');

  const ensureMediapool = (value) => {
    const normalized = normalize(value);
    if (!normalized) return '';
    if (normalized.toLowerCase().startsWith('mediapool')) return normalized;
    return `mediapool/${normalized}`;
  };

  const pushTarget = (dir) => {
    const normalized = normalize(dir);
    if (!normalized) return;
    if (/^(draft|public)\//i.test(normalized)) {
      const key = normalized
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join('/')
        .toLowerCase();
      if (!targets.includes(key)) targets.push(key);
      return;
    }
    const mediapoolDir = ensureMediapool(normalized);
    ['public', 'draft'].forEach((channel) => {
      if (!mediapoolDir) return;
      const key = `${channel}/${mediapoolDir}`
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join('/')
        .toLowerCase();
      if (!targets.includes(key)) targets.push(key);
    });
  };

  baseDirs.forEach(pushTarget);

  await Promise.all(
    targets.map(async (dir) => {
      try {
        const r = await fetch(`/api/list-media?dir=${encodeURIComponent(dir)}`, { credentials: 'include', cache: 'no-store' });
        const j = await r.json();
        (j?.items || []).forEach((it = {}) => {
          const key = it.path || it.url || it.id || '';
          if (!key) return;
          if (seen.has(key)) return;
          seen.add(key);
          out.push(it);
        });
      } catch {}
    })
  );

  return out;
}
function baseNameFromUrl(url) {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    const file = (u.pathname.split('/').pop() || '').replace(/\.[^.]+$/, '');
    return file.replace(/[-_]+/g, ' ').trim();
  } catch {
    const file = (String(url).split('/').pop() || '').replace(/\.[^.]+$/, '');
    return file.replace(/[-_]+/g, ' ').trim();
  }
}
function qs(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k,v])=>{
    if (v===undefined || v===null || v==='') return;
    p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}
// compute repo path from /media/... URL
function pathFromUrl(u) {
  try {
    const url = new URL(u, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    const p = url.pathname || '';
    if (p.startsWith('/media/')) return `public${p}`;
    if (p.startsWith('/public/media/')) return p;
  } catch {}
  const s = String(u || '');
  if (s.startsWith('/media/')) return `public${s}`;
  if (s.startsWith('/public/media/')) return s;
  return ''; // external or unknown
}

function formatLocalDateTime(value) {
  if (!value) return '';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

function cloneSnapshot(snapshot) {
  if (!snapshot) return snapshot;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(snapshot); } catch {}
  }
  try {
    return JSON.parse(JSON.stringify(snapshot));
  } catch {
    return snapshot;
  }
}


async function deleteMediaEntry(entry) {
  const payload = (() => {
    if (!entry) return {};
    if (typeof entry === 'string') return { path: entry };
    const body = {};
    if (entry.path) body.path = entry.path;
    if (entry.id) body.id = entry.id;
    if (entry.supabase && entry.supabase.path) {
      body.supabase = {
        bucket: entry.supabase.bucket,
        path: entry.supabase.path,
      };
    }
    if (!body.path && entry.url) {
      const maybePath = pathFromUrl(entry.url);
      if (maybePath) body.path = maybePath;
    }
    return body;
  })();

  if (!payload.path && !(payload.supabase && payload.supabase.path)) {
    return false;
  }

  const endpoints = [
    '/api/media/delete',
    '/api/delete-media',
    '/api/delete',
    '/api/repo-delete',
    '/api/github/delete',
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (r.ok) return true;
    } catch {}
  }
  return false;
}

async function fileToBase64(file) {
  if (!file) return '';
  if (typeof window !== 'undefined' && typeof window.FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const base64 = result.split(',')[1] || '';
          resolve(base64);
        } else {
          reject(new Error('Unable to read file contents'));
        }
      };
      reader.onerror = () => reject(reader.error || new Error('Unable to read file contents'));
      reader.readAsDataURL(file);
    });
  }
  const arrayBuffer = await file.arrayBuffer();
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(arrayBuffer).toString('base64');
  }
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  if (typeof btoa === 'function') return btoa(binary);
  throw new Error('Base64 conversion is not supported in this environment');
}

/* ───────────────────────── Defaults ───────────────────────── */
const PLACEHOLDER_MEDIA = {
  cover: '/media/placeholders/cover.svg',
  icon: '/media/placeholders/icon.svg',
  bundle: '/media/placeholders/bundle.svg',
};

const STARFIELD_DEFAULTS = {
  title: 'Starfield Station Break',
  type: 'Sci-Fi',
  slug: 'starfield-station-break',
  coverImage: PLACEHOLDER_MEDIA.cover,
  tags: ['starfield-station-break', 'default-game'],
};

const DEFAULT_BUNDLES = {
  devices: [
    { key: 'aurora-beacon', name: 'Aurora Beacon', url: PLACEHOLDER_MEDIA.icon },
    { key: 'lumen-halo', name: 'Lumen Halo', url: PLACEHOLDER_MEDIA.icon },
    { key: 'quantum-anchor', name: 'Quantum Anchor', url: PLACEHOLDER_MEDIA.icon },
    { key: 'chrono-switch', name: 'Chrono Switch', url: PLACEHOLDER_MEDIA.icon },
    { key: 'voyager-dial', name: 'Voyager Dial', url: PLACEHOLDER_MEDIA.icon },
  ],
  missions: [
    { key: 'briefing-star', name: 'Briefing Star', url: PLACEHOLDER_MEDIA.icon },
    { key: 'aurora-beacon', name: 'Aurora Beacon', url: PLACEHOLDER_MEDIA.icon },
    { key: 'decoy-glow', name: 'Decoy Glow', url: PLACEHOLDER_MEDIA.icon },
  ],
  rewards: [
    { key: 'evidence', name: 'Evidence', url: PLACEHOLDER_MEDIA.bundle },
    { key: 'clue', name: 'Clue', url: PLACEHOLDER_MEDIA.bundle },
    { key: 'gold-coin', name: 'Gold Coin', url: PLACEHOLDER_MEDIA.bundle },
  ],
};

function applyDefaultIcons(cfg) {
  const next = { ...cfg, icons: { missions:[], devices:[], rewards:[], ...(cfg.icons || {}) } };
  function ensure(kind, arr) {
    const list = [...(next.icons[kind] || [])];
    const keys = new Set(list.map(x => (x.key||'').toLowerCase()));
    for (const it of arr) {
      if (!keys.has((it.key||'').toLowerCase())) list.push({ ...it });
    }
    next.icons[kind] = list;
  }
  ensure('missions', DEFAULT_BUNDLES.missions);
  ensure('devices',  DEFAULT_BUNDLES.devices);
  ensure('rewards',  DEFAULT_BUNDLES.rewards);
  return next;
}

/* ───────────────────────── Constants ───────────────────────── */
const TYPE_FIELDS = {
  multiple_choice: [
    { key:'question', label:'Question', type:'text' },
    { key:'mediaUrl', label:'Image or Video URL (optional)', type:'text', optional: true },
  ],
  short_answer: [
    { key:'question',   label:'Question', type:'text' },
    { key:'answer',     label:'Correct Answer', type:'text' },
    { key:'acceptable', label:'Also Accept (comma-separated)', type:'text', optional: true },
    { key:'mediaUrl',   label:'Image or Video URL (optional)', type:'text', optional: true },
  ],
  statement: [
    { key:'text',     label:'Statement Text', type:'multiline' },
    { key:'mediaUrl', label:'Image or Video URL (optional)', type:'text', optional: true },
  ],
  video: [
    { key:'videoUrl',   label:'Video URL (https)', type:'text' },
    { key:'overlayText',label:'Overlay Text (optional)', type:'text', optional: true },
  ],
  geofence_image: [
    { key:'lat', label:'Latitude', type:'number' },
    { key:'lng', label:'Longitude', type:'number' },
    { key:'radiusMeters',    label:'Geofence Radius (m)', type:'number', min:5, max:500 },
    { key:'cooldownSeconds', label:'Cooldown (sec)', type:'number', min:5, max:240 },
    { key:'imageUrl',  label:'Image URL (https)', type:'text' },
    { key:'overlayText',label:'Caption/Text', type:'text', optional: true },
  ],
  geofence_video: [
    { key:'lat', label:'Latitude', type:'number' },
    { key:'lng', label:'Longitude', type:'number' },
    { key:'radiusMeters',    label:'Geofence Radius (m)', type:'number', min:5, max:500 },
    { key:'cooldownSeconds', label:'Cooldown (sec)', type:'number', min:5, max:240 },
    { key:'videoUrl',  label:'Video URL (https)', type:'text' },
    { key:'overlayText',label:'Overlay Text (optional)', type:'text', optional: true },
  ],
  ar_image: [
    { key:'markerUrl', label:'AR Marker Image URL (png/jpg)', type:'text' },
    { key:'assetUrl',  label:'AR Overlay Image URL (png/jpg)', type:'text' },
    { key:'overlayText',label:'Overlay Text (optional)', type:'text', optional: true },
  ],
  ar_video: [
    { key:'markerUrl', label:'AR Marker Image URL (png/jpg)', type:'text' },
    { key:'assetUrl',  label:'AR Video URL (mp4)', type:'text' },
    { key:'overlayText',label:'Overlay Text (optional)', type:'text', optional: true },
  ],
  stored_statement: [
    { key:'template', label:'Template Text (use #mXX# to insert answers)', type:'multiline' },
  ],
};
const TYPE_LABELS = {
  multiple_choice:  'Multiple Choice',
  short_answer:     'Question (Short Answer)',
  statement:        'Statement',
  video:            'Video',
  geofence_image:   'Geo Fence Image',
  geofence_video:   'Geo Fence Video',
  ar_image:         'AR Image',
  ar_video:         'AR Video',
  stored_statement: 'Stored Statement',
};

const GAME_TYPES = ['Mystery','Chase','Race','Thriller','Hunt'];
const DEVICE_TYPES = [
  { value:'smoke',  label:'Smoke (hide on GPS)' },
  { value:'clone',  label:'Clone (decoy location)' },
  { value:'jammer', label:'Signal Jammer (blackout radius)' },
];
const DEFAULT_TRIGGER_CONFIG = {
  enabled: false,
  actionType: 'media',
  actionTarget: '',
  actionLabel: '',
  actionThumbnail: '',
  triggerDeviceId: '',
  triggerDeviceLabel: '',
  triggeredResponseKey: '',
  triggeredMissionId: '',
};
function sanitizeTriggerConfig(input = {}) {
  const src = input || {};
  const validType = ['media', 'devices', 'missions'].includes(src.actionType) ? src.actionType : 'media';
  return {
    enabled: !!src.enabled,
    actionType: validType,
    actionTarget: src.actionTarget || '',
    actionLabel: src.actionLabel || '',
    actionThumbnail: src.actionThumbnail || '',
    triggerDeviceId: src.triggerDeviceId || '',
    triggerDeviceLabel: src.triggerDeviceLabel || '',
    triggeredResponseKey: src.triggeredResponseKey || '',
    triggeredMissionId: src.triggeredMissionId || '',
  };
}
function mergeTriggerState(current, partial = {}) {
  return { ...DEFAULT_TRIGGER_CONFIG, ...(current || {}), ...(partial || {}) };
}
function createDeviceDraft(overrides = {}) {
  const base = {
    title: '',
    type: 'smoke',
    iconKey: '',
    pickupRadius: 100,
    effectSeconds: 120,
    lat: null,
    lng: null,
    trigger: { ...DEFAULT_TRIGGER_CONFIG },
  };
  const merged = { ...base, ...overrides };
  merged.trigger = { ...DEFAULT_TRIGGER_CONFIG, ...(overrides.trigger || merged.trigger || {}) };
  return merged;
}
const BASE_UI_THEME = {
  headerBg: 'linear-gradient(135deg, rgba(226, 234, 247, 0.92), rgba(197, 210, 232, 0.88))',
  headerBorder: '1px solid rgba(99, 127, 170, 0.38)',
  headerShadow: '0 32px 64px rgba(28, 52, 84, 0.35)',
  headerBlur: 'blur(18px)',
  headerFrameBg: 'linear-gradient(145deg, rgba(236, 243, 255, 0.9), rgba(206, 218, 240, 0.85))',
  headerFrameBorder: '1px solid rgba(120, 150, 190, 0.4)',
  headerFrameShadow: '0 18px 32px rgba(62, 99, 149, 0.35)',
  tabBg: 'linear-gradient(135deg, rgba(228, 236, 250, 0.82), rgba(203, 214, 236, 0.78))',
  tabActiveBg: 'linear-gradient(140deg, #2563eb, #60a5fa)',
  buttonBg: 'linear-gradient(135deg, rgba(217, 228, 245, 0.9), rgba(188, 205, 232, 0.86))',
  buttonBorder: '1px solid rgba(99, 127, 170, 0.45)',
  glassSheen: '0 14px 30px rgba(54, 83, 137, 0.25)',
  borderSoft: 'rgba(120, 150, 190, 0.38)',
  chipBg: 'rgba(120, 150, 190, 0.2)',
  chipBorder: '1px solid rgba(120, 150, 190, 0.35)',
  linkColor: '#2563eb',
  accent: '#2563eb',
  dangerBg: 'linear-gradient(135deg, rgba(190, 41, 41, 0.9), rgba(239, 68, 68, 0.9))',
  dangerBorder: '1px solid rgba(248, 113, 113, 0.78)',
  successBg: 'linear-gradient(135deg, rgba(20, 122, 75, 0.95), rgba(34, 197, 94, 0.95))',
  successBorder: '1px solid rgba(52, 211, 153, 0.78)',
  saveGradient: 'linear-gradient(95deg, #2563eb, #38bdf8)',
  saveBorder: '1px solid rgba(59, 130, 246, 0.6)',
  saveShadow: '0 20px 36px rgba(37, 99, 235, 0.45)',
};

function createUiTheme(overrides = {}) {
  return { ...BASE_UI_THEME, ...overrides };
}

const DEFAULT_UI_THEME = createUiTheme();

const APPEARANCE_SKINS = [
  {
    key: 'default',
    label: 'Default Control',
    description: 'Neutral chrome-lite mission console with woven fabric texture.',
    uiKey: 'default',
    appearance: {
      ...defaultAppearance(),
      fontColor: '#1f2a35',
      textBgColor: '#f4f8fb',
      textBgOpacity: 0.76,
      screenBgColor: '#dbe4f1',
      screenBgOpacity: 0.45,
      screenBgImage: '/media/skins/control-fabric.svg',
      screenBgImageEnabled: true,
      textAlign: 'left',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(135deg, rgba(234, 240, 251, 0.94), rgba(204, 216, 234, 0.9))',
      headerBorder: '1px solid rgba(116, 144, 186, 0.45)',
      headerShadow: '0 34px 62px rgba(45, 75, 120, 0.32)',
      headerFrameBg: 'linear-gradient(145deg, rgba(242, 247, 255, 0.95), rgba(214, 224, 241, 0.88))',
      headerFrameBorder: '1px solid rgba(128, 156, 204, 0.45)',
      headerFrameShadow: '0 20px 34px rgba(72, 104, 154, 0.32)',
      tabBg: 'linear-gradient(135deg, rgba(228, 235, 249, 0.86), rgba(202, 214, 236, 0.82))',
      buttonBg: 'linear-gradient(135deg, rgba(222, 232, 247, 0.92), rgba(193, 207, 232, 0.88))',
      buttonBorder: '1px solid rgba(128, 156, 204, 0.45)',
      glassSheen: '0 14px 34px rgba(66, 98, 150, 0.26)',
      borderSoft: 'rgba(138, 162, 206, 0.38)',
      chipBg: 'rgba(138, 162, 206, 0.2)',
      chipBorder: '1px solid rgba(138, 162, 206, 0.35)',
      saveGradient: 'linear-gradient(100deg, #2563eb, #60a5fa)',
      saveBorder: '1px solid rgba(116, 144, 186, 0.6)',
      saveShadow: '0 20px 36px rgba(68, 104, 160, 0.32)',
    }),
  },
  {
    key: 'space-military',
    label: 'Space Military Command',
    description: 'Jet cockpit chrome and brushed metal HUD piping.',
    uiKey: 'space-military',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Orbitron", "Rajdhani", "Segoe UI", sans-serif',
      fontSizePx: 26,
      fontColor: '#14253a',
      textBgColor: '#f3f8ff',
      textBgOpacity: 0.7,
      screenBgColor: '#d6e2f2',
      screenBgOpacity: 0.5,
      screenBgImage: '/media/skins/space-metal.svg',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(140deg, rgba(9, 18, 32, 0.96), rgba(26, 48, 74, 0.88))',
      headerBorder: '1px solid rgba(68, 112, 178, 0.55)',
      headerShadow: '0 42px 72px rgba(5, 12, 24, 0.68)',
      headerFrameBg: 'linear-gradient(150deg, rgba(12, 26, 44, 0.96), rgba(32, 60, 96, 0.88))',
      headerFrameBorder: '1px solid rgba(82, 140, 210, 0.65)',
      headerFrameShadow: '0 24px 36px rgba(10, 24, 48, 0.62)',
      tabBg: 'linear-gradient(135deg, rgba(16, 32, 54, 0.86), rgba(34, 60, 94, 0.86))',
      tabActiveBg: 'linear-gradient(145deg, #0ea5e9, #38bdf8)',
      buttonBg: 'linear-gradient(135deg, rgba(12, 28, 48, 0.92), rgba(28, 52, 86, 0.88))',
      buttonBorder: '1px solid rgba(64, 116, 188, 0.62)',
      glassSheen: '0 18px 40px rgba(6, 20, 36, 0.6)',
      borderSoft: 'rgba(64, 100, 148, 0.5)',
      chipBg: 'rgba(56, 101, 162, 0.28)',
      chipBorder: '1px solid rgba(66, 118, 188, 0.48)',
      linkColor: '#7dd3fc',
      accent: '#38bdf8',
      saveGradient: 'linear-gradient(115deg, #0ea5e9, #38bdf8)',
      saveBorder: '1px solid rgba(64, 130, 200, 0.7)',
      saveShadow: '0 24px 40px rgba(12, 40, 78, 0.6)',
    }),
  },
  {
    key: 'military-desert',
    label: 'Desert Ops',
    description: 'Sun-baked armor plating with sandy cactus silhouettes.',
    uiKey: 'military-desert',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Copperplate", "Trebuchet MS", "Segoe UI", sans-serif',
      fontSizePx: 24,
      fontColor: '#3b2a16',
      textBgColor: '#fff4de',
      textBgOpacity: 0.76,
      screenBgColor: '#f1ddbc',
      screenBgOpacity: 0.55,
      screenBgImage: '/media/skins/desert-canvas.svg',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(130deg, rgba(248, 231, 196, 0.94), rgba(224, 193, 141, 0.9))',
      headerBorder: '1px solid rgba(148, 110, 68, 0.52)',
      headerShadow: '0 38px 68px rgba(107, 82, 45, 0.4)',
      headerFrameBg: 'linear-gradient(150deg, rgba(245, 220, 180, 0.92), rgba(229, 197, 152, 0.86))',
      headerFrameBorder: '1px solid rgba(168, 128, 72, 0.55)',
      headerFrameShadow: '0 20px 32px rgba(122, 82, 40, 0.42)',
      tabBg: 'linear-gradient(135deg, rgba(242, 214, 168, 0.86), rgba(228, 190, 132, 0.82))',
      tabActiveBg: 'linear-gradient(140deg, #d97706, #fbbf24)',
      buttonBg: 'linear-gradient(135deg, rgba(243, 215, 170, 0.9), rgba(227, 189, 128, 0.86))',
      buttonBorder: '1px solid rgba(182, 134, 72, 0.55)',
      glassSheen: '0 16px 34px rgba(182, 121, 54, 0.32)',
      borderSoft: 'rgba(182, 134, 72, 0.42)',
      chipBg: 'rgba(214, 162, 90, 0.24)',
      chipBorder: '1px solid rgba(184, 132, 68, 0.45)',
      linkColor: '#b45309',
      accent: '#d97706',
      saveGradient: 'linear-gradient(110deg, #b45309, #f97316)',
      saveBorder: '1px solid rgba(210, 140, 80, 0.55)',
      saveShadow: '0 20px 32px rgba(182, 120, 58, 0.4)',
    }),
  },
  {
    key: 'forest-outpost',
    label: 'Forest Outpost',
    description: 'Leaf canopy, wood grain, and moss-lit control glass.',
    uiKey: 'forest-outpost',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Merriweather Sans", "Gill Sans", "Segoe UI", sans-serif',
      fontSizePx: 24,
      fontColor: '#1f2d1f',
      textBgColor: '#edf8e6',
      textBgOpacity: 0.74,
      screenBgColor: '#d4ebcc',
      screenBgOpacity: 0.54,
      screenBgImage: '/media/skins/forest-foliage.svg',
      screenBgImageEnabled: true,
      textAlign: 'left',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(135deg, rgba(36, 64, 46, 0.92), rgba(20, 42, 28, 0.9))',
      headerBorder: '1px solid rgba(56, 102, 74, 0.48)',
      headerShadow: '0 40px 70px rgba(12, 30, 20, 0.55)',
      headerFrameBg: 'linear-gradient(150deg, rgba(32, 58, 42, 0.94), rgba(18, 40, 28, 0.88))',
      headerFrameBorder: '1px solid rgba(72, 122, 92, 0.55)',
      headerFrameShadow: '0 22px 34px rgba(12, 30, 20, 0.5)',
      tabBg: 'linear-gradient(135deg, rgba(44, 80, 56, 0.86), rgba(28, 60, 38, 0.84))',
      tabActiveBg: 'linear-gradient(140deg, #16a34a, #4ade80)',
      buttonBg: 'linear-gradient(135deg, rgba(38, 74, 48, 0.9), rgba(24, 52, 32, 0.88))',
      buttonBorder: '1px solid rgba(66, 122, 88, 0.55)',
      glassSheen: '0 18px 36px rgba(12, 36, 22, 0.5)',
      borderSoft: 'rgba(76, 128, 96, 0.46)',
      chipBg: 'rgba(74, 122, 94, 0.28)',
      chipBorder: '1px solid rgba(74, 122, 94, 0.45)',
      linkColor: '#34d399',
      accent: '#22c55e',
      saveGradient: 'linear-gradient(120deg, #16a34a, #4ade80)',
      saveBorder: '1px solid rgba(52, 140, 96, 0.6)',
      saveShadow: '0 24px 38px rgba(14, 44, 24, 0.55)',
    }),
  },
  {
    key: 'starfield',
    label: 'Starfield Observatory',
    description: 'Soft starfield glass with nebula shimmer and chrome trim.',
    uiKey: 'starfield',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Exo 2", "Segoe UI", sans-serif',
      fontSizePx: 22,
      fontColor: '#1f2648',
      textBgColor: '#eef1ff',
      textBgOpacity: 0.7,
      screenBgColor: '#d7def6',
      screenBgOpacity: 0.5,
      screenBgImage: '/media/skins/starfield-soft.svg',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(27, 33, 68, 0.94), rgba(18, 26, 58, 0.9))',
      headerBorder: '1px solid rgba(90, 112, 198, 0.55)',
      headerShadow: '0 42px 74px rgba(10, 14, 38, 0.58)',
      headerFrameBg: 'linear-gradient(150deg, rgba(36, 44, 88, 0.96), rgba(24, 30, 64, 0.92))',
      headerFrameBorder: '1px solid rgba(108, 132, 220, 0.58)',
      headerFrameShadow: '0 24px 38px rgba(14, 18, 48, 0.54)',
      tabBg: 'linear-gradient(135deg, rgba(34, 44, 88, 0.85), rgba(22, 30, 68, 0.83))',
      tabActiveBg: 'linear-gradient(145deg, #6366f1, #38bdf8)',
      buttonBg: 'linear-gradient(135deg, rgba(28, 36, 78, 0.92), rgba(18, 26, 62, 0.9))',
      buttonBorder: '1px solid rgba(104, 132, 220, 0.58)',
      glassSheen: '0 18px 38px rgba(12, 16, 42, 0.55)',
      borderSoft: 'rgba(104, 132, 220, 0.46)',
      chipBg: 'rgba(104, 132, 220, 0.26)',
      chipBorder: '1px solid rgba(104, 132, 220, 0.45)',
      linkColor: '#93c5fd',
      accent: '#6366f1',
      saveGradient: 'linear-gradient(115deg, #4c51bf, #38bdf8)',
      saveBorder: '1px solid rgba(108, 132, 220, 0.6)',
      saveShadow: '0 24px 40px rgba(18, 24, 68, 0.58)',
    }),
  },
  {
    key: 'cartoon-bubbles',
    label: 'Cartoon Bubbles',
    description: 'High-def balloons, candy gloss, and playful fonts.',
    uiKey: 'cartoon-bubbles',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Baloo 2", "Comic Sans MS", "Segoe UI", sans-serif',
      fontSizePx: 28,
      fontColor: '#4b2c6c',
      textBgColor: '#fff1ff',
      textBgOpacity: 0.68,
      screenBgColor: '#f2dfff',
      screenBgOpacity: 0.55,
      screenBgImage: '/media/skins/cartoon-balloons.svg',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(140deg, rgba(255, 229, 255, 0.94), rgba(240, 205, 255, 0.9))',
      headerBorder: '1px solid rgba(171, 119, 206, 0.5)',
      headerShadow: '0 34px 64px rgba(120, 64, 160, 0.32)',
      headerFrameBg: 'linear-gradient(150deg, rgba(255, 235, 255, 0.95), rgba(245, 210, 255, 0.88))',
      headerFrameBorder: '1px solid rgba(190, 132, 220, 0.5)',
      headerFrameShadow: '0 22px 34px rgba(140, 82, 190, 0.32)',
      tabBg: 'linear-gradient(135deg, rgba(250, 228, 255, 0.88), rgba(238, 206, 255, 0.84))',
      tabActiveBg: 'linear-gradient(140deg, #d946ef, #f472b6)',
      buttonBg: 'linear-gradient(135deg, rgba(255, 224, 240, 0.92), rgba(250, 200, 216, 0.88))',
      buttonBorder: '1px solid rgba(232, 132, 168, 0.48)',
      glassSheen: '0 16px 34px rgba(232, 96, 160, 0.28)',
      borderSoft: 'rgba(232, 140, 170, 0.42)',
      chipBg: 'rgba(238, 162, 186, 0.26)',
      chipBorder: '1px solid rgba(232, 140, 170, 0.42)',
      linkColor: '#ec4899',
      accent: '#d946ef',
      saveGradient: 'linear-gradient(120deg, #d946ef, #f472b6)',
      saveBorder: '1px solid rgba(236, 134, 170, 0.55)',
      saveShadow: '0 20px 34px rgba(220, 96, 146, 0.32)',
    }),
  },
  {
    key: 'chrome-luminous',
    label: 'Chrome Luminous',
    description: 'Polished steel, holo accents, and vaporwave magenta trims.',
    uiKey: 'chrome-luminous',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Titillium Web", "Segoe UI", sans-serif',
      fontSizePx: 24,
      fontColor: '#1b1d2a',
      textBgColor: '#f5f6ff',
      textBgOpacity: 0.7,
      screenBgColor: '#dfe2f3',
      screenBgOpacity: 0.52,
      screenBgImage: '/media/skins/chrome-luminous.svg',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(36, 34, 68, 0.95), rgba(18, 18, 44, 0.92))',
      headerBorder: '1px solid rgba(138, 120, 220, 0.55)',
      headerShadow: '0 42px 72px rgba(14, 12, 36, 0.6)',
      headerFrameBg: 'linear-gradient(155deg, rgba(52, 48, 102, 0.96), rgba(28, 26, 64, 0.9))',
      headerFrameBorder: '1px solid rgba(168, 150, 240, 0.58)',
      headerFrameShadow: '0 24px 38px rgba(22, 20, 58, 0.56)',
      tabBg: 'linear-gradient(140deg, rgba(46, 42, 92, 0.9), rgba(28, 26, 64, 0.88))',
      tabActiveBg: 'linear-gradient(145deg, #a855f7, #f97316)',
      buttonBg: 'linear-gradient(140deg, rgba(42, 38, 88, 0.94), rgba(26, 24, 62, 0.9))',
      buttonBorder: '1px solid rgba(156, 138, 240, 0.55)',
      glassSheen: '0 20px 40px rgba(20, 18, 58, 0.6)',
      borderSoft: 'rgba(156, 138, 240, 0.42)',
      chipBg: 'rgba(168, 150, 248, 0.28)',
      chipBorder: '1px solid rgba(156, 138, 240, 0.45)',
      linkColor: '#a855f7',
      accent: '#f97316',
      saveGradient: 'linear-gradient(125deg, #a855f7, #f97316)',
      saveBorder: '1px solid rgba(176, 152, 248, 0.58)',
      saveShadow: '0 24px 38px rgba(32, 24, 74, 0.56)',
    }),
  },
  {
    key: 'desert-horizon',
    label: 'Desert Horizon',
    description: 'Golden hour dunes with warm canyon rimlight.',
    uiKey: 'desert-horizon',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Nunito", "Segoe UI", sans-serif',
      fontSizePx: 24,
      fontColor: '#372210',
      textBgColor: '#fff6eb',
      textBgOpacity: 0.74,
      screenBgColor: '#f3d6b8',
      screenBgOpacity: 0.52,
      screenBgImage: '/media/skins/desert-horizon.svg',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(140deg, rgba(255, 224, 196, 0.94), rgba(240, 180, 120, 0.9))',
      headerBorder: '1px solid rgba(206, 140, 76, 0.5)',
      headerShadow: '0 38px 66px rgba(150, 92, 44, 0.36)',
      headerFrameBg: 'linear-gradient(150deg, rgba(255, 232, 204, 0.94), rgba(246, 196, 138, 0.86))',
      headerFrameBorder: '1px solid rgba(210, 148, 84, 0.52)',
      headerFrameShadow: '0 20px 32px rgba(160, 102, 48, 0.38)',
      tabBg: 'linear-gradient(135deg, rgba(253, 226, 198, 0.88), rgba(244, 200, 150, 0.82))',
      tabActiveBg: 'linear-gradient(140deg, #f97316, #fbbf24)',
      buttonBg: 'linear-gradient(135deg, rgba(252, 222, 192, 0.9), rgba(244, 196, 138, 0.86))',
      buttonBorder: '1px solid rgba(214, 154, 86, 0.52)',
      glassSheen: '0 18px 34px rgba(204, 126, 54, 0.28)',
      borderSoft: 'rgba(204, 138, 74, 0.4)',
      chipBg: 'rgba(216, 160, 88, 0.26)',
      chipBorder: '1px solid rgba(204, 138, 74, 0.42)',
      linkColor: '#c2410c',
      accent: '#f97316',
      saveGradient: 'linear-gradient(120deg, #f97316, #fbbf24)',
      saveBorder: '1px solid rgba(224, 156, 80, 0.5)',
      saveShadow: '0 20px 32px rgba(204, 128, 60, 0.36)',
    }),
  },
  {
    key: 'forest-meadow',
    label: 'Forest Meadow',
    description: 'Sunlit forest clearing with dew-lit petals and lens flare.',
    uiKey: 'forest-meadow',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Merriweather", "Segoe UI", serif',
      fontSizePx: 24,
      fontColor: '#1f2b1a',
      textBgColor: '#f0faeb',
      textBgOpacity: 0.74,
      screenBgColor: '#d6efd0',
      screenBgOpacity: 0.5,
      screenBgImage: '/media/skins/forest-meadow.svg',
      screenBgImageEnabled: true,
      textAlign: 'left',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(140deg, rgba(180, 232, 180, 0.94), rgba(142, 200, 152, 0.9))',
      headerBorder: '1px solid rgba(96, 156, 112, 0.5)',
      headerShadow: '0 38px 66px rgba(48, 96, 68, 0.34)',
      headerFrameBg: 'linear-gradient(150deg, rgba(194, 238, 194, 0.94), rgba(156, 206, 162, 0.88))',
      headerFrameBorder: '1px solid rgba(108, 164, 120, 0.5)',
      headerFrameShadow: '0 22px 34px rgba(62, 118, 82, 0.32)',
      tabBg: 'linear-gradient(135deg, rgba(200, 240, 200, 0.88), rgba(164, 212, 168, 0.84))',
      tabActiveBg: 'linear-gradient(140deg, #22c55e, #a3e635)',
      buttonBg: 'linear-gradient(135deg, rgba(198, 238, 198, 0.92), rgba(158, 208, 162, 0.88))',
      buttonBorder: '1px solid rgba(110, 168, 120, 0.5)',
      glassSheen: '0 18px 34px rgba(84, 148, 94, 0.3)',
      borderSoft: 'rgba(116, 180, 128, 0.42)',
      chipBg: 'rgba(132, 192, 140, 0.26)',
      chipBorder: '1px solid rgba(122, 176, 132, 0.42)',
      linkColor: '#16a34a',
      accent: '#22c55e',
      saveGradient: 'linear-gradient(120deg, #22c55e, #84cc16)',
      saveBorder: '1px solid rgba(128, 188, 120, 0.5)',
      saveShadow: '0 20px 32px rgba(92, 148, 84, 0.3)',
    }),
  },
  {
    key: 'starfield-dawn',
    label: 'Starfield Dawn',
    description: 'Lavender nebula glass with chrome rails and early starlight.',
    uiKey: 'starfield-dawn',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Exo 2", "Segoe UI", sans-serif',
      fontSizePx: 23,
      fontColor: '#262a58',
      textBgColor: '#f4f0ff',
      textBgOpacity: 0.7,
      screenBgColor: '#e0dcfa',
      screenBgOpacity: 0.46,
      screenBgImage: '/media/skins/starfield-dawn.svg',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(222, 209, 255, 0.94), rgba(192, 178, 246, 0.9))',
      headerBorder: '1px solid rgba(142, 116, 208, 0.5)',
      headerShadow: '0 40px 68px rgba(94, 72, 168, 0.38)',
      headerFrameBg: 'linear-gradient(155deg, rgba(232, 220, 255, 0.95), rgba(204, 190, 248, 0.9))',
      headerFrameBorder: '1px solid rgba(156, 132, 216, 0.5)',
      headerFrameShadow: '0 22px 36px rgba(104, 82, 176, 0.38)',
      tabBg: 'linear-gradient(135deg, rgba(230, 218, 255, 0.88), rgba(204, 190, 246, 0.84))',
      tabActiveBg: 'linear-gradient(140deg, #7c3aed, #f472b6)',
      buttonBg: 'linear-gradient(135deg, rgba(226, 214, 255, 0.92), rgba(202, 188, 246, 0.88))',
      buttonBorder: '1px solid rgba(156, 132, 216, 0.5)',
      glassSheen: '0 18px 38px rgba(128, 96, 198, 0.32)',
      borderSoft: 'rgba(156, 132, 216, 0.42)',
      chipBg: 'rgba(176, 150, 224, 0.26)',
      chipBorder: '1px solid rgba(156, 132, 216, 0.44)',
      linkColor: '#a855f7',
      accent: '#7c3aed',
      saveGradient: 'linear-gradient(120deg, #7c3aed, #f472b6)',
      saveBorder: '1px solid rgba(162, 132, 224, 0.55)',
      saveShadow: '0 22px 36px rgba(118, 88, 196, 0.36)',
    }),
  },
  {
    key: 'cartoon-parade',
    label: 'Cartoon Parade',
    description: 'High-energy balloons, confetti piping, and carnival gloss.',
    uiKey: 'cartoon-parade',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Baloo 2", "Comic Sans MS", "Segoe UI", sans-serif',
      fontSizePx: 30,
      fontColor: '#4a256a',
      textBgColor: '#fff4ff',
      textBgOpacity: 0.7,
      screenBgColor: '#f7e4ff',
      screenBgOpacity: 0.52,
      screenBgImage: '/media/skins/cartoon-parade.svg',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(140deg, rgba(255, 224, 244, 0.94), rgba(255, 200, 214, 0.9))',
      headerBorder: '1px solid rgba(220, 110, 150, 0.5)',
      headerShadow: '0 34px 60px rgba(200, 80, 130, 0.32)',
      headerFrameBg: 'linear-gradient(155deg, rgba(255, 232, 248, 0.95), rgba(252, 208, 220, 0.88))',
      headerFrameBorder: '1px solid rgba(224, 126, 160, 0.48)',
      headerFrameShadow: '0 20px 32px rgba(210, 90, 148, 0.3)',
      tabBg: 'linear-gradient(135deg, rgba(255, 226, 242, 0.86), rgba(253, 204, 220, 0.82))',
      tabActiveBg: 'linear-gradient(145deg, #f97316, #ec4899)',
      buttonBg: 'linear-gradient(135deg, rgba(255, 224, 240, 0.92), rgba(250, 200, 216, 0.88))',
      buttonBorder: '1px solid rgba(232, 132, 168, 0.48)',
      glassSheen: '0 16px 34px rgba(232, 96, 160, 0.28)',
      borderSoft: 'rgba(232, 140, 170, 0.42)',
      chipBg: 'rgba(238, 162, 186, 0.26)',
      chipBorder: '1px solid rgba(232, 140, 170, 0.42)',
      linkColor: '#ec4899',
      accent: '#f97316',
      saveGradient: 'linear-gradient(120deg, #f97316, #ec4899)',
      saveBorder: '1px solid rgba(236, 134, 170, 0.55)',
      saveShadow: '0 20px 34px rgba(220, 96, 146, 0.32)',
    }),
  },
  {
    key: 'arctic-lab',
    label: 'Arctic Lab',
    description: 'Glacial glass, mint piping, and frosted chrome instrumentation.',
    uiKey: 'arctic-lab',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Titillium Web", "Segoe UI", sans-serif',
      fontSizePx: 24,
      fontColor: '#133246',
      textBgColor: '#f2fbff',
      textBgOpacity: 0.72,
      screenBgColor: '#d5eef5',
      screenBgOpacity: 0.45,
      screenBgImage: '/media/skins/arctic-lab.svg',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(145deg, rgba(210, 240, 252, 0.94), rgba(178, 224, 244, 0.9))',
      headerBorder: '1px solid rgba(88, 150, 190, 0.48)',
      headerShadow: '0 36px 64px rgba(46, 100, 132, 0.32)',
      headerFrameBg: 'linear-gradient(155deg, rgba(220, 244, 255, 0.95), rgba(190, 230, 246, 0.9))',
      headerFrameBorder: '1px solid rgba(104, 170, 206, 0.48)',
      headerFrameShadow: '0 22px 34px rgba(52, 112, 146, 0.34)',
      tabBg: 'linear-gradient(135deg, rgba(214, 240, 252, 0.86), rgba(184, 226, 244, 0.82))',
      tabActiveBg: 'linear-gradient(140deg, #06b6d4, #38bdf8)',
      buttonBg: 'linear-gradient(135deg, rgba(210, 236, 250, 0.92), rgba(184, 220, 240, 0.88))',
      buttonBorder: '1px solid rgba(108, 180, 214, 0.48)',
      glassSheen: '0 18px 36px rgba(46, 120, 152, 0.3)',
      borderSoft: 'rgba(108, 180, 214, 0.42)',
      chipBg: 'rgba(124, 192, 220, 0.24)',
      chipBorder: '1px solid rgba(108, 180, 214, 0.42)',
      linkColor: '#06b6d4',
      accent: '#06b6d4',
      saveGradient: 'linear-gradient(120deg, #06b6d4, #38bdf8)',
      saveBorder: '1px solid rgba(116, 188, 220, 0.55)',
      saveShadow: '0 22px 36px rgba(64, 132, 168, 0.32)',
    }),
  },
  {
    key: 'ocean-tides',
    label: 'Ocean Tides',
    description: 'Cerulean surf with rolling wave foam and sunlit spray.',
    uiKey: 'ocean-tides',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Work Sans", "Segoe UI", sans-serif',
      fontSizePx: 24,
      fontColor: '#0d2a3f',
      textBgColor: '#e6f6ff',
      textBgOpacity: 0.72,
      screenBgColor: '#ccecff',
      screenBgOpacity: 0.52,
      screenBgImage: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(12, 54, 92, 0.95), rgba(22, 92, 128, 0.88))',
      headerBorder: '1px solid rgba(74, 166, 214, 0.55)',
      headerShadow: '0 40px 72px rgba(8, 30, 48, 0.52)',
      headerFrameBg: 'linear-gradient(150deg, rgba(16, 74, 118, 0.94), rgba(24, 102, 148, 0.88))',
      headerFrameBorder: '1px solid rgba(90, 180, 224, 0.58)',
      headerFrameShadow: '0 24px 38px rgba(10, 42, 68, 0.48)',
      tabBg: 'linear-gradient(135deg, rgba(20, 94, 142, 0.86), rgba(16, 72, 118, 0.84))',
      tabActiveBg: 'linear-gradient(140deg, #0ea5e9, #22d3ee)',
      buttonBg: 'linear-gradient(135deg, rgba(18, 82, 126, 0.92), rgba(14, 66, 108, 0.88))',
      buttonBorder: '1px solid rgba(78, 170, 220, 0.55)',
      glassSheen: '0 18px 38px rgba(10, 54, 88, 0.45)',
      borderSoft: 'rgba(90, 174, 220, 0.48)',
      chipBg: 'rgba(94, 188, 236, 0.28)',
      chipBorder: '1px solid rgba(90, 174, 220, 0.44)',
      linkColor: '#38bdf8',
      accent: '#0ea5e9',
      saveGradient: 'linear-gradient(120deg, #0ea5e9, #22d3ee)',
      saveBorder: '1px solid rgba(90, 178, 226, 0.55)',
      saveShadow: '0 22px 36px rgba(12, 70, 110, 0.42)',
    }),
  },
  {
    key: 'winter-frost',
    label: 'Winter Frostfall',
    description: 'Aurora glass, crystalline snowfields, and frosted steel rails.',
    uiKey: 'winter-frost',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Work Sans", "Segoe UI", sans-serif',
      fontSizePx: 24,
      fontColor: '#0b1f33',
      textBgColor: '#e5f2ff',
      textBgOpacity: 0.78,
      screenBgColor: '#cfe3f8',
      screenBgOpacity: 0.62,
      screenBgImage: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
      textShadow: '0 4px 12px rgba(9, 25, 46, 0.45)',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(15, 35, 58, 0.94), rgba(26, 70, 105, 0.9))',
      headerBorder: '1px solid rgba(148, 197, 255, 0.58)',
      headerShadow: '0 42px 72px rgba(7, 18, 32, 0.55)',
      headerFrameBg: 'linear-gradient(155deg, rgba(22, 52, 82, 0.94), rgba(32, 78, 114, 0.9))',
      headerFrameBorder: '1px solid rgba(164, 210, 255, 0.6)',
      headerFrameShadow: '0 24px 38px rgba(6, 18, 32, 0.5)',
      tabBg: 'linear-gradient(135deg, rgba(26, 68, 104, 0.88), rgba(20, 52, 82, 0.86))',
      tabActiveBg: 'linear-gradient(145deg, #38bdf8, #a855f7)',
      buttonBg: 'linear-gradient(140deg, rgba(24, 60, 90, 0.92), rgba(18, 48, 74, 0.9))',
      buttonBorder: '1px solid rgba(125, 196, 255, 0.55)',
      glassSheen: '0 20px 40px rgba(12, 32, 54, 0.45)',
      borderSoft: 'rgba(148, 197, 255, 0.45)',
      chipBg: 'rgba(148, 197, 255, 0.32)',
      chipBorder: '1px solid rgba(148, 197, 255, 0.5)',
      linkColor: '#38bdf8',
      accent: '#a855f7',
      saveGradient: 'linear-gradient(125deg, #38bdf8, #a855f7)',
      saveBorder: '1px solid rgba(148, 197, 255, 0.58)',
      saveShadow: '0 24px 36px rgba(10, 30, 48, 0.48)',
    }),
  },
  {
    key: 'ghost-fog',
    label: 'Ghost Fog',
    description: 'Moonlit mist, spectral blue haze, and pale chrome frames.',
    uiKey: 'ghost-fog',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Montserrat", "Segoe UI", sans-serif',
      fontSizePx: 23,
      fontColor: '#e5ecff',
      textBgColor: '#101322',
      textBgOpacity: 0.65,
      screenBgColor: '#1b2334',
      screenBgOpacity: 0.62,
      screenBgImage: 'https://images.unsplash.com/photo-1473773508845-188df298d2d1?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'middle',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(12, 18, 32, 0.96), rgba(30, 40, 66, 0.9))',
      headerBorder: '1px solid rgba(116, 148, 216, 0.6)',
      headerShadow: '0 40px 70px rgba(4, 8, 20, 0.6)',
      headerFrameBg: 'linear-gradient(155deg, rgba(18, 26, 46, 0.95), rgba(36, 48, 78, 0.9))',
      headerFrameBorder: '1px solid rgba(130, 160, 224, 0.58)',
      headerFrameShadow: '0 22px 34px rgba(8, 16, 34, 0.52)',
      tabBg: 'linear-gradient(140deg, rgba(26, 36, 58, 0.9), rgba(18, 26, 44, 0.88))',
      tabActiveBg: 'linear-gradient(145deg, #6366f1, #8b5cf6)',
      buttonBg: 'linear-gradient(140deg, rgba(22, 32, 52, 0.92), rgba(16, 24, 40, 0.88))',
      buttonBorder: '1px solid rgba(128, 160, 230, 0.55)',
      glassSheen: '0 18px 36px rgba(12, 20, 40, 0.48)',
      borderSoft: 'rgba(126, 158, 224, 0.45)',
      chipBg: 'rgba(126, 158, 224, 0.32)',
      chipBorder: '1px solid rgba(126, 158, 224, 0.48)',
      linkColor: '#a5b4fc',
      accent: '#6366f1',
      saveGradient: 'linear-gradient(120deg, #6366f1, #8b5cf6)',
      saveBorder: '1px solid rgba(138, 170, 236, 0.55)',
      saveShadow: '0 24px 38px rgba(16, 26, 48, 0.46)',
    }),
  },
  {
    key: 'halloween-midnight',
    label: 'Halloween Midnight',
    description: 'Jack-o-lantern glow with midnight purple fog and bats.',
    uiKey: 'halloween-midnight',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Creepster", "Segoe UI", cursive',
      fontSizePx: 26,
      fontColor: '#ffedd5',
      textBgColor: '#1b0f1d',
      textBgOpacity: 0.7,
      screenBgColor: '#2a1130',
      screenBgOpacity: 0.58,
      screenBgImage: 'https://images.unsplash.com/photo-1508882668657-372ac7f1d1b1?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(44, 12, 56, 0.95), rgba(24, 6, 36, 0.92))',
      headerBorder: '1px solid rgba(208, 112, 38, 0.58)',
      headerShadow: '0 42px 72px rgba(12, 4, 24, 0.6)',
      headerFrameBg: 'linear-gradient(150deg, rgba(52, 16, 68, 0.95), rgba(30, 8, 44, 0.9))',
      headerFrameBorder: '1px solid rgba(232, 140, 62, 0.6)',
      headerFrameShadow: '0 24px 38px rgba(18, 6, 30, 0.54)',
      tabBg: 'linear-gradient(135deg, rgba(46, 18, 62, 0.9), rgba(30, 10, 42, 0.88))',
      tabActiveBg: 'linear-gradient(145deg, #f97316, #facc15)',
      buttonBg: 'linear-gradient(140deg, rgba(52, 18, 70, 0.92), rgba(30, 8, 44, 0.88))',
      buttonBorder: '1px solid rgba(228, 132, 54, 0.58)',
      glassSheen: '0 18px 36px rgba(30, 10, 44, 0.48)',
      borderSoft: 'rgba(232, 146, 66, 0.5)',
      chipBg: 'rgba(248, 168, 68, 0.32)',
      chipBorder: '1px solid rgba(232, 146, 66, 0.48)',
      linkColor: '#fb923c',
      accent: '#f97316',
      saveGradient: 'linear-gradient(125deg, #f97316, #facc15)',
      saveBorder: '1px solid rgba(236, 152, 74, 0.58)',
      saveShadow: '0 24px 36px rgba(24, 6, 32, 0.48)',
    }),
  },
  {
    key: 'holiday-lights',
    label: 'Holiday Lights',
    description: 'Warm cabin lights, evergreen sparkle, and snowfall bokeh.',
    uiKey: 'holiday-lights',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Playfair Display", "Segoe UI", serif',
      fontSizePx: 24,
      fontColor: '#f8fafc',
      textBgColor: '#152016',
      textBgOpacity: 0.72,
      screenBgColor: '#1d2a1f',
      screenBgOpacity: 0.6,
      screenBgImage: 'https://images.unsplash.com/photo-1543584759-1925b76b7073?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(24, 62, 42, 0.96), rgba(18, 44, 32, 0.9))',
      headerBorder: '1px solid rgba(120, 200, 150, 0.6)',
      headerShadow: '0 40px 70px rgba(6, 18, 12, 0.58)',
      headerFrameBg: 'linear-gradient(150deg, rgba(30, 74, 48, 0.95), rgba(22, 56, 36, 0.9))',
      headerFrameBorder: '1px solid rgba(140, 214, 164, 0.6)',
      headerFrameShadow: '0 24px 36px rgba(10, 28, 18, 0.5)',
      tabBg: 'linear-gradient(135deg, rgba(34, 88, 56, 0.9), rgba(24, 62, 38, 0.86))',
      tabActiveBg: 'linear-gradient(145deg, #22c55e, #facc15)',
      buttonBg: 'linear-gradient(140deg, rgba(28, 74, 44, 0.92), rgba(20, 54, 34, 0.88))',
      buttonBorder: '1px solid rgba(144, 216, 172, 0.58)',
      glassSheen: '0 18px 36px rgba(14, 36, 24, 0.46)',
      borderSoft: 'rgba(142, 216, 172, 0.5)',
      chipBg: 'rgba(216, 187, 78, 0.32)',
      chipBorder: '1px solid rgba(216, 187, 78, 0.48)',
      linkColor: '#facc15',
      accent: '#22c55e',
      saveGradient: 'linear-gradient(125deg, #22c55e, #f87171)',
      saveBorder: '1px solid rgba(200, 104, 104, 0.58)',
      saveShadow: '0 24px 34px rgba(12, 28, 20, 0.48)',
    }),
  },
  {
    key: 'valentines-blush',
    label: 'Valentine Blush',
    description: 'Soft rose petals, glowing hearts, and satin ribbon trims.',
    uiKey: 'valentines-blush',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Quicksand", "Segoe UI", sans-serif',
      fontSizePx: 26,
      fontColor: '#4a1f2f',
      textBgColor: '#ffe4ef',
      textBgOpacity: 0.72,
      screenBgColor: '#ffcfe0',
      screenBgOpacity: 0.55,
      screenBgImage: 'https://images.unsplash.com/photo-1519750776000-0fc0d68e7d87?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(255, 208, 224, 0.95), rgba(244, 164, 196, 0.9))',
      headerBorder: '1px solid rgba(214, 120, 150, 0.55)',
      headerShadow: '0 38px 66px rgba(160, 64, 92, 0.32)',
      headerFrameBg: 'linear-gradient(150deg, rgba(255, 216, 228, 0.95), rgba(244, 176, 200, 0.9))',
      headerFrameBorder: '1px solid rgba(226, 132, 170, 0.55)',
      headerFrameShadow: '0 22px 34px rgba(176, 80, 110, 0.34)',
      tabBg: 'linear-gradient(135deg, rgba(255, 212, 226, 0.9), rgba(246, 176, 198, 0.86))',
      tabActiveBg: 'linear-gradient(145deg, #ec4899, #f97316)',
      buttonBg: 'linear-gradient(140deg, rgba(255, 214, 230, 0.92), rgba(246, 180, 202, 0.88))',
      buttonBorder: '1px solid rgba(226, 134, 172, 0.55)',
      glassSheen: '0 18px 34px rgba(196, 82, 120, 0.3)',
      borderSoft: 'rgba(226, 136, 170, 0.44)',
      chipBg: 'rgba(238, 152, 188, 0.3)',
      chipBorder: '1px solid rgba(226, 136, 170, 0.46)',
      linkColor: '#f472b6',
      accent: '#ec4899',
      saveGradient: 'linear-gradient(125deg, #ec4899, #f97316)',
      saveBorder: '1px solid rgba(232, 138, 172, 0.55)',
      saveShadow: '0 22px 34px rgba(172, 70, 106, 0.32)',
    }),
  },
  {
    key: 'freedom-sky',
    label: 'Freedom Sky',
    description: 'Firework bursts with midnight blue sky and flag-inspired trim.',
    uiKey: 'freedom-sky',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Source Sans Pro", "Segoe UI", sans-serif',
      fontSizePx: 24,
      fontColor: '#0f172a',
      textBgColor: '#f8fafc',
      textBgOpacity: 0.76,
      screenBgColor: '#c7d2fe',
      screenBgOpacity: 0.52,
      screenBgImage: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(15, 34, 74, 0.95), rgba(12, 26, 54, 0.92))',
      headerBorder: '1px solid rgba(99, 132, 222, 0.6)',
      headerShadow: '0 42px 72px rgba(8, 16, 36, 0.58)',
      headerFrameBg: 'linear-gradient(155deg, rgba(18, 44, 92, 0.95), rgba(14, 30, 64, 0.9))',
      headerFrameBorder: '1px solid rgba(120, 150, 230, 0.6)',
      headerFrameShadow: '0 24px 38px rgba(10, 20, 46, 0.52)',
      tabBg: 'linear-gradient(135deg, rgba(18, 44, 92, 0.88), rgba(12, 30, 68, 0.86))',
      tabActiveBg: 'linear-gradient(145deg, #ef4444, #3b82f6)',
      buttonBg: 'linear-gradient(140deg, rgba(18, 42, 92, 0.94), rgba(14, 32, 72, 0.9))',
      buttonBorder: '1px solid rgba(132, 160, 236, 0.55)',
      glassSheen: '0 20px 38px rgba(12, 28, 64, 0.5)',
      borderSoft: 'rgba(132, 160, 236, 0.48)',
      chipBg: 'rgba(226, 88, 88, 0.3)',
      chipBorder: '1px solid rgba(226, 88, 88, 0.46)',
      linkColor: '#3b82f6',
      accent: '#ef4444',
      saveGradient: 'linear-gradient(130deg, #ef4444, #3b82f6)',
      saveBorder: '1px solid rgba(204, 112, 112, 0.55)',
      saveShadow: '0 24px 36px rgba(12, 26, 60, 0.46)',
    }),
  },
  {
    key: 'summer-breeze',
    label: 'Summer Breeze',
    description: 'Sun-kissed boardwalks, teal surf, and citrus gradients.',
    uiKey: 'summer-breeze',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Poppins", "Segoe UI", sans-serif',
      fontSizePx: 24,
      fontColor: '#2f1f0f',
      textBgColor: '#fff8eb',
      textBgOpacity: 0.74,
      screenBgColor: '#ffe9c9',
      screenBgOpacity: 0.54,
      screenBgImage: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(140deg, rgba(255, 219, 166, 0.94), rgba(254, 178, 134, 0.9))',
      headerBorder: '1px solid rgba(238, 137, 84, 0.55)',
      headerShadow: '0 36px 64px rgba(188, 92, 48, 0.34)',
      headerFrameBg: 'linear-gradient(145deg, rgba(255, 230, 192, 0.94), rgba(252, 194, 150, 0.9))',
      headerFrameBorder: '1px solid rgba(240, 150, 94, 0.55)',
      headerFrameShadow: '0 22px 32px rgba(192, 102, 52, 0.32)',
      tabBg: 'linear-gradient(135deg, rgba(255, 222, 182, 0.9), rgba(252, 192, 150, 0.86))',
      tabActiveBg: 'linear-gradient(140deg, #f97316, #22d3ee)',
      buttonBg: 'linear-gradient(135deg, rgba(255, 218, 180, 0.92), rgba(252, 196, 146, 0.88))',
      buttonBorder: '1px solid rgba(238, 148, 92, 0.55)',
      glassSheen: '0 18px 32px rgba(208, 112, 58, 0.28)',
      borderSoft: 'rgba(238, 150, 92, 0.42)',
      chipBg: 'rgba(252, 180, 110, 0.28)',
      chipBorder: '1px solid rgba(238, 150, 92, 0.44)',
      linkColor: '#0ea5e9',
      accent: '#f97316',
      saveGradient: 'linear-gradient(125deg, #f97316, #0ea5e9)',
      saveBorder: '1px solid rgba(238, 152, 98, 0.55)',
      saveShadow: '0 22px 34px rgba(184, 94, 52, 0.3)',
    }),
  },
  {
    key: 'st-patricks-glow',
    label: "St. Patrick's Glow",
    description: 'Emerald neon, clover sparkles, and gold-trimmed panels.',
    uiKey: 'st-patricks-glow',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Rubik", "Segoe UI", sans-serif',
      fontSizePx: 24,
      fontColor: '#052e16',
      textBgColor: '#ecfdf5',
      textBgOpacity: 0.74,
      screenBgColor: '#c5f6d6',
      screenBgOpacity: 0.54,
      screenBgImage: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(12, 82, 45, 0.95), rgba(8, 60, 32, 0.9))',
      headerBorder: '1px solid rgba(72, 208, 120, 0.58)',
      headerShadow: '0 40px 70px rgba(6, 28, 16, 0.52)',
      headerFrameBg: 'linear-gradient(150deg, rgba(16, 96, 50, 0.95), rgba(10, 68, 36, 0.9))',
      headerFrameBorder: '1px solid rgba(94, 220, 144, 0.6)',
      headerFrameShadow: '0 24px 36px rgba(6, 34, 18, 0.48)',
      tabBg: 'linear-gradient(135deg, rgba(18, 104, 56, 0.9), rgba(10, 80, 40, 0.88))',
      tabActiveBg: 'linear-gradient(145deg, #22c55e, #facc15)',
      buttonBg: 'linear-gradient(140deg, rgba(18, 96, 52, 0.92), rgba(12, 72, 38, 0.88))',
      buttonBorder: '1px solid rgba(102, 224, 152, 0.58)',
      glassSheen: '0 18px 34px rgba(10, 64, 36, 0.4)',
      borderSoft: 'rgba(110, 228, 156, 0.5)',
      chipBg: 'rgba(244, 208, 80, 0.32)',
      chipBorder: '1px solid rgba(244, 208, 80, 0.48)',
      linkColor: '#22c55e',
      accent: '#facc15',
      saveGradient: 'linear-gradient(125deg, #22c55e, #facc15)',
      saveBorder: '1px solid rgba(180, 200, 80, 0.55)',
      saveShadow: '0 22px 34px rgba(12, 48, 24, 0.4)',
    }),
  },
  {
    key: 'party-neon',
    label: 'Neon Party Pulse',
    description: 'Midnight dance floor with laser lights and confetti glow.',
    uiKey: 'party-neon',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Pacifico", "Segoe UI", cursive',
      fontSizePx: 28,
      fontColor: '#f8fafc',
      textBgColor: '#0f172a',
      textBgOpacity: 0.58,
      screenBgColor: '#0b1120',
      screenBgOpacity: 0.62,
      screenBgImage: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'middle',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(15, 23, 42, 0.96), rgba(76, 29, 149, 0.88))',
      headerBorder: '1px solid rgba(236, 72, 153, 0.58)',
      headerShadow: '0 42px 74px rgba(3, 6, 18, 0.62)',
      headerFrameBg: 'linear-gradient(155deg, rgba(30, 27, 75, 0.95), rgba(59, 7, 100, 0.9))',
      headerFrameBorder: '1px solid rgba(244, 114, 182, 0.6)',
      headerFrameShadow: '0 24px 38px rgba(12, 6, 36, 0.55)',
      tabBg: 'linear-gradient(140deg, rgba(30, 64, 175, 0.92), rgba(67, 56, 202, 0.88))',
      tabActiveBg: 'linear-gradient(145deg, #f472b6, #22d3ee)',
      buttonBg: 'linear-gradient(140deg, rgba(59, 7, 100, 0.92), rgba(67, 56, 202, 0.9))',
      buttonBorder: '1px solid rgba(59, 130, 246, 0.58)',
      glassSheen: '0 20px 40px rgba(14, 11, 60, 0.55)',
      borderSoft: 'rgba(99, 102, 241, 0.5)',
      chipBg: 'rgba(244, 114, 182, 0.28)',
      chipBorder: '1px solid rgba(244, 114, 182, 0.46)',
      linkColor: '#22d3ee',
      accent: '#f472b6',
      saveGradient: 'linear-gradient(130deg, #f472b6, #22d3ee)',
      saveBorder: '1px solid rgba(56, 189, 248, 0.6)',
      saveShadow: '0 26px 42px rgba(12, 18, 48, 0.58)',
    }),
  },
  {
    key: 'canine-companion',
    label: 'Canine Command',
    description: 'Hero dogs on patrol with warm sunset lighting and brass trim.',
    uiKey: 'canine-companion',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Fredoka", "Segoe UI", sans-serif',
      fontSizePx: 26,
      fontColor: '#311b0b',
      textBgColor: '#fff5e1',
      textBgOpacity: 0.72,
      screenBgColor: '#fdeed3',
      screenBgOpacity: 0.54,
      screenBgImage: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'top',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(145deg, rgba(253, 230, 194, 0.95), rgba(250, 204, 170, 0.9))',
      headerBorder: '1px solid rgba(217, 119, 6, 0.55)',
      headerShadow: '0 36px 62px rgba(146, 64, 14, 0.32)',
      headerFrameBg: 'linear-gradient(150deg, rgba(255, 236, 208, 0.95), rgba(250, 214, 182, 0.9))',
      headerFrameBorder: '1px solid rgba(234, 140, 24, 0.55)',
      headerFrameShadow: '0 22px 34px rgba(156, 72, 18, 0.32)',
      tabBg: 'linear-gradient(135deg, rgba(255, 228, 196, 0.9), rgba(250, 206, 164, 0.86))',
      tabActiveBg: 'linear-gradient(145deg, #f97316, #facc15)',
      buttonBg: 'linear-gradient(135deg, rgba(255, 226, 194, 0.92), rgba(248, 200, 154, 0.88))',
      buttonBorder: '1px solid rgba(217, 119, 6, 0.5)',
      glassSheen: '0 18px 32px rgba(194, 82, 12, 0.26)',
      borderSoft: 'rgba(217, 119, 6, 0.42)',
      chipBg: 'rgba(250, 204, 154, 0.28)',
      chipBorder: '1px solid rgba(217, 119, 6, 0.44)',
      linkColor: '#f97316',
      accent: '#d97706',
      saveGradient: 'linear-gradient(125deg, #f97316, #facc15)',
      saveBorder: '1px solid rgba(234, 179, 8, 0.55)',
      saveShadow: '0 22px 34px rgba(156, 72, 18, 0.3)',
    }),
  },
  {
    key: 'feline-lounge',
    label: 'Feline Midnight Lounge',
    description: 'Velvet moonlight with curious cats and aurora backlight.',
    uiKey: 'feline-lounge',
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Kalam", "Segoe UI", cursive',
      fontSizePx: 25,
      fontColor: '#fdf2f8',
      textBgColor: '#312e81',
      textBgOpacity: 0.6,
      screenBgColor: '#1f1b4d',
      screenBgOpacity: 0.64,
      screenBgImage: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=1600&q=80',
      screenBgImageEnabled: true,
      textAlign: 'center',
      textVertical: 'middle',
    },
    ui: createUiTheme({
      headerBg: 'linear-gradient(150deg, rgba(28, 20, 68, 0.96), rgba(17, 24, 66, 0.9))',
      headerBorder: '1px solid rgba(129, 140, 248, 0.58)',
      headerShadow: '0 40px 70px rgba(8, 10, 32, 0.6)',
      headerFrameBg: 'linear-gradient(155deg, rgba(36, 28, 88, 0.95), rgba(20, 24, 78, 0.9))',
      headerFrameBorder: '1px solid rgba(165, 180, 252, 0.58)',
      headerFrameShadow: '0 24px 36px rgba(12, 16, 44, 0.52)',
      tabBg: 'linear-gradient(140deg, rgba(36, 24, 78, 0.9), rgba(24, 20, 68, 0.88))',
      tabActiveBg: 'linear-gradient(145deg, #a855f7, #38bdf8)',
      buttonBg: 'linear-gradient(140deg, rgba(30, 24, 70, 0.94), rgba(20, 18, 58, 0.9))',
      buttonBorder: '1px solid rgba(167, 139, 250, 0.55)',
      glassSheen: '0 20px 38px rgba(16, 14, 54, 0.5)',
      borderSoft: 'rgba(167, 139, 250, 0.46)',
      chipBg: 'rgba(147, 197, 253, 0.28)',
      chipBorder: '1px solid rgba(147, 197, 253, 0.44)',
      linkColor: '#c4b5fd',
      accent: '#a855f7',
      saveGradient: 'linear-gradient(130deg, #a855f7, #38bdf8)',
      saveBorder: '1px solid rgba(165, 180, 252, 0.55)',
      saveShadow: '0 24px 38px rgba(14, 18, 48, 0.5)',
    }),
  },
];

const APPEARANCE_SKIN_MAP = new Map(APPEARANCE_SKINS.map((skin) => [skin.key, skin]));
const ADMIN_SKIN_TO_UI = new Map(APPEARANCE_SKINS.map((skin) => [skin.key, skin.uiKey || skin.key]));
const UI_THEME_MAP = new Map(
  APPEARANCE_SKINS.map((skin) => [skin.uiKey || skin.key, skin.ui || DEFAULT_UI_THEME]),
);
const DEFAULT_SKIN_PRESET = APPEARANCE_SKIN_MAP.get(DEFAULT_APPEARANCE_SKIN);
const DEFAULT_UI_SKIN = ADMIN_SKIN_TO_UI.get(DEFAULT_APPEARANCE_SKIN) || DEFAULT_APPEARANCE_SKIN;

function applyAdminUiThemeForDocument(skinKey, appearance, tone = 'light') {
  if (typeof document === 'undefined') return;
  const body = document.body;
  if (!body) return;
  const root = document.documentElement;
  const uiKey = ADMIN_SKIN_TO_UI.get(skinKey) || DEFAULT_UI_SKIN;
  const normalizedTone = normalizeTone(tone);
  const background = appearanceBackgroundStyle(appearance, normalizedTone);
  const surfaces = surfaceStylesFromAppearance(appearance, normalizedTone);
  const overlay = clamp(Number(appearance?.screenBgOpacity ?? 0), 0, 1);
  const fontSize = clamp(Number(appearance?.fontSizePx ?? 22), 10, 72);
  const fontFamily = appearance?.fontFamily || '';
  const textColor = normalizedTone === 'dark'
    ? '#f4f7ff'
    : (appearance?.fontColor || '#1f2d3a');
  const textBg = `rgba(${hexToRgb(appearance?.textBgColor || '#000000')}, ${clamp(Number(appearance?.textBgOpacity ?? 0), 0, 1)})`;
  const mutedColor = normalizedTone === 'dark'
    ? 'rgba(198, 212, 236, 0.78)'
    : 'rgba(36, 52, 72, 0.68)';
  const inputBg = normalizedTone === 'dark'
    ? `rgba(12, 18, 28, ${clamp(0.78 + overlay * 0.12, 0.72, 0.92)})`
    : `rgba(255, 255, 255, ${clamp(0.88 - overlay * 0.28, 0.55, 0.97)})`;
  const inputBorder = normalizedTone === 'dark'
    ? '1px solid rgba(132, 176, 226, 0.42)'
    : '1px solid rgba(128, 156, 204, 0.42)';
  const buttonColor = normalizedTone === 'dark' ? '#f4f7ff' : '#0e1c2e';
  body.dataset.skin = uiKey;
  body.dataset.tone = normalizedTone;
  body.style.backgroundColor = background.backgroundColor || '';
  body.style.backgroundImage = background.backgroundImage || 'none';
  body.style.backgroundSize = background.backgroundSize || '';
  body.style.backgroundRepeat = background.backgroundRepeat || '';
  body.style.backgroundPosition = background.backgroundPosition || '';
  body.style.backgroundBlendMode = background.backgroundBlendMode || '';
  body.style.setProperty('--appearance-panel-bg', surfaces.panelBg);
  body.style.setProperty('--appearance-panel-border', surfaces.panelBorder);
  body.style.setProperty('--appearance-panel-shadow', surfaces.panelShadow);
  body.style.setProperty('--appearance-piping-opacity', String(surfaces.pipingOpacity));
  body.style.setProperty('--appearance-piping-shadow', surfaces.pipingShadow);
  body.style.setProperty('--appearance-screen-overlay', String(overlay));
  body.style.setProperty('--admin-body-color', textColor);
  body.style.setProperty('--admin-muted', mutedColor);
  body.style.setProperty('--admin-input-bg', inputBg);
  body.style.setProperty('--admin-input-border', inputBorder);
  body.style.setProperty('--admin-input-color', textColor);
  body.style.setProperty('--admin-button-color', buttonColor);
  const uiTheme = UI_THEME_MAP.get(uiKey) || DEFAULT_UI_THEME;
  const themeVariables = {
    '--admin-header-bg': uiTheme.headerBg,
    '--admin-header-border': uiTheme.headerBorder,
    '--admin-header-shadow': uiTheme.headerShadow,
    '--admin-header-blur': uiTheme.headerBlur,
    '--admin-header-frame-bg': uiTheme.headerFrameBg,
    '--admin-header-frame-border': uiTheme.headerFrameBorder,
    '--admin-header-frame-shadow': uiTheme.headerFrameShadow,
    '--admin-tab-bg': uiTheme.tabBg,
    '--admin-tab-active-bg': uiTheme.tabActiveBg,
    '--admin-button-bg': uiTheme.buttonBg,
    '--admin-button-border': uiTheme.buttonBorder,
    '--admin-glass-sheen': uiTheme.glassSheen,
    '--admin-border-soft': uiTheme.borderSoft,
    '--admin-chip-bg': uiTheme.chipBg,
    '--admin-chip-border': uiTheme.chipBorder,
    '--admin-link-color': uiTheme.linkColor,
    '--admin-accent': uiTheme.accent,
    '--admin-danger-bg': uiTheme.dangerBg,
    '--admin-danger-border': uiTheme.dangerBorder,
    '--admin-success-bg': uiTheme.successBg,
    '--admin-success-border': uiTheme.successBorder,
    '--admin-save-gradient': uiTheme.saveGradient,
    '--admin-save-border': uiTheme.saveBorder,
    '--admin-save-shadow': uiTheme.saveShadow,
  };
  Object.entries(themeVariables).forEach(([cssVar, value]) => {
    if (value) body.style.setProperty(cssVar, value);
    else body.style.removeProperty(cssVar);
  });
  if (appearance?.screenBgImage && appearance?.screenBgImageEnabled !== false) {
    body.style.setProperty('--appearance-panel-surface', 'none');
  } else {
    body.style.removeProperty('--appearance-panel-surface');
  }
  body.dataset.panelDepth = appearance?.panelDepth === false ? 'flat' : 'deep';
  if (root) {
    if (fontFamily) root.style.setProperty('--appearance-font-family', fontFamily);
    else root.style.removeProperty('--appearance-font-family');
    root.style.setProperty('--appearance-font-size', `${fontSize}px`);
    root.style.setProperty('--appearance-font-color', textColor);
    root.style.setProperty('--appearance-text-bg', textBg);
  }
}

function isAppearanceEqual(a, b) {
  if (!a || !b) return false;
  const keys = [
    'fontFamily',
    'fontSizePx',
    'fontColor',
    'textBgColor',
    'textBgOpacity',
    'screenBgColor',
    'screenBgOpacity',
    'screenBgImage',
    'screenBgImageEnabled',
    'textAlign',
    'textVertical',
    'panelDepth',
  ];
  return keys.every((key) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' || typeof bv === 'number') {
      return Math.abs(Number(av ?? 0) - Number(bv ?? 0)) < 0.0001;
    }
    return String(av ?? '') === String(bv ?? '');
  });
}
function detectAppearanceSkin(appearance, fallbackKey) {
  if (fallbackKey && APPEARANCE_SKIN_MAP.has(fallbackKey)) {
    const preset = APPEARANCE_SKIN_MAP.get(fallbackKey);
    if (preset && isAppearanceEqual(appearance, preset.appearance)) return fallbackKey;
  }
  for (const skin of APPEARANCE_SKINS) {
    if (isAppearanceEqual(appearance, skin.appearance)) return skin.key;
  }
  return 'custom';
}
const DEFAULT_ICONS = { missions:[], devices:[], rewards:[] };

function normalizeGameMetadata(cfg, slug = '') {
  const base = { ...(cfg || {}) };
  const game = { ...(base.game || {}) };
  const rawTags = Array.isArray(game.tags) ? game.tags : [];
  const cleaned = [];
  const seen = new Set();
  rawTags.forEach((tag) => {
    const str = String(tag || '').trim();
    if (!str) return;
    const key = str.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push(str);
  });
  const normalizedSlug = (slug || '').toString().trim().toLowerCase() || 'default';
  if (!seen.has(normalizedSlug)) {
    cleaned.push(normalizedSlug);
    seen.add(normalizedSlug);
  }
  // Legacy defaults like "default-game" are no longer auto-inserted —
  // keep only the tags explicitly provided by the caller plus the slug itself.
  const normalizedTitle = (game.title || '').toString().trim();
  const normalizedType = (game.type || '').toString().trim();
  const normalizedCover = typeof game.coverImage === 'string' ? game.coverImage.trim() : '';
  const normalizedShort = typeof game.shortDescription === 'string' ? game.shortDescription.trim() : '';
  const normalizedLong = typeof game.longDescription === 'string' ? game.longDescription.trim() : '';
  game.tags = cleaned;
  game.title = normalizedTitle || STARFIELD_DEFAULTS.title;
  game.type = normalizedType || STARFIELD_DEFAULTS.type;
  game.coverImage = normalizedCover || (normalizedSlug === 'default' ? STARFIELD_DEFAULTS.coverImage : '');
  game.shortDescription = normalizedShort;
  game.longDescription = normalizedLong;
  game.slug = normalizedSlug;
  base.game = game;
  return base;
}

function slugifyTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

const DEFAULT_SNAPSHOT_KEY = 'erix.defaultOriginalSnapshot';

/* ───────────────────────── Root ───────────────────────── */
export default function Admin() {
  const [gameEnabled, setGameEnabled] = useState(GAME_ENABLED);
  const [tab, setTab] = useState('missions');

  const [adminMeta, setAdminMeta] = useState(ADMIN_META_INITIAL_STATE);

  const [games, setGames] = useState([]);
  const [activeSlug, setActiveSlug] = useState('default'); // Starfield default stored on legacy root
  const [activeGameMeta, setActiveGameMeta] = useState(null);
  const [gameFlagsBusy, setGameFlagsBusy] = useState(false);
  const [gameFlagsError, setGameFlagsError] = useState('');
  const [showNewGame, setShowNewGame] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('Mystery');
  const [newMode, setNewMode] = useState('single');
  const [newDurationMin, setNewDurationMin] = useState(0);
  const [newAlertMin, setNewAlertMin] = useState(10);
  const [newGameSlug, setNewGameSlug] = useState('');
  const [newGameStatusTone, setNewGameStatusTone] = useState('info');
  const [newShortDesc, setNewShortDesc] = useState('');
  const [newLongDesc, setNewLongDesc] = useState('');
  const [newCoverPreview, setNewCoverPreview] = useState('');
  const [newCoverFile, setNewCoverFile] = useState(null);
  const [newCoverSelectedUrl, setNewCoverSelectedUrl] = useState('');
  const [newCoverOptions, setNewCoverOptions] = useState([]);
  const [newCoverLookupLoading, setNewCoverLookupLoading] = useState(false);
  const [newGameStatus, setNewGameStatus] = useState('');
  const [newGameBusy, setNewGameBusy] = useState(false);
  const [newCoverDropActive, setNewCoverDropActive] = useState(false);
  const newGameChannelDefaultRef = useRef('draft');
  const [newGameChannel, setNewGameChannel] = useState('draft');
  const newGameCoverInputRef = useRef(null);
  const newGameSlugSeed = useRef('');
  const newGameSlugEdited = useRef(false);

  useEffect(() => {
    setGameFlagsError('');
    setGameFlagsBusy(false);
  }, [activeSlug]);

  useEffect(() => {
    if (!activeGameMeta) {
      setGameEnabled(true);
      return;
    }
    if (typeof activeGameMeta.game_enabled === 'boolean') {
      setGameEnabled(Boolean(activeGameMeta.game_enabled));
    }
    const normalized = activeGameMeta.default_channel === 'published' ? 'published' : 'draft';
    newGameChannelDefaultRef.current = normalized;
    if (!showNewGame) {
      setNewGameChannel(normalized);
    }
  }, [activeGameMeta, showNewGame]);

  const [suite, setSuite] = useState(null);
  const [config, setConfig] = useState(null);
  const [status, setStatusInternal] = useState('');
  const [statusLog, setStatusLog] = useState([]);

  const [missionActionFlash, setMissionActionFlash] = useState(false);
  const [deviceActionFlash, setDeviceActionFlash] = useState(false);
  const [newMissionButtonFlash, setNewMissionButtonFlash] = useState(false);
  const [addDeviceButtonFlash, setAddDeviceButtonFlash] = useState(false);
  const missionFlashTimeout = useRef(null);
  const deviceFlashTimeout = useRef(null);
  const missionButtonTimeout = useRef(null);
  const deviceButtonTimeout = useRef(null);
  const initialConversationLoggedRef = useRef(false);

  const logConversation = useCallback((speaker, text) => {
    if (!text) return;
    setStatusLog((prev) => {
      const entry = { speaker, text, timestamp: new Date().toISOString() };
      const next = [...prev, entry];
      return next.slice(-20);
    });
  }, []);

  useEffect(() => {
    if (initialConversationLoggedRef.current) return;
    [
      {
        speaker: 'You',
        text: 'Swapped the repo over to Yarn workspaces so builds no longer depend on pnpm/Corepack.',
      },
      {
        speaker: 'GPT',
        text: 'Rewired the admin and game build scripts to Yarn workspace commands and confirmed local Next.js binaries are still available when installs fail.',
      },
      {
        speaker: 'You',
        text: 'Converted the Supabase entry point to JSX so Next.js stops auto-installing TypeScript packages.',
      },
      {
        speaker: 'GPT',
        text: 'Confirmed Next.js build runs cleanly now that Yarn is no longer invoked for missing types.',
      },
      {
        speaker: 'You',
        text: 'Pinned Volta to Node 22.11.0 and Yarn 4.9.4 so every sandbox step uses the same toolchain.',
      },
      {
        speaker: 'GPT',
        text: 'Tightened the sandbox guard to read the Volta pin, short-circuit on mismatched runtimes, and surface the fix-it tip.',
      },
      {
        speaker: 'You',
        text: 'Captured repo, branch, commit, and Vercel metadata for the settings footer audit strip.',
      },
      {
        speaker: 'GPT',
        text: 'Rendered the footer snapshot with local timestamps so QA can verify deployments at a glance.',
      },
      {
        speaker: 'You',
        text: 'Hooked up Supabase ping, storage list, and signed URL endpoints for the admin toolbox.',
      },
      {
        speaker: 'GPT',
        text: 'Exposed the Supabase health check API trio and a thumbnail viewer so operators can spot media issues quickly.',
      },
      {
        speaker: 'You',
        text: 'Removed the disabled publishing banner from the New Game modal and streamlined the launch button.',
      },
      {
        speaker: 'GPT',
        text: 'Confirmed the New Game dialog now relies on inline status updates without redundant warning chrome.',
      },
      {
        speaker: 'You',
        text: 'Pinned the workspace to Node 22.x so Vercel stops rejecting builds.',
      },
      {
        speaker: 'GPT',
        text: 'Updated package.json and Volta pins mean Vercel detects the supported Node 22 runtime alongside Yarn 4.',
      },
      {
        speaker: 'You',
        text: 'Asked for the Supabase storage list API to surface better debug context when requests fail.',
      },
      {
        speaker: 'GPT',
        text: 'Hardened the storage list handler with guarded JSON parsing and optional base URL echoing when debug mode is toggled.',
      },
    ].forEach(({ speaker, text }) => logConversation(speaker, text));
    initialConversationLoggedRef.current = true;
  }, [logConversation]);

  function updateNewGameStatus(message, tone = 'info') {
    setNewGameStatus(message);
    setNewGameStatusTone(tone);
  }

  function ensureNewGameSlugSeed() {
    if (!newGameSlugSeed.current) {
      newGameSlugSeed.current = Math.random().toString(36).slice(2, 8);
    }
    return newGameSlugSeed.current;
  }

  function buildSuggestedSlug(title) {
    const base = slugifyTitle(title) || 'escape-ride';
    const suffix = ensureNewGameSlugSeed();
    const combined = `${base}-${suffix}`.replace(/-+/g, '-');
    return combined.slice(0, 48);
  }

  const setStatus = useCallback((message) => {
    if (typeof message === 'function') {
      setStatusInternal((prev) => {
        const resolved = message(prev);
        const next = typeof resolved === 'string' ? resolved : '';
        if (next.trim() && next !== prev) logConversation('GPT', next);
        return next;
      });
      return;
    }

    setStatusInternal((prev) => {
      const next = typeof message === 'string' ? message : '';
      if (next.trim() && next !== prev) logConversation('GPT', next);
      return next;
    });
  }, [logConversation]);

  function resetNewGameForm() {
    setNewTitle('');
    setNewType('Mystery');
    setNewMode('single');
    setNewDurationMin(0);
    setNewAlertMin(10);
    setNewGameSlug('');
    newGameSlugSeed.current = '';
    newGameSlugEdited.current = false;
    setNewShortDesc('');
    setNewLongDesc('');
    setNewCoverPreview('');
    setNewCoverFile(null);
    setNewCoverSelectedUrl('');
    setNewCoverOptions([]);
    setNewCoverLookupLoading(false);
    updateNewGameStatus('', 'info');
    setNewGameBusy(false);
    setNewCoverDropActive(false);
    setNewGameChannel(newGameChannelDefaultRef.current);
    if (newGameCoverInputRef.current) newGameCoverInputRef.current.value = '';
  }

  const openNewGameModal = useCallback(() => {
    logConversation('You', 'Opened “Create New Game”');
    const message = gameEnabled
      ? '🛠️ Draft games are editable before you publish.'
      : '⚠️ Game project is disabled. New titles may not sync.';
    updateNewGameStatus(message, gameEnabled ? 'info' : 'danger');
    logConversation('GPT', message);
    setNewGameChannel(newGameChannelDefaultRef.current);
    setShowNewGame(true);
  }, [gameEnabled, logConversation]);

  function handleNewGameModalClose() {
    logConversation('You', 'Closed “Create New Game” dialog');
    setShowNewGame(false);
    resetNewGameForm();
  }

  function clearNewGameCover() {
    setNewCoverPreview('');
    setNewCoverFile(null);
    setNewCoverSelectedUrl('');
  }

  async function handleNewGameCoverFile(file) {
    if (!file) return;
    const safeName = file.name || 'cover';
    const looksLikeImage = (file.type && file.type.startsWith('image/')) || EXTS.image.test(file.name || '');
    if (!looksLikeImage) {
      updateNewGameStatus(`❌ ${safeName} must be an image file.`, 'danger');
      return;
    }
    const sizeBytes = file.size || 0;
    if (sizeBytes > COVER_SIZE_LIMIT_BYTES) {
      const sizeKb = Math.max(1, Math.round(sizeBytes / 1024));
      updateNewGameStatus(`❌ ${safeName} is ${sizeKb} KB — please choose an image under 5 MB.`, 'danger');
      return;
    }
    try {
      const previewUrl = (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function')
        ? URL.createObjectURL(file)
        : '';
      setNewCoverPreview(previewUrl);
      setNewCoverFile(file);
      setNewCoverSelectedUrl('');
      updateNewGameStatus('✅ Cover ready — it will upload when you create the game.', 'success');
    } catch (err) {
      updateNewGameStatus(`❌ Unable to preview ${safeName}`, 'danger');
    }
  }

  async function loadNewCoverOptions() {
    setNewCoverLookupLoading(true);
    try {
      const items = await listInventory(['mediapool']);
      const filtered = (items || []).filter((item) => ['image', 'gif'].includes(item.type));
      setNewCoverOptions(filtered);
      if (!filtered.length) {
        updateNewGameStatus('No reusable covers found yet. Try uploading one.', 'info');
      }
    } catch (err) {
      updateNewGameStatus('❌ Unable to load media pool covers.', 'danger');
      setNewCoverOptions([]);
    } finally {
      setNewCoverLookupLoading(false);
    }
  }

  function applyNewCoverFromUrl(url) {
    if (!url) return;
    const direct = toDirectMediaURL(url);
    setNewCoverSelectedUrl(url);
    setNewCoverPreview(direct);
    setNewCoverFile(null);
    updateNewGameStatus('✅ Using cover from the media pool.', 'success');
  }

  function handleNewGameSlugInput(value) {
    newGameSlugEdited.current = true;
    const sanitized = slugifyTitle(value);
    setNewGameSlug(sanitized);
    logConversation('You', `Edited slug to “${value}”`);
    logConversation('GPT', sanitized
      ? `Slug captured as ${sanitized}.`
      : 'Slug cleared — a new value will be generated when you save.');
  }

  function regenerateNewGameSlug({ resetSeed = false } = {}) {
    if (resetSeed) {
      newGameSlugSeed.current = '';
    }
    newGameSlugEdited.current = false;
    const suggestion = buildSuggestedSlug(newTitle);
    setNewGameSlug(suggestion);
    logConversation('You', 'Regenerated slug suggestion');
    logConversation('GPT', `Suggested slug updated to ${suggestion || 'default'}.`);
  }

  async function handleCreateNewGame() {
    if (newGameBusy) return;
    const title = newTitle.trim();
    logConversation('You', `Attempted to create new game “${title || 'untitled'}”`);
    if (!title) { updateNewGameStatus('❌ Title is required.', 'danger'); return; }

    // build a fresh config for the NEW game; don't mutate current/default
    const slugCandidate = slugifyTitle(newGameSlug);
    const slugInput = (slugCandidate || buildSuggestedSlug(title)).trim().slice(0, 48);
    if (!slugCandidate) {
      newGameSlugEdited.current = false;
      setNewGameSlug(slugInput);
    }

    setNewGameBusy(true);
    const channelLabel = newGameChannel === 'published' ? 'Publishing new game…' : 'Creating draft game…';
    updateNewGameStatus(channelLabel, 'info');

    try {
      let coverPath = newCoverSelectedUrl;
      if (!coverPath && newCoverFile) {
        coverPath = await uploadToRepo(newCoverFile, 'covers');
        if (!coverPath) throw new Error('Cover upload failed');
      }

      const freshConfig = {
        ...defaultConfig(),
        game: {
          ...(defaultConfig().game || {}),
          title,
          type: newType,
          slug: slugInput,
          mode: newMode,
          shortDescription: newShortDesc.trim(),
          longDescription: newLongDesc.trim(),
          coverImage: coverPath || ''
        },
        timer: { durationMinutes: newDurationMin, alertMinutes: newAlertMin },
        appearance: (config?.appearance || defaultAppearance()),
        appearanceSkin: (config?.appearanceSkin || DEFAULT_APPEARANCE_SKIN),
        appearanceTone: (config?.appearanceTone || 'light')
      };

      const createdSlug = await createNewGame({
        title,
        slug: slugInput,
        channel: newGameChannel,
        config: freshConfig,
      });

      // ⚠️ Switch to the NEW game first (prevents writing new slug into default tags)
      setActiveSlug(createdSlug);
      setEditChannel(newGameChannel === 'published' ? 'published' : 'draft');
      setTab('settings');

      // Refresh the Saved Games dropdown
      await reloadGamesList();

      const successLabel = newGameChannel === 'published'
        ? `✅ Created & published “${title}”`
        : `✅ Created draft “${title}”`;
      setStatus(successLabel);
      updateNewGameStatus('✅ Game created! Loading…', 'success');
      handleNewGameModalClose();
    } catch (err) {
      updateNewGameStatus('❌ ' + (err?.message || 'Unable to create game'), 'danger');
    } finally {
      setNewGameBusy(false);
    }
  }



  useEffect(() => {
    if (newGameSlugEdited.current) return;
    const suggestion = buildSuggestedSlug(newTitle);
    setNewGameSlug(suggestion);
  }, [newTitle]);

  useEffect(() => {
    return () => {
      [missionFlashTimeout, deviceFlashTimeout, missionButtonTimeout, deviceButtonTimeout].forEach((ref) => {
        if (ref.current) {
          clearTimeout(ref.current);
          ref.current = null;
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!newCoverPreview) return undefined;
    if (
      newCoverPreview.startsWith('blob:') &&
      typeof URL !== 'undefined' &&
      typeof URL.revokeObjectURL === 'function'
    ) {
      const preview = newCoverPreview;
      return () => {
        try { URL.revokeObjectURL(preview); } catch {}
      };
    }
    return undefined;
  }, [newCoverPreview]);

  const [showRings, setShowRings] = useState(true);
  const [testChannel, setTestChannel] = useState('draft');
  const [editChannel, setEditChannel] = useState('draft');
  const headerStatus = editChannel === 'published' ? 'published' : 'draft';
  const [saveBusy, setSaveBusy] = useState(false);
  const [openGameModal, setOpenGameModal] = useState(false);
  const [gamesIndex, setGamesIndex] = useState({ bySlug: {}, count: 0 });
  const [selected, setSelected] = useState(null);
  const [editing, setEditing]   = useState(null);
  const editingIsNew = useMemo(() => {
    if (!editing) return false;
    return !(suite?.missions || []).some((mission) => mission?.id === editing.id);
  }, [editing, suite]);
  // media inventory for editors
  const [inventory, setInventory] = useState([]);
  const fetchInventory = useCallback(async () => {
    try {
      const items = await listInventory(['mediapool']);
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }, []);
  const syncInventory = useCallback(async () => {
    const items = await fetchInventory();
    setInventory(items);
    return items;
  }, [fetchInventory]);
  useEffect(()=>{
    let mounted = true;
    (async ()=>{
      const items = await fetchInventory();
      if (mounted) setInventory(items);
    })();
    return ()=> { mounted = false; };
  },[fetchInventory]);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      const nowIso = new Date().toISOString();
      try {
        const [metaRes, vercelRes] = await Promise.all([
          fetch('/api/admin-meta', { cache: 'no-store', credentials: 'include' }).catch(() => null),
          fetch('/api/vercel-status?project=game', { cache: 'no-store', credentials: 'include' }).catch(() => null),
        ]);

        const metaJson = metaRes ? await metaRes.json().catch(() => ({})) : {};
        const vercelJson = vercelRes ? await vercelRes.json().catch(() => ({})) : {};

        if (cancelled) return;

        const metaOk = metaJson?.ok !== false;
        const vercelOk = vercelJson?.ok !== false;

        const deploymentUrlRaw = vercelJson?.url || '';
        const deploymentUrl = typeof deploymentUrlRaw === 'string' && deploymentUrlRaw
          ? (deploymentUrlRaw.startsWith('http') ? deploymentUrlRaw : `https://${deploymentUrlRaw}`)
          : '';
        const deploymentState = vercelJson?.state || (vercelJson?.disabled ? 'DISABLED' : '');
        const combinedError = (!metaOk && metaJson?.error)
          || (!vercelOk && (vercelJson?.error || vercelJson?.reason))
          || '';

        setAdminMeta((prev) => {
          const base = { ...ADMIN_META_INITIAL_STATE, ...(prev || {}) };
          return {
            ...base,
            branch: metaOk && metaJson?.branch ? metaJson.branch : base.branch,
            commit: metaOk && metaJson?.commit ? metaJson.commit : base.commit,
            owner: metaOk && metaJson?.owner ? metaJson.owner : base.owner,
            repo: metaOk && metaJson?.repo ? metaJson.repo : base.repo,
            vercelUrl: metaOk && metaJson?.vercelUrl ? metaJson.vercelUrl : base.vercelUrl,
            deploymentUrl: deploymentUrl || base.deploymentUrl,
            deploymentState: deploymentState ? String(deploymentState).toUpperCase() : base.deploymentState,
            fetchedAt: nowIso,
            error: combinedError || '',
            runtime: metaOk && metaJson?.runtime
              ? { ...(base.runtime || {}), ...metaJson.runtime }
              : base.runtime,
          };
        });
      } catch (err) {
        if (cancelled) return;
        setAdminMeta((prev) => {
          const base = { ...ADMIN_META_INITIAL_STATE, ...(prev || {}) };
          return {
            ...base,
            fetchedAt: new Date().toISOString(),
            error: 'Unable to load deployment status',
          };
        });
      }
    }

    loadMeta();
    const timer = setInterval(loadMeta, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const refreshGamesIndex = useCallback(async () => {
    try {
      const [draftResponse, publishedResponse] = await Promise.all([
        fetch('/api/games?list=1&channel=draft', { credentials: 'include', cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => ({ ok: false, games: [] })),
        fetch('/api/games?list=1&channel=published', { credentials: 'include', cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => ({ ok: false, games: [] })),
      ]);

      const bySlug = new Map();

      (Array.isArray(draftResponse.games) ? draftResponse.games : []).forEach((game) => {
        const entry = bySlug.get(game.slug) || {};
        entry.draft = game;
        bySlug.set(game.slug, entry);
      });

      (Array.isArray(publishedResponse.games) ? publishedResponse.games : []).forEach((game) => {
        const entry = bySlug.get(game.slug) || {};
        entry.published = game;
        bySlug.set(game.slug, entry);
      });

      setGamesIndex({ bySlug: Object.fromEntries(bySlug), count: bySlug.size });
    } catch {
      // ignore index refresh errors; UI can recover on next attempt
    }
  }, [setGamesIndex]);

  const reloadGamesList = useCallback(async () => {
    if (!gameEnabled) {
      setGames([]);
      setGamesIndex({ bySlug: {}, count: 0 });
      return;
    }
    try {
      const r = await fetch('/api/games?list=1&channel=draft', { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      if (j.ok) setGames(Array.isArray(j.games) ? j.games : []);
    } catch {}
  }, [gameEnabled]);

  useEffect(() => {
    refreshGamesIndex();
  }, [activeSlug]);

  const [uploadStatus, setUploadStatus] = useState('');

  useEffect(() => {
    if (!config) {
      const fallbackAppearance = DEFAULT_SKIN_PRESET?.appearance || defaultAppearance();
      applyAdminUiThemeForDocument(DEFAULT_APPEARANCE_SKIN, fallbackAppearance, 'light');
      return;
    }
    const stored = config.appearanceSkin && ADMIN_SKIN_TO_UI.has(config.appearanceSkin)
      ? config.appearanceSkin
      : null;
    const detected = detectAppearanceSkin(config.appearance, config.appearanceSkin);
    const tone = normalizeTone(config.appearanceTone);
    applyAdminUiThemeForDocument(stored || detected, config.appearance, tone);
  }, [
    config?.appearanceSkin,
    config?.appearance?.fontFamily,
    config?.appearance?.fontSizePx,
    config?.appearance?.fontColor,
    config?.appearance?.textBgColor,
    config?.appearance?.textBgOpacity,
    config?.appearance?.screenBgColor,
    config?.appearance?.screenBgOpacity,
    config?.appearance?.screenBgImage,
    config?.appearance?.screenBgImageEnabled,
    config?.appearance?.textAlign,
    config?.appearance?.textVertical,
    config?.appearance?.panelDepth,
    config?.appearanceTone,
  ]);


  const [dirty, setDirty]       = useState(false);
  const [missionTriggerPicker, setMissionTriggerPicker] = useState('');
  const missionTriggerState = mergeTriggerState(editing?.trigger);
  function updateMissionTrigger(partial) {
    setEditing(cur => {
      if (!cur) return cur;
      return { ...cur, trigger: mergeTriggerState(cur.trigger, partial) };
    });
    setDirty(true);
  }

  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [coverPickerItems, setCoverPickerItems] = useState([]);
  const [coverPickerLoading, setCoverPickerLoading] = useState(false);
  const [coverDropActive, setCoverDropActive] = useState(false);
  const [coverUploadPreview, setCoverUploadPreview] = useState('');
  const [coverUploadTarget, setCoverUploadTarget] = useState('');
  const [missionResponsesError, setMissionResponsesError] = useState(null);
  const [assignedMediaError, setAssignedMediaError] = useState(null);

  const missionResponsesFallback = useCallback(({ error, reset }) => (
    <div style={S.errorPanel}>
      <div style={S.errorPanelTitle}>Mission responses failed to load</div>
      <div style={S.errorPanelMessage}>
        {error?.message || 'An unexpected error occurred while rendering the mission response editor.'}
      </div>
      <div style={S.errorPanelActions}>
        <button
          type="button"
          style={S.button}
          onClick={() => {
            setMissionResponsesError(null);
            reset();
          }}
        >
          Retry
        </button>
      </div>
    </div>
  ), [setMissionResponsesError]);

  useEffect(() => {
    return () => {
      if (
        coverUploadPreview &&
        coverUploadPreview.startsWith('blob:') &&
        typeof URL !== 'undefined' &&
        typeof URL.revokeObjectURL === 'function'
      ) {
        try { URL.revokeObjectURL(coverUploadPreview); } catch {}
      }
    };
  }, [coverUploadPreview]);

  useEffect(() => {
    if (!coverUploadTarget) return;
    const safeNormalize = (value) => {
      try {
        return toDirectMediaURL(value || '');
      } catch {
        return String(value || '');
      }
    };
    const normalizedTarget = safeNormalize(coverUploadTarget);
    const normalizedCurrent = config?.game?.coverImage ? safeNormalize(config.game.coverImage) : '';
    if (normalizedTarget && normalizedCurrent && normalizedTarget === normalizedCurrent) {
      setCoverUploadTarget('');
      setCoverUploadPreview('');
    }
  }, [config?.game?.coverImage, coverUploadTarget]);
  const coverFileInputRef = useRef(null);
  const [gameTagsDraft, setGameTagsDraft] = useState('');

  // selections
  const [selectedDevIdx, setSelectedDevIdx] = useState(null);
  const [selectedMissionIdx, setSelectedMissionIdx] = useState(null);

  // Devices tab
  const [devSearchQ, setDevSearchQ] = useState('');
  const [devSearching, setDevSearching] = useState(false);
  const [devResults, setDevResults] = useState([]);
  const [isDeviceEditorOpen, setIsDeviceEditorOpen] = useState(false);
  const [deviceEditorMode, setDeviceEditorMode] = useState('new');
  const [devDraft, setDevDraft] = useState(() => createDeviceDraft());
  const [devDraftBaseline, setDevDraftBaseline] = useState(() => createDeviceDraft());
  const [deviceTriggerPicker, setDeviceTriggerPicker] = useState('');

  // Pin size (selected)
  const [selectedPinSize, setSelectedPinSize] = useState(28);
  const defaultPinSize = 24;


  // Settings → Region search
  const [mapSearchQ, setMapSearchQ] = useState('');
  const [mapSearching, setMapSearching] = useState(false);
  const [mapResults, setMapResults] = useState([]);

  // Test preview nonce (force iframe reload)
  const [previewNonce, setPreviewNonce] = useState(0);

  // Delete confirm modal
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [overwriteDefaultSnapshot, setOverwriteDefaultSnapshot] = useState(false);
  const [defaultSlug, setDefaultSlug] = useState(() => {
    if (typeof window !== 'undefined' && window.__ERIX__ && window.__ERIX__.defaultSlug) {
      return window.__ERIX__.defaultSlug || 'default';
    }
    return 'default';
  });
  const [defaultSnapshotMeta, setDefaultSnapshotMeta] = useState(null);

  const slugForMeta = (!activeSlug || activeSlug === 'default') ? 'default' : activeSlug;

  const updateDomGameTagsField = useCallback((slugValue) => {
    if (typeof window === 'undefined') return;
    try {
      const doc = window.document;
      if (!doc) return;
      const nextValue = String(slugValue || '').trim();
      if (!nextValue) return;
      const fields = Array.from(doc.querySelectorAll('input,textarea'));
      for (const field of fields) {
        const name = (field.getAttribute('name') || '').toLowerCase();
        const aria = (field.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (field.getAttribute('placeholder') || '').toLowerCase();
        const looksLikeTags = name.includes('tag') || aria.includes('game tags') || placeholder.includes('comma') || placeholder.includes('tag');
        if (!looksLikeTags) continue;
        if (field.value !== nextValue) {
          field.value = nextValue;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
        break;
      }
    } catch {}
  }, []);

  const setActiveTagsToOnly = useCallback((slug) => {
    const raw = String(slug || '').trim();
    if (!raw) return;
    let canonical = raw.toLowerCase();
    setConfig((prev) => {
      if (!prev) return prev;
      const base = { ...prev };
      const nextGame = { ...(base.game || {}), tags: [canonical] };
      const normalizedConfig = normalizeGameMetadata({ ...base, game: nextGame }, canonical);
      const resolvedSlug = (normalizedConfig?.game?.slug || canonical).toString();
      canonical = resolvedSlug;
      if (normalizedConfig && normalizedConfig.game) {
        normalizedConfig.game = {
          ...normalizedConfig.game,
          tags: [resolvedSlug],
        };
      }
      return normalizedConfig;
    });
    const slugForUi = canonical;
    setGameTagsDraft(slugForUi);
    updateDomGameTagsField(slugForUi);
    try {
      if (typeof window !== 'undefined' && window.__ERIX__ && typeof window.__ERIX__.setActiveTags === 'function') {
        window.__ERIX__.setActiveTags([slugForUi]);
      }
    } catch {}
    try {
      if (typeof window !== 'undefined' && window.__ERIX__ && typeof window.__ERIX__.setTagFilter === 'function') {
        window.__ERIX__.setTagFilter([slugForUi]);
      }
    } catch {}
  }, [updateDomGameTagsField]);

  const readDefaultSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return null;
    try {
      return JSON.parse(window.localStorage.getItem(DEFAULT_SNAPSHOT_KEY) || 'null');
    } catch {
      return null;
    }
  }, []);

  const writeDefaultSnapshot = useCallback((snapshot) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DEFAULT_SNAPSHOT_KEY, JSON.stringify(snapshot || null));
    } catch {}
  }, []);

  const cloneForSnapshot = useCallback((value) => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }, []);

  const buildDefaultSnapshotPayload = useCallback(() => {
    if (!config) return null;
    const normalizedSlug = slugForMeta || 'default';
    const payload = {
      slug: normalizedSlug,
      title: config?.game?.title || '',
      channel: headerStatus,
      capturedAt: new Date().toISOString(),
      config: cloneForSnapshot(normalizeGameMetadata({ ...config }, normalizedSlug)),
      suite: cloneForSnapshot({
        version: suite?.version || '0.0.0',
        missions: Array.isArray(suite?.missions) ? suite.missions : [],
      }),
    };
    return payload;
  }, [cloneForSnapshot, config, headerStatus, slugForMeta, suite]);

  const ensureDefaultSnapshotFromState = useCallback(() => {
    if (slugForMeta !== defaultSlug) return;
    const existing = readDefaultSnapshot();
    if (existing) return existing;
    const snapshot = buildDefaultSnapshotPayload();
    if (snapshot) writeDefaultSnapshot(snapshot);
    return snapshot;
  }, [buildDefaultSnapshotPayload, defaultSlug, readDefaultSnapshot, slugForMeta, writeDefaultSnapshot]);

  useEffect(() => {
    const tags = Array.isArray(config?.game?.tags) ? config.game.tags : [];
    setGameTagsDraft(tags.join(', '));
  }, [config?.game?.tags]);

  useEffect(() => {
    if (!config) return;
    const captured = ensureDefaultSnapshotFromState();
    if (captured) setDefaultSnapshotMeta(captured);
  }, [config, ensureDefaultSnapshotFromState]);

  useEffect(() => {
    const fallbackTitle = (!config || !(config.game && config.game.title))
      ? (activeSlug === 'default' ? STARFIELD_DEFAULTS.title : activeSlug || '')
      : '';
    const nextTitle = (config?.game?.title || '').trim() || fallbackTitle;
    setTitleDraft(nextTitle);
  }, [activeSlug, config?.game?.title]);

  useEffect(() => {
    setActiveTagsToOnly(slugForMeta);
  }, [setActiveTagsToOnly, slugForMeta]);

  useEffect(() => {
    const stored = readDefaultSnapshot();
    if (stored) setDefaultSnapshotMeta(stored);
  }, [readDefaultSnapshot]);

  useEffect(() => {
    try {
      const savedSel = localStorage.getItem('selectedPinSize');
      if (savedSel != null) setSelectedPinSize(clamp(Number(savedSel) || 28, 12, 64));
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem('selectedPinSize', String(selectedPinSize)); } catch {} }, [selectedPinSize]);

  const gameBase =
    ((typeof window !== 'undefined'
      ? (window.__GAME_ORIGIN__ || process.env.NEXT_PUBLIC_GAME_ORIGIN)
      : process.env.NEXT_PUBLIC_GAME_ORIGIN) || (config?.gameOrigin) || '');

  const getDevices = () => (config?.devices?.length ? config.devices : (config?.powerups || []));
  const setDevices = (list) => setConfig(prev => ({ ...(prev || {}), devices: list, powerups: list }));

  /* load games */
  useEffect(() => {
    if (!gameEnabled) { setGames([]); return; }
    (async () => {
      try {
        const r = await fetch('/api/games?list=1&channel=draft', { credentials:'include', cache:'no-store' });
        const j = await r.json();
        if (j.ok) setGames(Array.isArray(j.games) ? j.games : []);
      } catch {}
    })();
  }, [gameEnabled]);

  /* load suite/config when slug changes */
  useEffect(() => {
    (async () => {
      try {
        setStatus('Loading…');
        const slugParam = !activeSlug ? 'default' : activeSlug;
        const supaUrl = `/api/load${qs({ slug: slugParam, channel: 'draft' })}`;

        const supaPayload = await fetchJsonSafe(supaUrl, null);

        let missionsSource = null;
        let configSource = null;
        let fallbackUsed = false;

        if (supaPayload && supaPayload.ok) {
          missionsSource = {
            version: supaPayload.game?.config?.version
              || supaPayload.game?.version
              || supaPayload.config?.version
              || '0.0.0',
            missions: Array.isArray(supaPayload.missions) ? supaPayload.missions : [],
          };
          configSource = supaPayload.config || supaPayload.game?.config || {};
        }

        if (!missionsSource || !configSource) {
          fallbackUsed = true;
          const isDefault = !activeSlug || activeSlug === 'default';
          const missionUrls = isDefault
            ? ['/missions.json']
            : [`/games/${encodeURIComponent(activeSlug)}/missions.json`, `/missions.json`];
          const configUrls = isDefault
            ? ['/api/config']
            : [`/api/config${qs({ slug: activeSlug })}`, '/api/config'];
          missionsSource = await fetchFirstJson(missionUrls, { version: '0.0.0', missions: [] });
          configSource = await fetchFirstJson(configUrls, defaultConfig());
        }

        const dc = defaultConfig();
        const missionsList = Array.isArray(missionsSource?.missions) ? missionsSource.missions : [];
        const normalized = {
          ...missionsSource,
          missions: missionsList.map((x) => ({
            ...x,
            appearanceOverrideEnabled: !!x.appearanceOverrideEnabled,
            appearance: { ...defaultAppearance(), ...(x.appearance || {}) },
            correct: x.correct || { mode: 'none' },
            wrong: x.wrong || { mode: 'none' },
            showContinue: x.showContinue !== false,
          })),
        };

        const c0 = { ...configSource };
        let merged = {
          ...dc,
          ...c0,
          game: { ...dc.game, ...(c0.game || {}) },
          splash: { ...dc.splash, ...(c0.splash || {}) },
          timer: { ...dc.timer, ...(c0.timer || {}) },
          devices: Array.isArray(c0.devices)
            ? c0.devices
            : Array.isArray(c0.powerups)
              ? c0.powerups
              : [],
          media: { rewardsPool: [], penaltiesPool: [], ...(c0.media || {}) },
          icons: { ...DEFAULT_ICONS, ...(c0.icons || {}) },
          appearance: {
            ...defaultAppearance(),
            ...dc.appearance,
            ...(c0.appearance || {}),
          },
          map: { ...dc.map, ...(c0.map || {}) },
          geofence: { ...dc.geofence, ...(c0.geofence || {}) },
          mediaTriggers: { ...DEFAULT_TRIGGER_CONFIG, ...(c0.mediaTriggers || {}) },
        };

        const storedSkin = c0.appearanceSkin && ADMIN_SKIN_TO_UI.has(c0.appearanceSkin)
          ? c0.appearanceSkin
          : null;
        merged.appearanceSkin = storedSkin || detectAppearanceSkin(merged.appearance, c0.appearanceSkin);

        merged = applyDefaultIcons(merged);
        merged = normalizeGameMetadata(merged, slugForMeta);

        const supaGame = supaPayload?.game || null;
        if (supaGame) {
          const tagSource = typeof supaGame.tag === 'string'
            ? supaGame.tag
            : typeof supaGame.channel === 'string'
              ? supaGame.channel
              : supaPayload?.channel;
          const normalizedTag = tagSource === 'published' || tagSource === 'live' ? 'published' : 'draft';
          const defaultChannelRaw = typeof supaGame.default_channel === 'string'
            ? supaGame.default_channel
            : typeof supaGame.defaultChannel === 'string'
              ? supaGame.defaultChannel
              : 'draft';
          const normalizedDefaultChannel = defaultChannelRaw === 'published' || defaultChannelRaw === 'live'
            ? 'published'
            : 'draft';
          setActiveGameMeta({
            id: supaGame.id ?? null,
            slug: supaGame.slug ?? slugParam,
            tag: normalizedTag,
            default_channel: normalizedDefaultChannel,
            game_enabled: typeof supaGame.game_enabled === 'boolean'
              ? supaGame.game_enabled
              : true,
            settings: supaGame.settings || {},
          });
        } else {
          const fallbackTagRaw = supaPayload?.channel;
          const fallbackTag = fallbackTagRaw === 'published' || fallbackTagRaw === 'live' ? 'published' : 'draft';
          setActiveGameMeta({
            id: null,
            slug: slugParam,
            tag: fallbackTag,
            default_channel: fallbackTag,
            game_enabled: true,
            settings: {},
          });
        }
        setSuite(normalized);
        setConfig(merged);
        setSelected(null);
        setEditing(null);
        setDirty(false);
        setSelectedDevIdx(null);
        setSelectedMissionIdx(null);
        setStatus(fallbackUsed ? 'Loaded (legacy fallback)' : '');
      } catch (e) {
        setStatus('Load failed: ' + (e?.message || e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlug]);

  function defaultConfig() {
    return {
      splash: { enabled:false, mode:'single' },
      game: {
        title: STARFIELD_DEFAULTS.title,
        type: STARFIELD_DEFAULTS.type,
        tags: [...STARFIELD_DEFAULTS.tags],
        coverImage: STARFIELD_DEFAULTS.coverImage,
      },
      forms:  { players:1 },
      timer:  { durationMinutes:0, alertMinutes:10 },
      textRules: [],
      devices: [], powerups: [],
      media: { rewardsPool:[], penaltiesPool:[] },
      icons: DEFAULT_ICONS,
      appearanceSkin: DEFAULT_APPEARANCE_SKIN,
      appearance: {
        ...defaultAppearance(),
        ...(DEFAULT_SKIN_PRESET?.appearance || {}),
      },
      appearanceTone: 'light',
      mediaTriggers: { ...DEFAULT_TRIGGER_CONFIG },
      map: { centerLat: 44.9778, centerLng: -93.2650, defaultZoom: 13 },
      geofence: { mode: 'test' },
    };
  }
  function getPreferredLocation() {
    let stored = null;
    try { stored = getDefaultGeo(); } catch {}
    const fallbackLat = config?.map?.centerLat;
    const fallbackLng = config?.map?.centerLng;
    const latCandidate = stored?.lat ?? fallbackLat ?? 44.9778;
    const lngCandidate = stored?.lng ?? fallbackLng ?? -93.265;
    const lat = Number(latCandidate);
    const lng = Number(lngCandidate);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return { lat: 44.9778, lng: -93.265 };
  }
  function defaultContentForType(t) {
    const base = { geofenceEnabled:false, lat:'', lng:'', radiusMeters:25, cooldownSeconds:30 };
    switch (t) {
      case 'multiple_choice': return { question:'', choices:[], correctIndex:undefined, mediaUrl:'', ...base };
      case 'short_answer':    return { question:'', answer:'', acceptable:'', mediaUrl:'', ...base };
      case 'statement':       return { text:'', mediaUrl:'', ...base };
      case 'video':           return { videoUrl:'', overlayText:'', ...base };
      case 'geofence_image':  return { lat:'', lng:'', radiusMeters:25, cooldownSeconds:30, imageUrl:'', overlayText:'' };
      case 'geofence_video':  return { lat:'', lng:'', radiusMeters:25, cooldownSeconds:30, videoUrl:'', overlayText:'' };
      case 'ar_image':        return { markerUrl:'', assetUrl:'', overlayText:'', ...base };
      case 'ar_video':        return { markerUrl:'', assetUrl:'', overlayText:'', ...base };
      case 'stored_statement':return { template:'' };
      default:                return { ...base };
    }
  }

  /* ── API helpers respecting Default Game (legacy root) ── */
  function isDefaultSlug(slug) { return !slug || slug === 'default'; }

  async function saveAllWithSlug(slug, channel = 'draft') {
    if (!suite || !config) return false;
    const normalizedChannel = String(channel || 'draft').toLowerCase() === 'published' ? 'published' : 'draft';
    setStatus((prev) => {
      if (typeof prev === 'string') {
        const lower = prev.toLowerCase();
        if (lower.includes('publishing') || lower.includes('saving')) return prev;
      }
      return 'Saving…';
    });
    const isDefault = isDefaultSlug(slug);
    const slugTag = isDefault ? 'default' : slug;
    const preparedConfig = normalizeGameMetadata(config, slugTag);
    if (preparedConfig !== config) setConfig(preparedConfig);

    const supaPayload = {
      slug,
      channel: normalizedChannel,
      config: preparedConfig,
      missions: suite?.missions || [],
      devices: getDevices(),
    };

    const attemptSupabase = async () => {
      const response = await fetch(`/api/games?channel=${encodeURIComponent(normalizedChannel)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(supaPayload),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || 'supabase save failed');
    };

    const bundleUrl = isDefault ? '/api/save-bundle' : `/api/save-bundle${qs({ slug })}`;
    const attemptBundle = async () => {
      const response = await fetch(bundleUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ missions: suite, config: preparedConfig }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || 'save failed');
    };

    const attemptLegacy = async () => {
      const slugQuery = isDefault ? '' : qs({ slug });
      const missionsUrl = isDefault ? '/api/save' : `/api/save${slugQuery}`;
      const configUrl = isDefault ? '/api/save-config' : `/api/save-config${slugQuery}`;

      const missionsRes = await fetch(missionsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ missions: suite }),
      });
      const missionsText = await missionsRes.text();
      if (!missionsRes.ok) throw new Error(missionsText || 'save missions failed');

      const configRes = await fetch(configUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config: preparedConfig }),
      });
      const configText = await configRes.text();
      if (!configRes.ok) throw new Error(configText || 'save config failed');
    };

    try {
      await attemptSupabase();
      setStatus('✅ Saved');
      return true;
    } catch (supaError) {
      console.warn('Supabase save failed, attempting fallback', supaError);
      try {
        await attemptBundle();
        setStatus('✅ Saved');
        return true;
      } catch (bundleError) {
        try {
          setStatus('Bundle save unavailable — retrying legacy save…');
          await attemptLegacy();
          setStatus('✅ Saved');
          return true;
        } catch (legacyError) {
          console.error('Save failed', { supaError, bundleError, legacyError });
          setStatus('❌ Save failed: ' + (legacyError?.message || legacyError || bundleError || supaError));
          return false;
        }
      }
    }
  }

  async function saveDraftNow() {
    logConversation('You', 'Requested Save Draft');
    if (!suite || !config) return;
    const slug = activeSlug || 'default';
    setSaveBusy(true);
    setStatus('Saving draft…');
    const saved = await saveAllWithSlug(slug, 'draft');
    if (saved) {
      setStatus('✅ Draft saved');
      logConversation('GPT', `Draft saved for ${slug}`);
      await reloadGamesList();
      await refreshGamesIndex();
    } else {
      logConversation('GPT', `Draft save failed for ${slug}`);
    }
    setSaveBusy(false);
  }

  async function publishNow() {
    logConversation('You', 'Requested Publish Now');
    const slug = activeSlug || 'default';
    if (!slug) return;
    setSaveBusy(true);
    setStatus('Publishing…');
    try {
      const response = await fetch(`/api/publish?slug=${encodeURIComponent(slug)}`, {
        method: 'POST',
        credentials: 'include',
      });
      const text = await response.text();
      let payload = null;
      if (text) {
        try { payload = JSON.parse(text); } catch { payload = null; }
      }
      if (!response.ok || (payload && payload.ok === false)) {
        const message = (payload && payload.error) || text || 'publish failed';
        throw new Error(message);
      }
      setStatus('🚀 Published');
      logConversation('GPT', `Published ${slug}`);
      await reloadGamesList();
      await refreshGamesIndex();
      setPreviewNonce((n) => n + 1);
    } catch (error) {
      const message = error?.message || 'publish failed';
      setStatus(`❌ Publish failed: ${message}`);
      logConversation('GPT', `Publish failed for ${slug}: ${message}`);
    } finally {
      setSaveBusy(false);
    }
  }

  async function saveDraftThenPublish() {
    await saveDraftNow();
    await publishNow();
  }

  const getSnapshotFor = useCallback(
    async (slug) => {
      const normalizedSlug = String(slug || 'default').trim() || 'default';
      try {
        if (typeof window !== 'undefined' && window.__ERIX__?.getGameSnapshot) {
          const snap = await window.__ERIX__.getGameSnapshot(normalizedSlug);
          if (snap) return snap;
        }
      } catch (error) {
        console.warn('getGameSnapshot bridge failed', error);
      }

      const clonedConfig = config ? cloneForSnapshot(normalizeGameMetadata({ ...config }, normalizedSlug)) : null;
      const baseSuite = suite
        ? {
            version: suite?.version || '0.0.0',
            missions: cloneForSnapshot(Array.isArray(suite?.missions) ? suite.missions : []),
          }
        : { version: '0.0.0', missions: [] };

      return {
        meta: {
          slug: normalizedSlug,
          title: clonedConfig?.game?.title || normalizedSlug,
          channel: headerStatus,
          capturedAt: new Date().toISOString(),
        },
        data: {
          config: clonedConfig,
          suite: baseSuite,
        },
      };
    },
    [cloneForSnapshot, config, headerStatus, suite],
  );

  const gameIdentifier = useMemo(() => {
    const slug = (activeGameMeta?.slug || activeSlug || 'default').trim() || 'default';
    const tagRaw = activeGameMeta?.tag || headerStatus;
    const tag = tagRaw === 'published' ? 'published' : 'draft';
    const gameId = activeGameMeta?.id || null;
    return { gameId, slug, tag };
  }, [activeGameMeta?.id, activeGameMeta?.slug, activeGameMeta?.tag, activeSlug, headerStatus]);

  const saveGameFlags = useCallback(
    async (patch) => {
      if (!patch || typeof patch !== 'object') {
        return null;
      }
      setGameFlagsBusy(true);
      setGameFlagsError('');
      try {
        const payload = { patch };
        if (gameIdentifier.gameId) {
          payload.gameId = gameIdentifier.gameId;
        } else {
          payload.slug = gameIdentifier.slug;
          payload.tag = gameIdentifier.tag;
        }
        const response = await fetch('/api/game/save-flags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
          cache: 'no-store',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.ok === false) {
          const message = result?.error || `Save failed (${response.status})`;
          throw new Error(message);
        }
        const saved = result?.saved || {};
        setActiveGameMeta((prev) => {
          const nextSettings = saved.settings ?? prev?.settings ?? {};
          return {
            ...(prev || {}),
            id: saved.id ?? prev?.id ?? gameIdentifier.gameId,
            slug: saved.slug ?? prev?.slug ?? gameIdentifier.slug,
            tag: saved.tag ?? prev?.tag ?? gameIdentifier.tag,
            default_channel: saved.default_channel ?? prev?.default_channel,
            game_enabled: typeof saved.game_enabled === 'boolean'
              ? saved.game_enabled
              : prev?.game_enabled,
            settings: nextSettings,
          };
        });
        if (Object.prototype.hasOwnProperty.call(saved, 'game_enabled')) {
          setGameEnabled(Boolean(saved.game_enabled));
        }
        if (Object.prototype.hasOwnProperty.call(saved, 'default_channel')) {
          const normalized = saved.default_channel === 'published' ? 'published' : 'draft';
          newGameChannelDefaultRef.current = normalized;
          if (!showNewGame) {
            setNewGameChannel(normalized);
          }
        }
        return saved;
      } catch (error) {
        const message = error?.message || String(error);
        setGameFlagsError(message);
        throw error;
      } finally {
        setGameFlagsBusy(false);
      }
    },
    [gameIdentifier, showNewGame],
  );

  const handleUpdateAllPins = useCallback(
    async (lat, lng) => {
      const slug = activeSlug || 'default';
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setStatus('❌ Provide a valid latitude and longitude to update pins');
        return;
      }
      logConversation('You', `Updating all pins to ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      setStatus('📍 Updating all pins…');
      try {
        const snapshot = await getSnapshotFor(slug);
        if (!snapshot) throw new Error('Snapshot unavailable');
        const mutated = updateAllPinsInSnapshot(cloneSnapshot(snapshot), lat, lng);
        const response = await fetch('/api/games/save-full', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            slug,
            channel: headerStatus,
            snapshot: mutated,
          }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Save failed');
        }
        if (mutated?.data?.config) {
          setConfig(mutated.data.config);
        } else {
          setConfig((prev) => {
            const base = { ...(prev || {}) };
            base.map = { ...(base.map || {}), centerLat: lat, centerLng: lng };
            return base;
          });
        }
        if (mutated?.data?.suite) {
          setSuite(mutated.data.suite);
        }
        await saveGameFlags({ globalLocation: { lat, lng } });
        setStatus('✅ Updated all pins to new location');
        logConversation('GPT', `All pins updated to ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      } catch (error) {
        const message = error?.message || 'Update failed';
        setStatus(`❌ Failed to update pins: ${message}`);
        logConversation('GPT', `Failed to update pins: ${message}`);
        throw error;
      }
    },
    [activeSlug, getSnapshotFor, headerStatus, logConversation, saveGameFlags, setConfig, setStatus, setSuite],
  );

  const saveFull = useCallback(
    async (publish = false) => {
      const slug = activeSlug || 'default';
      const intentLabel = publish ? 'Save & Publish' : 'Update';
      logConversation('You', `Triggered ${intentLabel} for ${slug}`);
      if (!slug) return false;
      setSaveBusy(true);
      setStatus(publish ? 'Saving snapshot & publishing…' : 'Saving snapshot…');
      let success = true;
      try {
        const snapshot = await getSnapshotFor(slug);
        if (!snapshot) throw new Error('Snapshot unavailable');

        let handled = false;
        try {
          if (typeof window !== 'undefined' && window.__ERIX__?.saveFullGame) {
            await window.__ERIX__.saveFullGame({ slug, publish, snapshot });
            handled = true;
          }
        } catch (bridgeError) {
          console.warn('saveFullGame bridge failed', bridgeError);
        }

        if (!handled) {
          const endpoint = publish ? '/api/games/save-and-publish' : '/api/games/save-full';
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              slug,
              channel: publish ? 'published' : headerStatus,
              snapshot,
            }),
          });
          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || 'Save request failed');
          }
        }

        setStatus(publish ? '✅ Snapshot saved & published' : '✅ Snapshot updated');
        logConversation('GPT', publish ? `Saved and published ${slug}` : `Snapshot updated for ${slug}`);
        await reloadGamesList();
        await refreshGamesIndex();
        if (publish) setPreviewNonce((n) => n + 1);
      } catch (error) {
        const message = error?.message || 'snapshot save failed';
        setStatus(`❌ ${intentLabel} failed: ${message}`);
        logConversation('GPT', `${intentLabel} failed for ${slug}: ${message}`);
        success = false;
      } finally {
        setSaveBusy(false);
      }
      return success;
    },
    [activeSlug, getSnapshotFor, headerStatus, logConversation, reloadGamesList, refreshGamesIndex, setPreviewNonce, setStatus],
  );

  const handleMakeLive = useCallback(async () => {
    const ok = await saveFull(true);
    if (ok) {
      if (editChannel !== 'published') setEditChannel('published');
      const slug = activeSlug || 'default';
      logConversation('GPT', `Live channel engaged for ${slug}.`);
    }
  }, [activeSlug, editChannel, logConversation, saveFull, setEditChannel]);

  const handleSetDraftMode = useCallback(() => {
    if (editChannel !== 'draft') setEditChannel('draft');
    const slug = activeSlug || 'default';
    logConversation('GPT', `Draft channel ready for ${slug}.`);
  }, [activeSlug, editChannel, logConversation, setEditChannel]);

  async function runSettingsMenuAction(action) {
    if (typeof action !== 'function') return;
    try {
      const result = action();
      if (result && typeof result.then === 'function') {
        await result;
      }
    } catch (error) {
      console.error('Settings menu action failed', error);
    }
  }

  const handleHeaderNav = useCallback(
    (key) => {
      switch (key) {
        case 'settings':
          setTab('settings');
          break;
        case 'missions':
        case 'devices':
        case 'text':
        case 'assigned':
          setTab(key);
          break;
        case 'media':
          setTab('media-pool');
          break;
        case 'new':
          runSettingsMenuAction(() => openNewGameModal());
          break;
        case 'save':
          runSettingsMenuAction(() => saveDraftNow());
          break;
        case 'publish':
          runSettingsMenuAction(() => publishNow());
          break;
        case 'update':
          runSettingsMenuAction(() => saveFull(false));
          break;
        case 'save_and_publish':
          runSettingsMenuAction(() => saveFull(true));
          break;
        case 'make_live':
          runSettingsMenuAction(() => saveFull(true));
          break;
        case 'set_draft_mode':
          handleSetDraftMode();
          break;
        default:
          break;
      }
    },
    [handleSetDraftMode, openNewGameModal, publishNow, saveDraftNow, saveFull],
  );

  /* Delete game (with modal confirm) */
  async function reallyDeleteGame() {
    logConversation('You', `Requested deletion for ${activeSlug || 'default'} game`);
    if (!gameEnabled) { setConfirmDeleteOpen(false); return; }
    const slug = activeSlug || 'default';
    const urlTry = [
      `/api/games${qs({ slug: isDefaultSlug(slug) ? '' : slug })}`,
      !isDefaultSlug(slug) ? `/api/game${qs({ slug })}` : null,
      !isDefaultSlug(slug) ? `/api/games/${encodeURIComponent(slug)}` : null,
      !isDefaultSlug(slug) ? `/api/game/${encodeURIComponent(slug)}` : null,
    ].filter(Boolean);

    setStatus('Deleting game…');
    let ok = false, lastErr = '';
    for (const u of urlTry) {
      try {
        const res = await fetch(u, { method:'DELETE', credentials:'include' });
        if (res.ok) { ok = true; break; }
        lastErr = await res.text();
      } catch (e) { lastErr = e?.message || String(e); }
    }

    if (!ok) {
      setSuite({ version:'0.0.0', missions:[] });
      setConfig(c => ({
        ...(c || {}),
        devices: [],
        powerups: [],
        media: { rewardsPool:[], penaltiesPool:[] },
        textRules: [],
      }));
      setDirty(true);
      const saved = await saveAllWithSlug(slug);
      if (saved) { setStatus('✅ Cleared game content'); ok = true; }
    }

    if (ok) {
      await reloadGamesList();
      setActiveSlug('default');
      setStatus('✅ Game deleted');
      setPreviewNonce(n => n + 1);
    } else {
      setStatus('❌ Delete failed: ' + (lastErr || 'unknown error'));
    }
    setConfirmDeleteOpen(false);
  }

  /* Missions CRUD */
  function suggestId() {
    return nextMissionId(suite?.missions || []);
  }
  function startNew() {
    if (missionButtonTimeout.current) {
      clearTimeout(missionButtonTimeout.current);
      missionButtonTimeout.current = null;
    }
    setNewMissionButtonFlash(true);
    missionButtonTimeout.current = setTimeout(() => {
      setNewMissionButtonFlash(false);
      missionButtonTimeout.current = null;
    }, 420);
    const draft = {
      id: suggestId(),
      title: 'New Mission',
      type: 'multiple_choice',
      iconKey: '',
      rewards: { points: 25 },
      correct: { mode: 'none' },
      wrong:   { mode: 'none' },
      onCorrect: { statement:'', mediaUrl:'', audioUrl:'', durationSeconds:0, buttonText:'OK', enabled:false },
      onWrong:   { statement:'', mediaUrl:'', audioUrl:'', durationSeconds:0, buttonText:'OK', enabled:false },
      content: defaultContentForType('multiple_choice'),
      appearanceOverrideEnabled: false,
      appearance: defaultAppearance(),
      showContinue: true,
      trigger: { ...DEFAULT_TRIGGER_CONFIG },
    };
    const preferred = getPreferredLocation();
    if (preferred) {
      const lat = Number(Number(preferred.lat).toFixed(6));
      const lng = Number(Number(preferred.lng).toFixed(6));
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        draft.content.lat = lat;
        draft.content.lng = lng;
        draft.content.geofenceEnabled = true;
      }
    }
    setEditing(draft); setSelected(null); setDirty(true);
  }
  function editExisting(m) {
    if (!m) return;
    let e;
    try {
      e = JSON.parse(JSON.stringify(m));
    } catch (err) {
      console.warn('Falling back to shallow mission copy', err);
      e = { ...(m || {}) };
    }
    e.appearanceOverrideEnabled = !!e.appearanceOverrideEnabled;
    e.appearance = { ...defaultAppearance(), ...(e.appearance || {}) };
    if (!e.correct) e.correct = { mode: 'none' };
    if (!e.wrong)   e.wrong   = { mode: 'none' };
    if (!e.onCorrect) e.onCorrect = { statement:'', mediaUrl:'', audioUrl:'', durationSeconds:0, buttonText:'OK', enabled:false };
    if (!e.onWrong)   e.onWrong   = { statement:'', mediaUrl:'', audioUrl:'', durationSeconds:0, buttonText:'OK', enabled:false };
    if (e.showContinue === undefined) e.showContinue = true;
    e.trigger = { ...DEFAULT_TRIGGER_CONFIG, ...(e.trigger || {}) };
    setEditing(e); setSelected(m.id); setDirty(false);
  }
  function cancelEdit() {
    setEditing(null); setSelected(null); setDirty(false);
    setMissionActionFlash(false);
    if (missionFlashTimeout.current) {
      clearTimeout(missionFlashTimeout.current);
      missionFlashTimeout.current = null;
    }
  }
  function bumpVersion(v) {
    const p = String(v || '0.0.0')
      .split('.')
      .map((n) => parseInt(n || '0', 10));
    while (p.length < 3) p.push(0);
    p[2] += 1;
    return p.join('.');
  }
  function saveToList() {
    if (!editing || !suite) return;
    if (!editing.id || !editing.title || !editing.type) return setStatus('❌ Fill id, title, type');

    const fields = TYPE_FIELDS[editing.type] || [];
    for (const f of fields) {
      if (f.type === 'number' || f.optional) continue;
      if (f.key === 'acceptable' || f.key === 'mediaUrl') continue;
      const v = editing.content?.[f.key];
      if (v === undefined || v === null || v === '') {
        return setStatus('❌ Missing: ' + f.label);
      }
    }
    const missions = [...(suite.missions || [])];
    const i = missions.findIndex(m => m.id === editing.id);
    const obj = { ...editing };
    obj.trigger = sanitizeTriggerConfig(editing.trigger);
    if (!obj.appearanceOverrideEnabled) delete obj.appearance;

    const list = (i >= 0 ? (missions[i]=obj, missions) : [...missions, obj]);
    setSuite({ ...suite, missions: list, version: bumpVersion(suite.version || '0.0.0') });
    setSelected(editing.id); setEditing(null); setDirty(false);
    setStatus('✅ Mission saved');
  }
  function handleMissionSave() {
    if (missionFlashTimeout.current) {
      clearTimeout(missionFlashTimeout.current);
      missionFlashTimeout.current = null;
    }
    setMissionActionFlash(true);
    missionFlashTimeout.current = setTimeout(() => {
      setMissionActionFlash(false);
      missionFlashTimeout.current = null;
    }, 420);
    saveToList();
  }
  function removeMission(id) {
    if (!suite) return;
    setSuite({ ...suite, missions: (suite.missions || []).filter(m => m.id !== id) });
    setDirty(true);
    if (selected === id) { setSelected(null); setEditing(null); }
  }
  function moveMission(idx, dir) {
    if (!suite) return;
    const list = [...(suite.missions || [])];
    const j = idx + dir; if (j < 0 || j >= list.length) return;
    const [row] = list.splice(idx, 1); list.splice(j, 0, row);
    setSuite({ ...suite, missions: list });
    setDirty(true);
  }
  function duplicateMission(idx) {
    const list = [...(suite.missions || [])];
    const src  = list[idx]; if (!src) return;
    const cp   = JSON.parse(JSON.stringify(src));
    cp.id      = suggestId();
    cp.title   = (src.title || 'Copy') + ' (copy)';
    list.splice(idx + 1, 0, cp);
    setSuite({ ...suite, missions: list });
    setDirty(true);
    setStatus('✅ Duplicated');
  }

  /* Devices (Devices tab only) */
  const devices = getDevices();
  function deviceIconUrlFromKey(key) {
    if (!key) return '';
    const it = (config?.icons?.devices || []).find(x => (x.key||'') === key);
    return it?.url || '';
  }
  function missionIconUrlFromKey(key) {
    if (!key) return '';
    const missionIcon = (config?.icons?.missions || []).find(x => (x.key || '') === key);
    if (missionIcon?.url) return missionIcon.url;
    const deviceFallback = (config?.icons?.devices || []).find(x => (x.key || '') === key);
    return deviceFallback?.url || '';
  }
  const triggerOptionSets = useMemo(() => {
    const mediaOptions = (inventory || []).map((it, idx) => {
      const rawUrl = it?.url || it?.path || it;
      const url = toDirectMediaURL(rawUrl);
      if (!url) return null;
      const label = it?.label || baseNameFromUrl(url) || `Media ${idx + 1}`;
      return { id: url, label, thumbnail: url, meta: it };
    }).filter(Boolean);
    const deviceOptions = (devices || []).map((d, idx) => {
      const id = d?.id || d?.key || `device-${idx}`;
      const label = d?.title || d?.name || id;
      const thumbnail = toDirectMediaURL(d?.iconUrl || deviceIconUrlFromKey(d?.iconKey) || '');
      return { id, label, thumbnail, meta: d };
    });
    const missionOptions = ((suite?.missions) || []).map((m, idx) => {
      const id = m?.id || `mission-${idx}`;
      const label = m?.title || id;
      const thumbnail = toDirectMediaURL(missionIconUrlFromKey(m?.iconKey) || '');
      return { id, label, thumbnail, meta: m };
    });
    const responseOptions = [];
    ((suite?.missions) || []).forEach((m) => {
      if (!m) return;
      const baseLabel = m.title || m.id || 'Mission';
      const correctUrl = toDirectMediaURL(m?.correct?.mediaUrl || m?.correct?.audioUrl || missionIconUrlFromKey(m?.iconKey) || '');
      responseOptions.push({
        id: `${m.id || baseLabel}::correct`,
        label: `${baseLabel} — Correct`,
        thumbnail: correctUrl,
        meta: { mission: m, side: 'correct', url: correctUrl },
      });
      const wrongUrl = toDirectMediaURL(m?.wrong?.mediaUrl || m?.wrong?.audioUrl || missionIconUrlFromKey(m?.iconKey) || '');
      responseOptions.push({
        id: `${m.id || baseLabel}::wrong`,
        label: `${baseLabel} — Wrong`,
        thumbnail: wrongUrl,
        meta: { mission: m, side: 'wrong', url: wrongUrl },
      });
    });
    return { media: mediaOptions, devices: deviceOptions, missions: missionOptions, responses: responseOptions };
  }, [inventory, devices, suite?.missions, config?.icons?.devices, config?.icons?.missions]);
  function suggestDeviceId(existing = devices) {
    return nextDeviceId(existing || []);
  }
  function addDevice() {
    if (deviceButtonTimeout.current) {
      clearTimeout(deviceButtonTimeout.current);
      deviceButtonTimeout.current = null;
    }
    setAddDeviceButtonFlash(true);
    deviceButtonTimeout.current = setTimeout(() => {
      setAddDeviceButtonFlash(false);
      deviceButtonTimeout.current = null;
    }, 420);
    setDeviceEditorMode('new');
    setIsDeviceEditorOpen(true);
    setSelectedDevIdx(null);
    setSelectedMissionIdx(null);
    const preferred = getPreferredLocation();
    const baseLat = Number.isFinite(preferred?.lat) ? preferred.lat : 44.9778;
    const baseLng = Number.isFinite(preferred?.lng) ? preferred.lng : -93.265;
    const initial = createDeviceDraft({
      lat: Number(Number(baseLat).toFixed(6)),
      lng: Number(Number(baseLng).toFixed(6)),
    });
    setDevDraft(initial);
    setDevDraftBaseline(createDeviceDraft({ ...initial }));
  }
  function openDeviceEditor(idx) {
    if (idx == null) return;
    const item = devices?.[idx];
    if (!item) return;
    setDeviceEditorMode('edit');
    setIsDeviceEditorOpen(true);
    setSelectedDevIdx(idx);
    setSelectedMissionIdx(null);
    const draft = createDeviceDraft({ ...item });
    setDevDraft(draft);
    setDevDraftBaseline(createDeviceDraft({ ...item }));
  }
  function closeDeviceEditor() {
    setIsDeviceEditorOpen(false);
    setDeviceEditorMode('new');
    setDevDraft(createDeviceDraft());
    setDevDraftBaseline(createDeviceDraft());
  }
  function resetDeviceEditor() {
    const baseline = createDeviceDraft({ ...devDraftBaseline });
    const unchanged = JSON.stringify(baseline) === JSON.stringify(devDraft);
    setDevDraft(baseline);
    setDeviceTriggerPicker('');
    setStatus(unchanged ? 'ℹ️ Device draft unchanged' : '↩️ Device changes reset');
  }
  function cancelDeviceEditor() {
    setDeviceTriggerPicker('');
    closeDeviceEditor();
    setStatus('🚫 Device edit cancelled');
    setDeviceActionFlash(false);
    if (deviceFlashTimeout.current) {
      clearTimeout(deviceFlashTimeout.current);
      deviceFlashTimeout.current = null;
    }
  }
  function saveDraftDevice() {
    const normalized = {
      title: devDraft.title?.trim() || (devDraft.type.charAt(0).toUpperCase() + devDraft.type.slice(1)),
      type: devDraft.type || 'smoke',
      iconKey: devDraft.iconKey || '',
      pickupRadius: clamp(Number(devDraft.pickupRadius || 0), 1, 2000),
      effectSeconds: clamp(Number(devDraft.effectSeconds || 0), 5, 3600),
      trigger: sanitizeTriggerConfig(devDraft.trigger),
    };
    if (deviceEditorMode === 'new') {
      if (devDraft.lat == null || devDraft.lng == null) {
        setStatus('❌ Click the map or search an address to set device location');
        return;
      }
      const lat = Number(Number(devDraft.lat).toFixed(6));
      const lng = Number(Number(devDraft.lng).toFixed(6));
      const list = [...(devices || [])];
      const item = { id: suggestDeviceId(list), ...normalized, lat, lng };
      const next = [...list, item];
      setDevices(next);
      setSelectedDevIdx(next.length - 1);
      setSelectedMissionIdx(null);
      setDirty(true);
      setStatus('✅ Device added');
      closeDeviceEditor();
      return;
    }
    if (deviceEditorMode === 'edit' && selectedDevIdx != null) {
      const index = selectedDevIdx;
      const list = [...(devices || [])];
      const existing = list[index];
      if (!existing) return;
      const lat = devDraft.lat == null ? existing.lat : Number(Number(devDraft.lat).toFixed(6));
      const lng = devDraft.lng == null ? existing.lng : Number(Number(devDraft.lng).toFixed(6));
      list[index] = { ...existing, ...normalized, lat, lng };
      setDevices(list);
      setDirty(true);
      setStatus('✅ Device updated');
      closeDeviceEditor();
    }
  }
  function handleDeviceSave() {
    if (deviceFlashTimeout.current) {
      clearTimeout(deviceFlashTimeout.current);
      deviceFlashTimeout.current = null;
    }
    setDeviceActionFlash(true);
    deviceFlashTimeout.current = setTimeout(() => {
      setDeviceActionFlash(false);
      deviceFlashTimeout.current = null;
    }, 420);
    saveDraftDevice();
  }
  function duplicateDevice(idx) {
    const list = [...(devices || [])];
    const src = list[idx];
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = suggestDeviceId(list);
    copy.title = (src.title || src.id || 'Device') + ' (copy)';
    list.splice(idx + 1, 0, copy);
    setDevices(list);
    setDirty(true);
    const newIndex = idx + 1;
    setSelectedDevIdx(newIndex);
    setSelectedMissionIdx(null);
    setStatus('✅ Device duplicated');
    setDeviceEditorMode('edit');
    setIsDeviceEditorOpen(true);
    setDevDraft(createDeviceDraft({ ...copy }));
  }
  function deleteDevice(idx) {
    const list = [...(devices || [])];
    if (idx == null || idx < 0 || idx >= list.length) return;
    const currentSelected = selectedDevIdx;
    list.splice(idx, 1);
    setDevices(list);
    setDirty(true);
    if (currentSelected === idx) {
      setSelectedDevIdx(null);
      if (isDeviceEditorOpen && deviceEditorMode === 'edit') closeDeviceEditor();
    } else if (currentSelected != null && currentSelected > idx) {
      setSelectedDevIdx(currentSelected - 1);
    }
    setStatus('✅ Device deleted');
  }
  function moveDevice(idx, dir) {
    const list = [...(devices || [])];
    if (idx == null || idx < 0 || idx >= list.length) return;
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const [row] = list.splice(idx, 1);
    list.splice(target, 0, row);
    setDevices(list);
    setDirty(true);
    const currentSelected = selectedDevIdx;
    if (currentSelected === idx) {
      setSelectedDevIdx(target);
      if (isDeviceEditorOpen && deviceEditorMode === 'edit') {
        setDevDraft(createDeviceDraft({ ...list[target] }));
      }
    } else if (currentSelected === target) {
      setSelectedDevIdx(idx);
    }
  }
  function moveSelectedDevice(lat, lng) {
    if (selectedDevIdx == null) return;
    const list = [...(devices || [])];
    const existing = list[selectedDevIdx];
    if (!existing) return;
    const latFixed = Number(lat.toFixed(6));
    const lngFixed = Number(lng.toFixed(6));
    list[selectedDevIdx] = { ...existing, lat: latFixed, lng: lngFixed };
    setDevices(list);
    setDirty(true);
    if (isDeviceEditorOpen && deviceEditorMode === 'edit') {
      setDevDraft(d => ({ ...d, lat: latFixed, lng: lngFixed }));
    }
  }
  function setSelectedDeviceRadius(r) {
    if (selectedDevIdx == null) return;
    const list = [...(devices || [])];
    const existing = list[selectedDevIdx];
    if (!existing) return;
    const nextRadius = clamp(Number(r || 0), 1, 2000);
    list[selectedDevIdx] = { ...existing, pickupRadius: nextRadius };
    setDevices(list);
    setDirty(true);
    if (isDeviceEditorOpen && deviceEditorMode === 'edit') {
      setDevDraft(d => ({ ...d, pickupRadius: nextRadius }));
    }
  }

  function applyAppearanceSkin(key) {
    const preset = APPEARANCE_SKIN_MAP.get(key);
    if (!preset) return;
    const tone = normalizeTone(config?.appearanceTone);
    applyAdminUiThemeForDocument(key, preset.appearance, tone);
    setConfig(prev => ({
      ...(prev || {}),
      appearance: { ...defaultAppearance(), ...preset.appearance },
      appearanceSkin: key,
    }));
    setDirty(true);
    setStatus(`✅ Applied theme: ${preset.label}`);
  }

  function updateInterfaceTone(nextTone) {
    const normalized = normalizeTone(nextTone);
    if (normalized === normalizeTone(config?.appearanceTone)) return;
    const appearance = config?.appearance || defaultAppearance();
    const skinKey = config?.appearanceSkin && ADMIN_SKIN_TO_UI.has(config.appearanceSkin)
      ? config.appearanceSkin
      : detectAppearanceSkin(appearance, config?.appearanceSkin);
    applyAdminUiThemeForDocument(skinKey, appearance, normalized);
    setConfig(prev => ({ ...(prev || {}), appearanceTone: normalized }));
    setDirty(true);
    setStatus(normalized === 'dark' ? '🌙 Dark mission deck enabled' : '☀️ Light command deck enabled');
  }

  async function openGameChannel(slug, channel) {
    if (!slug) return;
    const normalized = String(channel || 'draft').toLowerCase() === 'published' ? 'published' : 'draft';
    setActiveSlug(slug);
    setTab('settings');
    if (typeof setEditChannel === 'function') setEditChannel(normalized);
    setStatus(`Opened ${slug} (${normalized})`);
  }

  async function ensureDraftFromCurrent() {
    const slug = activeSlug || 'default';
    if (!config) {
      setStatus('❌ Nothing to clone into draft');
      return;
    }
    setStatus('Creating draft from current config…');
    try {
      const payload = {
        slug,
        title: config?.game?.title || slug,
        type: config?.game?.type || null,
        config,
      };
      const response = await fetch('/api/games?channel=draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || 'draft create failed');
      setStatus('✅ Draft created');
      setActiveSlug(slug);
      if (typeof setEditChannel === 'function') setEditChannel('draft');
      await refreshGamesIndex();
      await reloadGamesList();
    } catch (error) {
      setStatus(`❌ ${error?.message || 'Unable to create draft'}`);
    }
  }

  async function saveGamePublished() {
    logConversation('You', 'Requested Save Published');
    if (!suite || !config) return;
    const slug = activeSlug || 'default';
    setSaveBusy(true);
    setStatus('Saving published…');
    const saved = await saveAllWithSlug(slug, 'published');
    if (saved) {
      setStatus('✅ Published saved');
      logConversation('GPT', `Published saved for ${slug}`);
      await reloadGamesList();
      await refreshGamesIndex();
    } else {
      logConversation('GPT', `Published save failed for ${slug}`);
    }
    setSaveBusy(false);
  }

  // Missions selection operations (Missions tab only)
  function moveSelectedMission(lat, lng) {
    if (selectedMissionIdx == null) return;
    const list = [...(suite?.missions || [])];
    const m = list[selectedMissionIdx]; if (!m) return;
    const c = { ...(m.content || {}) };
    c.lat = Number(lat.toFixed(6));
    c.lng = Number(lng.toFixed(6));
    c.geofenceEnabled = true;
    c.radiusMeters = clamp(Number(c.radiusMeters || 25), 5, 500);
    list[selectedMissionIdx] = { ...m, content: c };
    setSuite({ ...suite, missions: list });
    setDirty(true);
    setStatus(`Moved mission #${selectedMissionIdx+1}`);
  }
  function setSelectedMissionRadius(r) {
    if (selectedMissionIdx == null) return;
    const list = [...(suite?.missions || [])];
    const m = list[selectedMissionIdx]; if (!m) return;
    const c = { ...(m.content || {}) };
    c.radiusMeters = clamp(Number(r || 0), 5, 500);
    c.geofenceEnabled = true;
    if (!isFinite(Number(c.lat)) || !isFinite(Number(c.lng))) {
      c.lat = Number(config.map?.centerLat || 44.9778);
      c.lng = Number(config.map?.centerLng || -93.2650);
    }
    list[selectedMissionIdx] = { ...m, content: c };
    setSuite({ ...suite, missions: list });
    setDirty(true);
  }

  // Address search (Devices tab)
  async function devSearch(e) {
    e?.preventDefault();
    const q = devSearchQ.trim();
    if (!q) return;
    setDevSearching(true);
    setDevResults([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&addressdetails=1`;
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      const j = await r.json();
      setDevResults(Array.isArray(j) ? j : []);
    } catch {
      setDevResults([]);
    } finally {
      setDevSearching(false);
    }
  }
  function applySearchResult(r) {
    const lat = Number(r.lat), lon = Number(r.lon);
    if (isDeviceEditorOpen && deviceEditorMode === 'new') {
      setDevDraft(d => ({ ...d, lat, lng: lon }));
    } else if (selectedDevIdx != null) {
      moveSelectedDevice(lat, lon);
    }
    setDevResults([]);
  }
  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      applySearchResult({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    });
  }

  // Settings → Map center search
  async function searchMapCenter(e) {
    e?.preventDefault?.();
    const q = mapSearchQ.trim();
    if (!q) return;
    setMapSearching(true);
    setMapResults([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&addressdetails=1`;
      const r = await fetch(url);
      const j = await r.json();
      setMapResults(Array.isArray(j) ? j : []);
    } catch { setMapResults([]); }
    finally { setMapSearching(false); }
  }
  function useCenterResult(r) {
    const lat = Number(r.lat), lng = Number(r.lon);
    setConfig(c => ({ ...(c || {}), map: { ...((c && c.map) || {}), centerLat: Number(lat.toFixed(6)), centerLng: Number(lng.toFixed(6)) } }));
    setMapResults([]);
  }

  // Project Health scan
  async function scanProject() {
    logConversation('You', 'Scanning media usage for unused files');
    const inv = await listInventory(['mediapool']);
    const used = new Set();

    const iconUrlByKey = {};
    (config?.icons?.missions || []).forEach(i => { if (i.key && i.url) iconUrlByKey['missions:'+i.key]=i.url; });
    (config?.icons?.devices  || []).forEach(i => { if (i.key && i.url) iconUrlByKey['devices:'+i.key]=i.url; });

    (suite?.missions || []).forEach(m => {
      if (m.iconUrl) used.add(m.iconUrl);
      if (m.iconKey && iconUrlByKey['missions:'+m.iconKey]) used.add(iconUrlByKey['missions:'+m.iconKey]);
      const c = m.content || {};
      ['mediaUrl','imageUrl','videoUrl','assetUrl','markerUrl'].forEach(k => { if (c[k]) used.add(c[k]); });
      if (m.correct?.mediaUrl) used.add(m.correct.mediaUrl);
      if (m.wrong?.mediaUrl)   used.add(m.wrong.mediaUrl);
    });
    (getDevices() || []).forEach(d => {
      if (d.iconKey && iconUrlByKey['devices:'+d.iconKey]) used.add(iconUrlByKey['devices:'+d.iconKey]);
    });
    (config?.media?.rewardsPool || []).forEach(x => x.url && used.add(x.url));
    (config?.media?.penaltiesPool || []).forEach(x => x.url && used.add(x.url));

    const total = inv.length;
    const usedCount = used.size;
    const unused = inv.filter(i => !used.has(i.url));

    setStatus(`Scan complete: ${usedCount}/${total} media referenced; ${unused.length} unused.`);
    alert(
      `${usedCount}/${total} media referenced\n` +
      (unused.length ? `Unused files:\n- `+unused.map(u=>u.url).join('\n- ') : 'No unused files detected')
    );
  }

  async function uploadToRepo(file, subfolder = 'auto', options = {}) {
    if (!file) return '';
    const safeName = (file.name || 'upload').replace(/[^\w.\-]+/g, '_');
    const normalizedFolder = String(subfolder || 'auto').replace(/^\/+|\/+$/g, '');
    const classification = classifyByExt(file.name || file.type || safeName);
    const folderKey = normalizedFolder.toLowerCase();
    const folderMap = new Map([
      ['audio', 'mediapool/Audio'],
      ['mediapool/audio', 'mediapool/Audio'],
      ['video', 'mediapool/Video'],
      ['mediapool/video', 'mediapool/Video'],
      ['ar-target', 'mediapool/AR Target'],
      ['mediapool/ar target', 'mediapool/AR Target'],
      ['mediapool/ar-target', 'mediapool/AR Target'],
      ['ar-overlay', 'mediapool/AR Overlay'],
      ['mediapool/ar overlay', 'mediapool/AR Overlay'],
      ['mediapool/ar-overlay', 'mediapool/AR Overlay'],
      ['images', 'mediapool/Images'],
      ['mediapool/images', 'mediapool/Images'],
      ['images/icons', 'mediapool/Images/icons'],
      ['mediapool/images/icons', 'mediapool/Images/icons'],
      ['images/covers', 'mediapool/Images/covers'],
      ['mediapool/images/covers', 'mediapool/Images/covers'],
      ['images/bundles', 'mediapool/Images/bundles'],
      ['mediapool/images/bundles', 'mediapool/Images/bundles'],
      ['images/uploads', 'mediapool/Images/uploads'],
      ['mediapool/images/uploads', 'mediapool/Images/uploads'],
      ['gif', 'mediapool/Gif'],
      ['mediapool/gif', 'mediapool/Gif'],
      ['gifs', 'mediapool/Gif'],
      ['mediapool/gifs', 'mediapool/Gif'],
      ['other', 'mediapool/Other'],
      ['mediapool/other', 'mediapool/Other'],
    ]);

    let resolvedFolder = '';
    if (!folderKey || folderKey === 'auto') {
      const autoMap = {
        image: 'mediapool/Images',
        gif: 'mediapool/Gif',
        audio: 'mediapool/Audio',
        video: 'mediapool/Video',
        ar: 'mediapool/AR Target',
        other: 'mediapool/Other',
      };
      resolvedFolder = autoMap[classification] || 'mediapool/Other';
    } else if (folderMap.has(folderKey)) {
      resolvedFolder = folderMap.get(folderKey);
    } else if (normalizedFolder.startsWith('mediapool/')) {
      resolvedFolder = normalizedFolder;
    } else {
      resolvedFolder = `mediapool/${normalizedFolder}`;
    }

    const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET || 'media';
    const prefix = editChannel === 'published' ? 'public' : 'draft';
    const folder = `${prefix}/${resolvedFolder}`.replace(/\/+/g, '/');

    const uniqueName = `${Date.now()}-${safeName}`;
    const destinationLabel = `${prefix.toUpperCase()} @ ${BUCKET}/${folder}`;
    const overWarning = (file.size || 0) > MEDIA_WARNING_BYTES;
    if (overWarning) {
      const sizeMb = Math.max(0.01, (file.size || 0) / (1024 * 1024));
      setUploadStatus(`⚠️ ${safeName} is ${sizeMb.toFixed(sizeMb >= 10 ? 0 : 1)} MB — uploads over 5 MB may take longer to sync into ${destinationLabel}.`);
    } else {
      setUploadStatus(`Uploading ${safeName} to ${destinationLabel}…`);
    }
    const base64 = await fileToBase64(file);
    const body = {
      fileName: uniqueName,
      folder: folder,
      sizeBytes: file.size || 0,
      contentBase64: base64,
      remoteUrl: options.remoteUrl || '',
    };
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      let message = `✅ Registered ${safeName} in ${destinationLabel}`;
      if (j?.manifestFallback && j?.manifestPath) {
        message += ` (manifest fallback: ${j.manifestPath})`;
      } else if (j?.manifestPath) {
        message += ` (manifest: ${j.manifestPath})`;
      }
      setUploadStatus(message);
    } else {
      setUploadStatus(`❌ ${j?.error || 'upload failed'}`);
    }
    return res.ok ? (j?.item?.url || '') : '';
  }

  const selectGameOptions = useMemo(() => {
    const entries = new Map();
    entries.set('default', `${STARFIELD_DEFAULTS.title} (default)`);
    const bySlug = gamesIndex?.bySlug || {};
    Object.entries(bySlug).forEach(([slug, channels]) => {
      if (!slug || slug === 'default') return;
      const source = channels?.draft || channels?.published || {};
      const title = source.title || slug;
      const mode = source.mode;
      entries.set(slug, mode ? `${title} — ${mode}` : title);
    });
    if (entries.size === 1 && Array.isArray(games)) {
      games.forEach((game) => {
        if (!game || !game.slug || game.slug === 'default') return;
        if (entries.has(game.slug)) return;
        const label = `${game.title || game.slug}${game.mode ? ` — ${game.mode}` : ''}`;
        entries.set(game.slug, label);
      });
    }
    return Array.from(entries, ([value, label]) => ({ value, label }));
  }, [gamesIndex, games]);
  const settingsMenuGames = useMemo(() => {
    const entries = [
      {
        slug: 'default',
        channel: 'draft',
        label: `${STARFIELD_DEFAULTS.title} (default)`,
      },
    ];
    const seen = new Set(entries.map((entry) => `${entry.slug}::${entry.channel}`));
    const bySlug = gamesIndex?.bySlug || {};
    Object.entries(bySlug).forEach(([slug, channels]) => {
      if (!slug) return;
      const variants = [
        { channel: 'published', data: channels?.published },
        { channel: 'draft', data: channels?.draft },
      ];
      variants.forEach(({ channel, data }) => {
        if (!data) return;
        const normalizedChannel = channel === 'published' ? 'published' : 'draft';
        const key = `${slug}::${normalizedChannel}`;
        if (seen.has(key)) return;
        seen.add(key);
        entries.push({
          slug,
          channel: normalizedChannel,
          label: `${data.title || slug} (${normalizedChannel})`,
        });
      });
    });
    return entries;
  }, [gamesIndex]);

  const savedGamesList = useMemo(() => {
    const bySlug = gamesIndex?.bySlug || {};
    const entries = [];
    Object.entries(bySlug).forEach(([slug, channels]) => {
      if (!slug) return;
      const variants = [
        { channel: 'published', data: channels?.published },
        { channel: 'draft', data: channels?.draft },
      ];
      variants.forEach(({ channel, data }) => {
        if (!data) return;
        const normalizedChannel = channel === 'published' ? 'published' : 'draft';
        const base = typeof data === 'object' && data !== null ? data : {};
        entries.push({
          ...base,
          slug: base.slug || slug,
          title: base.title || slug,
          channel: normalizedChannel,
        });
      });
    });
    if (!entries.length) {
      (Array.isArray(games) ? games : []).forEach((game) => {
        if (!game || !game.slug) return;
        const normalizedChannel = String(game.channel || 'draft').toLowerCase() === 'published' ? 'published' : 'draft';
        entries.push({
          ...game,
          slug: game.slug,
          title: game.title || game.slug,
          channel: normalizedChannel,
        });
      });
    }
    const hasDefault = entries.some((entry) => entry.slug === 'default' && entry.channel !== 'published');
    if (!hasDefault) {
      entries.unshift({ id: 'default', slug: 'default', title: STARFIELD_DEFAULTS.title, channel: 'draft' });
    }
    return entries;
  }, [gamesIndex, games]);

  const savedGamesChannel = useMemo(() => {
    const slug = activeSlug || 'default';
    const desired = slug === 'default' ? 'draft' : headerStatus;
    const match = savedGamesList.some(
      (entry) => entry.slug === slug && (entry.channel || 'draft') === desired,
    );
    if (match) return desired;
    return 'draft';
  }, [activeSlug, headerStatus, savedGamesList]);

  const savedGamesValue = `${activeSlug || 'default'}:${savedGamesChannel}`;

  useEffect(() => {
    if (tab !== 'settings' && confirmDeleteOpen) {
      setConfirmDeleteOpen(false);
    }
  }, [tab, confirmDeleteOpen]);

  const applyOpenGameFromMenu = useCallback(
    (slug, channel = 'draft', label = '') => {
      if (!slug) return;
      const normalized = channel === 'published' ? 'published' : slug === 'default' ? 'default' : 'draft';
      const nextChannel = normalized === 'default' ? 'draft' : normalized;
      setActiveSlug(slug);
      setEditChannel(nextChannel);
      setTab('settings');
      const displayLabel = label || `${slug} (${normalized === 'default' ? 'default' : nextChannel})`;
      setStatus(`Opened ${displayLabel}`);
    },
    [setActiveSlug, setEditChannel, setTab, setStatus],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const normalizedChannel = editChannel === 'published' ? 'published' : 'draft';
    const detail = {
      slug: activeSlug || 'default',
      channel: normalizedChannel,
      games: settingsMenuGames,
      saving: saveBusy,
    };
    const bridge = window.__esxSettingsBridge || {};
    bridge.saveAndPublish = () => {
      runSettingsMenuAction(() => saveDraftThenPublish());
    };
    bridge.openGame = (slug, channel) => {
      const normalized = channel === 'published' ? 'published' : channel === 'default' ? 'default' : 'draft';
      const match = settingsMenuGames.find(
        (entry) => entry.slug === slug && (entry.channel === normalized || (normalized === 'draft' && entry.channel === 'default')),
      );
      applyOpenGameFromMenu(slug, normalized, match?.label);
    };
    bridge.deleteGame = (entry) => {
      if (entry && entry.slug && entry.slug !== activeSlug) {
        const normalized = entry.channel === 'published'
          ? 'published'
          : entry.channel === 'default'
          ? 'default'
          : 'draft';
        applyOpenGameFromMenu(entry.slug, normalized, entry.label);
      }
      setConfirmDeleteOpen(true);
    };
    bridge.reloadGames = () => reloadGamesList();
    bridge.getState = () => ({ ...detail });
    window.__esxSettingsBridge = bridge;
    window.dispatchEvent(new CustomEvent('esx:settings:state', { detail }));
    return () => {};
  }, [activeSlug, editChannel, saveBusy, settingsMenuGames, applyOpenGameFromMenu, saveDraftThenPublish, reloadGamesList]);
  const fallbackSuite = useMemo(() => ({ version: '0.0.0', missions: [] }), []);
  const fallbackConfig = useMemo(() => defaultConfig(), []);
  const viewSuite = suite || fallbackSuite;
  const viewConfig = config || fallbackConfig;
  const globalLocationSeed = useMemo(() => {
    const storedSetting = activeGameMeta?.settings?.globalLocation;
    if (storedSetting) {
      const lat = Number(storedSetting.lat);
      const lng = Number(storedSetting.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
    const fromConfig = deriveInitialGeo({ data: { config: viewConfig || {} } });
    if (fromConfig) return fromConfig;
    try {
      const stored = getDefaultGeo();
      if (stored && Number.isFinite(stored.lat) && Number.isFinite(stored.lng)) {
        return stored;
      }
    } catch {}
    return null;
  }, [activeGameMeta?.settings?.globalLocation, viewConfig]);
  const isBootstrapping = !suite || !config;

  const mapCenter = {
    lat: Number((viewConfig?.map?.centerLat ?? 44.9778)) || 44.9778,
    lng: Number((viewConfig?.map?.centerLng ?? -93.2650)) || -93.2650,
  };
  const mapZoom = Number(viewConfig?.map?.defaultZoom ?? 13) || 13;

  const missionRadiusDisabled = (selectedMissionIdx==null);
  const missionRadiusValue = selectedMissionIdx!=null
    ? Number(viewSuite.missions?.[selectedMissionIdx]?.content?.radiusMeters ?? 25)
    : 25;

  const missionTitleDraft = (editing?.title || '').trim();
  const missionButtonContextLabel = editing
    ? (missionTitleDraft || (editingIsNew ? 'New' : 'Current'))
    : 'Mission';
  const missionButtonLabel = `Save and Close ${missionButtonContextLabel} Mission`;
  const missionButtonTitleAttr = editing
    ? `Save and close ${missionButtonContextLabel} mission`
    : 'Save and close mission';
  const missionIconPreviewUrl = editing
    ? toDirectMediaURL(missionIconUrlFromKey(editing.iconKey) || '')
    : '';
  const missionIconOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    const append = (list = []) => {
      list.forEach((icon) => {
        const key = (icon?.key || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        options.push({ key, name: icon?.name || key, url: icon?.url || '' });
      });
    };
    append(viewConfig?.icons?.missions || []);
    append(viewConfig?.icons?.devices || []);
    return options;
  }, [viewConfig?.icons?.missions, viewConfig?.icons?.devices]);

  const isAddingDevice = isDeviceEditorOpen && deviceEditorMode === 'new';
  const deviceRadiusDisabled = (selectedDevIdx==null && !isAddingDevice);
  const deviceRadiusValue = selectedDevIdx!=null
    ? Number(devices?.[selectedDevIdx]?.pickupRadius ?? 0)
    : Number(devDraft.pickupRadius ?? 100);

  const deviceTitleDraft = (devDraft?.title || '').trim();
  const deviceButtonContextLabel = deviceTitleDraft
    || (deviceEditorMode === 'new'
      ? 'New'
      : ((selectedDevIdx != null && (devices?.[selectedDevIdx]?.title || '').trim()) || 'Current'));
  const deviceButtonLabel = `Save and Close ${deviceButtonContextLabel} Device`;
  const deviceButtonTitleAttr = `Save and close ${deviceButtonContextLabel} device`;

  const storedAppearanceSkin = viewConfig.appearanceSkin && ADMIN_SKIN_TO_UI.has(viewConfig.appearanceSkin)
    ? viewConfig.appearanceSkin
    : null;
  const detectedAppearanceSkin = detectAppearanceSkin(viewConfig.appearance, viewConfig.appearanceSkin);
  const selectedAppearanceSkin = storedAppearanceSkin || detectedAppearanceSkin;
  const selectedAppearanceSkinLabel = storedAppearanceSkin
    ? `${APPEARANCE_SKIN_MAP.get(storedAppearanceSkin)?.label || storedAppearanceSkin}${detectedAppearanceSkin === 'custom' ? ' (modified)' : ''}`
    : detectedAppearanceSkin === 'custom'
      ? 'Custom (manual edits)'
      : (APPEARANCE_SKIN_MAP.get(detectedAppearanceSkin)?.label || 'Custom');
  const interfaceTone = normalizeTone(viewConfig.appearanceTone);
  const selectedPinSizeDisabled = (selectedMissionIdx==null && selectedDevIdx==null);

  function updateGameTagsDraft(value) {
    setGameTagsDraft(value);
    const tags = value.split(',').map(t => t.trim()).filter(Boolean);
    setConfig(prev => {
      if (!prev) return prev;
      return normalizeGameMetadata({ ...prev, game: { ...prev.game, tags } }, slugForMeta);
    });
  }

  async function handleCoverFile(file) {
    if (!file) return;
    const safeName = file.name || 'cover';
    const looksLikeImage = (file.type && file.type.startsWith('image/')) || EXTS.image.test(file.name || '');
    if (!looksLikeImage) {
      setUploadStatus(`❌ ${safeName} is not an image file.`);
      return;
    }
    const sizeBytes = file.size || 0;
    if (sizeBytes > COVER_SIZE_LIMIT_BYTES) {
      const sizeKb = Math.max(1, Math.round(sizeBytes / 1024));
      setUploadStatus(`❌ ${safeName} is ${sizeKb} KB — please choose an image under 5 MB (PNG or JPG work best).`);
      setCoverUploadPreview('');
      setCoverUploadTarget('');
      return;
    }
    let localPreview = '';
    if (typeof window !== 'undefined' && window.URL && typeof window.URL.createObjectURL === 'function') {
      try { localPreview = window.URL.createObjectURL(file); } catch { localPreview = ''; }
    }
    if (localPreview) {
      setCoverUploadPreview(localPreview);
    }
    setCoverUploadTarget('');
    setUploadStatus(`Preparing ${safeName}…`);
    try {
      const url = await uploadToRepo(file, 'covers');
      if (!url) {
        setUploadStatus(`❌ Upload failed for ${safeName}`);
        setCoverUploadPreview('');
        setCoverUploadTarget('');
        return;
      }
      const normalizedPreview = toDirectMediaURL(url) || url;
      setCoverUploadPreview(normalizedPreview);
      setCoverUploadTarget(url);
      setConfig(prev => {
        if (!prev) return prev;
        const next = normalizeGameMetadata({ ...prev, game: { ...prev.game, coverImage: url } }, slugForMeta);
        return next;
      });
      setDirty(true);
      setInventory((prev = []) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const normalize = (value) => {
          try { return toDirectMediaURL(value || ''); } catch { return String(value || ''); }
        };
        const normalizedTarget = normalize(url);
        const already = safePrev.some((item) => {
          const candidate = item?.url || item?.path || item;
          return candidate && normalize(candidate) === normalizedTarget;
        });
        if (already) return safePrev;
        return [
          ...safePrev,
          {
            url,
            path: url,
            id: url,
            type: 'image',
            thumbUrl: url,
            label: baseNameFromUrl(url),
          },
        ];
      });
      await syncInventory();
    } catch (err) {
      setUploadStatus(`❌ ${(err?.message) || 'upload failed'}`);
      setCoverUploadPreview('');
      setCoverUploadTarget('');
    }
  }

  async function openCoverPicker() {
    setCoverPickerOpen(true);
    setCoverPickerLoading(true);
    setCoverPickerItems([]);
    try {
      const items = await listInventory(['mediapool']);
      const filtered = (items || []).filter(it => ['image', 'gif'].includes(it.type));
      setCoverPickerItems(filtered);
    } catch {
      setCoverPickerItems([]);
    } finally {
      setCoverPickerLoading(false);
    }
  }

  function applyCoverFromUrl(url) {
    if (!url) return;
    setCoverUploadPreview('');
    setCoverUploadTarget(url);
    setConfig(prev => {
      if (!prev) return prev;
      const next = normalizeGameMetadata({ ...prev, game: { ...prev.game, coverImage: url } }, slugForMeta);
      return next;
    });
    setDirty(true);
    setCoverPickerOpen(false);
  }

  function clearCoverImage() {
    setCoverUploadPreview('');
    setCoverUploadTarget('');
    setConfig(prev => {
      if (!prev) return prev;
      const next = normalizeGameMetadata({ ...prev, game: { ...prev.game, coverImage: '' } }, slugForMeta);
      return next;
    });
    setDirty(true);
  }

  async function saveCoverImageOnly() {
    logConversation('You', 'Saved cover artwork');
    const slug = activeSlug || 'default';
    setStatus('Saving cover image…');
    const saved = await saveAllWithSlug(slug);
    if (saved) {
      setStatus('✅ Cover image saved');
      await syncInventory();
    }
  }

  const isDefault = slugForMeta === 'default';
  const coverImageUrl = viewConfig?.game?.coverImage ? toDirectMediaURL(viewConfig.game.coverImage) : '';
  const coverPreviewUrl = coverUploadPreview || coverImageUrl;
  const hasCoverForSave = Boolean((viewConfig?.game?.coverImage || '').trim() || coverUploadPreview);
  const headerGameTitle = (viewConfig?.game?.title || '').trim() || STARFIELD_DEFAULTS.title;
  const headerCoverThumb = viewConfig?.game?.coverImage
    ? toDirectMediaURL(viewConfig.game.coverImage)
    : '';
  const currentSlugDisplay = config?.game?.slug || slugForMeta;
  const normalizedExistingTitle = (headerGameTitle || '').trim();
  const normalizedDraftTitle = (titleDraft || '').trim();
  const currentSlugValue = activeSlug || 'default';
  const slugPreview = isDefaultSlug(currentSlugValue)
    ? currentSlugDisplay
    : (slugifyTitle(normalizedDraftTitle) || slugifyTitle(normalizedExistingTitle) || currentSlugDisplay || currentSlugValue);
  const disableSaveTitle = !normalizedDraftTitle
    || (normalizedDraftTitle === normalizedExistingTitle && slugPreview === currentSlugDisplay);
  const defaultSnapshotCapturedLabel = defaultSnapshotMeta?.capturedAt
    ? formatLocalDateTime(defaultSnapshotMeta.capturedAt)
    : '';
  const defaultSnapshotTitle = defaultSnapshotMeta?.title || '';
  const disableDefaultAction = !overwriteDefaultSnapshot && !defaultSnapshotMeta;

  const handleSaveTitle = useCallback(() => {
    const currentSlug = activeSlug || 'default';
    const draftTitle = (titleDraft || '').trim();
    const fallbackTitle = draftTitle || (currentSlug === 'default' ? STARFIELD_DEFAULTS.title : currentSlug);
    const nextTitle = draftTitle || fallbackTitle;
    const slugCandidate = slugifyTitle(nextTitle) || currentSlug;
    const nextSlug = isDefaultSlug(currentSlug) ? currentSlug : slugCandidate;
    if (nextTitle === normalizedExistingTitle && nextSlug === currentSlugDisplay) {
      setStatus('Title already up to date');
      return;
    }
    setConfig((prev) => {
      const base = prev ? { ...prev } : defaultConfig();
      const nextGame = {
        ...(base.game || {}),
        title: nextTitle,
        slug: nextSlug,
      };
      return normalizeGameMetadata({ ...base, game: nextGame }, nextSlug);
    });
    setDirty(true);
    setTitleDraft(nextTitle);
    logConversation('You', `Renamed game to ${nextTitle} (${nextSlug})`);
    logConversation('GPT', 'Rename applied locally. Save the draft to persist it.');
    setStatus(`Updated title to “${nextTitle}”`);
    setActiveTagsToOnly(nextSlug);
    if (currentSlug !== nextSlug) {
      setActiveSlug(nextSlug);
    }
    setGames((prevGames) => {
      if (!Array.isArray(prevGames)) return prevGames;
      return prevGames.map((game) => {
        if (!game || !game.slug) return game;
        if (game.slug !== currentSlug && game.slug !== currentSlugDisplay) return game;
        return { ...game, slug: nextSlug, title: nextTitle };
      });
    });
    setGamesIndex((prevIndex) => {
      if (!prevIndex || !prevIndex.bySlug) return prevIndex;
      const base = { ...prevIndex.bySlug };
      const candidateKeys = [currentSlug, currentSlugDisplay, nextSlug];
      const existingKey = candidateKeys.find((key) => key && base[key]);
      const existing = existingKey ? base[existingKey] : undefined;
      const updated = existing
        ? {
            ...existing,
            draft: existing.draft
              ? { ...existing.draft, slug: nextSlug, title: nextTitle }
              : { slug: nextSlug, title: nextTitle },
          }
        : {
            draft: { slug: nextSlug, title: nextTitle },
          };
      candidateKeys.forEach((key) => {
        if (key && key !== nextSlug) delete base[key];
      });
      base[nextSlug] = {
        ...updated,
        published: existing?.published ? { ...existing.published } : updated.published,
      };
      return { bySlug: base, count: Object.keys(base).length };
    });
  }, [activeSlug, currentSlugDisplay, defaultConfig, logConversation, normalizedExistingTitle, setActiveSlug, setActiveTagsToOnly, setConfig, setDirty, setGames, setGamesIndex, setStatus, slugForMeta, titleDraft]);

  const handleDefaultSnapshotAction = useCallback(() => {
    if (slugForMeta !== defaultSlug) return;
    if (overwriteDefaultSnapshot) {
      const snapshot = buildDefaultSnapshotPayload();
      if (snapshot) {
        writeDefaultSnapshot(snapshot);
        setDefaultSnapshotMeta(snapshot);
        setOverwriteDefaultSnapshot(false);
        logConversation('You', 'Overwrote original default snapshot');
        logConversation('GPT', 'Default snapshot refreshed. Use reset to restore this state later.');
        setStatus('Saved new original default snapshot');
      }
      return;
    }
    const stored = readDefaultSnapshot();
    if (!stored) {
      setStatus('No stored default snapshot to restore');
      logConversation('GPT', 'No original default snapshot is available yet.');
      return;
    }
    try {
      const restoredConfig = stored.config ? normalizeGameMetadata({ ...stored.config }, slugForMeta) : null;
      if (restoredConfig) setConfig(restoredConfig);
      if (stored.suite) {
        const missionsList = Array.isArray(stored.suite.missions) ? stored.suite.missions : [];
        setSuite({ version: stored.suite.version || '0.0.0', missions: missionsList });
      }
      if (stored.title) setTitleDraft(stored.title);
      setDirty(true);
      setActiveTagsToOnly(slugForMeta);
      setDefaultSnapshotMeta(stored);
      logConversation('You', 'Reset default game to original snapshot');
      logConversation('GPT', 'Default content restored locally. Save to push it upstream.');
      setStatus('Restored original default snapshot');
      setOverwriteDefaultSnapshot(false);
    } catch (err) {
      setStatus('Unable to restore default snapshot');
    }
  }, [buildDefaultSnapshotPayload, defaultSlug, logConversation, overwriteDefaultSnapshot, readDefaultSnapshot, setActiveTagsToOnly, setConfig, setDefaultSnapshotMeta, setDirty, setStatus, setSuite, setTitleDraft, slugForMeta, writeDefaultSnapshot]);

  const envRepoOwner = process.env.NEXT_PUBLIC_REPO_OWNER
    || process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER
    || process.env.NEXT_PUBLIC_GITHUB_OWNER
    || '';
  const envRepoName = process.env.NEXT_PUBLIC_REPO_NAME
    || process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG
    || process.env.NEXT_PUBLIC_GITHUB_REPO
    || '';
  const envOwnerRepo = envRepoName
    ? (envRepoOwner ? `${envRepoOwner}/${envRepoName}` : envRepoName)
    : '';
  const envRepoUrl = envOwnerRepo ? `https://github.com/${envOwnerRepo}` : '';
  const envBranchName = process.env.NEXT_PUBLIC_REPO_BRANCH
    || process.env.NEXT_PUBLIC_GIT_BRANCH
    || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF
    || '';
  const envCommitSha = process.env.NEXT_PUBLIC_COMMIT_SHA
    || process.env.NEXT_PUBLIC_GIT_COMMIT
    || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    || '';
  const envVercelHost = process.env.NEXT_PUBLIC_DEPLOYMENT_URL
    || process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_URL
    || process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL
    || process.env.NEXT_PUBLIC_VERCEL_URL
    || '';
  const envVercelUrl = envVercelHost
    ? (envVercelHost.startsWith('http') ? envVercelHost : `https://${envVercelHost}`)
    : '';

  const metaBranchLabel = adminMeta.branch || envBranchName || '';
  const metaCommitLabel = adminMeta.commit ? String(adminMeta.commit) : (envCommitSha || '');
  const metaCommitShort = metaCommitLabel ? metaCommitLabel.slice(0, 7) : '';
  const metaRepoName = adminMeta.repo ? String(adminMeta.repo) : (envRepoName || '');
  const metaOwnerRepo = adminMeta.repo
    ? `${adminMeta.owner ? `${adminMeta.owner}/` : ''}${adminMeta.repo}`
    : envOwnerRepo;
  const metaRepoUrl = adminMeta.owner && adminMeta.repo
    ? `https://github.com/${adminMeta.owner}/${adminMeta.repo}`
    : envRepoUrl;
  const metaCommitUrl = metaCommitLabel && metaRepoUrl
    ? `${metaRepoUrl}/commit/${metaCommitLabel}`
    : '';
  const metaDeploymentUrl = adminMeta.deploymentUrl || adminMeta.vercelUrl || envVercelUrl || '';
  const metaDeploymentState = adminMeta.deploymentState || (metaDeploymentUrl ? 'UNKNOWN' : '');
  const metaDeploymentLabel = metaDeploymentUrl
    ? metaDeploymentUrl.replace(/^https?:\/\//, '')
    : (metaDeploymentState || '—');
  const metaTimestampLabel = adminMeta.fetchedAt ? formatLocalDateTime(adminMeta.fetchedAt) : '';
  const metaVercelUrl = adminMeta.vercelUrl || envVercelUrl || '';
  const metaNowLabel = formatLocalDateTime(new Date());
  const metaVercelLabel = metaVercelUrl ? metaVercelUrl.replace(/^https?:\/\//, '') : '';
  const metaRuntimeNodeRaw = adminMeta.runtime?.node ? String(adminMeta.runtime.node) : '';
  const metaRuntimeNodeLabel = metaRuntimeNodeRaw
    ? (metaRuntimeNodeRaw.startsWith('v') ? metaRuntimeNodeRaw : `v${metaRuntimeNodeRaw}`)
    : '';
  const metaRuntimeCorepackRaw = adminMeta.runtime?.corepack ? String(adminMeta.runtime.corepack) : '';
  const metaRuntimeCorepackLabel = metaRuntimeCorepackRaw || '';
  const metaRuntimeEnv = adminMeta.runtime?.environment || '';
  const metaRuntimeEnvLabel = metaRuntimeEnv
    ? (metaRuntimeEnv === 'vercel' ? 'Vercel' : metaRuntimeEnv)
    : '';
  const metaRuntimePlatform = adminMeta.runtime?.platform || '';
  const metaPinnedNodeRaw = adminMeta.runtime?.pinnedNode ? String(adminMeta.runtime.pinnedNode) : '';
  const metaPinnedNodeLabel = metaPinnedNodeRaw || '';
  const metaRuntimeNpmRaw = adminMeta.runtime?.npm ? String(adminMeta.runtime.npm) : '';
  const metaRuntimeNpmLabel = metaRuntimeNpmRaw || '';
  const metaRuntimeNpmPathRaw = adminMeta.runtime?.npmPath ? String(adminMeta.runtime.npmPath) : '';
  const metaRuntimeNpmPath = metaRuntimeNpmPathRaw
    ? metaRuntimeNpmPathRaw.split(/\r?\n/).find(Boolean) || ''
    : '';
  const metaPinnedNpmRaw = adminMeta.runtime?.pinnedNpm ? String(adminMeta.runtime.pinnedNpm) : '';
  const metaPinnedNpmLabel = metaPinnedNpmRaw || '';
  const metaPinnedYarnRaw = adminMeta.runtime?.pinnedYarn ? String(adminMeta.runtime.pinnedYarn) : '';
  const metaPinnedYarnLabel = metaPinnedYarnRaw || '';
  const metaRuntimePackageManager = adminMeta.runtime?.packageManager || '';
  const metaRepoDisplay = metaOwnerRepo || envOwnerRepo || metaRepoName || envRepoName || '—';
  const metaBranchDisplay = metaBranchLabel || envBranchName || '—';
  const metaCommitFull = metaCommitLabel || envCommitSha || '';
  const metaCommitDisplay = metaCommitShort || (metaCommitFull ? metaCommitFull.slice(0, 7) : '—');
  const metaDeploymentDisplay = metaDeploymentLabel || metaVercelLabel || (envVercelUrl ? envVercelUrl.replace(/^https?:\/\//, '') : '—');
  const metaVercelDisplay = metaVercelLabel || (metaDeploymentDisplay !== '—' ? metaDeploymentDisplay : '');
  const metaFooterTimestamp = metaTimestampLabel || metaNowLabel || '—';
  const metaSnapshotHasValue = (value) => Boolean(value && value !== '—');
  const metaRepoSnapshot = metaSnapshotHasValue(metaRepoDisplay) ? `Repo ${metaRepoDisplay}` : '';
  const metaBranchSnapshot = metaSnapshotHasValue(metaBranchDisplay) ? `Branch ${metaBranchDisplay}` : '';
  const metaCommitSnapshot = metaSnapshotHasValue(metaCommitFull)
    ? `Commit ${metaCommitFull}${metaCommitDisplay && metaCommitDisplay !== metaCommitFull ? ` (${metaCommitDisplay})` : ''}`
    : '';
  const metaDeploymentSnapshot = metaSnapshotHasValue(metaDeploymentDisplay) ? `Deployment ${metaDeploymentDisplay}` : '';
  const metaVercelSnapshot = metaSnapshotHasValue(metaVercelDisplay) && metaVercelDisplay !== metaDeploymentDisplay
    ? `Vercel ${metaVercelDisplay}`
    : '';
  const metaCapturedSnapshot = metaSnapshotHasValue(metaFooterTimestamp) ? `Captured ${metaFooterTimestamp}` : '';
  const metaDevSummaryParts = [
    metaRepoSnapshot,
    metaBranchSnapshot,
    metaCommitSnapshot,
    metaDeploymentSnapshot,
    metaVercelSnapshot,
    metaCapturedSnapshot,
  ].filter(Boolean);
  const metaDevSummary = metaDevSummaryParts.length ? metaDevSummaryParts.join(' • ') : 'Repo snapshot unavailable';
  const metaRepoFooterLabel = metaSnapshotHasValue(metaRepoDisplay) ? metaRepoDisplay : '—';
  const metaBranchFooterLabel = metaSnapshotHasValue(metaBranchDisplay) ? metaBranchDisplay : '—';
  const metaCommitFooterLabel = metaSnapshotHasValue(metaCommitFull) ? metaCommitFull : (metaSnapshotHasValue(metaCommitDisplay) ? metaCommitDisplay : '—');
  const metaDeploymentFooterLabel = metaSnapshotHasValue(metaDeploymentDisplay) ? metaDeploymentDisplay : '—';
  const metaFooterNowLabel = metaNowLabel || '—';
  const metaDevFooterLine = `Repo: ${metaRepoFooterLabel} • Branch: ${metaBranchFooterLabel} • Commit: ${metaCommitFooterLabel} • Deployment: ${metaDeploymentFooterLabel} • Generated ${metaFooterNowLabel}`;
  const activeSlugForClient = isDefault ? '' : activeSlug; // omit for Default Game

  if (isBootstrapping) {
    return (
      <main style={{ maxWidth: 900, margin: '40px auto', color: 'var(--admin-muted)', padding: 16 }}>
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: '1px solid var(--admin-border-soft)',
            background: 'var(--appearance-panel-bg, var(--admin-panel-bg))',
            boxShadow: 'var(--appearance-panel-shadow, var(--admin-panel-shadow))',
          }}
        >
          Loading… (pulling config & missions)
        </div>
      </main>
    );
  }

  return (
    <div style={S.body}>
      <HideLegacyStatusToggles />
      <div style={S.headerShell}>
        <HeaderBar
          iconUrl={headerCoverThumb}
          title={headerGameTitle}
          isSettings={tab === 'settings'}
          status={headerStatus}
          onBack={() => setTab('missions')}
          onGo={handleHeaderNav}
          onUpdate={() => saveFull(false)}
          onSaveAndPublish={handleMakeLive}
          onMakeLive={handleMakeLive}
          onSetDraftMode={handleSetDraftMode}
        />
      </div>
      <div style={S.headerControls}>
        <div style={S.headerControlsRow}>
          <div style={S.headerToggleGroup}>
            <button
              type="button"
              onClick={() => setEditChannel('draft')}
              style={{ ...S.tab, ...(headerStatus === 'draft' ? S.tabActive : {}), fontWeight: 700 }}
              title="Edit in Draft mode"
            >
              Draft
            </button>
            <button
              type="button"
              onClick={() => setEditChannel('published')}
              style={{ ...S.tab, ...(headerStatus === 'published' ? S.tabActive : {}), fontWeight: 700 }}
              title="Enable publishing actions"
            >
              Published
            </button>
          </div>
          {gameEnabled && (
            <div style={S.headerGameSelect}>
              <label style={S.headerGameSelectLabel}>Game:</label>
              <select
                value={activeSlug}
                onChange={(e) => setActiveSlug(e.target.value)}
                style={{ ...S.input, width: 240 }}
              >
                {selectGameOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {tab !== 'settings' && (
          <div style={S.headerHint}>
            Settings holds game management actions, including Save & Publish.
          </div>
        )}
      </div>

      {/* MISSIONS */}
      {tab==='missions' && (
        <main style={S.wrapGrid2}>
          {/* Left list */}
          <aside style={S.sidebarTall}>
            <div style={S.sidebarBar}>
              <div style={S.noteText}>Launch a brand-new mission in this timeline.</div>
              <button
                onClick={startNew}
                style={{
                  ...S.action3DButton,
                  ...(newMissionButtonFlash ? S.action3DFlash : {}),
                }}
                title="Create a new mission and open the editor"
              >
                + New Mission
              </button>
            </div>
            <input
              placeholder="Search…"
              onChange={(e) => {
                const q=e.target.value.toLowerCase();
                document.querySelectorAll('[data-m-title]').forEach(it=>{
                  const t=(it.getAttribute('data-m-title')||'').toLowerCase();
                  it.style.display = t.includes(q) ? '' : 'none';
                });
              }}
              style={S.search}
            />
            <div>
              {(suite.missions||[]).map((m, idx)=>(
                <div key={m.id} data-m-title={(m.title||'')+' '+m.id+' '+m.type} style={S.missionItem}>
                  <div style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:8, alignItems:'center' }}>
                    <button style={{ ...S.button, padding:'6px 10px' }} onClick={()=>removeMission(m.id)}>Delete</button>
                    <div onClick={()=>editExisting(m)} style={{ cursor:'pointer' }}>
                      <div style={{ fontWeight:600 }}>
                        <span style={{ opacity:.65, marginRight:6 }}>#{idx+1}</span>{m.title||m.id}
                      </div>
                      <div style={{ color:'var(--admin-muted)', fontSize:12 }}>{TYPE_LABELS[m.type] || m.type} — id: {m.id}</div>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button title="Move up"   style={{ ...S.button, padding:'6px 10px' }} onClick={()=>moveMission(idx,-1)}>▲</button>
                      <button title="Move down" style={{ ...S.button, padding:'6px 10px' }} onClick={()=>moveMission(idx,+1)}>▼</button>
                      <button title="Duplicate" style={{ ...S.button, padding:'6px 10px' }} onClick={()=>duplicateMission(idx)}>⧉</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* Right: Missions Map */}
          <section style={{ position:'relative' }}>
            <div style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:12, marginBottom:8, flexWrap:'wrap' }}>
                <div>
                  <h3 style={{ margin:0 }}>Missions Map</h3>
                  <div style={{ color:'var(--admin-muted)', fontSize:12 }}>
                    Click a <b>mission</b> pin to select. Drag the selected mission, or click the map to move it. Devices are visible here but not editable.
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <label style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <input type="checkbox" checked={showRings} onChange={(e)=>setShowRings(e.target.checked)}/> Show radius rings
                  </label>
                  <label style={{ display:'flex', alignItems:'center', gap:6 }}>
                    Selected pin size:
                    <input type="range" min={16} max={120} step={2} value={selectedPinSize}
                      disabled={selectedMissionIdx==null}
                      onChange={(e)=>setSelectedPinSize(Number(e.target.value))}
                    />
                    <code style={{ color:'var(--admin-muted)' }}>{selectedMissionIdx==null ? '—' : `${selectedPinSize}px`}</code>
                  </label>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center', marginBottom:8 }}>
                <input
                  type="range" min={5} max={500} step={5}
                  disabled={missionRadiusDisabled}
                  value={missionRadiusValue}
                  onChange={(e)=> setSelectedMissionRadius(Number(e.target.value)) }
                />
                <code style={{ color:'var(--admin-muted)' }}>
                  {selectedMissionIdx==null ? 'Select a mission to adjust radius' : `M${selectedMissionIdx+1} radius: ${missionRadiusValue} m`}
                </code>
              </div>

              <MapOverview
                missions={(suite?.missions)||[]}
                devices={(config?.devices)||[]}
                icons={config?.icons || DEFAULT_ICONS}
                showRings={showRings}
                interactive={false}
                draftDevice={null}
                selectedDevIdx={null}
                selectedMissionIdx={selectedMissionIdx}
                onDraftChange={null}
                onMoveSelected={null}
                onMoveSelectedMission={(lat,lng)=>moveSelectedMission(lat,lng)}
                onSelectDevice={null}
                onSelectMission={(i)=>{ setSelectedMissionIdx(i); }}
                mapCenter={mapCenter}
                mapZoom={mapZoom}
                defaultIconSizePx={defaultPinSize}
                selectedIconSizePx={selectedPinSize}
                readOnly={false}
                lockToRegion={false}
              />
            </div>

            {/* Mission editor (overlay) */}
            {editing && (
              <div style={S.overlay}>
                <div style={{ ...S.card, width:'min(860px, 94vw)', maxHeight:'82vh', overflowY:'auto', position:'relative' }}>
                  <div style={S.floatingBarTop}>
                    <div style={S.overlayBarSide}>
                      <button
                        style={S.cancelGlowButton}
                        onClick={cancelEdit}
                        title="Close the mission editor without saving"
                      >
                        Cancel & Close
                      </button>
                      <div style={S.noteText}>Exit safely without saving changes.</div>
                    </div>
                    <div style={S.overlayCenter}>
                      <div style={S.overlayIdRow}>
                        <span style={S.overlayIdLabel}>Mission ID</span>
                        <code style={S.overlayIdValue}>{editing.id || '—'}</code>
                      </div>
                      <h3 style={{ margin: '0', fontSize: 18 }}>
                        {editingIsNew ? 'New Mission' : 'Edit Mission'}
                      </h3>
                      <div style={S.noteText}>Update the mission heading, type, and icon, then save.</div>
                    </div>
                    <div style={S.overlayBarSide}>
                      <button
                        style={{
                          ...S.action3DButton,
                          ...(missionActionFlash ? S.action3DFlash : {}),
                        }}
                        onClick={handleMissionSave}
                        title={missionButtonTitleAttr}
                      >
                        {missionButtonLabel}
                      </button>
                      <div style={S.noteText}>Glows green each time a mission save succeeds.</div>
                    </div>
                  </div>

                  <div style={S.missionPrimaryRow}>
                    <div>
                      {missionIconPreviewUrl ? (
                        <img
                          alt="icon preview"
                          src={missionIconPreviewUrl}
                          style={{ width: 48, height: 48, objectFit: 'contain', border: '1px solid var(--admin-border-soft)', borderRadius: 8 }}
                        />
                      ) : (
                        <div style={{ width: 48, height: 48, border: '1px dashed var(--admin-border-soft)', borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--admin-muted)' }}>
                          icon
                        </div>
                      )}
                    </div>
                    <Field label="Title">
                      <input
                        style={S.input}
                        value={editing.title || ''}
                        onChange={(e) => {
                          setEditing({ ...editing, title: e.target.value });
                          setDirty(true);
                        }}
                        placeholder="Mission title"
                      />
                    </Field>
                    <Field label="Type">
                      <select
                        style={S.input}
                        value={editing.type}
                        onChange={(e) => {
                          const t = e.target.value;
                          setEditing({ ...editing, type: t, content: defaultContentForType(t) });
                          setDirty(true);
                        }}
                      >
                        {Object.keys(TYPE_FIELDS).map((k) => (
                          <option key={k} value={k}>{TYPE_LABELS[k] || k}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Icon">
                      <select
                        style={S.input}
                        value={editing.iconKey || ''}
                        onChange={(e) => {
                          setEditing({ ...editing, iconKey: e.target.value });
                          setDirty(true);
                        }}
                      >
                        <option value="">(default)</option>
                        {missionIconOptions.map((it) => (
                          <option key={it.key} value={it.key}>{it.name || it.key}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div style={{ ...S.noteText, marginTop: -6 }}>
                    This label appears inside the admin and player timelines.
                  </div>

                  <hr style={S.hr}/>

                  {editing.type === 'multiple_choice' && (
                    <>
                      <Field label="Question">
                        <input
                          style={S.input}
                          value={editing.content?.question || ''}
                          onChange={(e)=>{ setEditing({ ...editing, content:{ ...(editing.content||{}), question:e.target.value } }); setDirty(true); }}
                        />
                      </Field>
                      <div style={{ marginBottom: 12 }}>
                        <MultipleChoiceEditor
                          value={Array.isArray(editing.content?.choices) ? editing.content.choices : []}
                          correctIndex={editing.content?.correctIndex}
                          onChange={({ choices, correctIndex }) => {
                            setEditing({ ...editing, content: { ...editing.content, choices, correctIndex } });
                            setDirty(true);
                          }}
                        />
                      </div>
                    </>
                  )}

                  {editing.type === 'short_answer' && (
                    <>
                      <Field label="Question">
                        <input
                          style={S.input}
                          value={editing.content?.question || ''}
                          onChange={(e)=>{ setEditing({ ...editing, content:{ ...(editing.content||{}), question:e.target.value } }); setDirty(true); }}
                        />
                      </Field>
                      <Field label="Correct Answer">
                        <input
                          style={S.input}
                          value={editing.content?.answer || ''}
                          onChange={(e)=>{ setEditing({ ...editing, content:{ ...(editing.content||{}), answer:e.target.value } }); setDirty(true); }}
                        />
                      </Field>
                      <Field label="Also Accept (comma-separated) (optional)">
                        <input
                          style={S.input}
                          value={editing.content?.acceptable || ''}
                          onChange={(e)=>{ setEditing({ ...editing, content:{ ...(editing.content||{}), acceptable:e.target.value } }); setDirty(true); }}
                        />
                      </Field>
                    </>
                  )}

                  {editing.type === 'statement' && (
                    <Field label="Statement Text">
                      <textarea
                        style={{ ...S.input, height: 120, fontFamily: 'ui-monospace, Menlo' }}
                        value={editing.content?.text || ''}
                        onChange={(e) => {
                          setEditing({ ...editing, content: { ...(editing.content || {}), text: e.target.value } });
                          setDirty(true);
                        }}
                      />
                    </Field>
                  )}

                  {(editing.type==='geofence_image'||editing.type==='geofence_video') && (
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:12, color:'var(--admin-muted)', marginBottom:6 }}>Pick location & radius</div>
                      <MapPicker
                        lat={editing.content?.lat} lng={editing.content?.lng} radius={editing.content?.radiusMeters ?? 25}
                        center={mapCenter}
                        onChange={(l1,l2,rad)=>{ setEditing({ ...editing, content:{ ...editing.content, lat:l1, lng:l2, radiusMeters:clamp(rad,5,500) } }); setDirty(true); }}
                      />
                    </div>
                  )}

                  {(editing.type==='multiple_choice'||editing.type==='short_answer'||editing.type==='statement'||editing.type==='video'||editing.type==='stored_statement') && (
                    <div style={{ marginBottom:12 }}>
                      <label style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                        <input type="checkbox" checked={!!editing.content?.geofenceEnabled}
                          onChange={(e)=>{ const on=e.target.checked;
                            const next={ ...editing.content, geofenceEnabled:on };
                            if (on && (!isFinite(Number(next.lat)) || !isFinite(Number(next.lng)))) { next.lat=mapCenter.lat; next.lng=mapCenter.lng; }
                            setEditing({ ...editing, content:next }); setDirty(true);
                          }}/> Enable geofence for this mission
                      </label>
                      {editing.content?.geofenceEnabled && (
                        <>
                          <MapPicker
                            lat={editing.content?.lat} lng={editing.content?.lng} radius={editing.content?.radiusMeters ?? 25}
                            center={mapCenter}
                            onChange={(l1,l2,rad)=>{ setEditing({ ...editing, content:{ ...editing.content, lat:l1, lng:l2, radiusMeters:clamp(rad,5,500) } }); setDirty(true); }}
                          />
                          <Field label="Cooldown (sec)">
                            <input type="number" min={0} max={3600} style={S.input}
                              value={editing.content?.cooldownSeconds ?? 30}
                              onChange={(e)=>{ const v=Number(e.target.value||0); setEditing({ ...editing, content:{ ...editing.content, cooldownSeconds:v } }); setDirty(true); }}
                            />
                          </Field>
                        </>
                      )}
                    </div>
                  )}

                  {(TYPE_FIELDS[editing.type] || [])
                    .filter(f => !(editing.type === 'multiple_choice' && f.key === 'question'))
                    .filter(f => !(editing.type === 'short_answer' && (f.key === 'question' || f.key === 'answer' || f.key === 'acceptable')))
                    .filter(f => !(editing.type === 'statement' && f.key === 'text'))
                    .map((f)=>(
                    <Field key={f.key} label={f.label}>
                      {f.type==='text' && (
                        <>
                          <input style={S.input} value={editing.content?.[f.key] || ''}
                            onChange={(e)=>{ setEditing({ ...editing, content:{ ...editing.content, [f.key]: e.target.value } }); setDirty(true); }}/>
                          {['mediaUrl','imageUrl','videoUrl','assetUrl','markerUrl'].includes(f.key) && (
                            <MediaPreview url={editing.content?.[f.key]} kind={f.key}/>
                          )}
                        </>
                      )}
                      {f.type==='number' && (
                        <input type="number" min={f.min} max={f.max} style={S.input}
                          value={editing.content?.[f.key] ?? ''} onChange={(e)=>{
                            const v = e.target.value==='' ? '' : Number(e.target.value);
                            const vClamped = (f.key==='radiusMeters') ? clamp(v,5,500) : v;
                            setEditing({ ...editing, content:{ ...editing.content, [f.key]:vClamped } }); setDirty(true);
                          }}/>
                      )}
                      {f.type==='multiline' && (
                        <textarea style={{ ...S.input, height:120, fontFamily:'ui-monospace, Menlo' }}
                          value={editing.content?.[f.key] || ''} onChange={(e)=>{
                            setEditing({ ...editing, content:{ ...editing.content, [f.key]: e.target.value } }); setDirty(true);
                          }}/>
                      )}
                    </Field>
                  ))}

                  <Field label="Points (Reward)">
                    <input type="number" style={S.input} value={editing.rewards?.points ?? 0}
                      onChange={(e)=>{ const v=e.target.value===''?0:Number(e.target.value);
                        setEditing({ ...editing, rewards:{ ...(editing.rewards||{}), points:v } }); setDirty(true); }}/>
                  </Field>

                  
                  <div style={{ marginTop:16, border:'1px solid var(--admin-border-soft)', borderRadius:10, padding:12 }}>
                    <div style={{ fontWeight:700, marginBottom:8 }}>Trigger</div>
                    <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input
                        type="checkbox"
                        checked={missionTriggerState.enabled}
                        onChange={(e)=>{
                          setMissionTriggerPicker('');
                          updateMissionTrigger({ enabled: e.target.checked });
                        }}
                      />
                      <span>Trigger Device — when this device is breached or deployed it will create an action.</span>
                    </label>

                    {missionTriggerState.enabled ? (() => {
                      const trigger = missionTriggerState;
                      const actionOptions = triggerOptionSets[trigger.actionType] || [];
                      const selectedAction = actionOptions.find(opt => opt.id === trigger.actionTarget) || null;
                      const actionPreview = trigger.actionThumbnail || selectedAction?.thumbnail || '';
                      const resolvedActionPreview = actionPreview ? toDirectMediaURL(actionPreview) : '';
                      const deviceOptions = triggerOptionSets.devices || [];
                      const selectedDevice = deviceOptions.find(opt => opt.id === trigger.triggerDeviceId) || null;
                      const responseOptions = triggerOptionSets.responses || [];
                      const selectedResponse = responseOptions.find(opt => opt.id === trigger.triggeredResponseKey) || null;
                      const missionOptions = triggerOptionSets.missions || [];
                      const selectedMission = missionOptions.find(opt => opt.id === trigger.triggeredMissionId) || null;
                      const responsePreview = selectedResponse?.thumbnail ? toDirectMediaURL(selectedResponse.thumbnail) : '';
                      const devicePreview = selectedDevice?.thumbnail ? toDirectMediaURL(selectedDevice.thumbnail) : '';
                      const missionPreview = selectedMission?.thumbnail ? toDirectMediaURL(selectedMission.thumbnail) : '';
                      return (
                        <>
                          <div style={{ marginTop:12, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                            <div style={{ fontSize:12, color:'var(--admin-muted)' }}>Action type</div>
                            <select
                              style={S.input}
                              value={trigger.actionType}
                              onChange={(e)=>{
                                setMissionTriggerPicker('');
                                updateMissionTrigger({ actionType: e.target.value, actionTarget:'', actionLabel:'', actionThumbnail:'' });
                              }}
                            >
                              <option value="media">Media</option>
                              <option value="devices">Devices</option>
                              <option value="missions">Missions</option>
                            </select>
                          </div>

                          <TriggerDropdown
                            label="Action target"
                            openKey={missionTriggerPicker}
                            setOpenKey={setMissionTriggerPicker}
                            dropdownKey="mission-action"
                            options={actionOptions}
                            selected={selectedAction}
                            onSelect={(opt)=>{
                              updateMissionTrigger({
                                actionTarget: opt?.id || '',
                                actionLabel: opt?.label || '',
                                actionThumbnail: opt?.thumbnail || '',
                              });
                            }}
                          />
                          {resolvedActionPreview && (
                            <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:12 }}>
                              <div style={{ fontSize:12, color:'var(--admin-muted)' }}>Selected action preview</div>
                              <div style={{ width:80, height:60, borderRadius:10, overflow:'hidden', border:'1px solid var(--admin-border-soft)', background:'var(--admin-tab-bg)', display:'grid', placeItems:'center' }}>
                                <img src={resolvedActionPreview} alt="action preview" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                              </div>
                            </div>
                          )}

                          <TriggerDropdown
                            label="Trigger Device"
                            openKey={missionTriggerPicker}
                            setOpenKey={setMissionTriggerPicker}
                            dropdownKey="mission-device"
                            options={deviceOptions}
                            selected={selectedDevice}
                            onSelect={(opt)=>{
                              updateMissionTrigger({
                                triggerDeviceId: opt?.id || '',
                                triggerDeviceLabel: opt?.label || '',
                              });
                            }}
                          />
                          {devicePreview && (
                            <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:12 }}>
                              <div style={{ fontSize:12, color:'var(--admin-muted)' }}>Device preview</div>
                              <div style={{ width:72, height:56, borderRadius:10, overflow:'hidden', border:'1px solid var(--admin-border-soft)', background:'var(--admin-tab-bg)', display:'grid', placeItems:'center' }}>
                                <img src={devicePreview} alt="device preview" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                              </div>
                            </div>
                          )}

                          <TriggerDropdown
                            label="Triggered Response"
                            openKey={missionTriggerPicker}
                            setOpenKey={setMissionTriggerPicker}
                            dropdownKey="mission-response"
                            options={responseOptions}
                            selected={selectedResponse}
                            onSelect={(opt)=>{
                              updateMissionTrigger({
                                triggeredResponseKey: opt?.id || '',
                              });
                            }}
                          />
                          {responsePreview && (
                            <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:12 }}>
                              <div style={{ fontSize:12, color:'var(--admin-muted)' }}>Response preview</div>
                              <div style={{ width:80, height:60, borderRadius:10, overflow:'hidden', border:'1px solid var(--admin-border-soft)', background:'var(--admin-tab-bg)', display:'grid', placeItems:'center' }}>
                                <img src={responsePreview} alt="response preview" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                              </div>
                            </div>
                          )}

                          <TriggerDropdown
                            label="Triggered Mission"
                            openKey={missionTriggerPicker}
                            setOpenKey={setMissionTriggerPicker}
                            dropdownKey="mission-mission"
                            options={missionOptions}
                            selected={selectedMission}
                            onSelect={(opt)=>{
                              updateMissionTrigger({
                                triggeredMissionId: opt?.id || '',
                              });
                            }}
                          />
                          {missionPreview && (
                            <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:12 }}>
                              <div style={{ fontSize:12, color:'var(--admin-muted)' }}>Triggered mission preview</div>
                              <div style={{ width:72, height:56, borderRadius:10, overflow:'hidden', border:'1px solid var(--admin-border-soft)', background:'var(--admin-tab-bg)', display:'grid', placeItems:'center' }}>
                                <img src={missionPreview} alt="mission preview" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })() : (
                      <div style={{ marginTop:8, color:'var(--admin-muted)', fontSize:12 }}>Enable Trigger Device to configure trigger actions.</div>
                    )}
                  </div>

                  {/* Mission Response (Correct/Wrong): below map, above Continue */}
                  <SafeBoundary
                    fallback={missionResponsesFallback}
                    onError={(error) => {
                      console.error('Mission responses render failure', error);
                      setMissionResponsesError(error);
                      const message = error?.message || error || 'unknown error';
                      setStatus(`❌ Mission responses failed to load: ${message}`);
                    }}
                    onReset={() => setMissionResponsesError(null)}
                    resetKeys={[missionResponsesError, editing, inventory]}
                  >
                    <InlineMissionResponses editing={editing} setEditing={setEditing} inventory={inventory} />
                  </SafeBoundary>

                  <hr style={S.hr} />
                  <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <input
                      type="checkbox"
                      checked={editing.showContinue !== false}
                      onChange={(e)=>{ setEditing({ ...editing, showContinue: e.target.checked }); setDirty(true); }}
                    />
                    Show “Continue” button to close this mission
                  </label>

                  <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <input type="checkbox" checked={!!editing.appearanceOverrideEnabled}
                      onChange={(e)=>{ setEditing({ ...editing, appearanceOverrideEnabled:e.target.checked }); setDirty(true); }}/>
                    Use custom appearance for this mission
                  </label>
                  {editing.appearanceOverrideEnabled && (
                    <AppearanceEditor value={editing.appearance||defaultAppearance()}
                      tone={interfaceTone}
                      onChange={(next)=>{ setEditing({ ...editing, appearance:next }); setDirty(true); }}/>
                  )}

                  {dirty && <div style={{ marginTop:6, color:'#ffd166' }}>Unsaved changes…</div>}
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {/* DEVICES */}
      {tab==='devices' && (
        <main style={S.wrapGrid2}>
          <aside style={S.sidebarTall}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:8, marginBottom:8 }}>
              <form onSubmit={devSearch} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:8 }}>
                <input placeholder="Search address or place…" style={S.input} value={devSearchQ} onChange={(e)=>setDevSearchQ(e.target.value)} />
                <button type="button" style={S.button} onClick={useMyLocation}>📍 My location</button>
                <button type="submit" disabled={devSearching} style={S.button}>{devSearching ? 'Searching…' : 'Search'}</button>
              </form>

              <div style={{ background:'var(--admin-input-bg)', border:'1px solid var(--admin-border-soft)', borderRadius:10, padding:8, maxHeight:180, overflow:'auto', display: devResults.length>0 ? 'block' : 'none' }}>
                {devResults.map((r,i)=>(
                  <div key={i} onClick={()=>applySearchResult(r)} style={{ padding:'6px 8px', cursor:'pointer', borderBottom:'1px solid var(--admin-border-soft)' }}>
                    <div style={{ fontWeight:600 }}>{r.display_name}</div>
                    <div style={{ color:'var(--admin-muted)', fontSize:12 }}>lat {Number(r.lat).toFixed(6)}, lng {Number(r.lon).toFixed(6)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={S.sidebarBar}>
              <div style={S.noteText}>Deploy devices and markers from this control strip.</div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
                {selectedDevIdx!=null && (
                  <button
                    style={S.button}
                    onClick={()=>{ setSelectedDevIdx(null); closeDeviceEditor(); }}
                    title="Deselect the highlighted device"
                  >
                    Clear selection
                  </button>
                )}
                <button
                  style={{
                    ...S.action3DButton,
                    ...(addDeviceButtonFlash ? S.action3DFlash : {}),
                  }}
                  onClick={addDevice}
                  title="Create a new device draft"
                >
                  + Add Device
                </button>
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(devices||[]).map((x,i)=>{
                const iconUrl = x.iconKey ? deviceIconUrlFromKey(x.iconKey) : '';
                const selected = selectedDevIdx === i;
                const hasCoords = typeof x.lat === 'number' && typeof x.lng === 'number';
                return (
                  <div
                    key={x.id||i}
                    onClick={()=>openDeviceEditor(i)}
                    style={{
                      display:'grid',
                      gridTemplateColumns:'56px 1fr auto',
                      gap:12,
                      alignItems:'center',
                      padding:12,
                      borderRadius:12,
                      border:`1px solid ${selected ? 'rgba(45, 212, 191, 0.35)' : 'var(--admin-border-soft)'}`,
                      background:selected ? 'var(--admin-tab-active-bg)' : 'var(--appearance-panel-bg, var(--admin-panel-bg))',
                      cursor:'pointer',
                    }}
                  >
                    <div style={{ width:52, height:52, borderRadius:10, background:'var(--appearance-panel-bg, var(--admin-panel-bg))', border:'1px solid var(--admin-border-soft)', display:'grid', placeItems:'center', overflow:'hidden' }}>
                      {iconUrl
                        ? <img alt={x.title || 'device icon'} src={toDirectMediaURL(iconUrl)} style={{ width:'100%', height:'100%', objectFit:'contain' }}/>
                        : <div style={{ color:'var(--admin-muted)', fontSize:12, textAlign:'center', padding:'6px 4px' }}>{(x.type||'D').slice(0,1).toUpperCase()}</div>}
                    </div>
                    <div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                        <div style={{ fontWeight:600 }}>{`D${i+1}`} — {x.title || '(untitled)'}</div>
                        <div style={{ fontSize:12, color:'var(--admin-muted)' }}>{hasCoords ? `${Number(x.lat).toFixed(4)}, ${Number(x.lng).toFixed(4)}` : 'Not placed'}</div>
                      </div>
                      <div style={{ marginTop:6, display:'flex', gap:8, flexWrap:'wrap', fontSize:12 }}>
                        <span style={S.chip}>{x.type}</span>
                        <span style={S.chip}>Radius {x.pickupRadius} m</span>
                        <span style={S.chip}>Effect {x.effectSeconds}s</span>
                      </div>
                    </div>
                    <div onClick={(e)=>e.stopPropagation()} style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      <div style={{ display:'flex', gap:6 }}>
                        <button title="Move up" style={{ ...S.button, padding:'6px 10px' }} disabled={i===0} onClick={()=>moveDevice(i,-1)}>▲</button>
                        <button title="Move down" style={{ ...S.button, padding:'6px 10px' }} disabled={i===(devices?.length||0)-1} onClick={()=>moveDevice(i,+1)}>▼</button>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button title="Duplicate" style={{ ...S.button, padding:'6px 10px' }} onClick={()=>duplicateDevice(i)}>⧉</button>
                        <button title="Delete" style={{ ...S.button, ...S.buttonDanger, padding:'6px 10px' }} onClick={()=>deleteDevice(i)}>🗑</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {(devices||[]).length===0 && <div style={{ color:'var(--admin-muted)' }}>No devices yet. Use “Add Device” to place devices.</div>}
          </aside>

          <section style={{ position:'relative' }}>
            <div style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:12, marginBottom:8, flexWrap:'wrap' }}>
                <div>
                  <h3 style={{ margin:0 }}>Devices Map</h3>
                  <div style={{ color:'var(--admin-muted)', fontSize:12 }}>
                    Select a <b>device</b> pin to move it. Map uses your **Game Region** center/zoom.
                  </div>
                </div>
              </div>

              {isDeviceEditorOpen && (() => {
                const trigger = mergeTriggerState(devDraft.trigger);
                const actionOptions = triggerOptionSets[trigger.actionType] || [];
                const selectedAction = actionOptions.find(opt => opt.id === trigger.actionTarget) || null;
                const previewThumb = trigger.actionThumbnail || selectedAction?.thumbnail || '';
                const resolvedPreview = previewThumb ? toDirectMediaURL(previewThumb) : '';
                return (
                  <div style={{ border:'1px solid var(--admin-border-soft)', borderRadius:10, padding:12, marginBottom:12 }}>
                    <div style={S.floatingBarTop}>
                      <div style={S.overlayBarSide}>
                        <button
                          style={S.cancelGlowButton}
                          onClick={cancelDeviceEditor}
                          title="Close the device editor without saving"
                        >
                          Cancel & Close
                        </button>
                        <div style={S.noteText}>Use when you need to exit without storing updates.</div>
                      </div>
                      <div style={S.overlayCenter}>
                        <div style={S.overlayIdRow}>
                          <span style={S.overlayIdLabel}>Device ID</span>
                          <code style={S.overlayIdValue}>{devDraft.id || '—'}</code>
                        </div>
                        <h4 style={{ margin:'0 0 6px 0' }}>
                          {deviceEditorMode === 'new' ? 'New Device' : 'Edit Device'}
                        </h4>
                        <div style={{ marginTop:4 }}>
                          <button
                            type="button"
                            style={S.subtleActionButton}
                            onClick={resetDeviceEditor}
                            title="Restore the draft to its last saved state"
                          >
                            Reset draft
                          </button>
                        </div>
                        <div style={S.noteText}>Update the title, type, or trigger settings before saving.</div>
                      </div>
                      <div style={S.overlayBarSide}>
                        <button
                          style={{
                            ...S.action3DButton,
                            ...(deviceActionFlash ? S.action3DFlash : {}),
                          }}
                          onClick={handleDeviceSave}
                          title={deviceButtonTitleAttr}
                        >
                          {deviceButtonLabel}
                        </button>
                        <div style={S.noteText}>Watch for the green flash when the device is stored.</div>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'64px 1fr 1fr 1fr 1fr', gap:8, alignItems:'center' }}>
                      <div>
                        {devDraft.iconKey
                          ? <img alt="icon" src={toDirectMediaURL(deviceIconUrlFromKey(devDraft.iconKey))} style={{ width:48, height:48, objectFit:'contain', border:'1px solid var(--admin-border-soft)', borderRadius:8 }}/>
                          : <div style={{ width:48, height:48, border:'1px dashed var(--admin-border-soft)', borderRadius:8, display:'grid', placeItems:'center', color:'var(--admin-muted)' }}>icon</div>}
                      </div>
                      <Field label="Title"><input style={S.input} value={devDraft.title} onChange={(e)=>setDevDraft(d=>({ ...d, title:e.target.value }))}/></Field>
                      <Field label="Type">
                        <select style={S.input} value={devDraft.type} onChange={(e)=>setDevDraft(d=>({ ...d, type:e.target.value }))}>
                          {DEVICE_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Icon">
                        <select style={S.input} value={devDraft.iconKey} onChange={(e)=>setDevDraft(d=>({ ...d, iconKey:e.target.value }))}>
                          <option value="">(default)</option>
                          {(config?.icons?.devices||[]).map(it=><option key={it.key} value={it.key}>{it.name||it.key}</option>)}
                        </select>
                      </Field>
                      <Field label="Effect (sec)">
                        <input type="number" min={5} max={3600} style={S.input} value={devDraft.effectSeconds}
                          onChange={(e)=>setDevDraft(d=>({ ...d, effectSeconds: clamp(Number(e.target.value||0),5,3600) }))}/>
                      </Field>
                    </div>

                    <div style={{ marginTop:14, border:'1px solid var(--admin-border-soft)', borderRadius:10, padding:12 }}>
                      <div style={{ fontWeight:700, marginBottom:8 }}>Trigger</div>
                      <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <input
                          type="checkbox"
                          checked={trigger.enabled}
                          onChange={(e)=>{
                            const checked = e.target.checked;
                            setDeviceTriggerPicker('');
                            setDevDraft(d=>({ ...d, trigger: mergeTriggerState(d.trigger, { enabled: checked }) }));
                          }}
                        />
                        <span>
                          Trigger Device — when this device is breached or deployed it will create an action.
                        </span>
                      </label>

                      {trigger.enabled ? (
                        <>
                          <div style={{ marginTop:12, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                            <div style={{ fontSize:12, color:'var(--admin-muted)' }}>Action type</div>
                            <select
                              style={S.input}
                              value={trigger.actionType}
                              onChange={(e)=>{
                                const nextType = e.target.value;
                                setDeviceTriggerPicker('');
                                setDevDraft(d=>({
                                  ...d,
                                  trigger: mergeTriggerState(d.trigger, {
                                    actionType: nextType,
                                    actionTarget: '',
                                    actionLabel: '',
                                    actionThumbnail: '',
                                  }),
                                }));
                              }}
                            >
                              <option value="media">Media</option>
                              <option value="devices">Devices</option>
                              <option value="missions">Missions</option>
                            </select>
                          </div>

                          <div style={{ marginTop:12 }}>
                            <div style={{ fontSize:12, color:'var(--admin-muted)', marginBottom:6 }}>Action target</div>
                            <div style={{ position:'relative' }}>
                              <button
                                type="button"
                                style={{ ...S.button, width:'100%', justifyContent:'space-between', display:'flex', alignItems:'center' }}
                                onClick={()=>setDeviceTriggerPicker(prev => prev === 'action' ? '' : 'action')}
                              >
                                <span>{selectedAction ? selectedAction.label : 'Select action target'}</span>
                                <span style={{ opacity:0.6 }}>▾</span>
                              </button>
                              {deviceTriggerPicker === 'action' && (
                                <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0, zIndex:30, maxHeight:240, overflowY:'auto', border:'1px solid var(--admin-border-soft)', borderRadius:10, background:'var(--appearance-panel-bg, var(--admin-panel-bg))', boxShadow:'0 16px 32px rgba(0,0,0,0.4)' }}>
                                  {actionOptions.length === 0 ? (
                                    <div style={{ padding:12, color:'var(--admin-muted)' }}>No options available.</div>
                                  ) : actionOptions.map(opt => (
                                    <div
                                      key={opt.id}
                                      onClick={()=>{
                                        setDevDraft(d=>({
                                          ...d,
                                          trigger: mergeTriggerState(d.trigger, {
                                            actionTarget: opt.id,
                                            actionLabel: opt.label,
                                            actionThumbnail: opt.thumbnail,
                                          }),
                                        }));
                                        setDeviceTriggerPicker('');
                                      }}
                                      style={{ display:'grid', gridTemplateColumns:'56px 1fr', gap:10, alignItems:'center', padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--admin-border-soft)' }}
                                    >
                                      <div style={{ width:56, height:42, borderRadius:8, overflow:'hidden', background:'var(--admin-tab-bg)', display:'grid', placeItems:'center' }}>
                                        {opt.thumbnail ? (
                                          <img src={toDirectMediaURL(opt.thumbnail)} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                        ) : (
                                          <div style={{ fontSize:12, color:'var(--admin-muted)' }}>No preview</div>
                                        )}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight:600 }}>{opt.label}</div>
                                        <div style={{ fontSize:12, color:'var(--admin-muted)' }}>{opt.id}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            {resolvedPreview && (
                              <div style={{ marginTop:12, display:'flex', gap:12, alignItems:'center' }}>
                                <div style={{ fontSize:12, color:'var(--admin-muted)' }}>Selected preview</div>
                                <div style={{ width:80, height:60, borderRadius:10, overflow:'hidden', border:'1px solid var(--admin-border-soft)', background:'var(--admin-tab-bg)', display:'grid', placeItems:'center' }}>
                                  <img src={resolvedPreview} alt="preview" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div style={{ marginTop:8, color:'var(--admin-muted)', fontSize:12 }}>Enable Trigger Device to configure actions.</div>
                      )}
                    </div>

                    <div style={{ marginTop:8, color:'var(--admin-muted)', fontSize:12 }}>
                      {devDraft.lat==null ? 'Click the map or search an address to set location'
                        : <>lat {Number(devDraft.lat).toFixed(6)}, lng {Number(devDraft.lng).toFixed(6)}</>}
                    </div>
                  </div>
                );
              })()}

              <div style={{ display:'grid', gap:8, marginBottom:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <label style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <input type="checkbox" checked={showRings} onChange={(e)=>setShowRings(e.target.checked)}/> Show radius rings
                  </label>
                  <label style={{ display:'flex', alignItems:'center', gap:6 }}>
                    Selected pin size:
                    <input type="range" min={16} max={120} step={2} value={selectedPinSize}
                      disabled={selectedDevIdx==null}
                      onChange={(e)=>setSelectedPinSize(Number(e.target.value))}
                    />
                    <code style={{ color:'var(--admin-muted)' }}>{selectedDevIdx==null ? '—' : `${selectedPinSize}px`}</code>
                  </label>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
                  <input
                    type="range" min={5} max={2000} step={5}
                    disabled={deviceRadiusDisabled}
                    value={deviceRadiusValue}
                    onChange={(e)=>{
                      const r = Number(e.target.value);
                      if (selectedDevIdx!=null) setSelectedDeviceRadius(r);
                      else setDevDraft(d=>({ ...d, pickupRadius: r }));
                    }}
                  />
                  <code style={{ color:'var(--admin-muted)' }}>
                    {selectedDevIdx!=null ? `D${selectedDevIdx+1} radius: ${deviceRadiusValue} m`
                     : isAddingDevice ? `New device radius: ${deviceRadiusValue} m`
                     : 'Select a device to adjust radius'}
                  </code>
                </div>
              </div>

              <MapOverview
                missions={(suite?.missions)||[]}
                devices={devices}
                icons={config?.icons||DEFAULT_ICONS}
                showRings={showRings}
                mapCenter={mapCenter}
                mapZoom={mapZoom}
                defaultIconSizePx={defaultPinSize}
                selectedIconSizePx={selectedPinSize}
                interactive={isAddingDevice}
                draftDevice={isAddingDevice ? { lat:devDraft.lat, lng:devDraft.lng, radius:devDraft.pickupRadius } : null}
                selectedDevIdx={selectedDevIdx}
                selectedMissionIdx={null}
                onDraftChange={isAddingDevice ? ((lat,lng)=>setDevDraft(d=>({ ...d, lat, lng }))) : null}
                onMoveSelected={(lat,lng)=>moveSelectedDevice(lat,lng)}
                onMoveSelectedMission={null}
                onSelectDevice={(i)=>{ openDeviceEditor(i); }}
                onSelectMission={null}
                readOnly={false}
                lockToRegion={true}
              />
            </div>
          </section>
        </main>
      )}

      {/* SETTINGS */}
      {tab==='settings' && (
        <main style={S.wrap}>
          <div style={S.card}>
            <h3 style={{ marginTop:0 }}>Game Settings</h3>
            {/* Codex note (2025-10-30): Saved Games dropdown (filesystem scan via /api/games/list) */}
            <div data-codex="SettingsGamesDropdown">
              <GamesDropdown />
            </div>
            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDeleteOpen(false);
                    openNewGameModal();
                  }}
                  style={{
                    fontSize: 13,
                    padding: '8px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(99,102,241,0.4)',
                    background: 'linear-gradient(135deg, rgba(168,85,247,.08), rgba(99,102,241,.08))',
                    cursor: 'pointer',
                    fontWeight: 600,
                    color: '#1e1b4b',
                  }}
                >
                  + New Game
                </button>
              </div>
              <SavedGamesPicker
                games={savedGamesList}
                value={savedGamesValue}
                defaultSlug={defaultSlug}
                onChange={(val) => {
                  setConfirmDeleteOpen(false);
                  const [slug, channel] = String(val || '').split(':');
                  if (!slug) return;
                  const normalized = channel === 'published' ? 'published' : 'draft';
                  const match = savedGamesList.find(
                    (entry) => entry.slug === slug && (entry.channel || 'draft') === normalized,
                  );
                  const label = match
                    ? `${match.title || match.slug}${normalized === 'published' ? ' (published)' : ' (draft)'}`
                    : undefined;
                  applyOpenGameFromMenu(slug, normalized, label);
                  setActiveTagsToOnly(slug);
                  logConversation('You', `Switched to ${label || slug}`);
                  logConversation('GPT', 'Tag filters updated to focus on the selected game.');
                }}
              />
              <div>
                {confirmDeleteOpen ? (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid rgba(239,68,68,0.35)',
                      background: 'rgba(239,68,68,0.08)',
                    }}
                  >
                    <div style={{ fontSize: 13, color: '#0f172a', flex: '1 1 auto' }}>
                      Are you sure you want to delete “{headerGameTitle}”? 
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteOpen(false);
                        void reallyDeleteGame();
                      }}
                      style={{
                        fontSize: 13,
                        padding: '6px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(239,68,68,0.5)',
                        background: 'rgba(239,68,68,0.12)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: '#7f1d1d',
                      }}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(false)}
                      style={{
                        fontSize: 13,
                        padding: '6px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(15,23,42,0.12)',
                        background: 'white',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      logConversation('You', 'Opened delete confirmation for current game');
                      setConfirmDeleteOpen(true);
                    }}
                    style={{
                      fontSize: 13,
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(239,68,68,0.35)',
                      background: 'rgba(239,68,68,0.08)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: '#7f1d1d',
                    }}
                  >
                    Delete Current Game
                  </button>
                )}
              </div>
            </div>
            <ProjectFlags
              gameEnabled={activeGameMeta?.game_enabled ?? true}
              defaultChannel={activeGameMeta?.default_channel ?? 'draft'}
              useLocationAsDefault={Boolean(activeGameMeta?.settings?.useLocationAsDefault)}
              busy={gameFlagsBusy}
              error={gameFlagsError}
              onMirrorChange={(checked) => saveGameFlags({ gameEnabled: checked }).catch(() => {})}
              onChannelChange={(value) => saveGameFlags({ defaultChannel: value }).catch(() => {})}
              onUseLocationDefaultChange={(checked) => saveGameFlags({ useLocationAsDefault: checked }).catch(() => {})}
            />
            <div style={S.titleEditorBlock}>
              <label style={S.fieldLabel} htmlFor="admin-title-input">Game Title</label>
              <input
                id="admin-title-input"
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="Enter game title"
                style={S.titleInput}
              />
              <div style={S.slugWarning}>
                Changing the title will also update this game’s <strong>tag</strong> to{' '}
                <code style={S.slugMetaCode}>{slugPreview}</code>.
              </div>
              <div style={S.slugMetaRow}>
                <div style={S.slugMetaItem}>
                  <span style={S.slugMetaLabel}>Current tag:</span>{' '}
                  <code style={S.slugMetaCode}>{currentSlugDisplay}</code>
                </div>
                <div style={S.slugMetaItem}>
                  <span style={S.slugMetaLabel}>Preview tag:</span>{' '}
                  <code style={S.slugMetaCode}>{slugPreview}</code>
                </div>
              </div>
              <div style={S.titleActionsRow}>
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  disabled={disableSaveTitle}
                  style={{
                    ...S.saveTitleButton,
                    ...(disableSaveTitle ? S.saveTitleButtonDisabled : {}),
                  }}
                >
                  Save Title
                </button>
              </div>
            </div>

            {slugForMeta === defaultSlug && (
              <div style={S.defaultControlsBlock}>
                <div style={S.defaultControlsHeading}>Default Game Controls</div>
                <label style={S.defaultOverwriteToggle}>
                  <input
                    type="checkbox"
                    checked={overwriteDefaultSnapshot}
                    onChange={(e) => {
                      setOverwriteDefaultSnapshot(e.target.checked);
                      logConversation('You', e.target.checked
                        ? 'Armed overwrite for default snapshot'
                        : 'Cancelled default snapshot overwrite');
                    }}
                  />
                  <span style={{
                    ...S.defaultOverwriteLabel,
                    ...(overwriteDefaultSnapshot ? S.defaultOverwriteLabelActive : {}),
                  }}>
                    Overwrite Original Default (RED when on)
                  </span>
                </label>
                <div style={S.defaultControlsRow}>
                  <button
                    type="button"
                    onClick={handleDefaultSnapshotAction}
                    disabled={disableDefaultAction}
                    style={{
                      ...S.defaultActionButton,
                      ...(overwriteDefaultSnapshot ? S.defaultActionButtonArmed : {}),
                      ...(disableDefaultAction ? S.defaultActionButtonDisabled : {}),
                    }}
                  >
                    {overwriteDefaultSnapshot ? 'Save as New Original Default' : 'Reset to Original Default'}
                  </button>
                  <div style={S.defaultSnapshotNote}>
                    {defaultSnapshotCapturedLabel
                      ? `Original snapshot captured ${defaultSnapshotCapturedLabel}${defaultSnapshotTitle ? ` — ${defaultSnapshotTitle}` : ''}`
                      : 'Snapshot not captured yet. Saving will create one automatically.'}
                  </div>
                </div>
              </div>
            )}
            <div style={S.coverControlsRow}>
              <div
                onDragOver={(e)=>{ e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; setCoverDropActive(true); }}
                onDragLeave={(e)=>{ e.preventDefault(); setCoverDropActive(false); }}
                onDrop={(e)=>{
                  e.preventDefault();
                  setCoverDropActive(false);
                  const file = e.dataTransfer?.files?.[0];
                  if (file) handleCoverFile(file);
                }}
                style={{ ...S.coverDropZone, ...(coverDropActive ? S.coverDropZoneActive : {}) }}
              >
                {coverPreviewUrl ? (
                  <img src={coverPreviewUrl} alt="Cover preview" style={S.coverDropImage} />
                ) : (
                  <div style={S.coverDropPlaceholder}>
                    <strong>Drag & drop cover art</strong>
                    <span>JPG or PNG · under 5&nbsp;MB · ideal at 16:9</span>
                  </div>
                )}
              </div>
              <div style={S.coverActionsColumn}>
                <div style={S.coverActionButtons}>
                  <button
                    style={{ ...S.button, ...S.saveCoverButton, opacity: hasCoverForSave ? 1 : 0.45 }}
                    onClick={saveCoverImageOnly}
                    disabled={!hasCoverForSave}
                  >
                    Save Cover Image
                  </button>
                  <button style={S.button} onClick={()=>coverFileInputRef.current?.click()}>Upload image</button>
                  <input
                    ref={coverFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display:'none' }}
                    onChange={(e)=>{
                      const file = e.target.files?.[0];
                      if (file) handleCoverFile(file);
                      if (e.target) e.target.value = '';
                    }}
                  />
                  <button style={S.button} onClick={openCoverPicker} disabled={coverPickerLoading}>
                    {coverPickerLoading ? 'Loading media…' : 'Media pool'}
                  </button>
                  <button
                    style={{ ...S.button, ...S.buttonDanger }}
                    onClick={clearCoverImage}
                    disabled={!config?.game?.coverImage}
                  >
                    Remove
                  </button>
                </div>
                {uploadStatus && (
                  <div style={S.coverActionStatus}>{uploadStatus}</div>
                )}
                <div style={S.coverActionHint}>
                  Tip: <strong>Save Cover Image</strong> stores this artwork right away and also copies it to <code>/media/covers</code> for reuse.
                </div>
              </div>
            </div>
            <div style={{ marginTop: 18 }} />
            <Field label="Game Type">
              <select style={S.input} value={config.game.type}
                onChange={(e)=>setConfig({ ...config, game:{ ...config.game, type:e.target.value } })}>
                {GAME_TYPES.map((g)=><option key={g} value={g}>{g}</option>)}
              </select>
              <div style={S.noteText}>Pick the base structure for missions and pacing.</div>
            </Field>
            <Field label="Game Tags (comma separated)">
              <input
                style={S.input}
                value={gameTagsDraft}
                onChange={(e)=>updateGameTagsDraft(e.target.value)}
                placeholder="default-game, mystery"
              />
              <div style={S.noteText}>
                Switching games or saving a new title resets this list to the active slug automatically.
              </div>
            </Field>
            <Field label="Stripe Splash Page">
              <label style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="checkbox" checked={config.splash.enabled}
                  onChange={(e)=>setConfig({ ...config, splash:{ ...config.splash, enabled:e.target.checked } })}/>
                Enable Splash (game code & Stripe)
              </label>
              <div style={S.noteText}>Toggles the landing experience with access code + payment prompts.</div>
            </Field>
          </div>

          <div style={{ ...S.card, marginTop:16 }}>
            <h3 style={{ marginTop:0 }}>Game Region, Geofence &amp; Global Location</h3>
            <div
              style={{
                display:'grid',
                gap:16,
                alignItems:'flex-start',
                gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',
              }}
            >
              <div style={{ display:'grid', gap:12 }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
                  <Field label="Default Map Center — Latitude">
                    <input
                      type="number" step="0.000001" style={S.input}
                      value={config.map?.centerLat ?? ''}
                      onChange={(e)=>setConfig({ ...config, map:{ ...(config.map||{}), centerLat: Number(e.target.value||0) } })}
                    />
                  </Field>
                  <Field label="Default Map Center — Longitude">
                    <input
                      type="number" step="0.000001" style={S.input}
                      value={config.map?.centerLng ?? ''}
                      onChange={(e)=>setConfig({ ...config, map:{ ...(config.map||{}), centerLng: Number(e.target.value||0) } })}
                    />
                  </Field>
                  <Field label="Find center by address/city">
                    <form onSubmit={searchMapCenter} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>
                      <input placeholder="Address / City" value={mapSearchQ} onChange={(e)=>setMapSearchQ(e.target.value)} style={S.input}/>
                      <button type="submit" className="button" style={S.button} disabled={mapSearching}>{mapSearching?'Searching…':'Search'}</button>
                    </form>
                    <div style={{ background:'var(--admin-input-bg)', border:'1px solid var(--admin-border-soft)', borderRadius:10, padding:8, marginTop:8, maxHeight:160, overflow:'auto', display: mapResults.length>0 ? 'block' : 'none' }}>
                      {mapResults.map((r,i)=>(
                        <div key={i} onClick={()=>useCenterResult(r)} style={{ padding:'6px 8px', cursor:'pointer', borderBottom:'1px solid var(--admin-border-soft)' }}>
                          <div style={{ fontWeight:600 }}>{r.display_name}</div>
                          <div style={{ color:'var(--admin-muted)', fontSize:12 }}>lat {Number(r.lat).toFixed(6)}, lng {Number(r.lon).toFixed(6)}</div>
                        </div>
                      ))}
                    </div>
                  </Field>
                  <Field label="Default Zoom">
                    <input
                      type="number" min={2} max={20} style={S.input}
                      value={config.map?.defaultZoom ?? 13}
                      onChange={(e)=>setConfig({ ...config, map:{ ...(config.map||{}), defaultZoom: clamp(Number(e.target.value||13), 2, 20) } })}
                    />
                  </Field>
                  <Field label="Geofence Mode">
                    <select
                      style={S.input}
                      value={config.geofence?.mode || 'test'}
                      onChange={(e)=>setConfig({ ...config, geofence:{ ...(config.geofence||{}), mode: e.target.value } })}
                    >
                      <option value="test">Test — click to enter (dev)</option>
                      <option value="live">Live — GPS radius only</option>
                    </select>
                  </Field>
                </div>
                <div style={{ color:'var(--admin-muted)', fontSize:12 }}>
                  These defaults keep pins in the same region. “Geofence Mode” can be used by the Game client to allow click-to-enter in test vs GPS in live.
                </div>
              </div>
              <div style={{ minWidth:0 }}>
                <GlobalLocationSelector
                  initial={globalLocationSeed}
                  useAsDefault={Boolean(activeGameMeta?.settings?.useLocationAsDefault)}
                  onUseAsDefaultChange={(checked) => saveGameFlags({ useLocationAsDefault: checked }).catch(() => {})}
                  onUpdate={(nextLat, nextLng) => handleUpdateAllPins(nextLat, nextLng)}
                />
              </div>
            </div>
          </div>

          <div style={{ ...S.card, marginTop:16 }}>
            <h3 style={{ marginTop:0 }}>Maintenance</h3>
            <div style={S.noteText}>
              Game maintenance actions now live in the header toolbar. Switch to Settings to delete games,
              scan for unused media, or trigger publishing workflows.
            </div>
          </div>

          <div style={{ ...S.card, marginTop:16 }}>
            <h3 style={{ marginTop:0 }}>Appearance (Global)</h3>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'var(--admin-muted)', marginBottom:8 }}>Interface tone</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {[
                  { key:'light', label:'☀️ Light — dark text' },
                  { key:'dark', label:'🌙 Dark — light text' },
                ].map((option) => {
                  const active = interfaceTone === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={()=>updateInterfaceTone(option.key)}
                      style={{
                        borderRadius:12,
                        padding:'8px 14px',
                        border: active ? '1px solid var(--admin-accent)' : '1px solid var(--admin-border-soft)',
                        background: active ? 'var(--admin-tab-active-bg)' : 'var(--admin-tab-bg)',
                        color:'var(--admin-body-color)',
                        cursor:'pointer',
                        fontWeight: active ? 600 : 500,
                        boxShadow: active ? '0 0 0 1px rgba(255,255,255,0.08)' : 'none',
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ color:'var(--admin-muted)', fontSize:12, marginTop:8 }}>
                Switch between bright control-room surfaces or a night-mode deck. The tone applies to the admin UI and live game backgrounds.
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:'var(--admin-muted)', marginBottom:8 }}>Theme skins</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:8 }}>
                {APPEARANCE_SKINS.map((skin)=>{
                  const active = selectedAppearanceSkin === skin.key;
                  const previewBg = skin.appearance.screenBgImage && skin.appearance.screenBgImageEnabled !== false
                    ? `linear-gradient(rgba(0,0,0,${skin.appearance.screenBgOpacity}), rgba(0,0,0,${skin.appearance.screenBgOpacity})), url(${toDirectMediaURL(skin.appearance.screenBgImage)}) center/cover no-repeat`
                    : `linear-gradient(rgba(0,0,0,${skin.appearance.screenBgOpacity}), rgba(0,0,0,${skin.appearance.screenBgOpacity})), ${skin.appearance.screenBgColor}`;
                  return (
                    <button
                      key={skin.key}
                      type="button"
                      onClick={()=>applyAppearanceSkin(skin.key)}
                      style={{
                        borderRadius:12,
                        border:`1px solid ${active ? 'var(--admin-accent)' : 'var(--admin-border-soft)'}`,
                        background: active ? 'var(--admin-tab-active-bg)' : 'var(--admin-tab-bg)',
                        padding:12,
                        textAlign:'left',
                        color:'var(--admin-body-color)',
                        cursor:'pointer',
                      }}
                    >
                      <div style={{ fontWeight:600 }}>{skin.label}</div>
                      <div style={{ fontSize:12, color:'var(--admin-muted)', margin:'4px 0 8px 0' }}>{skin.description}</div>
                      <div style={{
                        border:'1px dashed var(--admin-border-soft)',
                        borderRadius:8,
                        padding:10,
                        background: previewBg,
                        color: skin.appearance.fontColor,
                        fontFamily: skin.appearance.fontFamily,
                        fontSize: Math.max(14, Math.min(20, skin.appearance.fontSizePx * 0.7)),
                        textAlign: skin.appearance.textAlign,
                      }}>
                        Preview text
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop:8, fontSize:12, color:'var(--admin-muted)' }}>
                Selected skin: <strong>{selectedAppearanceSkinLabel}</strong>
              </div>
            </div>
            <AppearanceEditor
              value={config.appearance||defaultAppearance()}
              tone={interfaceTone}
              onChange={(next)=>{
                setConfig(prev => {
                  const base = prev || {};
                  const retainedSkin = base.appearanceSkin && ADMIN_SKIN_TO_UI.has(base.appearanceSkin)
                    ? base.appearanceSkin
                    : detectAppearanceSkin(next, base.appearanceSkin);
                  return {
                    ...base,
                    appearance: next,
                    appearanceSkin: retainedSkin,
                  };
                });
                setDirty(true);
                setStatus('🎨 Updated appearance settings');
              }}
            />
            <div style={{ color:'var(--admin-muted)', marginTop:8, fontSize:12 }}>
              Tip: keep vertical alignment on <b>Top</b> so text doesn’t cover the backpack.
            </div>
          </div>

          <div style={{ ...S.card, marginTop:16 }}>
            <h3 style={{ marginTop:0 }}>Operator ↔ GPT Log</h3>
            {status && (
              <div style={{ color:'var(--admin-muted)', marginBottom:12, whiteSpace:'pre-wrap' }}>{status}</div>
            )}
            <div style={S.conversationLog}>
              {statusLog.length === 0 ? (
                <div style={{ color:'var(--admin-muted)', fontSize:12 }}>No exchanges recorded yet.</div>
              ) : (
                <div style={S.conversationLogEntries}>
                  {statusLog.slice().reverse().map((entry, idx) => (
                    <div key={`${entry.timestamp}-${idx}`} style={S.conversationLogRow}>
                      <span style={{ ...S.conversationBadge, ...(entry.speaker === 'GPT' ? S.conversationBadgeGpt : S.conversationBadgeYou) }}>
                        {entry.speaker}
                      </span>
                      <span style={S.conversationMessage}>{entry.text}</span>
                      <time style={S.conversationTime} dateTime={entry.timestamp}>
                        {formatLocalDateTime(entry.timestamp)}
                      </time>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {adminMeta.error && (
            <div style={{ ...S.card, marginTop:16, ...S.metaErrorCard }}>
              <div style={{ ...S.metaBannerError, margin:0 }}>{adminMeta.error}</div>
            </div>
          )}

          <footer style={S.settingsFooter}>
            <div style={S.settingsFooterHeading}>Repository Snapshot</div>
            <div style={S.settingsFooterRow}>
              <span style={S.settingsFooterItem}>
                <strong>Repo:</strong>{' '}
                {metaRepoUrl ? (
                  <a href={metaRepoUrl} target="_blank" rel="noreferrer" style={S.settingsFooterLink}>
                    {metaRepoDisplay}
                  </a>
                ) : (
                  metaRepoDisplay
                )}
              </span>
              <span style={S.settingsFooterSeparator}>•</span>
              <span style={S.settingsFooterItem}>
                <strong>Branch:</strong>{' '}
                {metaBranchDisplay}
              </span>
              <span style={S.settingsFooterSeparator}>•</span>
              <span style={S.settingsFooterItem}>
                <strong>Commit:</strong>{' '}
                {metaCommitDisplay !== '—' && metaCommitUrl ? (
                  <a
                    href={metaCommitUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={S.settingsFooterLink}
                    title={`Open commit ${metaCommitLabel}`}
                  >
                    {metaCommitDisplay}
                  </a>
                ) : (
                  metaCommitDisplay
                )}
              </span>
              <span style={S.settingsFooterSeparator}>•</span>
              <span style={S.settingsFooterItem}>
                <strong>Deployment:</strong>{' '}
                {metaDeploymentDisplay !== '—' && metaDeploymentUrl ? (
                  <a
                    href={metaDeploymentUrl.startsWith('http') ? metaDeploymentUrl : `https://${metaDeploymentUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    style={S.settingsFooterLink}
                  >
                    {metaDeploymentDisplay}
                  </a>
                ) : (
                  metaDeploymentDisplay
                )}
              </span>
              {metaVercelDisplay && (
                <>
                  <span style={S.settingsFooterSeparator}>•</span>
                  <span style={S.settingsFooterItem}>
                    <strong>Vercel:</strong>{' '}
                    {metaVercelLabel && metaVercelUrl ? (
                      <a href={metaVercelUrl} target="_blank" rel="noreferrer" style={S.settingsFooterLink}>
                        {metaVercelDisplay}
                      </a>
                    ) : (
                      metaVercelDisplay
                    )}
                  </span>
                </>
              )}
            </div>
            <div style={S.settingsFooterTime}>
              Snapshot fetched {metaTimestampLabel || '—'} • Rendered {metaNowLabel || '—'}
            </div>
            <div style={S.settingsFooterTime}>
              Runtime — Node {metaRuntimeNodeLabel || '—'}{metaRuntimeEnvLabel ? ` (${metaRuntimeEnvLabel})` : ''} • npm {metaRuntimeNpmLabel || '—'}{metaRuntimeNpmPath ? ` @ ${metaRuntimeNpmPath}` : ''}{metaRuntimeCorepackLabel ? ` • Corepack ${metaRuntimeCorepackLabel}` : ''} • Platform {metaRuntimePlatform || '—'} • Pinned Node {metaPinnedNodeLabel || '—'}{metaPinnedNpmLabel ? ` • Pinned npm ${metaPinnedNpmLabel}` : ''}{metaPinnedYarnLabel ? ` • Pinned Yarn ${metaPinnedYarnLabel}` : ''}
            </div>
            {metaRuntimePackageManager && (
              <div style={S.settingsFooterTime}>
                Package manager manifest — {metaRuntimePackageManager}
              </div>
            )}
            <div style={S.settingsFooterTime}>
              Dev Environment Snapshot — {metaDevSummary}
            </div>
            <div style={S.settingsFooterTime}>
              {metaDevFooterLine}
            </div>
            <div style={{ ...S.settingsFooterTime, fontWeight: 600 }}>
              Repo: {metaRepoFooterLabel} • Branch: {metaBranchFooterLabel} • Commit: {metaCommitFooterLabel} • Deployment: {metaDeploymentFooterLabel} • Timestamp {metaFooterNowLabel}
            </div>
          </footer>
        </main>
      )}

      {/* TEXT rules */}
      {tab==='text' && <TextTab config={config} setConfig={setConfig} />}

      {/* MEDIA POOL — with sub-tabs and per-file usage counts */}
      {tab==='media-pool' && (
        <MediaPoolTab
          suite={suite}
          config={config}
          setConfig={setConfig}
          uploadStatus={uploadStatus}
          setUploadStatus={setUploadStatus}
          uploadToRepo={async (file, folder, options = {}) => {
            const url = await (async () => { try { return await uploadToRepo(file, folder, options); } catch { return ''; } })();
            return url;
          }}
          onInventoryRefresh={syncInventory}
        />
      )}

      {/* ASSIGNED MEDIA — renamed Media tab */}
      {tab==='assigned' && (
        <AssignedMediaPageTab
          config={config}
          setConfig={setConfig}
          onReapplyDefaults={()=>setConfig(c=> (c ? applyDefaultIcons(c) : c))}
          inventory={inventory}
          devices={devices}
          missions={suite?.missions || []}
          assignedMediaError={assignedMediaError}
          setAssignedMediaError={setAssignedMediaError}
          setStatus={setStatus}
        />
      )}

      {coverPickerOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'grid', placeItems:'center', zIndex:1600, padding:16 }}>
          <div style={{ ...S.card, width:'min(680px, 94vw)', maxHeight:'80vh', overflowY:'auto' }}>
            <h3 style={{ marginTop:0 }}>Select Cover Image</h3>
            {coverPickerLoading ? (
              <div style={{ color:'#9fb0bf' }}>Loading media…</div>
            ) : coverPickerItems.length === 0 ? (
              <div style={{ color:'#9fb0bf' }}>
                No cover-ready images found. Upload a new file or add art to the media pool.
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12 }}>
                {coverPickerItems.map((item) => (
                  <button
                    key={item.url}
                    onClick={()=>applyCoverFromUrl(item.url)}
                    style={{
                      border:'1px solid #2a323b',
                      borderRadius:12,
                      background:'#0b0c10',
                      padding:0,
                      cursor:'pointer',
                      overflow:'hidden',
                      textAlign:'left',
                    }}
                  >
                    <img
                      src={toDirectMediaURL(item.url)}
                      alt={item.name || item.url}
                      style={{ width:'100%', height:120, objectFit:'cover' }}
                    />
                    <div style={{ padding:'6px 8px', fontSize:12, color:'#9fb0bf' }}>{item.name || item.url}</div>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
              <button style={S.button} onClick={()=>setCoverPickerOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* TEST */}
      {tab==='test' && (
        <main style={S.wrap}>
          <div style={S.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <h3 style={{ margin:0 }}>Play Test</h3>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <label>Channel:&nbsp;
                  <select value={testChannel} onChange={(e)=>setTestChannel(e.target.value)} style={S.input}>
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                  </select>
                </label>
                <button style={S.button} onClick={()=>setPreviewNonce(n=>n+1)}>Reload preview</button>
                <TestLauncher slug={activeSlugForClient} channel={testChannel} preferPretty={true} popup={false}/>
                <HomeDefaultButtons />
              </div>
            </div>
            {!gameBase && <div style={{ color:'var(--admin-muted)', marginBottom:8 }}>Set NEXT_PUBLIC_GAME_ORIGIN to enable preview.</div>}
            {gameBase && (
              <iframe
                key={previewNonce} // hard refresh on nonce change
                src={`${gameBase}/?${new URLSearchParams({
                  ...(activeSlugForClient ? { slug: activeSlugForClient } : {}),
                  channel: testChannel,
                  preview: '1',
                  cb: String(Date.now())
                }).toString()}`}
                style={{ width:'100%', height:'70vh', border:'1px solid var(--admin-border-soft)', borderRadius:12 }}
              />
            )}
          </div>
        </main>
      )}

      {/* New Game modal */}
      {showNewGame && (
        <div style={S.modalBackdrop}>
          <div style={{ ...S.card, ...S.modalCard }}>
            <div style={S.modalTopBar}>
              <button style={S.cancelGlowButton} onClick={handleNewGameModalClose}>Cancel & Close</button>
              <div style={S.modalTitleStack}>
                <div style={S.modalTitle}>Create New Game</div>
              </div>
              <button style={S.modalCloseButton} onClick={handleNewGameModalClose} aria-label="Close new game dialog">×</button>
            </div>
            <div style={S.modalContent}>
              <Field label="Game Title">
                <input
                  style={S.input}
                  value={newTitle}
                  onChange={(e)=>setNewTitle(e.target.value)}
                  placeholder="Starship Escape"
                />
                <div style={S.noteText}>This name appears wherever the game is listed.</div>
                <div style={S.noteText}>A unique slug is generated automatically for storage and Supabase lookups.</div>
              </Field>
              <Field label="Game Slug">
                <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
                  <input
                    style={S.input}
                    value={newGameSlug}
                    onChange={(e)=>handleNewGameSlugInput(e.target.value)}
                    placeholder="escape-ride-starship"
                    maxLength={48}
                  />
                  <button
                    type="button"
                    style={{ ...S.button, whiteSpace:'nowrap' }}
                    onClick={()=>regenerateNewGameSlug({ resetSeed: true })}
                  >
                    Reset slug
                  </button>
                </div>
                <div style={S.noteText}>
                  Used for file storage and Supabase records. Lowercase, numbers, and dashes only. Max 48 characters.
                </div>
                <div style={S.noteText}>
                  Example path: <code>/public/games/{newGameSlug || 'your-slug'}</code>
                </div>
              </Field>
              <Field label="Initial Channel">
                <div style={{ display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
                  <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                    <input
                      type="radio"
                      name="new-game-channel"
                      checked={newGameChannel === 'draft'}
                      onChange={() => setNewGameChannel('draft')}
                    />
                    Draft
                  </label>
                  <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                    <input
                      type="radio"
                      name="new-game-channel"
                      checked={newGameChannel === 'published'}
                      onChange={() => setNewGameChannel('published')}
                    />
                    Live (Publish)
                  </label>
                </div>
                <div style={S.noteText}>
                  Draft keeps the game private; Live publishes immediately using the latest snapshot.
                </div>
              </Field>
              <Field label="Game Type">
                <select style={S.input} value={newType} onChange={(e)=>setNewType(e.target.value)}>
                  {GAME_TYPES.map((t)=>(<option key={t} value={t}>{t}</option>))}
                </select>
                <div style={S.noteText}>Select a template for default mission pacing.</div>
              </Field>
              <Field label="Mode">
                <select style={S.input} value={newMode} onChange={(e)=>setNewMode(e.target.value)}>
                  <option value="single">Single Player</option>
                  <option value="head2head">Head to Head (2)</option>
                  <option value="multi">Multiple (4)</option>
                </select>
                <div style={S.noteText}>Defines how many players join each session.</div>
              </Field>
              <Field label="Duration (minutes — 0 = infinite)">
                <input
                  type="number"
                  min={0}
                  max={24*60}
                  style={S.input}
                  value={newDurationMin}
                  onChange={(e)=>setNewDurationMin(Math.max(0, Number(e.target.value||0)))}
                />
                <div style={S.noteText}>Players see this countdown during the mission.</div>
              </Field>
              <Field label="Alert before end (minutes)">
                <input
                  type="number"
                  min={1}
                  max={120}
                  style={S.input}
                  value={newAlertMin}
                  onChange={(e)=>setNewAlertMin(Math.max(1, Number(e.target.value||1)))}
                />
                <div style={S.noteText}>Send a warning before time is up.</div>
              </Field>
              <Field label="Short Description">
                <textarea
                  style={{ ...S.input, minHeight: 80 }}
                  value={newShortDesc}
                  onChange={(e)=>setNewShortDesc(e.target.value)}
                  placeholder="One-sentence teaser for listings"
                />
                <div style={S.noteText}>Great for cards, previews, and quick share links.</div>
              </Field>
              <Field label="Long Description">
                <textarea
                  style={{ ...S.input, minHeight: 140 }}
                  value={newLongDesc}
                  onChange={(e)=>setNewLongDesc(e.target.value)}
                  placeholder="Give players the full briefing for this escape ride"
                />
                <div style={S.noteText}>Appears on marketing pages and internal docs.</div>
              </Field>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize:12, color:'var(--admin-muted)', marginBottom:6 }}>Cover Image</div>
                <div
                  onDragOver={(e)=>{ e.preventDefault(); setNewCoverDropActive(true); }}
                  onDragLeave={(e)=>{ e.preventDefault(); setNewCoverDropActive(false); }}
                  onDrop={(e)=>{
                    e.preventDefault();
                    setNewCoverDropActive(false);
                    const file = e.dataTransfer?.files?.[0];
                    if (file) handleNewGameCoverFile(file);
                  }}
                  style={{ ...S.coverDropZone, ...(newCoverDropActive ? S.coverDropZoneActive : {}) }}
                >
                  {newCoverPreview ? (
                    <img src={newCoverPreview} alt="New game cover" style={S.coverDropImage} />
                  ) : (
                    <div style={S.coverDropPlaceholder}>
                      <strong>Drag & drop cover art</strong>
                      <span>PNG or JPG · under 5 MB · shows beside the admin header</span>
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
                  <button type="button" style={S.button} onClick={()=>newGameCoverInputRef.current?.click()}>Upload cover</button>
                  <input
                    ref={newGameCoverInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display:'none' }}
                    onChange={(e)=>{
                      const file = e.target.files?.[0];
                      if (file) handleNewGameCoverFile(file);
                      if (e.target) e.target.value = '';
                    }}
                  />
                  <button type="button" style={S.button} onClick={loadNewCoverOptions} disabled={newCoverLookupLoading}>
                    {newCoverLookupLoading ? 'Loading…' : 'Import from Media Pool'}
                  </button>
                  <button
                    type="button"
                    style={{ ...S.button, ...S.buttonDanger }}
                    onClick={clearNewGameCover}
                    disabled={!newCoverPreview && !newCoverSelectedUrl}
                  >
                    Clear cover
                  </button>
                </div>
                <div style={S.noteText}>Upload new artwork or reuse an existing asset.</div>
                {newCoverOptions.length > 0 && (
                  <div style={S.modalCoverGrid}>
                    {newCoverOptions.map((item) => (
                      <button
                        key={item.url}
                        type="button"
                        onClick={()=>applyNewCoverFromUrl(item.url)}
                        style={{
                          ...S.modalCoverButton,
                          ...(newCoverSelectedUrl === item.url ? S.modalCoverButtonActive : {}),
                        }}
                      >
                        <img src={toDirectMediaURL(item.url)} alt={item.name || item.url} style={S.modalCoverThumb} />
                        <div style={S.modalCoverLabel}>{item.name || item.url}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {newGameStatus && (
                <div
                  style={{
                    ...S.modalStatus,
                    ...(newGameStatusTone === 'success'
                      ? S.modalStatusSuccess
                      : newGameStatusTone === 'danger'
                        ? S.modalStatusDanger
                        : S.modalStatusInfo),
                  }}
                >
                  {newGameStatus}
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:12, flexWrap:'wrap' }}>
                <button
                  style={{
                    ...S.action3DButton,
                    ...(newGameBusy ? { opacity:0.7, cursor:'wait' } : {}),
                  }}
                  onClick={handleCreateNewGame}
                  disabled={newGameBusy}
                >
                  {newGameBusy ? 'Creating…' : 'Save New Game'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {openGameModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 4000, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...S.card, width: 'min(720px,96vw)', maxHeight: '82vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Open Game</h3>
              <button style={S.button} onClick={() => setOpenGameModal(false)}>Close</button>
            </div>
            <div style={{ color: 'var(--admin-muted)', margin: '6px 0 12px' }}>
              Choose which channel to open for each slug.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>Slug</div>
              <div style={{ fontWeight: 700, textAlign: 'center' }}>Draft</div>
              <div style={{ fontWeight: 700, textAlign: 'center' }}>Published</div>
              {Object.entries(gamesIndex.bySlug || {}).map(([slug, channels]) => (
                <React.Fragment key={slug}>
                  <div style={{ padding: '6px 0' }}>{slug}</div>
                  <div style={{ display: 'grid', placeItems: 'center' }}>
                    <button
                      style={{ ...S.button, ...(channels?.draft ? {} : S.buttonDisabled) }}
                      disabled={!channels?.draft}
                      title={channels?.draft ? 'Open draft' : 'No draft yet'}
                      onClick={() => {
                        openGameChannel(slug, 'draft');
                        setOpenGameModal(false);
                      }}
                    >
                      {channels?.draft ? 'Open' : '—'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', placeItems: 'center' }}>
                    <button
                      style={{ ...S.button, ...(channels?.published ? {} : S.buttonDisabled) }}
                      disabled={!channels?.published}
                      title={channels?.published ? 'Open published' : 'No published yet'}
                      onClick={() => {
                        openGameChannel(slug, 'published');
                        setOpenGameModal(false);
                      }}
                    >
                      {channels?.published ? 'Open' : '—'}
                    </button>
                  </div>
                </React.Fragment>
              ))}
              {(!gamesIndex.count || gamesIndex.count === 0) && (
                <div style={{ gridColumn: '1 / span 3', color: 'var(--admin-muted)', padding: '12px 0' }}>
                  No games found yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Sub-tabs & Components ───────────────────────── */
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--admin-muted)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function MultipleChoiceEditor({ value, correctIndex, onChange }) {
  const [local, setLocal] = useState(Array.isArray(value) ? value.slice(0, 5) : []);
  const [correct, setCorrect] = useState(Number.isInteger(correctIndex) ? correctIndex : undefined);
  useEffect(()=>{ setLocal(Array.isArray(value)?value.slice(0,5):[]); },[value]);
  useEffect(()=>{ setCorrect(Number.isInteger(correctIndex)?correctIndex:undefined); },[correctIndex]);
  function sync(nextChoices, nextCorrect) {
    const trimmed = nextChoices.map(s=>(s || '').trim()).filter(Boolean).slice(0,5);
    const ci = Number.isInteger(nextCorrect) && nextCorrect < trimmed.length ? nextCorrect : undefined;
    onChange({ choices: trimmed, correctIndex: ci });
  }
  return (
    <div style={{ border:'1px solid var(--admin-border-soft)', borderRadius:10, padding:12 }}>
      <div style={{ fontWeight:600, marginBottom:8 }}>Choices (A–E)</div>
      {[0,1,2,3,4].map((i)=>(
        <div key={i} style={{ display:'grid', gridTemplateColumns:'24px 1fr', alignItems:'center', gap:8, marginBottom:8 }}>
          <input type="radio" name="mcq-correct" checked={correct===i} onChange={()=>{ setCorrect(i); sync(local,i); }} title="Mark as correct"/>
          <input placeholder={`Choice ${String.fromCharCode(65+i)}`} style={S.input} value={local[i]||''}
            onChange={(e)=>{ const next=[...local]; next[i]=e.target.value; setLocal(next); sync(next, correct); }}/>
        </div>
      ))}
      <div style={{ color:'var(--admin-muted)', fontSize:12 }}>Leave blanks for unused options. Exactly one radio can be marked correct.</div>
    </div>
  );
}
function MediaPreview({ url, kind }) {
  if (!url) return null;
  const u = toDirectMediaURL(String(url).trim());
  const lower = u.toLowerCase();
  const isVideo = /\.(mp4|webm|mov)(\?|#|$)/.test(lower);
  const isImage = /\.(png|jpg|jpeg|gif|webp)(\?|#|$)/.test(lower) || u.includes('drive.google.com/uc?export=view');
  const isAudio = /\.(mp3|wav|ogg|m4a|aiff|aif)(\?|#|$)/.test(lower);
  const isAr = /\.(glb|gltf|usdz|reality|vrm|fbx|obj)(\?|#|$)/.test(lower);
  return (
    <div style={{ marginTop:8 }}>
      <div style={{ color:'var(--admin-muted)', fontSize:12, marginBottom:6 }}>Preview ({kind})</div>
      {isVideo ? (
        <video src={u} controls style={{ width:'100%', maxHeight:260, borderRadius:10, border:'1px solid var(--admin-border-soft)' }}/>
      ) : isImage ? (
        <img src={u} alt="preview" style={{ width:'100%', maxHeight:260, objectFit:'contain', borderRadius:10, border:'1px solid var(--admin-border-soft)' }}/>
      ) : isAr ? (
        <div
          style={{
            width: '100%',
            maxHeight: 200,
            borderRadius: 10,
            border: '1px dashed var(--admin-border-soft)',
            background: 'rgba(148, 163, 184, 0.08)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            color: 'var(--admin-muted)',
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          AR asset preview not available — open in a compatible viewer.
        </div>
      ) : isAudio ? (
        <audio src={u} controls style={{ width:'100%' }} />
      ) : (
        <a href={u} target="_blank" rel="noreferrer" style={{ color:'var(--admin-muted)', textDecoration:'underline' }}>Open media</a>
      )}
    </div>
  );
}

/* Styles */
const S = {
  body: {
    background: 'transparent',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
    minHeight: '100vh',
    fontFamily: 'var(--appearance-font-family, var(--admin-font-family))',
  },
  metaBannerError: {
    color: '#f87171',
    fontWeight: 600,
  },
  metaFooterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
    marginTop: 8,
  },
  metaFooterLabel: {
    fontSize: 12,
    color: 'var(--admin-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 4,
  },
  metaFooterValue: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--appearance-font-color, var(--admin-body-color))',
    wordBreak: 'break-word',
    lineHeight: 1.4,
  },
  metaFooterLink: {
    color: 'var(--admin-link-color, #60a5fa)',
    textDecoration: 'none',
    fontWeight: 600,
    wordBreak: 'break-all',
  },
  metaFooterTimeLine: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--appearance-font-color, var(--admin-body-color))',
  },
  metaFooterNote: {
    color: 'var(--admin-muted)',
    marginTop: 12,
    fontSize: 12,
  },
  metaErrorCard: {
    border: '1px solid rgba(248, 113, 113, 0.3)',
    background: 'rgba(248, 113, 113, 0.08)',
  },
  settingsFooter: {
    marginTop: 24,
    padding: '16px 18px',
    borderRadius: 14,
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--appearance-panel-bg, rgba(15, 23, 42, 0.32))',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  settingsFooterHeading: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--admin-muted)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  settingsFooterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  settingsFooterItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--appearance-font-color, var(--admin-body-color))',
  },
  settingsFooterSeparator: {
    color: 'var(--admin-muted)',
    fontSize: 12,
  },
  settingsFooterLink: {
    color: 'var(--admin-link-color, #60a5fa)',
    textDecoration: 'none',
    fontWeight: 600,
    wordBreak: 'break-word',
  },
  settingsFooterTime: {
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  settingsMenuWrap: {
    position: 'fixed',
    top: 16,
    right: 16,
    display: 'inline-block',
    zIndex: 1200,
  },
  settingsMenuButton: {
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--admin-panel-bg)',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
    cursor: 'pointer',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    boxShadow: 'var(--admin-glass-sheen)',
    transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
  },
  settingsMenuButtonActive: {
    background: 'var(--admin-tab-active-bg)',
    borderColor: 'var(--admin-accent, rgba(59, 130, 246, 0.6))',
    boxShadow: '0 16px 28px rgba(15, 23, 42, 0.28)',
  },
  settingsMenuDropdown: {
    position: 'absolute',
    top: 'calc(100% + 12px)',
    right: 0,
    left: 'auto',
    minWidth: 260,
    padding: 12,
    borderRadius: 14,
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--appearance-panel-bg, rgba(15, 23, 42, 0.9))',
    boxShadow: '0 24px 36px rgba(15, 23, 42, 0.45)',
    display: 'grid',
    gap: 6,
    zIndex: 60,
  },
  settingsMenuSectionLabel: {
    fontSize: 11,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--admin-muted)',
    fontWeight: 700,
    marginTop: 4,
    marginBottom: 2,
  },
  settingsMenuItem: {
    width: '100%',
    borderRadius: 10,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
    textAlign: 'left',
    padding: '8px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 500,
    transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease',
  },
  settingsMenuItemDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  settingsMenuItemActive: {
    background: 'rgba(59, 130, 246, 0.18)',
    borderColor: 'rgba(59, 130, 246, 0.45)',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
  },
  settingsMenuDanger: {
    background: 'rgba(153, 27, 27, 0.32)',
    borderColor: 'rgba(239, 68, 68, 0.65)',
    color: '#fecaca',
  },
  settingsMenuDivider: {
    margin: '8px 0',
    borderTop: '1px solid var(--admin-border-soft)',
  },
  headerShell: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    background: 'transparent',
  },
  headerControls: {
    padding: '8px 16px 16px',
    borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(255, 255, 255, 0.6)',
    backdropFilter: 'blur(8px)',
    display: 'grid',
    gap: 8,
    position: 'sticky',
    top: 56,
    zIndex: 39,
  },
  headerControlsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerToggleGroup: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerGameSelect: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerGameSelectLabel: {
    color: 'var(--admin-muted)',
    fontSize: 12,
    fontWeight: 600,
  },
  headerHint: {
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  conversationLog: {
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(241, 245, 249, 0.78)',
    boxShadow: '0 14px 28px rgba(15, 23, 42, 0.12)',
  },
  conversationLogHeading: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: '#334155',
    fontWeight: 700,
    marginBottom: 10,
  },
  conversationLogEntries: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 200,
    overflowY: 'auto',
  },
  conversationLogRow: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    gap: 12,
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 10,
    background: 'rgba(255, 255, 255, 0.72)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
  },
  conversationBadge: {
    fontSize: 11,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '3px 10px',
    borderRadius: 999,
    background: 'rgba(51, 65, 85, 0.08)',
    color: '#0f172a',
    fontWeight: 700,
  },
  conversationBadgeGpt: {
    background: 'rgba(59, 130, 246, 0.16)',
    color: '#1d4ed8',
  },
  conversationBadgeYou: {
    background: 'rgba(16, 185, 129, 0.16)',
    color: '#047857',
  },
  conversationMessage: {
    color: '#1e293b',
    fontSize: 14,
    lineHeight: 1.4,
  },
  conversationTime: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  wrap: { maxWidth: 1400, margin: '0 auto', padding: 16 },
  wrapGrid2: { display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start', maxWidth: 1400, margin: '0 auto', padding: 16 },
  sidebarTall: {
    background: 'var(--appearance-panel-bg, var(--admin-panel-bg))',
    border: 'var(--appearance-panel-border, var(--admin-panel-border))',
    borderRadius: 18,
    padding: 14,
    position: 'sticky',
    top: 20,
    height: 'calc(100vh - 140px)',
    overflow: 'auto',
    boxShadow: 'var(--appearance-panel-shadow, var(--admin-panel-shadow))',
  },
  sidebarBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    marginBottom: 12,
    borderRadius: 14,
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--appearance-panel-bg, var(--admin-panel-bg))',
    boxShadow: '0 12px 24px rgba(8, 13, 19, 0.35)',
  },
  card: {
    position: 'relative',
    background: 'var(--appearance-panel-bg, var(--admin-panel-bg))',
    border: 'var(--appearance-panel-border, var(--admin-panel-border))',
    borderRadius: 18,
    padding: 18,
    boxShadow: 'var(--appearance-panel-shadow, var(--admin-panel-shadow))',
  },
  inlineCode: {
    fontFamily: 'monospace',
    background: 'rgba(148, 163, 184, 0.16)',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
    padding: '2px 6px',
    borderRadius: 6,
  },
  floatingBarTop: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    padding: '12px 0',
    background: 'var(--appearance-panel-bg, var(--admin-panel-bg))',
    borderBottom: '1px solid var(--admin-border-soft)',
  },
  floatingBarBottom: {
    position: 'sticky',
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '12px 0',
    marginTop: 18,
    background: 'var(--appearance-panel-bg, var(--admin-panel-bg))',
    borderTop: '1px solid var(--admin-border-soft)',
  },
  missionItem: { borderBottom: '1px solid var(--admin-border-soft)', padding: '10px 4px' },
  noteText: { marginTop: 6, fontSize: 12, color: 'var(--admin-muted)' },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 12,
    border: 'var(--admin-input-border)',
    background: 'var(--admin-input-bg)',
    color: 'var(--admin-input-color)',
    boxShadow: 'var(--admin-glass-sheen)',
  },
  button: {
    padding: '10px 14px',
    borderRadius: 12,
    border: 'var(--admin-button-border)',
    background: 'var(--admin-button-bg)',
    color: 'var(--admin-button-color)',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'background 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease',
    boxShadow: 'var(--admin-glass-sheen)',
  },
  buttonDanger: {
    border: 'var(--admin-danger-border)',
    background: 'var(--admin-danger-bg)',
    color: 'var(--admin-body-color)',
  },
  buttonSuccess: {
    border: 'var(--admin-success-border)',
    background: 'var(--admin-success-bg)',
    color: 'var(--admin-body-color)',
  },
  floatingButton: {
    padding: '10px 18px',
    borderRadius: 14,
    border: '1px solid var(--admin-button-border)',
    background: 'var(--admin-button-bg)',
    color: 'var(--admin-button-color)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    minWidth: 160,
    letterSpacing: 0.5,
    boxShadow: 'var(--admin-glass-sheen)',
    transition: 'background 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease',
  },
  floatingSave: {
    background: 'linear-gradient(92deg, #1f7a32, #2dd36f)',
    border: '1px solid rgba(56, 161, 105, 0.8)',
    color: '#e9ffe9',
    boxShadow: '0 0 18px rgba(56, 161, 105, 0.55)',
  },
  floatingCancel: {
    background: 'linear-gradient(92deg, #7a2d00, #ff8800)',
    border: '1px solid rgba(255, 136, 0, 0.8)',
    color: '#fff4dd',
    boxShadow: '0 0 18px rgba(255, 136, 0, 0.55)',
  },
  action3DButton: {
    padding: '12px 20px',
    borderRadius: 16,
    border: '1px solid rgba(34, 197, 94, 0.85)',
    background: 'linear-gradient(165deg, #0b4224, #22c55e)',
    color: '#ecfdf5',
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    boxShadow: '0 18px 28px rgba(12, 83, 33, 0.6), inset 0 2px 0 rgba(255, 255, 255, 0.15)',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  action3DFlash: {
    boxShadow: '0 0 28px rgba(34, 197, 94, 0.75), 0 22px 34px rgba(12, 83, 33, 0.55)',
    transform: 'translateY(-2px)',
  },
  cancelGlowButton: {
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(248, 113, 113, 0.6)',
    background: 'linear-gradient(140deg, #4c0519, #f87171)',
    color: '#ffe4e6',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    boxShadow: '0 0 22px rgba(248, 113, 113, 0.55)',
    cursor: 'pointer',
  },
  deviceMapFooter: {
    marginTop: 12,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  saveCoverButton: {
    background: 'linear-gradient(92deg, #047857, #34d399)',
    border: '1px solid rgba(52, 211, 153, 0.6)',
    color: '#ecfdf5',
    boxShadow: '0 16px 28px rgba(5, 150, 105, 0.35)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 700,
  },
  savePublishButton: {
    background: 'linear-gradient(95deg, #2563eb, #38bdf8)',
    border: '1px solid rgba(59, 130, 246, 0.6)',
    color: '#f8fafc',
    boxShadow: '0 20px 36px rgba(37, 99, 235, 0.45)',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    fontWeight: 800,
    padding: '12px 20px',
  },
  headerNewGameButton: {
    background: 'linear-gradient(100deg, #7c3aed, #a855f7)',
    border: '1px solid rgba(168, 85, 247, 0.65)',
    color: '#fdf4ff',
    boxShadow: '0 18px 32px rgba(124, 58, 237, 0.35)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontWeight: 700,
    padding: '10px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  newGameLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerTopRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 6,
    marginBottom: 20,
  },
  headerTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  headerCoverFrame: {
    width: 68,
    height: 68,
    borderRadius: 16,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.7)',
    display: 'grid',
    placeItems: 'center',
    boxShadow: '0 18px 32px rgba(2, 6, 12, 0.55)',
  },
  headerCoverThumb: { width: '100%', height: '100%', objectFit: 'cover' },
  headerCoverPlaceholder: {
    fontSize: 11,
    color: 'var(--admin-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    textAlign: 'center',
    padding: '0 6px',
  },
  headerTitleColumn: {
    display: 'grid',
    justifyItems: 'flex-start',
    textAlign: 'left',
    gap: 4,
  },
  headerGameTitle: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  headerSubtitle: {
    fontSize: 13,
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
    color: 'var(--admin-muted)',
  },
  headerNavRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  headerNavPrimary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerNavSecondary: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  titleEditorBlock: {
    display: 'grid',
    gap: 8,
    marginBottom: 16,
    padding: '12px 16px',
    borderRadius: 14,
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--admin-input-bg)',
    boxShadow: 'var(--admin-glass-sheen)',
  },
  titleInput: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft)',
    fontSize: 15,
    fontWeight: 500,
    color: '#0f172a',
    background: '#ffffff',
    lineHeight: 1.3,
    boxShadow: 'none',
    outline: 'none',
  },
  slugWarning: {
    fontSize: 12,
    color: '#b45309',
    background: 'rgba(251, 191, 36, 0.12)',
    border: '1px solid rgba(251, 191, 36, 0.4)',
    borderRadius: 10,
    padding: '8px 10px',
  },
  slugMetaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  slugMetaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  slugMetaLabel: {
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  slugMetaCode: {
    fontFamily: 'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12,
    padding: '2px 8px',
    borderRadius: 8,
    background: 'rgba(148, 163, 184, 0.15)',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
  },
  titleActionsRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  saveTitleButton: {
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 18px',
    borderRadius: 12,
    border: '1px solid rgba(59, 130, 246, 0.4)',
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.14), rgba(37, 99, 235, 0.08))',
    color: '#0f172a',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  saveTitleButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  defaultControlsBlock: {
    marginTop: 12,
    padding: '12px 16px',
    borderRadius: 14,
    border: '1px solid rgba(59, 130, 246, 0.18)',
    background: 'rgba(59, 130, 246, 0.06)',
    display: 'grid',
    gap: 10,
  },
  defaultControlsHeading: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--admin-muted)',
  },
  defaultOverwriteToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    userSelect: 'none',
  },
  defaultOverwriteLabel: {
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid rgba(59, 130, 246, 0.35)',
    background: 'rgba(59, 130, 246, 0.12)',
    color: '#1d4ed8',
  },
  defaultOverwriteLabelActive: {
    borderColor: 'rgba(239, 68, 68, 0.6)',
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#991b1b',
  },
  defaultControlsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  defaultActionButton: {
    fontSize: 13,
    fontWeight: 700,
    padding: '8px 16px',
    borderRadius: 12,
    border: '1px solid rgba(59, 130, 246, 0.35)',
    background: 'white',
    color: '#0f172a',
    cursor: 'pointer',
  },
  defaultActionButtonArmed: {
    borderColor: 'rgba(239, 68, 68, 0.55)',
    background: 'rgba(239, 68, 68, 0.14)',
    color: '#7f1d1d',
  },
  defaultActionButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  defaultSnapshotNote: {
    fontSize: 12,
    color: 'var(--admin-muted)',
    flex: '1 1 auto',
  },
  coverControlsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 18,
    alignItems: 'stretch',
  },
  coverDropZone: {
    flex: '0 1 200px',
    maxWidth: 220,
    minHeight: 140,
    border: '1px dashed rgba(94, 234, 212, 0.35)',
    borderRadius: 20,
    background: 'rgba(15, 23, 42, 0.75)',
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    transition: 'border 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
  },
  coverDropZoneActive: {
    border: '1px dashed rgba(94, 234, 212, 0.8)',
    boxShadow: '0 0 24px rgba(94, 234, 212, 0.35)',
    background: 'rgba(15, 32, 27, 0.85)',
  },
  coverDropImage: { width: '100%', height: '100%', objectFit: 'cover' },
  coverDropPlaceholder: {
    color: '#9fb0bf',
    fontSize: 13,
    textAlign: 'center',
    display: 'grid',
    gap: 6,
    padding: 16,
    justifyItems: 'center',
    letterSpacing: '0.05em',
  },
  coverActionsColumn: {
    flex: '0 0 240px',
    minWidth: 220,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  coverActionButtons: {
    display: 'grid',
    gap: 10,
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  },
  coverActionStatus: {
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  coverActionHint: {
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  mediaDropZone: {
    marginTop: 12,
    padding: '14px 18px',
    borderRadius: 16,
    border: '1px dashed rgba(148, 163, 184, 0.4)',
    background: 'rgba(226, 232, 240, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    transition: 'border 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
  },
  mediaDropZoneActive: {
    border: '1px dashed rgba(59, 130, 246, 0.65)',
    background: 'rgba(191, 219, 254, 0.72)',
    boxShadow: '0 16px 32px rgba(59, 130, 246, 0.25)',
  },
  mediaDropHeadline: {
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#1e293b',
    fontSize: 13,
  },
  mediaDropHint: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
  },
  mediaDropBrowse: {
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid rgba(14, 165, 233, 0.6)',
    background: 'linear-gradient(96deg, #0ea5e9, #38bdf8)',
    color: '#f8fafc',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow: '0 12px 24px rgba(14, 165, 233, 0.35)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  buttonDisabled: {
    opacity: 0.65,
    cursor: 'not-allowed',
  },
  pendingWrap: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--appearance-subpanel-bg, var(--admin-tab-bg))',
    display: 'grid',
    gap: 12,
  },
  pendingHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pendingTitle: {
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  pendingCount: {
    padding: '2px 10px',
    borderRadius: 999,
    background: 'rgba(59, 130, 246, 0.18)',
    color: '#1d4ed8',
    fontWeight: 700,
    fontSize: 12,
  },
  pendingGrid: {
    display: 'grid',
    gap: 10,
  },
  pendingItem: {
    display: 'grid',
    gridTemplateColumns: '60px 1fr auto',
    gap: 12,
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: 10,
    background: 'rgba(148, 163, 184, 0.08)',
  },
  pendingThumb: {
    width: 60,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--admin-input-bg)',
    display: 'grid',
    placeItems: 'center',
  },
  pendingThumbImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  pendingThumbPlaceholder: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--admin-muted)',
  },
  pendingMeta: {
    display: 'grid',
    gap: 4,
  },
  pendingName: {
    fontWeight: 600,
    color: 'var(--appearance-font-color, var(--admin-body-color))',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pendingDetails: {
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  pendingRemove: {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid rgba(248, 113, 113, 0.55)',
    background: 'rgba(248, 113, 113, 0.12)',
    color: '#f87171',
    fontWeight: 600,
    cursor: 'pointer',
  },
  pendingWarning: {
    fontSize: 12,
    color: '#b45309',
    background: 'rgba(234, 179, 8, 0.12)',
    border: '1px solid rgba(234, 179, 8, 0.24)',
    borderRadius: 10,
    padding: '8px 10px',
  },
  pendingActions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  tab: {
    padding: '8px 12px',
    borderRadius: 12,
    border: 'var(--admin-button-border)',
    background: 'var(--admin-tab-bg)',
    color: 'var(--admin-body-color)',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
  },
  tabActive: { background: 'var(--admin-tab-active-bg)', boxShadow: '0 0 0 1px rgba(255,255,255,0.06)' },
  search: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 12,
    border: 'var(--admin-input-border)',
    background: 'var(--admin-input-bg)',
    color: 'var(--admin-input-color)',
    marginBottom: 10,
    boxShadow: 'var(--admin-glass-sheen)',
  },
  hr: { border: '1px solid var(--admin-border-soft)', borderBottom: 'none', margin: '12px 0' },
  overlay: { position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.55)', zIndex: 2000, padding: 16 },
  missionPrimaryRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(64px, 72px) repeat(3, minmax(160px, 1fr))',
    gap: 8,
    alignItems: 'center',
    margin: '16px 0 12px',
  },
  overlayBarSide: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
    minWidth: 180,
  },
  overlayCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    textAlign: 'center',
  },
  overlayIdRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  overlayIdLabel: {
    fontSize: 12,
    color: 'var(--admin-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  overlayIdValue: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--admin-body-color)',
    background: 'var(--admin-tab-bg)',
    padding: '4px 12px',
    borderRadius: 999,
  },
  chip: { fontSize: 11, color: 'var(--admin-muted)', border: 'var(--admin-chip-border)', padding: '2px 6px', borderRadius: 999, background: 'var(--admin-chip-bg)' },
  muted: { color: 'var(--admin-muted)' },
  errorPanel: {
    border: '1px solid var(--admin-border-soft)',
    borderRadius: 14,
    padding: 16,
    background: 'var(--appearance-panel-bg, var(--admin-panel-bg))',
    boxShadow: 'var(--appearance-panel-shadow, var(--admin-panel-shadow))',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
    display: 'grid',
    gap: 10,
  },
  errorPanelTitle: { fontWeight: 700, fontSize: 16 },
  errorPanelMessage: { fontSize: 13, color: 'var(--admin-muted)', whiteSpace: 'pre-wrap' },
  errorPanelActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  subtleActionButton: {
    padding: '4px 12px',
    borderRadius: 999,
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--admin-tab-bg)',
    color: 'var(--admin-muted)',
    cursor: 'pointer',
    fontSize: 12,
    boxShadow: 'var(--admin-glass-sheen)',
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5, 12, 20, 0.82)',
    backdropFilter: 'blur(14px)',
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    zIndex: 4000,
  },
  modalCard: {
    width: 'min(720px, 96vw)',
    maxHeight: '82vh',
    padding: 0,
    overflow: 'hidden',
  },
  modalTopBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '16px 20px',
    borderBottom: '1px solid var(--admin-border-soft)',
    background: 'var(--appearance-panel-bg, var(--admin-panel-bg))',
    position: 'sticky',
    top: 0,
    zIndex: 5,
  },
  modalTitleStack: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  modalTitle: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  modalCloseButton: {
    border: 'none',
    background: 'transparent',
    color: 'var(--admin-muted)',
    fontSize: 28,
    lineHeight: 1,
    cursor: 'pointer',
    padding: 4,
  },
  modalContent: {
    padding: '20px 24px 24px',
    display: 'grid',
    gap: 16,
    maxHeight: 'calc(82vh - 72px)',
    overflowY: 'auto',
  },
  modalCoverGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
    marginTop: 12,
  },
  modalCoverButton: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    border: '1px solid var(--admin-border-soft)',
    borderRadius: 14,
    padding: 12,
    background: 'var(--admin-tab-bg)',
    color: 'var(--admin-body-color)',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border 0.2s ease',
  },
  modalCoverButtonActive: {
    border: '1px solid rgba(59, 130, 246, 0.85)',
    boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.35)',
  },
  modalCoverThumb: {
    width: '100%',
    height: 120,
    objectFit: 'cover',
    borderRadius: 10,
    background: '#0f172a',
  },
  modalCoverLabel: {
    fontSize: 12,
    color: 'var(--admin-muted)',
    textAlign: 'left',
    wordBreak: 'break-word',
  },
  modalStatus: {
    fontSize: 13,
    color: 'var(--admin-muted)',
    minHeight: 20,
  },
  modalStatusInfo: {
    color: 'var(--admin-muted)',
  },
  modalStatusSuccess: {
    color: '#16a34a',
    fontWeight: 600,
  },
  modalStatusDanger: {
    color: '#ef4444',
    fontWeight: 600,
  },
};

/* MapOverview — shows missions + devices */
function MapOverview({
  missions = [], devices = [], icons = DEFAULT_ICONS, showRings = true,
  interactive = false, draftDevice = null,
  selectedDevIdx = null, selectedMissionIdx = null,
  onDraftChange = null, onMoveSelected = null, onMoveSelectedMission = null,
  onSelectDevice = null, onSelectMission = null,
  mapCenter = { lat:44.9778, lng:-93.2650 }, mapZoom = 13,
  defaultIconSizePx = 24, selectedIconSizePx = 28,
  readOnly = false,
  lockToRegion = false,
}) {
  const divRef = React.useRef(null);
  const [leafletReady, setLeafletReady] = React.useState(!!(typeof window !== 'undefined' && window.L));

  function getMissionPos(m){ const c=m?.content||{}; const lat=Number(c.lat), lng=Number(c.lng); if(!isFinite(lat)||!isFinite(lng))return null; return [lat,lng]; }
  function getDevicePos(d){ const lat=Number(d?.lat),lng=Number(d?.lng); if(!isFinite(lat)||!isFinite(lng))return null; return [lat,lng]; }
  function iconUrl(kind,key){ if(!key)return''; const list=icons?.[kind]||[]; const it=list.find(x=>x.key===key); return it?toDirectMediaURL(it.url||''):''; }
  function numberedIcon(number, imgUrl, color='#60a5fa', highlight=false, size=24){
    const s = Math.max(12, Math.min(64, Number(size)||24));
    const img = imgUrl
      ? `<img src="${imgUrl}" style="width:${s}px;height:${s}px;border-radius:50%;object-fit:cover;border:2px solid ${highlight?'#22c55e':'white'};box-shadow:0 0 0 2px #1f2937"/>`
      : `<div style="width:${s-4}px;height:${s-4}px;border-radius:50%;background:${color};border:2px solid ${highlight?'#22c55e':'white'};box-shadow:0 0 0 2px #1f2937"></div>`;
    const font = Math.round(s*0.5);
    return window.L.divIcon({
      className:'num-pin',
      html:`<div style="position:relative;display:grid;place-items:center">${img}<div style="position:absolute;bottom:-${Math.round(s*0.45)}px;left:50%;transform:translateX(-50%);font-weight:700;font-size:${font}px;color:#fff;text-shadow:0 1px 2px #000">${number}</div></div>`,
      iconSize:[s, s+4], iconAnchor:[s/2, s/2]
    });
  }

  useEffect(()=>{ if(typeof window==='undefined')return;
    if(window.L){ setLeafletReady(true); return; }
    const linkId='leaflet-css';
    if(!document.getElementById(linkId)){
      const link=document.createElement('link'); link.id=linkId; link.rel='stylesheet'; link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    }
    const s=document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.async=true; s.onload=()=>setLeafletReady(true); document.body.appendChild(s);
  },[]);

  useEffect(()=>{
    if(!leafletReady || !divRef.current || typeof window==='undefined') return;
    const L = window.L; if (!L) return;

    const initialCenter = [mapCenter?.lat ?? 44.9778, mapCenter?.lng ?? -93.2650];
    const initialZoom = mapZoom ?? 13;

    if(!divRef.current._leaflet_map){
      const map=L.map(divRef.current,{ center:initialCenter, zoom:initialZoom });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19, attribution:'© OpenStreetMap contributors' }).addTo(map);
      divRef.current._leaflet_map=map;
    }
    const map=divRef.current._leaflet_map;

    if(!map._layerGroup) map._layerGroup=L.layerGroup().addTo(map);
    map._layerGroup.clearLayers();
    const layer=map._layerGroup;
    const bounds=L.latLngBounds([]);

    // Missions
    (missions||[]).forEach((m,idx)=>{
      const pos=getMissionPos(m); if(!pos) return;
      const url = m.iconUrl ? toDirectMediaURL(m.iconUrl) : iconUrl('missions', m.iconKey);
      const isSel = (selectedMissionIdx===idx);
      const size = isSel ? selectedIconSizePx : defaultIconSizePx;
      const marker=L.marker(pos,{icon:numberedIcon(idx+1,url,'#60a5fa',isSel,size), draggable:(!readOnly && isSel)}).addTo(layer);
      const rad=Number(m.content?.radiusMeters||0);
      let circle=null;
      if(showRings && rad>0) { circle=L.circle(pos,{ radius:rad, color:'#60a5fa', fillOpacity:0.08 }).addTo(layer); }
      if (onSelectMission) {
        marker.on('click',(ev)=>{ ev.originalEvent?.preventDefault?.(); ev.originalEvent?.stopPropagation?.(); onSelectMission(idx); });
      }
      if(!readOnly && isSel && onMoveSelectedMission){
        marker.on('drag',()=>{ if(circle) circle.setLatLng(marker.getLatLng()); });
        marker.on('dragend',()=>{ const p=marker.getLatLng(); onMoveSelectedMission(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))); });
      }
      bounds.extend(pos);
    });

    // Devices
    (devices||[]).forEach((d,idx)=>{
      const pos=getDevicePos(d); if(!pos) return;
      const url=iconUrl('devices', d.iconKey);
      const hl = (selectedDevIdx===idx);
      const size = hl ? selectedIconSizePx : defaultIconSizePx;
      const marker=L.marker(pos,{icon:numberedIcon(`D${idx+1}`,url,'#f59e0b',hl,size), draggable:(!readOnly && hl && !!onMoveSelected)}).addTo(layer);
      const rad=Number(d.pickupRadius||0);
      let circle=null;
      if(showRings && rad>0) { circle=L.circle(pos,{ radius:rad, color:'#f59e0b', fillOpacity:0.08 }).addTo(layer); }
      if (onSelectDevice) {
        marker.on('click',(ev)=>{ ev.originalEvent?.preventDefault?.(); ev.originalEvent?.stopPropagation?.(); onSelectDevice(idx); });
      }
      if(!readOnly && hl && onMoveSelected){
        marker.on('drag',()=>{ if(circle) circle.setLatLng(marker.getLatLng()); });
        marker.on('dragend',()=>{ const p=marker.getLatLng(); onMoveSelected(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))); });
      }
      bounds.extend(pos);
    });

    // Draft device (Devices tab)
    if(!readOnly && draftDevice && typeof draftDevice.lat==='number' && typeof draftDevice.lng==='number'){
      const pos=[draftDevice.lat, draftDevice.lng];
      const mk=L.marker(pos,{ icon:numberedIcon('D+','', '#34d399',true,selectedIconSizePx), draggable:true }).addTo(layer);
      if(showRings && Number(draftDevice.radius)>0){
        const c=L.circle(pos,{ radius:Number(draftDevice.radius), color:'#34d399', fillOpacity:0.08 }).addTo(layer);
        mk.on('drag',()=>c.setLatLng(mk.getLatLng()));
      }
      mk.on('dragend',()=>{ const p=mk.getLatLng(); onDraftChange && onDraftChange(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))); });
      bounds.extend(pos);
    }

    // Click handler
    if (map._clickHandler) map.off('click', map._clickHandler);
    map._clickHandler = (e) => {
      if (readOnly) return;
      const lat=e.latlng.lat, lng=e.latlng.lng;
      if (interactive && onDraftChange) { onDraftChange(Number(lat.toFixed(6)), Number(lng.toFixed(6))); return; }
      if (selectedDevIdx!=null && onMoveSelected) { onMoveSelected(Number(lat.toFixed(6)), Number(lng.toFixed(6))); return; }
      if (selectedMissionIdx!=null && onMoveSelectedMission) { onMoveSelectedMission(Number(lat.toFixed(6)), Number(lng.toFixed(6))); return; }
    };
    map.on('click', map._clickHandler);

    if (lockToRegion) {
      map.setView(initialCenter, initialZoom);
    } else if(bounds.isValid()) {
      map.fitBounds(bounds.pad(0.2));
    } else {
      map.setView(initialCenter, initialZoom);
    }
  },[
    leafletReady, missions, devices, icons, showRings, interactive, draftDevice,
    selectedDevIdx, selectedMissionIdx, onDraftChange, onMoveSelected, onMoveSelectedMission,
    onSelectDevice, onSelectMission, mapCenter, mapZoom, defaultIconSizePx, selectedIconSizePx, readOnly, lockToRegion
  ]);

  return (
    <div>
      {!leafletReady && <div style={{ color:'var(--admin-muted)', marginBottom:8 }}>Loading map…</div>}
      <div ref={divRef} style={{ height:560, borderRadius:12, border:'1px solid var(--admin-border-soft)', background:'var(--appearance-panel-bg, var(--admin-panel-bg))' }}/>
    </div>
  );
}

/* MapPicker — geofence mini map with draggable marker + radius slider (5–500 m) */
function MapPicker({ lat, lng, radius = 25, onChange, center = { lat:44.9778, lng:-93.2650 } }) {
  const divRef = useRef(null);
  const [leafletReady, setLeafletReady] = useState(!!(typeof window !== 'undefined' && window.L));
  const [rad, setRad] = useState(clamp(Number(radius) || 25, 5, 500));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.L) { setLeafletReady(true); return; }
    const linkId='leaflet-css';
    if(!document.getElementById(linkId)){
      const link=document.createElement('link'); link.id=linkId; link.rel='stylesheet'; link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    }
    const s=document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.async=true; s.onload=()=>setLeafletReady(true); document.body.appendChild(s);
  }, []);

  useEffect(() => { setRad(clamp(Number(radius) || 25, 5, 500)); }, [radius]);

  useEffect(() => {
    if (!leafletReady || !divRef.current || typeof window === 'undefined') return;
    const L = window.L; if (!L) return;

    const startLat = isFinite(Number(lat)) ? Number(lat) : Number(center.lat);
    const startLng = isFinite(Number(lng)) ? Number(lng) : Number(center.lng);

    if (!divRef.current._leaflet_map) {
      const map = L.map(divRef.current, { center: [startLat, startLng], zoom: 14 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
      const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);
      const circle = L.circle([startLat, startLng], { radius: Number(rad) || 25, color: '#60a5fa', fillOpacity: 0.08 }).addTo(map);

      marker.on('drag', () => circle.setLatLng(marker.getLatLng()));
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        onChange && onChange(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)), Number(clamp(rad,5,500)));
      });

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        circle.setLatLng(e.latlng);
        onChange && onChange(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)), Number(clamp(rad,5,500)));
      });

      divRef.current._leaflet_map = map;
      divRef.current._marker = marker;
      divRef.current._circle = circle;
    } else {
      const map = divRef.current._leaflet_map;
      const marker = divRef.current._marker;
      const circle = divRef.current._circle;

      const haveLat = isFinite(Number(lat));
      const haveLng = isFinite(Number(lng));
      const pos = haveLat && haveLng ? [Number(lat), Number(lng)] : [Number(center.lat), Number(center.lng)];
      marker.setLatLng(pos);
      circle.setLatLng(pos);
      map.setView(pos, map.getZoom());
      circle.setRadius(Number(clamp(rad,5,500)));
    }
  }, [leafletReady, lat, lng, rad, onChange, center]);

  return (
    <div>
      <div ref={divRef} style={{ height:260, borderRadius:12, border:'1px solid var(--admin-border-soft)', background:'var(--appearance-panel-bg, var(--admin-panel-bg))' }} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center', marginTop:8 }}>
        <input
          type="range" min={5} max={500} step={5}
          value={rad}
          onChange={(e)=>{
            const next = clamp(Number(e.target.value)||25, 5, 500);
            setRad(next);
            if (divRef.current?._circle) divRef.current._circle.setRadius(Number(next));
            if (onChange && divRef.current?._marker) {
              const p = divRef.current._marker.getLatLng();
              onChange(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)), Number(next));
            }
          }}
        />
        <code style={{ color:'var(--admin-muted)' }}>{rad} m</code>
      </div>
    </div>
  );
}

/* TEXT TAB */
function TextTab({ config, setConfig }) {
  const [text, setText] = useState((config.textRules || []).join('\n'));
  useEffect(()=>{ setText((config.textRules || []).join('\n')); }, [config.textRules]);

  return (
    <main style={S.wrap}>
      <div style={S.card}>
        <h3 style={{ marginTop:0 }}>Text Rules / Instructions</h3>
        <div style={{ color:'var(--admin-muted)', marginBottom:8, fontSize:12 }}>
          One rule per line. This saves into <code>config.textRules</code>.
        </div>
        <textarea
          style={{ ...S.input, height:220, fontFamily:'ui-monospace, Menlo' }}
          value={text}
          onChange={(e)=>setText(e.target.value)}
        />
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <button
            style={S.button}
            onClick={()=>{
              const lines = text.split('\n').map(s=>s.trim()).filter(Boolean);
              setConfig(c=>({ ...c, textRules: lines }));
            }}
          >
            Save Rules
          </button>
          <button
            style={S.button}
            onClick={()=>setText((config.textRules || []).join('\n'))}
          >
            Reset
          </button>
        </div>
      </div>
    </main>
  );
}

/* ───────────────────────── MEDIA POOL (with sub-tabs & per-file usage) ───────────────────────── */
function MediaPoolTab({
  suite,
  config,
  setConfig,
  uploadStatus,
  setUploadStatus,
  uploadToRepo,
  onInventoryRefresh,
}) {
  const [inv, setInv] = useState([]);
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState('auto');
  const [addUrl, setAddUrl] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const pendingFilesRef = useRef([]);
  const [pendingActionBusy, setPendingActionBusy] = useState(false);

  const [subTab, setSubTab] = useState('audio');
  const sanitizedInventory = useMemo(() => {
    return (inv || []).filter((item) => {
      const raw = String(item?.path || item?.name || item?.url || '').trim();
      if (!raw) return false;
      const withoutQuery = raw.split('?')[0];
      const base = withoutQuery.split('/').pop()?.toLowerCase() || '';
      if (base === 'index.json' || base === '.ds_store') return false;
      return true;
    });
  }, [inv]);

  const itemsByType = useMemo(() => {
    const grouped = sanitizedInventory.reduce((acc, it) => {
      const guess = classifyByExt(it.url || it.path || it.name || '');
      const metaType = String(it.kind || it.category || it.type || guess || 'other').toLowerCase();
      let key = metaType.replace(/\s+/g, '-');
      if (key === 'ar') key = 'ar-target';
      if (key === 'images' || key === 'image') key = 'image';
      if (key === 'gifs' || key === 'gif') key = 'gif';
      if (!MEDIA_TYPE_DEFS.find((def) => def.key === key)) {
        key = 'other';
      }
      if (!acc[key]) acc[key] = [];
      acc[key].push(it);
      return acc;
    }, {});

    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) => {
        const nameA = (a?.name || a?.url || a?.path || '').toString().toLowerCase();
        const nameB = (b?.name || b?.url || b?.path || '').toString().toLowerCase();
        return nameA.localeCompare(nameB);
      });
    });

    return grouped;
  }, [sanitizedInventory]);
  const uploadDestinations = [
    { value: 'auto', label: 'Auto — detect from file type' },
    { value: 'images', label: 'Images (general)' },
    { value: 'images/icons', label: 'Images · Icons' },
    { value: 'images/covers', label: 'Images · Covers' },
    { value: 'images/bundles', label: 'Images · Bundles' },
    { value: 'images/uploads', label: 'Images · Uploads' },
    { value: 'audio', label: 'Audio' },
    { value: 'video', label: 'Video' },
    { value: 'gif', label: 'Gif' },
    { value: 'ar-target', label: 'AR Target' },
    { value: 'ar-overlay', label: 'AR Overlay' },
    { value: 'other', label: 'Other' },
  ];

  useEffect(() => { refreshInventory(); }, []);

  async function refreshInventory() {
    setBusy(true);
    try {
      const items = await listInventory(['mediapool']);
      setInv(items || []);
      if (typeof onInventoryRefresh === 'function') {
        try { await onInventoryRefresh(); } catch {}
      }
    } finally { setBusy(false); }
  }

  function resolveUploadType(targetFolder, classification = 'other') {
    const normalized = String(targetFolder || '').trim().toLowerCase();
    if (!normalized || normalized === 'auto') {
      return MEDIA_CLASS_TO_TYPE[classification] || 'other';
    }

    if (FOLDER_TO_TYPE.has(normalized)) return FOLDER_TO_TYPE.get(normalized);

    if (normalized.startsWith('mediapool/')) {
      const after = normalized.replace(/^mediapool\//, '');
      if (FOLDER_TO_TYPE.has(after)) return FOLDER_TO_TYPE.get(after);
      const slug = after.replace(/\s+/g, '-');
      if (FOLDER_TO_TYPE.has(slug)) return FOLDER_TO_TYPE.get(slug);
    }

    const slugged = normalized.replace(/\s+/g, '-');
    if (FOLDER_TO_TYPE.has(slugged)) return FOLDER_TO_TYPE.get(slugged);

    return MEDIA_CLASS_TO_TYPE[classification] || 'other';
  }

  // Per-file usage counts retained for backwards compatibility
  function usageCounts() {
    return {
      rewardsPool: 0,
      penaltiesPool: 0,
      iconMission: 0,
      iconDevice: 0,
      iconReward: 0,
      outcomeCorrect: 0,
      outcomeWrong: 0,
      outcomeAudio: 0,
    };
  }

  function addPoolItem(kind, url) {
    const label = baseNameFromUrl(url);
    setConfig(c => {
      if (!c) return c;
      const m = { rewardsPool:[...(c.media?.rewardsPool||[])], penaltiesPool:[...(c.media?.penaltiesPool||[])] };
      if (kind === 'rewards') m.rewardsPool.push({ url, label });
      if (kind === 'penalties') m.penaltiesPool.push({ url, label });
      return { ...c, media: m };
    });
  }
  function addIcon(kind, url) {
    const key = baseNameFromUrl(url).toLowerCase().replace(/\s+/g,'-').slice(0,48) || `icon-${Date.now()}`;
    const name = baseNameFromUrl(url);
    setConfig(c => {
      if (!c) return c;
      const icons = { missions:[...(c.icons?.missions||[])], devices:[...(c.icons?.devices||[])], rewards:[...(c.icons?.rewards||[])] };
      const list = icons[kind] || [];
      // allow duplicates (keys must be unique)
      let finalKey = key;
      let suffix = 1;
      while (list.find(i => i.key === finalKey)) {
        suffix += 1;
        finalKey = `${key}-${suffix}`;
      }
      list.push({ key: finalKey, name, url });
      icons[kind] = list;
      return { ...c, icons };
    });
  }

  async function uploadFiles(fileList) {
    const entries = Array.from(fileList || [])
      .map((item) => {
        if (!item) return null;
        if (item.file instanceof File) return item;
        if (item instanceof File) return { file: item };
        return null;
      })
      .filter(Boolean);
    if (!entries.length) return { success: 0, total: 0, results: [] };
    let success = 0;
    let lastUrl = '';
    const results = [];
    let lastTypeKey = '';
    for (const entry of entries) {
      const file = entry.file;
      if (!file) {
        results.push({ entry, ok: false, url: '' });
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const uploaded = await uploadToRepo(file, folder, { remoteUrl: addUrl });
      if (uploaded) {
        success += 1;
        lastUrl = uploaded;
        const classification = classifyByExt(file.name || file.type || uploaded || '');
        lastTypeKey = resolveUploadType(folder, classification);
      }
      results.push({ entry, ok: !!uploaded, url: uploaded });
    }
    if (success) {
      setAddUrl('');
      await refreshInventory();
      if (lastTypeKey) setSubTab(lastTypeKey);
    }
    if (entries.length > 1) {
      const prefix = success === entries.length ? '✅' : '⚠️';
      setUploadStatus(`${prefix} Uploaded ${success}/${entries.length} files`);
    }
    return { success, total: entries.length, results };
  }

  function revokePreview(entry) {
    if (entry?.previewUrl) {
      try { URL.revokeObjectURL(entry.previewUrl); } catch (err) { /* noop */ }
    }
  }

  function formatFileSize(bytes = 0) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const fixed = size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1);
    return `${fixed} ${units[unitIndex]}`;
  }

  function stageFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    let added = false;
    setPendingFiles((prev) => {
      const existingKeys = new Set(
        prev.map((item) => `${item.file?.name || ''}-${item.file?.size || 0}-${item.file?.lastModified || 0}`)
      );
      const additions = [];
      files.forEach((file) => {
        const key = `${file.name || 'file'}-${file.size || 0}-${file.lastModified || 0}`;
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        const previewUrl = ((file.type && file.type.startsWith('image/')) || EXTS.image.test(file.name || ''))
          ? URL.createObjectURL(file)
          : '';
        additions.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file,
          name: file.name || 'upload',
          size: file.size || 0,
          previewUrl,
          type: classifyByExt(file.name || file.type || ''),
        });
      });
      if (!additions.length) return prev;
      added = true;
      return [...prev, ...additions];
    });
    if (!added) return;
    const oversize = files.filter((file) => (file.size || 0) > MEDIA_WARNING_BYTES);
    if (oversize.length) {
      const label = oversize.length === 1
        ? `${oversize[0].name || 'file'} (${formatFileSize(oversize[0].size || 0)})`
        : `${oversize.length} files over 5 MB`;
      setUploadStatus(`⚠️ ${label} — uploads over 5 MB may take longer. Click “Save to Media Pool” to continue.`);
    } else {
      setUploadStatus(`Ready to upload ${files.length} file${files.length === 1 ? '' : 's'}. Click “Save to Media Pool”.`);
    }
  }

  function removePending(id) {
    setPendingFiles((prev) => {
      const next = prev.filter((item) => item.id !== id);
      const removed = prev.find((item) => item.id === id);
      if (removed) revokePreview(removed);
      return next;
    });
  }

  function clearPending() {
    setPendingFiles((prev) => {
      prev.forEach(revokePreview);
      return [];
    });
  }

  async function savePending() {
    if (!pendingFiles.length) return;
    setPendingActionBusy(true);
    try {
      const result = await uploadFiles(pendingFiles);
      if (result?.success && result.success === pendingFiles.length) {
        clearPending();
      } else if (result?.success) {
        setPendingFiles((prev) => {
          const keepers = prev.filter((item) => !result.results.some((r) => r.entry === item && r.ok));
          prev
            .filter((item) => result.results.some((r) => r.entry === item && r.ok))
            .forEach(revokePreview);
          return keepers;
        });
      }
    } finally {
      setPendingActionBusy(false);
    }
  }

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => () => {
    pendingFilesRef.current.forEach(revokePreview);
  }, []);

  async function onUpload(e) {
    stageFiles(e.target.files);
    if (e.target) e.target.value = '';
  }

  async function deleteOne(item) {
    const targetUrl = typeof item === 'string' ? item : (item?.url || item?.id || '');
    const repoPath = typeof item === 'string'
      ? pathFromUrl(item)
      : (item?.path || pathFromUrl(item?.url || item?.id || ''));
    const type = String((item && (item.type || item.kind)) || '').toLowerCase();
    const nameLower = String(item?.name || '').toLowerCase();
    const fileNameLower = String(item?.fileName || '').toLowerCase();
    if (type === 'placeholder' || nameLower === '.gitkeep' || fileNameLower === '.gitkeep') {
      alert('Placeholder keep-alive files cannot be deleted from the dashboard.');
      return false;
    }
    if (!repoPath && !(item?.supabase?.path)) {
      alert('This file cannot be deleted here (external or unknown path).');
      return false;
    }
    if (!window.confirm(`Delete this media file?\n${targetUrl}`)) return false;
    setUploadStatus('Deleting…');
    const ok = await deleteMediaEntry({ ...item, path: repoPath });
    setUploadStatus(ok ? '✅ Deleted' : '❌ Delete failed');
    if (ok) await refreshInventory();
    return ok;
  }

  async function deleteAll(list) {
    const actionable = (list || []).filter((it) => {
      const type = String((it && (it.type || it.kind)) || '').toLowerCase();
      const nameLower = String(it?.name || '').toLowerCase();
      const fileNameLower = String(it?.fileName || '').toLowerCase();
      return !(type === 'placeholder' || nameLower === '.gitkeep' || fileNameLower === '.gitkeep');
    });
    if (!actionable.length) {
      alert('No deletable files in this group. Placeholder keep-alive files are protected.');
      return;
    }
    if (!window.confirm(`Delete ALL ${actionable.length} files in this group? This cannot be undone.`)) return;
    setUploadStatus('Deleting group…');
    let okCount = 0;
    for (const it of actionable) {
      const path = it?.path || pathFromUrl(it?.url || it?.id || '');
      if (!path && !(it?.supabase?.path)) continue;
      // eslint-disable-next-line no-await-in-loop
      const ok = await deleteMediaEntry({ ...it, path });
      if (ok) okCount++;
    }
    setUploadStatus(`✅ Deleted ${okCount}/${actionable.length}`);
    await refreshInventory();
  }

  const baseTabs = MEDIA_TYPE_DEFS.map(({ key, label }) => ({ key, label }));
  const sections = MEDIA_TYPE_DEFS.map(({ key, title }) => ({
    key,
    title,
    items: itemsByType[key] || [],
  }));
  const active = sections.find((s) => s.key === subTab) || sections[0];
  const canDeleteActive = active.items.some((item) => {
    const type = String((item && (item.type || item.kind)) || '').toLowerCase();
    const nameLower = String(item?.name || '').toLowerCase();
    const fileNameLower = String(item?.fileName || '').toLowerCase();
    return !(type === 'placeholder' || nameLower === '.gitkeep' || fileNameLower === '.gitkeep');
  });
  const availableTabKeys = baseTabs.map((tab) => tab.key);
  useEffect(() => {
    if (!availableTabKeys.includes(subTab) && availableTabKeys.length) {
      setSubTab(availableTabKeys[0]);
    }
  }, [availableTabKeys.join('::'), subTab]);
  const subTabs = baseTabs;
  const inventoryCount = sanitizedInventory.length;

  return (
    <main style={S.wrap}>
      {/* Upload */}
      <div style={S.card}>
        <h3 style={{ marginTop:0 }}>Upload</h3>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, alignItems:'center' }}>
          <input style={S.input} placeholder="(Optional) Paste URL to remember…" value={addUrl} onChange={(e)=>setAddUrl(e.target.value)} />
          <select style={S.input} value={folder} onChange={(e)=>setFolder(e.target.value)}>
            {uploadDestinations.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            type="button"
            style={{ ...S.button, display:'grid', placeItems:'center' }}
            onClick={()=>fileInputRef.current?.click()}
          >
            Upload
          </button>
        </div>
        <div style={{ marginTop:8, fontSize:12, color:'var(--admin-muted)' }}>
          Host media on an external service and paste the public URL before saving. The dashboard stores metadata only,
          keeping binary files out of Git history.
        </div>
        <div
          onDragOver={(e)=>{ e.preventDefault(); setDropActive(true); }}
          onDragLeave={(e)=>{ e.preventDefault(); setDropActive(false); }}
          onDrop={(e)=>{
            e.preventDefault();
            setDropActive(false);
            stageFiles(e.dataTransfer?.files);
          }}
          style={{ ...S.mediaDropZone, ...(dropActive ? S.mediaDropZoneActive : {}) }}
        >
          <div>
            <div style={S.mediaDropHeadline}>Drag & drop media</div>
            <div style={S.mediaDropHint}>Drop multiple files at once or click Upload to browse.</div>
          </div>
          <button type="button" style={S.mediaDropBrowse} onClick={()=>fileInputRef.current?.click()}>Browse files</button>
        </div>
        <input ref={fileInputRef} type="file" multiple onChange={onUpload} style={{ display:'none' }} />
        {pendingFiles.length > 0 && (
          <div style={S.pendingWrap}>
            <div style={S.pendingHeader}>
              <div style={S.pendingTitle}>Pending uploads</div>
              <div style={S.pendingCount}>{pendingFiles.length}</div>
            </div>
            <div style={S.pendingGrid}>
              {pendingFiles.map((item) => {
                const typeLabel = (item.type || 'file').toUpperCase();
                return (
                  <div key={item.id} style={S.pendingItem}>
                    <div style={S.pendingThumb}>
                      {item.previewUrl ? (
                        <img src={item.previewUrl} alt={item.name} style={S.pendingThumbImage} />
                      ) : (
                        <div style={S.pendingThumbPlaceholder}>
                          {item.type === 'ar' ? 'AR' : typeLabel}
                        </div>
                      )}
                    </div>
                    <div style={S.pendingMeta}>
                      <div style={S.pendingName}>{item.name}</div>
                      <div style={S.pendingDetails}>
                        {formatFileSize(item.size)} · {typeLabel}
                      </div>
                    </div>
                    <button
                      type="button"
                      style={{ ...S.pendingRemove, ...(pendingActionBusy ? S.buttonDisabled : {}) }}
                      onClick={() => removePending(item.id)}
                      title="Remove from pending uploads"
                      disabled={pendingActionBusy}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
            {pendingFiles.some((item) => (item.size || 0) > MEDIA_WARNING_BYTES) && (
              <div style={S.pendingWarning}>
                Files over 5 MB may take longer to sync. Saving keeps all sizes allowed.
              </div>
            )}
            <div style={S.pendingActions}>
              <button
                type="button"
                style={{ ...S.button, ...(pendingActionBusy ? S.buttonDisabled : {}) }}
                onClick={savePending}
                disabled={pendingActionBusy}
              >
                {pendingActionBusy ? 'Saving…' : 'Save to Media Pool'}
              </button>
              <button
                type="button"
                style={{ ...S.button, ...S.buttonDanger, ...(pendingActionBusy ? S.buttonDisabled : {}) }}
                onClick={clearPending}
                disabled={pendingActionBusy}
              >
                Clear
              </button>
            </div>
          </div>
        )}
        {uploadStatus && <div style={{ marginTop:8, color:'var(--admin-muted)' }}>{uploadStatus}</div>}
        <div style={{ color:'var(--admin-muted)', marginTop:8, fontSize:12 }}>
          Inventory {busy ? '(loading…)':''}: {inventoryCount} file{inventoryCount === 1 ? '' : 's'}
        </div>
      </div>

      {/* Sub-tabs: Audio • Video • Images • AR • GIF (Audio default) */}
      <div style={{ ...S.card, marginTop:16 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
          {subTabs.map(st => (
            <button
              key={st.key}
              onClick={()=>setSubTab(st.key)}
              style={{ ...S.tab, ...(subTab===st.key?S.tabActive:{}) }}
            >
              {st.label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Active section */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', margin: '4px 0 12px' }}>
          <h3 style={{ margin:0 }}>{active.title}</h3>
          <button
            style={{ ...S.button, ...S.buttonDanger, ...(!canDeleteActive ? S.buttonDisabled : {}) }}
            onClick={()=>deleteAll(active.items)}
            disabled={!canDeleteActive}
            title={canDeleteActive ? 'Delete all files in this type' : 'No deletable files in this type'}
          >
            Delete All
          </button>
        </div>

        {active.items.length === 0 ? (
          <div style={{ color:'var(--admin-muted)' }}>No files.</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px,1fr))', gap:12 }}>
            {active.items.map((it, idx)=>{
              const url = toDirectMediaURL(it.url);
              const name = it.name || baseNameFromUrl(url);
              const previewCandidate = toDirectMediaURL(it.thumbUrl || it.url || '');
              const looksImage = /\.(png|jpe?g|gif|webp|bmp|svg|tif|tiff|avif|heic|heif)(\?|#|$)/i.test(previewCandidate);
              const typeLower = String((it && (it.type || it.kind || active.key)) || '').toLowerCase();
              const fileNameLower = String(it?.fileName || '').toLowerCase();
              const isPlaceholderItem = typeLower === 'placeholder'
                || String(it?.name || '').toLowerCase() === '.gitkeep'
                || fileNameLower === '.gitkeep';
              const statusRaw = String(it.status || (url ? 'external' : 'pending'));
              const status = isPlaceholderItem ? 'placeholder' : statusRaw.replace(/[-_]+/g, ' ');
              const statusColor = isPlaceholderItem
                ? 'var(--admin-info)'
                : it.existsOnDisk
                  ? 'var(--admin-success)'
                  : (url ? 'var(--admin-info)' : 'var(--admin-warning)');
              const canDelete = !isPlaceholderItem;
              const canOpen = Boolean(url) && !isPlaceholderItem;
              return (
                <div key={idx} style={{ border:'1px solid var(--admin-border-soft)', borderRadius:12, padding:12, display:'grid', gap:10 }}>
                  {looksImage ? (
                    <div
                      style={{
                        width: '100%',
                        height: 160,
                        borderRadius: 12,
                        overflow: 'hidden',
                        border: '1px solid var(--admin-border-soft)',
                        background: 'var(--admin-input-bg)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <img src={previewCandidate} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    </div>
                  ) : (
                    <MediaPreview url={url} kind={it.kind || it.category || active.key} />
                  )}
                  <div>
                    <div style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
                    <div style={{ fontSize:12, color:'var(--admin-muted)', wordBreak:'break-word' }}>{url}</div>
                    <div style={{ fontSize:12, color: statusColor, marginTop:4 }}>Status: {status}</div>
                    {it.notes ? (
                      <div style={{ fontSize:11, color:'var(--admin-muted)', marginTop:4 }}>{it.notes}</div>
                    ) : null}
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        ...S.button,
                        textDecoration:'none',
                        display:'inline-flex',
                        alignItems:'center',
                        justifyContent:'center',
                        pointerEvents: canOpen ? 'auto' : 'none',
                        opacity: canOpen ? 1 : 0.5,
                      }}
                      aria-disabled={canOpen ? undefined : true}
                      title={canOpen ? 'Open media in new tab' : 'No preview available for placeholders'}
                    >
                      Open
                    </a>
                    <button
                      style={{ ...S.button, ...S.buttonDanger, ...(canDelete ? {} : S.buttonDisabled) }}
                      onClick={()=>{ if (canDelete) deleteOne(it); }}
                      disabled={!canDelete}
                      title={canDelete ? 'Delete this file' : 'Placeholder keep-alive files cannot be deleted'}
                    >
                      {canDelete ? 'Delete' : 'Protected'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

/* ───────────────────────── ASSIGNED MEDIA (renamed Media tab) ───────────────────────── */
function AssignedMediaPageTab({
  config,
  setConfig,
  onReapplyDefaults,
  inventory = [],
  devices = [],
  missions = [],
  assignedMediaError = null,
  setAssignedMediaError = () => {},
  setStatus = () => {},
}) {
  const [mediaTriggerPicker, setMediaTriggerPicker] = useState('');
  const safeConfig = config || {};
  const safeMedia = safeConfig.media || {};
  const safeIcons = safeConfig.icons || {};
  const rewards = safeMedia.rewardsPool || [];
  const penalties = safeMedia.penaltiesPool || [];
  const iconsM = safeIcons.missions || [];
  const iconsD = safeIcons.devices  || [];
  const iconsR = safeIcons.rewards  || [];
  const triggerConfig = mergeTriggerState(safeConfig.mediaTriggers);

  function updateMediaTrigger(partial) {
    setConfig((c) => {
      const base = c || {};
      return {
        ...base,
        mediaTriggers: mergeTriggerState(base.mediaTriggers, partial),
      };
    });
  }

  const iconsDevices = safeIcons.devices || [];
  const iconsMissions = safeIcons.missions || [];
  const mediaOptions = (inventory || []).map((it, idx) => {
    const rawUrl = it?.url || it?.path || it;
    const url = toDirectMediaURL(rawUrl);
    if (!url) return null;
    return { id: url, label: it?.label || baseNameFromUrl(url) || `Media ${idx + 1}`, thumbnail: url };
  }).filter(Boolean);
  const deviceOptions = (devices || []).map((d, idx) => {
    const id = d?.id || d?.key || `device-${idx}`;
    const label = d?.title || d?.name || id;
    const iconKey = d?.iconKey;
    const iconEntry = iconsDevices.find(x => (x.key||'') === iconKey);
    const thumbnail = toDirectMediaURL(d?.iconUrl || iconEntry?.url || '');
    return { id, label, thumbnail, meta: d };
  });
  const missionOptions = (missions || []).map((m, idx) => {
    const id = m?.id || `mission-${idx}`;
    const label = m?.title || id;
    const iconEntry = iconsMissions.find(x => (x.key||'') === m?.iconKey);
    const thumbnail = toDirectMediaURL(iconEntry?.url || '');
    return { id, label, thumbnail, meta: m };
  });
  const responseOptions = [];
  (missions || []).forEach((m) => {
    if (!m) return;
    const baseLabel = m.title || m.id || 'Mission';
    const iconEntry = iconsMissions.find(x => (x.key||'') === m?.iconKey);
    const correctThumb = toDirectMediaURL(m?.correct?.mediaUrl || m?.correct?.audioUrl || iconEntry?.url || '');
    responseOptions.push({ id: `${m.id || baseLabel}::correct`, label: `${baseLabel} — Correct`, thumbnail: correctThumb });
    const wrongThumb = toDirectMediaURL(m?.wrong?.mediaUrl || m?.wrong?.audioUrl || iconEntry?.url || '');
    responseOptions.push({ id: `${m.id || baseLabel}::wrong`, label: `${baseLabel} — Wrong`, thumbnail: wrongThumb });
  });
  const actionOptionsByType = {
    media: mediaOptions,
    devices: deviceOptions,
    missions: missionOptions,
  };
  const selectedActionList = actionOptionsByType[triggerConfig.actionType] || mediaOptions;
  const selectedAction = selectedActionList.find(opt => opt.id === triggerConfig.actionTarget) || null;
  const resolvedActionPreview = triggerConfig.actionThumbnail || selectedAction?.thumbnail || '';
  const selectedDevice = deviceOptions.find(opt => opt.id === triggerConfig.triggerDeviceId) || null;
  const selectedResponse = responseOptions.find(opt => opt.id === triggerConfig.triggeredResponseKey) || null;
  const selectedMission = missionOptions.find(opt => opt.id === triggerConfig.triggeredMissionId) || null;
  const triggeredDeviceSummaries = (devices || []).filter(d => d?.trigger?.enabled).map(d => ({
    id: d?.id || d?.key,
    label: d?.title || d?.name || d?.id || 'Device',
    trigger: sanitizeTriggerConfig(d?.trigger),
  }));

  const assignedMediaFallback = useCallback(({ error, reset }) => (
    <div style={S.errorPanel}>
      <div style={S.errorPanelTitle}>Assigned Media failed to load</div>
      <div style={S.errorPanelMessage}>
        {error?.message || 'An unexpected error occurred while rendering the Assigned Media tab.'}
      </div>
      <div style={S.errorPanelActions}>
        <button
          type="button"
          style={S.button}
          onClick={() => {
            setAssignedMediaError(null);
            reset();
          }}
        >
          Retry
        </button>
      </div>
    </div>
  ), [setAssignedMediaError]);

  const mediaPool = useMemo(() => {
    return (inventory || []).map((item, idx) => {
      const rawUrl = item?.url || item?.path || item;
      const directUrl = toDirectMediaURL(rawUrl);
      if (!directUrl) return null;
      const thumb = toDirectMediaURL(item?.thumbUrl || directUrl);
      return {
        id: directUrl,
        name: item?.label || baseNameFromUrl(directUrl) || `Media ${idx + 1}`,
        type: item?.kind || item?.type || classifyByExt(directUrl),
        category: item?.category || '',
        categoryLabel: item?.categoryLabel || '',
        tags: Array.isArray(item?.tags) ? item.tags : [],
        slug: item?.slug || '',
        thumbUrl: thumb,
        url: directUrl,
        openUrl: rawUrl || directUrl,
        path: item?.path || '',
      };
    }).filter(Boolean);
  }, [inventory]);

  const assignedState = useMemo(() => ({
    missionIcons: (config?.icons?.missions || []).map(icon => icon.key),
    deviceIcons: (config?.icons?.devices || []).map(icon => icon.key),
    rewardMedia: (config?.media?.rewardsPool || []).map(item => item.url),
    penaltyMedia: (config?.media?.penaltiesPool || []).map(item => item.url),
    actionMedia: config?.media?.actionMedia || [],
  }), [config]);

  const mediaUsageSummary = useMemo(() => {
    try {
    const normalize = (value) => {
      if (!value) return '';
      try {
        const direct = toDirectMediaURL(value) || String(value);
        return String(direct).trim();
      } catch {
        return String(value || '').trim();
      }
    };

    const inventoryIndex = new Map(
      (mediaPool || [])
        .map((item) => {
          const key = normalize(item?.id || item?.url);
          return key ? [key, item] : null;
        })
        .filter(Boolean)
    );

    const addTagValue = (set, value) => {
      if (!set) return;
      const normalizedTag = String(value || '').trim();
      if (!normalizedTag) return;
      set.add(normalizedTag);
    };

    const ensureEntry = (map, rawUrl, defaults = {}) => {
      const key = normalize(rawUrl);
      if (!key) return null;
      const info = inventoryIndex.get(key);
      let entry = map.get(key);
      if (!entry) {
        entry = {
          url: key,
          label: defaults.label || info?.name || baseNameFromUrl(key),
          references: new Set(),
          count: 0,
          kind: defaults.kind || info?.type || classifyByExt(key),
          thumbUrl: defaults.thumbUrl || info?.thumbUrl || '',
          tags: new Set(),
        };
        map.set(key, entry);
      }
      if (!entry.label && (defaults.label || info?.name)) {
        entry.label = defaults.label || info?.name;
      }
      if (!entry.kind && (defaults.kind || info?.type)) {
        entry.kind = defaults.kind || info?.type || entry.kind;
      }
      if (!entry.thumbUrl && (defaults.thumbUrl || info?.thumbUrl)) {
        entry.thumbUrl = defaults.thumbUrl || info?.thumbUrl || entry.thumbUrl;
      }
      (Array.isArray(info?.tags) ? info.tags : []).forEach((tag) => addTagValue(entry.tags, tag));
      (Array.isArray(defaults.tags) ? defaults.tags : []).forEach((tag) => addTagValue(entry.tags, tag));
      return entry;
    };

    const addUsage = (map, rawUrl, referenceLabel, defaults = {}) => {
      const entry = ensureEntry(map, rawUrl, defaults);
      if (!entry) return;
      entry.count += 1;
      if (referenceLabel) entry.references.add(referenceLabel);
    };

    const missionIconMap = new Map();
    const deviceIconMap = new Map();
    const rewardMap = new Map();
    const penaltyMap = new Map();
    const actionMap = new Map();
    const responseCorrectMap = new Map();
    const responseWrongMap = new Map();
    const responseAudioMap = new Map();
    const coverMap = new Map();
    const arTargetMap = new Map();
    const arOverlayMap = new Map();

    const missionIconLookup = new Map();
    (safeIcons.missions || []).forEach((icon) => {
      const url = normalize(icon?.url);
      if (!url) return;
      missionIconLookup.set(icon.key, { url, name: icon.name || icon.key });
    });

    (missions || []).forEach((mission) => {
      if (!mission) return;
      const title = mission.title || mission.id || 'Mission';
      const iconUrls = new Set();
      if (mission.iconUrl) {
        const direct = normalize(mission.iconUrl);
        if (direct) iconUrls.add(direct);
      }
      if (mission.iconKey && missionIconLookup.has(mission.iconKey)) {
        const found = missionIconLookup.get(mission.iconKey);
        if (found?.url) iconUrls.add(found.url);
      }
      iconUrls.forEach((url) => addUsage(missionIconMap, url, title));

      if (mission.onCorrect?.mediaUrl) addUsage(responseCorrectMap, mission.onCorrect.mediaUrl, `${title} — Correct`);
      if (mission.onWrong?.mediaUrl) addUsage(responseWrongMap, mission.onWrong.mediaUrl, `${title} — Wrong`);
      if (mission.onCorrect?.audioUrl) addUsage(responseAudioMap, mission.onCorrect.audioUrl, `${title} — Correct`);
      if (mission.onWrong?.audioUrl) addUsage(responseAudioMap, mission.onWrong.audioUrl, `${title} — Wrong`);

      const content = mission.content || {};
      if (content.markerUrl) {
        addUsage(arTargetMap, content.markerUrl, `${title} — Marker`, { label: `${title} marker`, kind: 'ar-target', tags: ['ar-target'] });
      }
      if (content.assetUrl) {
        addUsage(arOverlayMap, content.assetUrl, `${title} — Overlay`, { label: `${title} overlay`, kind: 'ar-overlay', tags: ['ar-overlay'] });
      }
    });

    const deviceIconLookup = new Map();
    (safeIcons.devices || []).forEach((icon) => {
      const url = normalize(icon?.url);
      if (!url) return;
      deviceIconLookup.set(icon.key, { url, name: icon.name || icon.key });
    });

    const hasDevices = Array.isArray(safeConfig.devices) && safeConfig.devices.length;
    const deviceList = (hasDevices ? safeConfig.devices : (safeConfig.powerups || [])) || [];
    deviceList.forEach((device) => {
      if (!device) return;
      const label = device.title || device.name || device.id || 'Device';
      const urls = new Set();
      if (device.iconUrl) {
        const direct = normalize(device.iconUrl);
        if (direct) urls.add(direct);
      }
      if (device.iconKey && deviceIconLookup.has(device.iconKey)) {
        const found = deviceIconLookup.get(device.iconKey);
        if (found?.url) urls.add(found.url);
      }
      urls.forEach((url) => addUsage(deviceIconMap, url, label));
    });

    (safeMedia.rewardsPool || []).forEach((item) => {
      if (!item?.url) return;
      const tags = Array.isArray(item?.tags) ? item.tags : undefined;
      addUsage(rewardMap, item.url, item.label || 'Reward slot', { label: item.label || undefined, tags });
    });

    (safeMedia.penaltiesPool || []).forEach((item) => {
      if (!item?.url) return;
      const tags = Array.isArray(item?.tags) ? item.tags : undefined;
      addUsage(penaltyMap, item.url, item.label || 'Penalty slot', { label: item.label || undefined, tags });
    });

    (safeMedia.actionMedia || []).forEach((url) => {
      addUsage(actionMap, url, 'Trigger assignment');
    });

    const coverUrl = normalize(safeConfig?.game?.coverImage);
    if (coverUrl) {
      const entry = ensureEntry(coverMap, coverUrl, { label: 'Game cover art' });
      if (entry) {
        entry.count = Math.max(1, entry.count);
        entry.references.add('Active cover image');
      }
    }

    const finalize = (map) => Array.from(map.values()).map((entry) => {
      const info = inventoryIndex.get(entry.url);
      const label = entry.label || info?.name || baseNameFromUrl(entry.url);
      const kind = entry.kind || info?.type || classifyByExt(entry.url);
      const openUrl = info?.openUrl || entry.url;
      const isAudioKind = kind === 'audio';
      const isArKind = kind === 'ar' || kind === 'ar-target' || kind === 'ar-overlay';
      const thumb = (isAudioKind || isArKind)
        ? ''
        : (info?.thumbUrl || entry.thumbUrl || openUrl);
      const tagSet = new Set();
      if (entry.tags instanceof Set) {
        entry.tags.forEach((tag) => addTagValue(tagSet, tag));
      }
      (Array.isArray(info?.tags) ? info.tags : []).forEach((tag) => addTagValue(tagSet, tag));
      return {
        url: openUrl,
        label,
        count: entry.count,
        references: Array.from(entry.references || []),
        kind,
        thumbUrl: thumb,
        removeKey: entry.url,
        tags: Array.from(tagSet),
      };
    }).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });

    return {
      missionIcons: finalize(missionIconMap),
      deviceIcons: finalize(deviceIconMap),
      rewardMedia: finalize(rewardMap),
      penaltyMedia: finalize(penaltyMap),
      actionMedia: finalize(actionMap),
      responseCorrect: finalize(responseCorrectMap),
      responseWrong: finalize(responseWrongMap),
      responseAudio: finalize(responseAudioMap),
      coverImages: finalize(coverMap),
      arTargets: finalize(arTargetMap),
      arOverlays: finalize(arOverlayMap),
    };
    } catch (err) {
      console.error('Failed to compute media usage summary', err);
      return {
        missionIcons: [],
        deviceIcons: [],
        rewardMedia: [],
        penaltyMedia: [],
        actionMedia: [],
        responseCorrect: [],
        responseWrong: [],
        responseAudio: [],
        coverImages: [],
        arTargets: [],
        arOverlays: [],
      };
    }
  }, [config, missions, mediaPool]);

  const arraysEqual = useCallback((a = [], b = []) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }, []);

  const handleAssignedStateChange = useCallback((nextAssigned = {}) => {
    const nextAction = Array.isArray(nextAssigned.actionMedia) ? nextAssigned.actionMedia : [];
    setConfig(current => {
      const base = current || {};
      const prevAction = base.media?.actionMedia || [];
      if (arraysEqual(prevAction, nextAction)) return current;
      return {
        ...base,
        media: {
          ...(base.media || {}),
          actionMedia: [...nextAction],
        },
      };
    });
  }, [arraysEqual, setConfig]);

  const triggerEnabled = !!triggerConfig.enabled;

  const handleTriggerToggle = useCallback((enabled) => {
    setMediaTriggerPicker('');
    updateMediaTrigger({ enabled });
  }, [updateMediaTrigger]);

  function removePoolItem(kind, idx) {
    if (!window.confirm('Remove this item from the assigned list?')) return;
    setConfig(c => {
      if (!c) return c;
      const m = { ...(c.media||{ rewardsPool:[], penaltiesPool:[] }) };
      if (kind === 'rewards') m.rewardsPool = m.rewardsPool.filter((_,i)=>i!==idx);
      if (kind === 'penalties') m.penaltiesPool = m.penaltiesPool.filter((_,i)=>i!==idx);
      return { ...c, media: m };
    });
  }
  function removeIcon(kind, key) {
    if (!window.confirm('Remove this icon from the assigned list?')) return;
    setConfig(c => {
      if (!c) return c;
      const icons = { missions:[...(c.icons?.missions||[])], devices:[...(c.icons?.devices||[])], rewards:[...(c.icons?.rewards||[])] };
      icons[kind] = icons[kind].filter(i => i.key !== key);
      return { ...c, icons };
    });
  }

  return (
    <main style={S.wrap}>
      <div style={S.card}>
        <SafeBoundary
          fallback={assignedMediaFallback}
          onError={(error) => {
            console.error('Assigned Media render failure', error);
            setAssignedMediaError(error);
            const message = error?.message || error || 'unknown error';
            setStatus(`❌ Assigned Media failed to load: ${message}`);
          }}
          onReset={() => setAssignedMediaError(null)}
          resetKeys={[assignedMediaError, assignedState, mediaUsageSummary, inventory]}
        >
          <AssignedMediaTab
            mediaPool={mediaPool}
            assigned={assignedState}
            onChange={handleAssignedStateChange}
            triggerEnabled={triggerEnabled}
            setTriggerEnabled={handleTriggerToggle}
            usageSummary={mediaUsageSummary}
          />
        </SafeBoundary>

        {triggerEnabled && (
          <>
            <div style={{ fontWeight:600, margin:'8px 0 12px', fontSize:18 }}>Automation Routing</div>

            <div style={{ marginTop:12, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ fontSize:12, color:'var(--admin-muted)' }}>Action type</div>
              <select
                style={S.input}
                value={triggerConfig.actionType}
                onChange={(e)=>{ setMediaTriggerPicker(''); updateMediaTrigger({ actionType:e.target.value, actionTarget:'', actionLabel:'', actionThumbnail:'' }); }}
              >
                <option value="media">Media</option>
                <option value="devices">Devices</option>
                <option value="missions">Missions</option>
              </select>
            </div>

            <TriggerDropdown
              label="Action target"
              openKey={mediaTriggerPicker}
              setOpenKey={setMediaTriggerPicker}
              dropdownKey="media-action"
              options={selectedActionList}
              selected={selectedAction}
              onSelect={(opt)=>{ updateMediaTrigger({ actionTarget: opt?.id || '', actionLabel: opt?.label || '', actionThumbnail: opt?.thumbnail || '' }); }}
            />
            {resolvedActionPreview && (
              <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontSize:12, color:'var(--admin-muted)' }}>Action preview</div>
                <div style={{ width:80, height:60, borderRadius:10, overflow:'hidden', border:'1px solid var(--admin-border-soft)', background:'var(--admin-tab-bg)', display:'grid', placeItems:'center' }}>
                  <img src={toDirectMediaURL(resolvedActionPreview)} alt="action preview" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                </div>
              </div>
            )}

            <TriggerDropdown
              label="Trigger Device"
              openKey={mediaTriggerPicker}
              setOpenKey={setMediaTriggerPicker}
              dropdownKey="media-device"
              options={deviceOptions}
              selected={selectedDevice}
              onSelect={(opt)=>{ updateMediaTrigger({ triggerDeviceId: opt?.id || '', triggerDeviceLabel: opt?.label || '' }); }}
            />

            <TriggerDropdown
              label="Triggered Response"
              openKey={mediaTriggerPicker}
              setOpenKey={setMediaTriggerPicker}
              dropdownKey="media-response"
              options={responseOptions}
              selected={selectedResponse}
              onSelect={(opt)=>{ updateMediaTrigger({ triggeredResponseKey: opt?.id || '' }); }}
            />

            <TriggerDropdown
              label="Triggered Mission"
              openKey={mediaTriggerPicker}
              setOpenKey={setMediaTriggerPicker}
              dropdownKey="media-mission"
              options={missionOptions}
              selected={selectedMission}
              onSelect={(opt)=>{ updateMediaTrigger({ triggeredMissionId: opt?.id || '' }); }}
            />
          </>
        )}

        <div style={{ marginTop:16 }}>
          <div style={{ fontWeight:600, marginBottom:6 }}>Trigger Device Assignments</div>
          {triggeredDeviceSummaries.length === 0 ? (
            <div style={{ color:'var(--admin-muted)', fontSize:12 }}>No trigger-enabled devices yet.</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:10 }}>
              {triggeredDeviceSummaries.map((it)=>{
                const preview = it.trigger.actionThumbnail || '';
                return (
                  <div key={it.id} style={{ border:'1px solid var(--admin-border-soft)', borderRadius:10, padding:10, display:'grid', gap:8 }}>
                    <div style={{ fontWeight:600 }}>{it.label}</div>
                    <div style={{ fontSize:12, color:'var(--admin-muted)' }}>Action: {it.trigger.actionLabel || it.trigger.actionTarget || '(none)'}</div>
                    {preview && (
                      <div style={{ width:'100%', height:64, borderRadius:10, overflow:'hidden', border:'1px solid var(--admin-border-soft)', background:'var(--admin-tab-bg)', display:'grid', placeItems:'center' }}>
                        <img src={toDirectMediaURL(preview)} alt="trigger preview" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Icons */}
      <div style={S.card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ marginTop:0, marginBottom:8 }}>Assigned Icons</h3>
          <button style={S.button} onClick={onReapplyDefaults}>Re-apply default icon sets</button>
        </div>

        <IconGroup
          title={`Mission Icons (${iconsM.length})`}
          items={iconsM}
          onRemove={(key)=>removeIcon('missions', key)}
        />
        <IconGroup
          title={`Device Icons (${iconsD.length})`}
          items={iconsD}
          onRemove={(key)=>removeIcon('devices', key)}
        />
        <IconGroup
          title={`Reward Icons (${iconsR.length})`}
          items={iconsR}
          onRemove={(key)=>removeIcon('rewards', key)}
        />
      </div>

      {/* Pools */}
      <div style={{ ...S.card, marginTop:16 }}>
        <h3 style={{ marginTop:0, marginBottom:8 }}>Assigned Media Pools</h3>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <Pool
            title={`Rewards Pool (${rewards.length})`}
            items={rewards}
            onRemove={(idx)=>removePoolItem('rewards', idx)}
          />
          <Pool
            title={`Penalties Pool (${penalties.length})`}
            items={penalties}
            onRemove={(idx)=>removePoolItem('penalties', idx)}
          />
        </div>
      </div>
    </main>
  );
}

/* Shared pieces for Assigned Media */
function IconGroup({ title, items, onRemove }) {
  return (
    <div style={{ marginTop:8 }}>
      <div style={{ fontWeight:600, marginBottom:8 }}>{title}</div>
      {items.length === 0 && <div style={{ color:'var(--admin-muted)', marginBottom:8 }}>No icons yet.</div>}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:10 }}>
        {items.map((it)=>(
          <div key={it.key} style={{ border:'1px solid var(--admin-border-soft)', borderRadius:10, padding:10, display:'grid', gap:6 }}>
            <div style={{ display:'grid', gridTemplateColumns:'48px 1fr', gap:8, alignItems:'center' }}>
              <img src={toDirectMediaURL(it.url)} alt="" style={{ width:48, height:48, objectFit:'contain', border:'1px solid var(--admin-border-soft)', borderRadius:8 }}/>
              <div>
                <div style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.name||it.key}</div>
                <div style={{ fontSize:12, color:'var(--admin-muted)' }}>{it.key}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <a href={toDirectMediaURL(it.url)} target="_blank" rel="noreferrer" style={{ ...S.button, textDecoration:'none', display:'grid', placeItems:'center' }}>Open</a>
              <button
                style={{ ...S.button, ...S.buttonDanger }}
                onClick={()=>onRemove(it.key)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function Pool({ title, items, onRemove }) {
  return (
    <div>
      <div style={{ fontWeight:600, marginBottom:8 }}>{title}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:10 }}>
        {items.map((it, idx)=>(
          <div key={idx} style={{ border:'1px solid var(--admin-border-soft)', borderRadius:10, padding:10 }}>
            <div style={{ fontWeight:600, marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {it.label || baseNameFromUrl(it.url)}
            </div>
            <MediaPreview url={it.url} kind="pool item" />
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <a href={toDirectMediaURL(it.url)} target="_blank" rel="noreferrer" style={{ ...S.button, textDecoration:'none', display:'grid', placeItems:'center' }}>Open</a>
              <button
                style={{ ...S.button, ...S.buttonDanger }}
                onClick={()=>{ if (window.confirm('Remove this item?')) onRemove(idx); }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {items.length===0 && <div style={{ color:'var(--admin-muted)' }}>No items.</div>}
      </div>
    </div>
  );
}

function TriggerDropdown({ label, openKey = '', setOpenKey = () => {}, dropdownKey, options = [], selected = null, onSelect = () => {} }) {
  const isOpen = openKey === dropdownKey;
  return (
    <div style={{ marginTop:12 }}>
      <div style={{ fontSize:12, color:'var(--admin-muted)', marginBottom:6 }}>{label}</div>
      <div style={{ position:'relative' }}>
        <button
          type="button"
          style={{ ...S.button, width:'100%', justifyContent:'space-between', display:'flex', alignItems:'center' }}
          onClick={()=>setOpenKey(isOpen ? '' : dropdownKey)}
        >
          <span>{selected ? selected.label : 'Select option'}</span>
          <span style={{ opacity:0.6 }}>▾</span>
        </button>
        {isOpen && (
          <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0, zIndex:40, maxHeight:240, overflowY:'auto', border:'1px solid var(--admin-border-soft)', borderRadius:10, background:'var(--appearance-panel-bg, var(--admin-panel-bg))', boxShadow:'0 18px 36px rgba(0,0,0,0.45)' }}>
            {options.length === 0 ? (
              <div style={{ padding:12, color:'var(--admin-muted)' }}>No options available.</div>
            ) : options.map(opt => (
              <div
                key={opt.id}
                onClick={()=>{ onSelect(opt); setOpenKey(''); }}
                style={{ display:'grid', gridTemplateColumns:'56px 1fr', gap:10, alignItems:'center', padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--admin-border-soft)' }}
              >
                <div style={{ width:56, height:42, borderRadius:8, overflow:'hidden', background:'var(--admin-tab-bg)', display:'grid', placeItems:'center' }}>
                  {opt.thumbnail ? (
                    <img src={toDirectMediaURL(opt.thumbnail)} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  ) : (
                    <div style={{ fontSize:12, color:'var(--admin-muted)' }}>No preview</div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight:600 }}>{opt.label}</div>
                  <div style={{ fontSize:12, color:'var(--admin-muted)' }}>{opt.id}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
