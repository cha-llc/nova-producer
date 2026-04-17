-- Migration 001: show_configs
-- Stores per-show ElevenLabs voice ID and HeyGen avatar ID

create table if not exists public.show_configs (
  id           uuid primary key default gen_random_uuid(),
  show_name    text not null unique,
  display_name text not null,
  description  text not null default '',
  color        text not null default '#C9A84C',
  voice_id     text not null default '',
  avatar_id    text not null default '',
  day_of_week  text not null default '',
  created_at   timestamptz not null default now()
);

alter table public.show_configs enable row level security;

create policy "Allow authenticated read" on public.show_configs
  for select using (true);

create policy "Allow authenticated update" on public.show_configs
  for update using (true);
