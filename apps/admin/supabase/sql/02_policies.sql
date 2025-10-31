alter table public.games enable row level security;
alter table public.missions enable row level security;
alter table public.devices enable row level security;
alter table public.feedback enable row level security;

create role if not exists app_admin;

create policy "read published games" on public.games
  for select using (status = 'published' or auth.role() = 'authenticated');

create policy "read missions published" on public.missions
  for select using (channel = 'published' or auth.role() = 'authenticated');

create policy "read devices by anyone" on public.devices
  for select using (true);

create policy "admin writes games" on public.games
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "admin writes missions" on public.missions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "admin writes devices" on public.devices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "players can send feedback" on public.feedback
  for insert to anon with check (true);

create policy "admins read feedback" on public.feedback
  for select to authenticated using (true);
