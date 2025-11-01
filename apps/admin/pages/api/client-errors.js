export default async function handler(req, res) {
  try {
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : req.body || {};
    console.error('[client-error]', {
      ua: req.headers['user-agent'],
      referer: req.headers.referer,
      ...body,
    });
  } catch (e) {
    console.error('[client-error] parse error', e);
  }
  res.status(200).json({ ok: true });
}
