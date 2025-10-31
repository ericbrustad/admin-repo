// Create a new match file under: public/games/<slug>/matches/<code>.json
// Body: { slug, code? }  -> returns { ok:true, code }
import { commitJsonIfAbsent, cors } from '../../../lib/secureStore';

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, error:'Method not allowed' });
  }

  try {
    const { slug, code } = req.body || {};
    if (!slug) return res.status(400).json({ ok:false, error:'Missing slug' });

    const matchCode = (code || randomCode()).toLowerCase();
    const path = `public/games/${encodeURIComponent(slug)}/matches/${encodeURIComponent(matchCode)}.json`;

    const now = new Date().toISOString();
    const doc = {
      gameSlug: slug,
      code: matchCode,
      createdAt: now,
      state: { status: 'waiting' },
      players: [] // we will push encrypted entries on join()
    };

    const ok = await commitJsonIfAbsent(path, doc, `Create match ${matchCode} for ${slug}`);
    if (!ok) return res.status(409).json({ ok:false, error:'Match already exists' });

    return res.status(200).json({ ok:true, code: matchCode });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}

function randomCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i=0;i<6;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)];
  return s;
}
