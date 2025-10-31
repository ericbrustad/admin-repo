import { serverClient } from '../../../lib/supabaseClient';

const R = 6378137;
function lon2x(lon) { return R * (lon * Math.PI / 180); }
function lat2y(lat) {
  const t = Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2);
  return R * Math.log(t);
}
function x2lon(x) { return (x / R) * 180 / Math.PI; }
function y2lat(y) { return (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI; }
function shiftPoint(point, dx, dy) {
  const x = lon2x(point.lng);
  const y = lat2y(point.lat);
  const nx = x + dx;
  const ny = y + dy;
  return { lat: y2lat(ny), lng: x2lon(nx) };
}

function applyOffsetToConfig(cfg, dx, dy) {
  if (!cfg || typeof cfg !== 'object') return cfg;

  if (cfg.map?.center?.lat != null && cfg.map?.center?.lng != null) {
    cfg.map.center = shiftPoint({ lat: Number(cfg.map.center.lat), lng: Number(cfg.map.center.lng) }, dx, dy);
  }

  if (cfg.geofence?.center?.lat != null && cfg.geofence?.center?.lng != null) {
    cfg.geofence.center = shiftPoint({ lat: Number(cfg.geofence.center.lat), lng: Number(cfg.geofence.center.lng) }, dx, dy);
  }

  const shiftLocField = (arr, field = 'location') => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      const loc = item?.[field];
      if (loc && loc.lat != null && loc.lng != null) {
        const shifted = shiftPoint({ lat: Number(loc.lat), lng: Number(loc.lng) }, dx, dy);
        item[field] = shifted;
      }
      if (item?.lat != null && item?.lng != null) {
        const shifted = shiftPoint({ lat: Number(item.lat), lng: Number(item.lng) }, dx, dy);
        item.lat = shifted.lat;
        item.lng = shifted.lng;
      }
    }
  };

  const shiftCircles = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      const center = item?.center;
      if (center && center.lat != null && center.lng != null) {
        item.center = shiftPoint({ lat: Number(center.lat), lng: Number(center.lng) }, dx, dy);
      }
    }
  };

  shiftLocField(cfg.missions, 'location');
  shiftLocField(cfg.devices, 'location');
  shiftLocField(cfg.pins, 'location');
  shiftLocField(cfg.checkpoints, 'location');
  shiftCircles(cfg.ranges);
  shiftCircles(cfg.geofences);

  return cfg;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { slug, channel = 'draft', newCenter } = req.body || {};
    if (!slug) {
      return res.status(400).json({ ok: false, error: 'Missing slug' });
    }
    if (!newCenter?.lat || !newCenter?.lng) {
      return res.status(400).json({ ok: false, error: 'Missing newCenter' });
    }

    const supabase = serverClient();
    const { data, error } = await supabase
      .from('games')
      .select('slug, channel, title, config')
      .eq('slug', slug)
      .eq('channel', channel)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (!data?.config?.map?.center) {
      const config = { ...(data?.config || {}), map: { ...(data?.config?.map || {}), center: newCenter } };
      const { error: updateError } = await supabase
        .from('games')
        .update({ config })
        .eq('slug', slug)
        .eq('channel', channel);
      if (updateError) {
        return res.status(500).json({ ok: false, error: updateError.message });
      }
      return res.status(200).json({ ok: true, moved: false, message: 'No previous center; set new center only.' });
    }

    const oldCenter = data.config.map.center;
    const dx = lon2x(newCenter.lng) - lon2x(oldCenter.lng);
    const dy = lat2y(newCenter.lat) - lat2y(oldCenter.lat);

    const cloned = JSON.parse(JSON.stringify(data.config || {}));
    applyOffsetToConfig(cloned, dx, dy);
    cloned.map = { ...(cloned.map || {}), center: newCenter };

    const { error: updateError } = await supabase
      .from('games')
      .update({ config: cloned, updated_at: new Date().toISOString() })
      .eq('slug', slug)
      .eq('channel', channel);

    if (updateError) {
      return res.status(500).json({ ok: false, error: updateError.message });
    }

    return res.status(200).json({ ok: true, moved: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'recenter failed' });
  }
}
