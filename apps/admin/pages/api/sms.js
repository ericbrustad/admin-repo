export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  try {
    const { to, body } = req.body || {};
    if (!to || !body) return res.status(400).send('Missing "to" or "body"');

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const apiKey = process.env.TWILIO_API_KEY_SID;
    const apiSecret = process.env.TWILIO_API_KEY_SECRET;
    const from = process.env.TWILIO_FROM;

    if (!from) return res.status(500).send('Server missing TWILIO_FROM');
    if (!accountSid) return res.status(500).send('Server missing TWILIO_ACCOUNT_SID');

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', from);
    params.append('Body', body);

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (authToken) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    } else if (apiKey && apiSecret) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
      headers['X-Twilio-AccountSid'] = accountSid;
    } else {
      return res.status(500).send('Server missing TWILIO_AUTH_TOKEN or API key/secret');
    }

    const resp = await fetch(url, { method:'POST', headers, body: params.toString() });
    if (!resp.ok) {
      const t = await resp.text();
      return res.status(500).send('Twilio error: ' + t);
    }
    const data = await resp.json();
    return res.status(200).json({ ok:true, sid: data.sid });
  } catch (e) {
    return res.status(500).send(String(e?.message || e));
  }
}