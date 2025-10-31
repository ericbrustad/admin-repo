// Esxape Ride — API: /api/games/list
// Codex (2025-10-30): Lists games discovered on the filesystem
import { findGames } from '../../../lib/find-games.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { baseDirs, games } = findGames();
    res.status(200).json({ ok: true, games, baseDirs });
  } catch (err) {
    res.status(200).json({
      ok: false,
      error: err?.message || 'Failed to list games',
    });
  }
}

