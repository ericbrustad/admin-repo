// Join an existing match, append encrypted player record.
// Body: { slug, code, player: { firstName, lastName, email, phone }, requestedRole? }
// Returns assigned { ok:true, playerId, role, playerIndex }
import { cors, getJsonFromRepo, commitJsonWithMerge, encryptPII } from '../../../lib/secureStore';

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error: 'Method not allowed' });

  try {
    const { slug, code, player, requestedRole } = req.body || {};
    if (!slug || !code || !player) return res.status(400).json({ ok:false, error:'Missing slug/code/player' });

    const path = `public/games/${encodeURIComponent(slug)}/matches/${encodeURIComponent(code)}.json`;
    const existing = await getJsonFromRepo(path);
    if (!existing) return res.status(404).json({ ok:false, error:'Match not found' });

    // decide seat
    const players = existing.players || [];
    if (players.length >= 2) return res.status(409).json({ ok:false, error:'Match is full' });

    // role logic: by join order if configured, else requested, else auto
    let role = 'seeker';
    const joinOrderRole = ['seeker','hider'][players.length] || 'seeker';
    const cfgRoleAssign = existing.config?.h2h?.roleAssignment; // optional if you later insert config snapshot

    if (cfgRoleAssign === 'by_join_order') {
      role = joinOrderRole;
    } else if (cfgRoleAssign === 'auto_assign') {
      role = Math.random() < 0.5 ? 'seeker' : 'hider';
      // avoid duplicate same roles if possible
      if (players.length === 1 && players[0]?.role === role) role = role === 'seeker' ? 'hider' : 'seeker';
    } else {
      // player_chooses (default): honor requestedRole if valid, else fallback by join order
      role = (requestedRole === 'hider' || requestedRole === 'seeker') ? requestedRole : joinOrderRole;
      if (players.length === 1 && players[0]?.role === role) role = role === 'seeker' ? 'hider' : 'seeker';
    }

    const playerIndex = players.length + 1; // 1 or 2
    const playerId = cryptoRandomId();

    const enc = await encryptPII({
      id: playerId,
      createdAt: new Date().toISOString(),
      role,
      playerIndex,
      info: {
        firstName: player.firstName || '',
        lastName:  player.lastName  || '',
        email:     player.email     || '',
        phone:     player.phone     || ''
      }
    });

    const updated = {
      ...existing,
      players: [...players, { enc }], // store encrypted blob
      // Optionally stamp a tiny snapshot of h2h config here for immutable reference later:
      // config: existing.config || { h2h: { ... } }
    };

    await commitJsonWithMerge(path, updated, `Join match ${code} (${role}#${playerIndex})`);
    return res.status(200).json({ ok:true, playerId, role, playerIndex });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}

function cryptoRandomId() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i=0;i<22;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)];
  return s;
}
