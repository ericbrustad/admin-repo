const DEFAULT_MISSION_PREFIX = 'm';
const DEFAULT_DEVICE_PREFIX = 'd';

function buildIdSet(values = [], normalizer = (value) => value) {
  const result = new Set();
  (values || []).forEach((value) => {
    const normalized = normalizer(value);
    if (!normalized) return;
    result.add(normalized);
  });
  return result;
}

function formatNumericId(prefix, counter) {
  const normalizedPrefix = String(prefix || '').trim() || 'x';
  const digits = String(counter || 0).padStart(2, '0');
  return `${normalizedPrefix}${digits}`;
}

export function nextMissionId(missions = [], prefix = DEFAULT_MISSION_PREFIX) {
  const ids = buildIdSet(missions, (mission) => String(mission?.id || '')
    .trim()
    .toLowerCase());
  let counter = 1;
  let candidate = formatNumericId(prefix, counter);
  while (ids.has(candidate)) {
    counter += 1;
    candidate = formatNumericId(prefix, counter);
  }
  return candidate;
}

export function nextDeviceId(devices = [], prefix = DEFAULT_DEVICE_PREFIX) {
  const ids = buildIdSet(devices, (device) => String(device?.id || device?.key || '')
    .trim()
    .toLowerCase());
  let counter = 1;
  let candidate = formatNumericId(prefix, counter);
  while (ids.has(candidate)) {
    counter += 1;
    candidate = formatNumericId(prefix, counter);
  }
  return candidate;
}

export function nextPowerupKey(powerups = [], prefix = 'powerup_') {
  const ids = buildIdSet(powerups, (powerup) => String(powerup?.key || powerup?.id || '')
    .trim()
    .toLowerCase());
  let counter = 1;
  let candidate = `${prefix}${counter}`;
  while (ids.has(candidate)) {
    counter += 1;
    candidate = `${prefix}${counter}`;
  }
  return candidate;
}

export default {
  nextMissionId,
  nextDeviceId,
  nextPowerupKey,
};
