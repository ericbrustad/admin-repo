-- 01_core.sql — Primary schema objects for Esxape Ride engine
-- This migration is idempotent so it can be re-run safely.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  status text not null default 'draft',
  splash_mode text,
  map_center jsonb,
  geofence_defaults jsonb,
  settings jsonb,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  bucket text not null,
  path text not null,
  mime_type text,
  size_bytes bigint,
  checksum text,
  tags text[],
  metadata jsonb,
  uploaded_at timestamptz not null default timezone('utc', now()),
  constraint media_bucket_path_unique unique (bucket, path)
);

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  slug text not null,
  title text not null,
  type text not null,
  description text,
  geo jsonb,
  triggers jsonb,
  config jsonb,
  order_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint missions_game_slug_unique unique (game_id, slug)
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  slug text not null,
  title text not null,
  kind text not null,
  state text,
  geo jsonb,
  config jsonb,
  is_active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint devices_game_slug_unique unique (game_id, slug)
);

create table if not exists public.mission_media (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete cascade,
  role text not null default 'reference',
  order_index integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint mission_media_mission_media_unique unique (mission_id, media_id, role)
);

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  mission_id uuid references public.missions (id) on delete set null,
  device_id uuid references public.devices (id) on delete set null,
  event_type text not null,
  actor_id text,
  payload jsonb,
  recorded_at timestamptz not null default timezone('utc', now())
);

create index if not exists game_events_game_id_idx on public.game_events (game_id, recorded_at desc);
create index if not exists mission_media_media_idx on public.mission_media (media_id);
create index if not exists missions_game_idx on public.missions (game_id, order_index);
create index if not exists devices_game_idx on public.devices (game_id, order_index);

create table if not exists public.published_games (
  game_id uuid primary key references public.games (id) on delete cascade,
  slug text not null,
  payload jsonb not null,
  published_at timestamptz not null default timezone('utc', now())
);

create or replace view public.v_published_game as
select
  g.id,
  g.slug,
  g.title,
  pg.published_at,
  (pg.payload ->> 'status') as status,
  (pg.payload -> 'settings') as settings,
  (pg.payload -> 'missions') as missions,
  (pg.payload -> 'devices') as devices,
  pg.payload
from public.published_games pg
join public.games g on g.id = pg.game_id;

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  file_path text not null,
  status text not null default 'pending',
  report jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger trg_games_updated_at
  before update on public.games
  for each row execute function public.touch_updated_at();

create trigger trg_missions_updated_at
  before update on public.missions
  for each row execute function public.touch_updated_at();

create trigger trg_devices_updated_at
  before update on public.devices
  for each row execute function public.touch_updated_at();
