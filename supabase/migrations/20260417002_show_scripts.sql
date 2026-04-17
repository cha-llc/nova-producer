-- Migration 002: show_scripts
-- Stores scripts for each show. status='ready' fires the NOVA trigger.

create type script_status as enum ('draft','ready','processing','done','failed');

create table if not exists public.show_scripts (
  id          uuid primary key default gen_random_uuid(),
  show_id     uuid not null references public.show_configs(id) on delete cascade,
  script_text text not null,
  caption     text not null default '',
  status      script_status not null default 'draft',
  created_at  timestamptz not null default now()
);

create index idx_show_scripts_show_id on public.show_scripts(show_id);
create index idx_show_scripts_status  on public.show_scripts(status);

alter table public.show_scripts enable row level security;

create policy "Allow all authenticated" on public.show_scripts
  for all using (true);
