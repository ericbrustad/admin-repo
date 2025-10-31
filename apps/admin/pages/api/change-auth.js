export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  try {
    const { curUser, curPass, newUser, newPass } = req.body || {};
    if (!curUser || !curPass || !newUser || !newPass) return res.status(400).send('Missing fields');

    const ENV_USER = process.env.BASIC_AUTH_USER || 'Eric';
    const ENV_PASS = process.env.BASIC_AUTH_PASS || 'someStrongPassword';
    if (curUser !== ENV_USER || curPass !== ENV_PASS) return res.status(401).send('Current credentials incorrect');

    const token = process.env.VERCEL_TOKEN;
    const project = process.env.VERCEL_PROJECT_ID_OR_NAME;
    const deployHook = process.env.VERCEL_DEPLOY_HOOK_URL;

    if (!token || !project) return res.status(500).send('Server missing VERCEL_TOKEN or VERCEL_PROJECT_ID_OR_NAME');

    const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/env?upsert=true`;
    for (const [key, value] of [['BASIC_AUTH_USER', newUser], ['BASIC_AUTH_PASS', newPass]]){
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, target: ['production'], type: 'plain' })
      });
      if (!resp.ok) {
        const t = await resp.text();
        return res.status(500).send(`Failed to set ${key}: ${t}`);
      }
    }
    if (deployHook) { try { await fetch(deployHook, { method: 'POST' }); } catch {} }
    return res.status(200).send('Updated');
  } catch (e) {
    return res.status(500).send(String(e?.message || e));
  }
}