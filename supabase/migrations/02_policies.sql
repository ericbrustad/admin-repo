-- 02_policies.sql — RLS and storage policies for Esxape Ride

alter table public.games enable row level security;
alter table public.missions enable row level security;
alter table public.devices enable row level security;
alter table public.mission_media enable row level security;
alter table public.media enable row level security;
alter table public.game_events enable row level security;
alter table public.published_games enable row level security;
alter table public.import_jobs enable row level security;

-- Anonymous / authenticated clients can read published payloads
create policy if not exists "read_published_games" on public.games
  for select using ( status = 'published' );

create policy if not exists "read_published_missions" on public.missions
  for select using ( exists (
    select 1 from public.games g
    where g.id = missions.game_id and g.status = 'published'
  ) );

create policy if not exists "read_published_devices" on public.devices
  for select using ( exists (
    select 1 from public.games g
    where g.id = devices.game_id and g.status = 'published'
  ) );

create policy if not exists "read_published_mission_media" on public.mission_media
  for select using (
    exists (
      select 1
      from public.missions m
      join public.games g on g.id = m.game_id
      where m.id = mission_media.mission_id and g.status = 'published'
    )
  );

create policy if not exists "read_published_payloads" on public.published_games
  for select using ( true );

-- Service role has full access via edge functions
create policy if not exists "service_role_games_all" on public.games
  using ( auth.role() = 'service_role' ) with check ( auth.role() = 'service_role' );

create policy if not exists "service_role_missions_all" on public.missions
  using ( auth.role() = 'service_role' ) with check ( auth.role() = 'service_role' );

create policy if not exists "service_role_devices_all" on public.devices
  using ( auth.role() = 'service_role' ) with check ( auth.role() = 'service_role' );

create policy if not exists "service_role_mission_media_all" on public.mission_media
  using ( auth.role() = 'service_role' ) with check ( auth.role() = 'service_role' );

create policy if not exists "service_role_media_all" on public.media
  using ( auth.role() = 'service_role' ) with check ( auth.role() = 'service_role' );

create policy if not exists "service_role_game_events_all" on public.game_events
  using ( auth.role() = 'service_role' ) with check ( auth.role() = 'service_role' );

create policy if not exists "service_role_published_games_all" on public.published_games
  using ( auth.role() = 'service_role' ) with check ( auth.role() = 'service_role' );

create policy if not exists "service_role_import_jobs_all" on public.import_jobs
  using ( auth.role() = 'service_role' ) with check ( auth.role() = 'service_role' );

-- Storage bucket policies are managed via the Supabase dashboard. Include reference comments.
comment on table public.media is 'Tracks Supabase Storage objects mirrored in the Esxape Ride engine.';
comment on table public.import_jobs is 'Audit log for CSV/JSON mission imports.';
