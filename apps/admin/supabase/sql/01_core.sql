-- Supabase core schema for Esxape Ride
create table if not exists public.games (
  slug text primary key,
  title text not null default '',
  status text not null default 'draft',
  theme jsonb not null default '{}'::jsonb,
  map jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.missions (
  id bigserial primary key,
  game_slug text not null references public.games(slug) on delete cascade,
  channel text not null check (channel in ('draft', 'published')),
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (game_slug, channel)
);

create table if not exists public.devices (
  id bigserial primary key,
  game_slug text not null references public.games(slug) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (game_slug)
);

create table if not exists public.feedback (
  id bigserial primary key,
  game_slug text not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
