// pages/api/content.js
import { loadContent } from '../../lib/content.js';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export default async function handler(req, res) {
  try {
    const slug = String(req.query.slug || '').trim();
    const channel = (req.query.channel || 'published').toString();

    if (!slug) return res.status(400).json({ ok:false, error: 'Missing slug' });

    const data = await loadContent({ slug, channel });

    // If loadContent returned local file paths, read from /public
    if (data.localRelConfig || data.localRelMissions) {
      const cfgPath = path.join(process.cwd(), 'public', data.localRelConfig);
      const misPath = path.join(process.cwd(), 'public', data.localRelMissions);
      let cfg = null, mis = null;
      try { cfg = JSON.parse(await fs.readFile(cfgPath, 'utf8')); } catch {}
      try { mis = JSON.parse(await fs.readFile(misPath, 'utf8')); } catch {}
      return res.status(200).json({ ok: true, config: cfg, missions: mis });
    }

    return res.status(200).json({ ok: true, ...data });
  } catch (err) {
    console.error('content error:', err);
    res.status(500).json({ ok:false, error: String(err?.message || err) });
  }
}
