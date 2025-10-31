// lib/game-switch.js
// Centralized toggle for the optional Game project.

function parseFlag(value) {
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  if (['0', 'false', 'off', 'no', 'disabled'].includes(normalized)) return false;
  if (['1', 'true', 'on', 'yes', 'enabled'].includes(normalized)) return true;
  return false;
}

const rawEnvValue = (typeof process !== 'undefined' && process.env)
  ? (process.env.NEXT_PUBLIC_GAME_ENABLED ?? process.env.GAME_ENABLED ?? '1')
  : '1';

export const GAME_ENABLED = parseFlag(rawEnvValue);
export const isGameEnabled = () => GAME_ENABLED;

export function assertGameEnabled() {
  if (!GAME_ENABLED) {
    throw new Error('Game project is disabled by configuration');
  }
}
