// lib/admin-shared.js
// Shared helpers, constants, and defaults used by Admin

/* ------------------ helpers ------------------ */
export async function fetchJsonSafe(url, fallback) {
  try {
    const r = await fetch(url, { cache: 'no-store', credentials: 'include' });
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes('application/json')) return await r.json();
  } catch {}
  return fallback;
}
export async function fetchFirstJson(urls, fallback) {
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: 'no-store', credentials: 'include' });
      const ct = r.headers.get('content-type') || '';
      if (r.ok && ct.includes('application/json')) return await r.json();
    } catch {}
  }
  return fallback;
}
export function toDirectMediaURL(u) {
  if (!u) return u;
  try {
    const url = new URL(u);
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
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function normalizeTone(tone) {
  const value = typeof tone === 'string' ? tone.trim().toLowerCase() : '';
  if (['dark', 'night', 'noir', 'shadow'].includes(value)) return 'dark';
  return 'light';
}
export function hexToRgb(hex) {
  try {
    const h = hex.replace('#','');
    const b = h.length === 3 ? h.split('').map(ch=>ch+ch).join('') : h;
    const r = parseInt(b.slice(0,2),16), g = parseInt(b.slice(2,4),16), bl = parseInt(b.slice(4,6),16);
    return `${r}, ${g}, ${bl}`;
  } catch { return '0,0,0'; }
}

function fallbackSurfaceColor(tone) {
  return tone === 'dark' ? '#0b1626' : '#f2f6fb';
}

export function appearanceBackgroundStyle(appearance = {}, tone = 'light') {
  const normalizedTone = normalizeTone(tone);
  const overlay = clamp(Number(appearance?.screenBgOpacity ?? 0), 0, 1);
  const bgHex = appearance?.screenBgColor || (normalizedTone === 'dark' ? '#0f1a2a' : '#e6eef9');
  const overlayColor = `rgba(${hexToRgb(bgHex)}, ${overlay})`;
  const style = {
    backgroundColor: appearance?.screenBgColor || fallbackSurfaceColor(normalizedTone),
    backgroundImage: 'none',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    backgroundBlendMode: overlay > 0.55 ? 'multiply' : 'normal',
  };

  const hasImage = appearance?.screenBgImage && appearance?.screenBgImageEnabled !== false;
  if (hasImage) {
    const layers = [];
    if (overlay > 0.02) {
      layers.push(`linear-gradient(${overlayColor}, ${overlayColor})`);
    }
    layers.push(`url(${appearance.screenBgImage})`);
    style.backgroundColor = fallbackSurfaceColor(normalizedTone);
    style.backgroundImage = layers.join(', ');
    style.backgroundBlendMode = overlay > 0.02 ? 'overlay' : 'normal';
  } else if (overlay > 0.02) {
    style.backgroundColor = fallbackSurfaceColor(normalizedTone);
    style.backgroundImage = `linear-gradient(${overlayColor}, ${overlayColor})`;
    style.backgroundBlendMode = 'normal';
  }

  return style;
}

export function surfaceStylesFromAppearance(appearance = {}, tone = 'light') {
  const normalizedTone = normalizeTone(tone);
  const overlay = clamp(Number(appearance?.screenBgOpacity ?? 0), 0, 1);
  const panelAlpha = normalizedTone === 'dark'
    ? clamp(0.78 + overlay * 0.12, 0.7, 0.94)
    : clamp(0.9 - overlay * 0.32, 0.55, 0.96);
  const borderAlpha = normalizedTone === 'dark'
    ? clamp(0.52 + overlay * 0.18, 0.4, 0.85)
    : clamp(0.3 + overlay * 0.22, 0.22, 0.72);
  const pipingOpacity = normalizedTone === 'dark'
    ? clamp(0.45 + overlay * 0.35, 0.32, 0.92)
    : clamp(0.25 + overlay * 0.26, 0.18, 0.72);

  return {
    panelBg: normalizedTone === 'dark'
      ? `rgba(12, 20, 32, ${panelAlpha})`
      : `rgba(255, 255, 255, ${panelAlpha})`,
    panelBorder: normalizedTone === 'dark'
      ? `1px solid rgba(120, 178, 232, ${borderAlpha})`
      : `1px solid rgba(28, 52, 78, ${borderAlpha})`,
    panelShadow: normalizedTone === 'dark'
      ? '0 22px 48px rgba(3, 8, 16, 0.72)'
      : '0 22px 48px rgba(10, 24, 46, 0.18)',
    pipingOpacity,
    pipingShadow: normalizedTone === 'dark'
      ? '0 0 30px rgba(68, 140, 220, 0.35)'
      : '0 0 30px rgba(26, 44, 68, 0.18)',
  };
}

/* ------------------ constants ------------------ */
export const TYPE_FIELDS = {
  multiple_choice: [
    { key:'question', label:'Question', type:'text' },
    { key:'mediaUrl',  label:'Image or Video URL (optional)', type:'text' },
  ],
  short_answer: [
    { key:'question',   label:'Question', type:'text' },
    { key:'answer',     label:'Correct Answer', type:'text' },
    { key:'acceptable', label:'Also Accept (comma-separated)', type:'text' },
    { key:'mediaUrl',   label:'Image or Video URL (optional)', type:'text' },
  ],
  statement: [
    { key:'text',     label:'Statement Text', type:'multiline' },
    { key:'mediaUrl', label:'Image or Video URL (optional)', type:'text' },
  ],
  video: [
    { key:'videoUrl',   label:'Video URL (https)', type:'text' },
    { key:'overlayText',label:'Overlay Text (optional)', type:'text' },
  ],
  geofence_image: [
    { key:'lat', label:'Latitude', type:'number' },
    { key:'lng', label:'Longitude', type:'number' },
    { key:'radiusMeters',    label:'Geofence Radius (m)', type:'number', min:5, max:2000 },
    { key:'cooldownSeconds', label:'Cooldown (sec)', type:'number', min:5, max:240 },
    { key:'imageUrl',  label:'Image URL (https)', type:'text' },
    { key:'overlayText',label:'Caption/Text', type:'text' },
  ],
  geofence_video: [
    { key:'lat', label:'Latitude', type:'number' },
    { key:'lng', label:'Longitude', type:'number' },
    { key:'radiusMeters',    label:'Geofence Radius (m)', type:'number', min:5, max:2000 },
    { key:'cooldownSeconds', label:'Cooldown (sec)', type:'number', min:5, max:240 },
    { key:'videoUrl',  label:'Video URL (https)', type:'text' },
    { key:'overlayText',label:'Overlay Text (optional)', type:'text' },
  ],
  ar_image: [
    { key:'markerUrl', label:'AR Marker Image URL (png/jpg)', type:'text' },
    { key:'assetUrl',  label:'AR Overlay Image URL (png/jpg)', type:'text' },
    { key:'overlayText',label:'Overlay Text (optional)', type:'text' },
  ],
  ar_video: [
    { key:'markerUrl', label:'AR Marker Image URL (png/jpg)', type:'text' },
    { key:'assetUrl',  label:'AR Video URL (mp4)', type:'text' },
    { key:'overlayText',label:'Overlay Text (optional)', type:'text' },
  ],
  stored_statement: [
    { key:'template', label:'Template Text (use #mXX# to insert answers)', type:'multiline' },
  ],
};
export const TYPE_LABELS = {
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
export const GAME_TYPES = ['Mystery','Chase','Race','Thriller','Hunt'];
export const DEVICE_TYPES = [
  { value:'smoke',  label:'Smoke (hide on GPS)' },
  { value:'clone',  label:'Clone (decoy location)' },
  { value:'jammer', label:'Signal Jammer (blackout radius)' },
];
export const FONT_FAMILIES = [
  { v:'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif', label:'System' },
  { v:'"Exo 2", "Segoe UI", sans-serif', label:'Exo 2' },
  { v:'"Orbitron", "Rajdhani", "Segoe UI", sans-serif', label:'Orbitron' },
  { v:'"Rajdhani", "Segoe UI", sans-serif', label:'Rajdhani' },
  { v:'"Titillium Web", "Segoe UI", sans-serif', label:'Titillium Web' },
  { v:'"Work Sans", "Segoe UI", sans-serif', label:'Work Sans' },
  { v:'"Source Sans Pro", "Segoe UI", sans-serif', label:'Source Sans Pro' },
  { v:'"Nunito", "Segoe UI", sans-serif', label:'Nunito' },
  { v:'"Poppins", "Segoe UI", sans-serif', label:'Poppins' },
  { v:'"Rubik", "Segoe UI", sans-serif', label:'Rubik' },
  { v:'"Merriweather Sans", "Segoe UI", sans-serif', label:'Merriweather Sans' },
  { v:'"Merriweather", "Times New Roman", serif', label:'Merriweather' },
  { v:'"Playfair Display", "Times New Roman", serif', label:'Playfair Display' },
  { v:'"Quicksand", "Segoe UI", sans-serif', label:'Quicksand' },
  { v:'"Baloo 2", "Comic Sans MS", "Segoe UI", sans-serif', label:'Baloo 2' },
  { v:'"Fredoka", "Segoe UI", sans-serif', label:'Fredoka' },
  { v:'"Pacifico", "Segoe UI", cursive', label:'Pacifico' },
  { v:'"Kalam", "Segoe UI", cursive', label:'Kalam' },
  { v:'"Creepster", "Segoe UI", cursive', label:'Creepster' },
  { v:'"Chewy", "Comic Sans MS", cursive', label:'Chewy' },
  { v:'Georgia, serif', label:'Georgia' },
  { v:'Times New Roman, Times, serif', label:'Times New Roman' },
  { v:'Arial, Helvetica, sans-serif', label:'Arial' },
  { v:'Courier New, Courier, monospace', label:'Courier New' },
];
export const DEFAULT_APPEARANCE_SKIN = 'forest-outpost';

export function defaultAppearance() {
  return {
    fontFamily: FONT_FAMILIES[0].v,
    fontSizePx: 22,
    fontColor: '#ffffff',
    textBgColor: '#000000',
    textBgOpacity: 0.0,
    screenBgColor: '#000000',
    screenBgOpacity: 0.0,
    screenBgImage: '',
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.45)',
    textAlign: 'center',
    textVertical: 'top',
  };
}
export const DEFAULT_ICONS = { missions:[], devices:[], rewards:[] };
export const DEFAULT_REWARDS = [
  { key:'gold-coin', name:'Gold Coin', ability:'Adds a coin to your wallet.', thumbUrl:'https://drive.google.com/uc?export=view&id=1TicLeS2LLwY8nVk-7Oc6ESxk_SyvxZGw' },
];

/* ------------------ defaults ------------------ */
export function defaultConfig() {
  return {
    splash: { enabled:true, mode:'single' },
    game:   { title:'Untitled Game', type:'Mystery', tags:['default','default-game'], coverImage:'' },
    forms:  { players:1 },
    timer:  { durationMinutes:0, alertMinutes:10 },
    textRules: [],
    devices: [], powerups: [],
    media: {}, icons: DEFAULT_ICONS,
    appearance: {
      ...defaultAppearance(),
      fontFamily: '"Exo 2", "Segoe UI", sans-serif',
      fontSizePx: 23,
      fontColor: '#262a58',
      textBgColor: '#f4f0ff',
      textBgOpacity: 0.7,
      screenBgColor: '#e0dcfa',
      screenBgOpacity: 0.46,
      screenBgImage: '',
      screenBgImageEnabled: false,
      textAlign: 'center',
      textVertical: 'top',
    },
    appearanceSkin: DEFAULT_APPEARANCE_SKIN,
    appearanceTone: 'light',
  };
}
export function defaultContentForType(t) {
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
