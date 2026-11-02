create table if not exists public.communication_email_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  event_type text not null check (event_type in ('welcome','weekly_summary')),
  status text not null check (status in ('processing','sent','failed')),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, event_key)
);
alter table public.communication_email_events enable row level security;
revoke all on public.communication_email_events from anon, authenticated;
grant all on public.communication_email_events to service_role;

create or replace function public.claim_communication_email_event(p_owner_id uuid, p_event_key text, p_event_type text)
returns boolean language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  v_status text;
  v_updated timestamptz;
begin
  if p_event_type not in ('welcome','weekly_summary') or length(p_event_key) not between 1 and 80 then
    raise exception 'Invalid communication event' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text || ':' || p_event_key,0));
  insert into public.communication_email_events(owner_id,event_key,event_type,status)
  values(p_owner_id,p_event_key,p_event_type,'processing') on conflict(owner_id,event_key) do nothing;
  select status,updated_at into v_status,v_updated from public.communication_email_events
    where owner_id=p_owner_id and event_key=p_event_key for update;
  if v_status='sent' or (v_status='processing' and v_updated > now()-interval '10 minutes') then return false; end if;
  update public.communication_email_events set status='processing',last_error=null,updated_at=now()
    where owner_id=p_owner_id and event_key=p_event_key;
  return true;
end $$;
revoke all on function public.claim_communication_email_event(uuid,text,text) from public, anon, authenticated;
grant execute on function public.claim_communication_email_event(uuid,text,text) to service_role;
