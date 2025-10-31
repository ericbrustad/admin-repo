import slugHandler from './[slug].js';

export default function handler(req, res) {
  if (!req.query.slug && req.body && typeof req.body.slug === 'string') {
    req.query.slug = req.body.slug;
  }
  if (!req.query.slug) {
    return res.status(400).json({ ok: false, error: 'Missing slug' });
  }
  return slugHandler(req, res);
}
