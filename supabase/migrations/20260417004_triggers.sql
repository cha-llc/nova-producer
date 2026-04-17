-- Migration 004: NOVA trigger
-- When a show_script's status changes to 'ready', this trigger:
--   1. Updates status to 'processing'
--   2. Calls the ai-show-producer Edge Function via pg_net

-- Requires pg_net extension (enabled by default on Supabase)
create extension if not exists pg_net;

-- Trigger function
create or replace function public.trigger_nova_producer()
returns trigger
language plpgsql
security definer
as $$
declare
  v_show       record;
  v_payload    jsonb;
  v_func_url   text;
begin
  -- Only fire on status change TO 'ready'
  if NEW.status <> 'ready' then
    return NEW;
  end if;
  if OLD.status = 'ready' then
    return NEW;
  end if;

  -- Fetch the show config (voice_id, avatar_id, show_name)
  select * into v_show
  from public.show_configs
  where id = NEW.show_id;

  if v_show is null then
    raise warning 'NOVA trigger: show_config not found for show_id %', NEW.show_id;
    return NEW;
  end if;

  -- Mark as processing immediately
  update public.show_scripts set status = 'processing' where id = NEW.id;

  -- Pre-insert an ai_episodes row in 'generating' state
  insert into public.ai_episodes (script_id, show_name, status)
  values (NEW.id, v_show.show_name, 'generating');

  -- Build Edge Function URL
  v_func_url := current_setting('app.supabase_url', true)
    || '/functions/v1/ai-show-producer';

  -- Build payload
  v_payload := jsonb_build_object(
    'script_id',  NEW.id,
    'show_name',  v_show.show_name,
    'voice_id',   v_show.voice_id,
    'avatar_id',  v_show.avatar_id
  );

  -- Fire the Edge Function asynchronously via pg_net
  perform net.http_post(
    url     := v_func_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := v_payload
  );

  return NEW;
end;
$$;

-- Attach trigger to show_scripts
drop trigger if exists on_script_ready on public.show_scripts;
create trigger on_script_ready
  after update of status on public.show_scripts
  for each row
  execute function public.trigger_nova_producer();

-- Also fire on INSERT when status is already 'ready'
drop trigger if exists on_script_insert_ready on public.show_scripts;
create trigger on_script_insert_ready
  after insert on public.show_scripts
  for each row
  when (NEW.status = 'ready')
  execute function public.trigger_nova_producer();

-- App settings (set these after running migrations)
-- alter database postgres set app.supabase_url = 'https://vzzzqsmqqaoilkmskadl.supabase.co';
-- alter database postgres set app.service_role_key = 'your_service_role_key';
