# Esxape Ride Game — Supabase Smoke Tests

These curl helpers verify the Supabase Edge Functions and published REST view
that power the live game client. Populate the environment variables first:

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="anon-key"
export GAME_ID="<uuid>"        # optional convenience var
```

## Signed Upload

```bash
curl -X POST "$SUPABASE_URL/functions/v1/sign-upload-url" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"bucket":"media","path":"mediapool/test/cover.png"}'
```

## Import Missions

```bash
curl -X POST "$SUPABASE_URL/functions/v1/import-missions" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"gameId":"'$GAME_ID'","filePath":"imports/sample.csv"}'
```

## Publish Game

```bash
curl -X POST "$SUPABASE_URL/functions/v1/publish-game" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"gameId":"'$GAME_ID'"}'
```

## Fetch Published Snapshot

```bash
curl "$SUPABASE_URL/rest/v1/v_published_game?slug=eq.test-city-run" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

## Geofence Check

```bash
curl -X POST "$SUPABASE_URL/functions/v1/geofence-check" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"gameId":"'$GAME_ID'","lat":44.9778,"lng":-93.2650}'
```

## Record Event

```bash
curl -X POST "$SUPABASE_URL/functions/v1/events-record" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"gameId":"'$GAME_ID'","eventType":"tap","payload":{"note":"sample"}}'
```
