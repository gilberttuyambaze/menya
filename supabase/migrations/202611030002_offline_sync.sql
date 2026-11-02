-- Versioned, idempotent sync boundary. Existing learning tables remain intact.
create table if not exists public.learning_sync_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('session','topic','plan','review','group','settings','audit')),
  entity_id text not null,
  payload jsonb,
  server_version bigint not null default 1 check (server_version > 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_id, entity_type, entity_id)
);
create index if not exists learning_sync_records_owner_updated_idx on public.learning_sync_records(owner_id, updated_at, entity_type, entity_id);
alter table public.learning_sync_records enable row level security;
drop policy if exists "learning sync owner read" on public.learning_sync_records;
create policy "learning sync owner read" on public.learning_sync_records for select to authenticated using ((select auth.uid()) = owner_id);
revoke insert, update, delete, truncate, references, trigger on public.learning_sync_records from anon, authenticated;
grant select on public.learning_sync_records to authenticated;

create table if not exists public.learning_sync_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, operation_id)
);
alter table public.learning_sync_operations enable row level security;
revoke all on public.learning_sync_operations from anon, authenticated;

-- Backfill current cloud data once. Existing rows are retained in both schemas.
insert into public.learning_sync_records(owner_id,entity_type,entity_id,payload,server_version,updated_at)
select user_id,'session',id::text,jsonb_build_object('id',id::text,'topic',topic_name,'subject',subject,'minutes',duration_minutes,'attempted',problems_attempted,'correct',problems_correct,'studiedAt',studied_at,'method',study_method,'difficulty',difficulty,'reflection',reflection),1,updated_at from public.study_sessions on conflict do nothing;
insert into public.learning_sync_records(owner_id,entity_type,entity_id,payload,server_version,updated_at)
select user_id,'topic',name,jsonb_build_object('name',name),1,now() from public.learning_topics on conflict do nothing;
insert into public.learning_sync_records(owner_id,entity_type,entity_id,payload,server_version,updated_at)
select user_id,'plan',id::text,jsonb_build_object('id',id::text,'topic',topic,'date',planned_for::text,'minutes',duration_minutes,'complete',completed_at is not null),1,coalesce(completed_at,planned_for::timestamptz,now()) from public.planned_sessions on conflict do nothing;
insert into public.learning_sync_records(owner_id,entity_type,entity_id,payload,server_version,updated_at)
select user_id,'review',week_start::text,jsonb_build_object('week',week_start::text,'wins',wins,'difficulties',difficulties,'lessons',lessons,'nextFocus',next_focus,'updatedAt',updated_at),1,updated_at from public.weekly_reviews on conflict do nothing;
insert into public.learning_sync_records(owner_id,entity_type,entity_id,payload,server_version,updated_at)
select id,'settings','profile',jsonb_build_object('name',display_name,'rules',jsonb_build_object('weeklyTargetMinutes',weekly_goal_minutes),'theme','dark'),1,updated_at from public.profiles on conflict do nothing;
insert into public.learning_sync_records(owner_id,entity_type,entity_id,payload,server_version,updated_at)
select user_id,'audit',id::text,jsonb_build_object('id',id::text,'action',action,'recordId',record_id::text,'at',created_at,'before',before_data,'after',after_data),1,created_at from public.audit_logs on conflict do nothing;

