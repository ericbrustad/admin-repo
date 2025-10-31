#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_ANON_KEY:-}" ]]; then
  echo "SUPABASE_URL and SUPABASE_ANON_KEY must be set" >&2
  exit 1
fi

game_id="${1:-${GAME_ID:-}}"
if [[ -z "$game_id" ]]; then
  echo "Usage: GAME_ID=<uuid> $0 [game-id]" >&2
  exit 1
fi

# Pretty-printer that does not hard require jq.
# Tries: jq → python3 -m json.tool → python -m json.tool → raw.
pretty() {
  # slurp stdin
  local input
  input="$(cat)"

  if command -v jq >/dev/null 2>&1; then
    echo "$input" | jq 2>/dev/null || { echo "$input"; return 0; }
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    echo "$input" | python3 -m json.tool 2>/dev/null || { echo "$input"; return 0; }
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    echo "$input" | python -m json.tool 2>/dev/null || { echo "$input"; return 0; }
    return 0
  fi
  # last resort: raw output
  echo "$input"
}

post_json() {
  local url="$1"
  local payload="$2"
  curl -sS -X POST "$url" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload" \
  | pretty
}

echo "== Publish game =="
post_json "$SUPABASE_URL/functions/v1/publish-game" '{"gameId":"'"$game_id"'"}'

echo "== Fetch published view =="
curl -sS "$SUPABASE_URL/rest/v1/v_published_game?slug=eq.test-city-run" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
| pretty

echo "== Geofence check =="
post_json "$SUPABASE_URL/functions/v1/geofence-check" '{"gameId":"'"$game_id"'","lat":44.9778,"lng":-93.2650}'

echo "== Record tap event =="
post_json "$SUPABASE_URL/functions/v1/events-record" '{"gameId":"'"$game_id"'","eventType":"tap","payload":{"note":"cli smoke"}}'
