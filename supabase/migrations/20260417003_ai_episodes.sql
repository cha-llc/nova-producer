-- Migration 003: ai_episodes
-- Stores every episode NOVA produces, including video/audio URLs and post status.

create type episode_status as enum ('generating','complete','failed');

create table if not exists public.ai_episodes (
  id               uuid primary key default gen_random_uuid(),
  script_id        uuid references public.show_scripts(id) on delete set null,
  show_name        text not null,
  audio_url        text not null default '',
  heygen_video_url text not null default '',
  storage_url      text not null default '',
  status           episode_status not null default 'generating',
  error_msg        text,
  created_at       timestamptz not null default now()
);

create index idx_ai_episodes_show_name  on public.ai_episodes(show_name);
create index idx_ai_episodes_status     on public.ai_episodes(status);
create index idx_ai_episodes_created_at on public.ai_episodes(created_at desc);

alter table public.ai_episodes enable row level security;

create policy "Allow all authenticated" on public.ai_episodes
  for all using (true);