create or replace function public.apply_learning_sync_operation(
  p_operation_id uuid, p_entity_type text, p_entity_id text,
  p_operation_type text, p_payload jsonb, p_expected_version bigint
) returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  v_owner uuid := auth.uid();
  v_existing jsonb;
  v_current public.learning_sync_records%rowtype;
  v_version bigint;
  v_now timestamptz := now();
  v_response jsonb;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_operation_id is null or p_entity_id is null or length(p_entity_id) = 0 or length(p_entity_id) > 160 then raise exception 'Invalid operation identity' using errcode='22023'; end if;
  if p_expected_version is null or p_expected_version < 0 then raise exception 'Invalid expected version' using errcode='22023'; end if;
  if p_entity_type not in ('session','topic','plan','review','group','settings','audit') then raise exception 'Unsupported entity type' using errcode='22023'; end if;
  if p_operation_type not in ('CREATE','UPDATE','DELETE') then raise exception 'Unsupported operation' using errcode='22023'; end if;
  if (p_operation_type = 'DELETE') <> (p_payload is null) then raise exception 'Payload does not match operation type' using errcode='22023'; end if;
  if p_payload is not null and jsonb_typeof(p_payload) <> 'object' then raise exception 'Payload must be a JSON object' using errcode='22023'; end if;
  if p_operation_type <> 'DELETE' and p_entity_type in ('session','plan','audit') and p_payload->>'id' is distinct from p_entity_id then raise exception 'Payload identifier mismatch' using errcode='22023'; end if;
  if p_operation_type <> 'DELETE' and p_entity_type in ('topic','group') and p_payload->>'name' is distinct from p_entity_id then raise exception 'Payload identifier mismatch' using errcode='22023'; end if;
  if p_operation_type <> 'DELETE' and p_entity_type='session' and (
    nullif(p_payload->>'topic','') is null or nullif(p_payload->>'studiedAt','') is null
    or coalesce((p_payload->>'minutes')::integer,-1) not between 0 and 1440
    or coalesce((p_payload->>'attempted')::integer,-1) < 0
    or coalesce((p_payload->>'correct')::integer,-1) < 0
    or (p_payload->>'correct')::integer > (p_payload->>'attempted')::integer
    or ((p_payload->>'minutes')::integer=0 and (p_payload->>'attempted')::integer=0)
    or coalesce(p_payload->>'difficulty','') not in ('Easy','Medium','Hard')
  ) then raise exception 'Invalid study session payload' using errcode='22023'; end if;
  if p_operation_type <> 'DELETE' and p_entity_type='topic' and length(trim(coalesce(p_payload->>'name',''))) not between 1 and 120 then raise exception 'Invalid topic payload' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_entity_type || ':' || p_entity_id,0));
  select response into v_existing from public.learning_sync_operations where owner_id=v_owner and operation_id=p_operation_id;
  if found then return v_existing; end if;
  select * into v_current from public.learning_sync_records where owner_id=v_owner and entity_type=p_entity_type and entity_id=p_entity_id for update;
  if not found then
    if p_expected_version <> 0 or p_operation_type not in ('CREATE','DELETE') then
      v_response := jsonb_build_object('ok',false,'conflict',jsonb_build_object('entityType',p_entity_type,'entityId',p_entity_id,'payload',null,'version',0,'deletedAt',null,'updatedAt',v_now));
    else
      insert into public.learning_sync_records(owner_id,entity_type,entity_id,payload,server_version,deleted_at,updated_at)
      values(v_owner,p_entity_type,p_entity_id,p_payload,1,case when p_operation_type='DELETE' then v_now end,v_now)
      returning server_version into v_version;
      v_response := jsonb_build_object('ok',true,'version',v_version,'updatedAt',v_now);
    end if;
  elsif v_current.server_version <> p_expected_version then
    v_response := jsonb_build_object('ok',false,'conflict',jsonb_build_object('entityType',v_current.entity_type,'entityId',v_current.entity_id,'payload',v_current.payload,'version',v_current.server_version,'deletedAt',v_current.deleted_at,'updatedAt',v_current.updated_at));
  elsif p_operation_type='CREATE' and v_current.deleted_at is null then
    v_response := jsonb_build_object('ok',false,'conflict',jsonb_build_object('entityType',v_current.entity_type,'entityId',v_current.entity_id,'payload',v_current.payload,'version',v_current.server_version,'deletedAt',v_current.deleted_at,'updatedAt',v_current.updated_at));
  else
    update public.learning_sync_records set payload=p_payload, server_version=server_version+1,
      deleted_at=case when p_operation_type='DELETE' then v_now else null end, updated_at=v_now
      where owner_id=v_owner and entity_type=p_entity_type and entity_id=p_entity_id returning server_version into v_version;
    v_response := jsonb_build_object('ok',true,'version',v_version,'updatedAt',v_now);
  end if;
  insert into public.learning_sync_operations(owner_id,operation_id,response) values(v_owner,p_operation_id,v_response);
  return v_response;
end $$;
revoke all on function public.apply_learning_sync_operation(uuid,text,text,text,jsonb,bigint) from public, anon;
grant execute on function public.apply_learning_sync_operation(uuid,text,text,text,jsonb,bigint) to authenticated;
