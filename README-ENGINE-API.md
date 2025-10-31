# Esxape Ride Admin — Engine API Integration

This repo ships the Supabase database schema, Edge Functions, and upload helpers
used by the Admin dashboard and game runtime. The Supabase project powers all
mission, device, media, and event persistence.

## Quickstart

1. Copy `.env.local.example` to `.env.local` and fill in the Supabase project
   URL plus anon/service keys.
2. Install dependencies with `yarn install` from the repository root.
3. Apply the SQL migrations:

   ```bash
   supabase db push
   # or run with psql: supabase/migrations/01_core.sql then 02_policies.sql
   ```

4. Create the `media` (public) and `imports` (private) buckets inside Supabase
   Storage. Attach the storage policies from `02_policies.sql` or through the
   Supabase dashboard.
5. Deploy the Edge Functions:

   ```bash
   supabase functions deploy sign-upload-url
   supabase functions deploy import-missions
   supabase functions deploy geofence-check
   supabase functions deploy events-record
   supabase functions deploy publish-game
   ```

6. Start the Admin dashboard:

   ```bash
   yarn workspace admin dev
   ```

## API Surfaces

- `POST /api/media/sign` — Next.js App Router endpoint that returns a signed
  upload URL for Supabase Storage. The Admin Media Pool uses this endpoint for
  uploads.
- `supabase/functions/sign-upload-url` — Edge Function used by the game client
  or automation to create signed upload URLs without exposing the service role.
- `supabase/functions/import-missions` — Parses CSV/JSON imports stored in the
  `imports` bucket and upserts mission rows with optional media linking.
- `supabase/functions/geofence-check` — Evaluates active missions and devices
  against incoming GPS coordinates.
- `supabase/functions/events-record` — Appends analytics events to
  `public.game_events`.
- `supabase/functions/publish-game` — Aggregates game content into the
  `public.published_games` snapshot consumed by the public API.

Refer to `game-esxape-ride/README-ENGINE-API.md` for curl smoke tests that hit
these endpoints with the anon key.
