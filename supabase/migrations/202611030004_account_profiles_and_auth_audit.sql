-- Create a profile for every Supabase Auth account and keep a private,
-- append-only record of account security events.
create table if not exists public.auth_access_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('sign_up','sign_in','sign_out','password_recovery','password_changed')),
  occurred_at timestamptz not null default now()
);

create index if not exists auth_access_audit_user_time_idx
  on public.auth_access_audit(user_id, occurred_at desc);

alter table public.auth_access_audit enable row level security;
revoke all on public.auth_access_audit from anon, authenticated;
grant select on public.auth_access_audit to authenticated;

drop policy if exists "auth audit owner read" on public.auth_access_audit;
create policy "auth audit owner read" on public.auth_access_audit
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.record_my_auth_event(p_event_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_event_type not in ('sign_in','sign_out','password_recovery','password_changed') then
    raise exception 'Unsupported account event' using errcode = '22023';
  end if;
  insert into public.auth_access_audit(user_id, event_type)
  values (v_user_id, p_event_type);
end;
$$;
revoke all on function public.record_my_auth_event(text) from public, anon, authenticated;
grant execute on function public.record_my_auth_event(text) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;

  insert into public.auth_access_audit(user_id, event_type)
  values (new.id, 'sign_up');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_menya on auth.users;
create trigger on_auth_user_created_menya
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill profiles for accounts that existed before the trigger was added.
insert into public.profiles(id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', '')
from auth.users
on conflict (id) do nothing;
