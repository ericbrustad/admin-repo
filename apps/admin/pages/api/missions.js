import fs from 'node:fs/promises';
import path from 'node:path';
export default async function handler(req, res) {
  try {
    const file = path.join(process.cwd(), 'public', 'missions.json');
    const raw = await fs.readFile(file, 'utf-8');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(raw);
  } catch (e) {
    res.status(500).send({ error: String(e?.message || e) });
  }
}