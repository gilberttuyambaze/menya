-- MENYA core user-owned learning data. Apply to a Supabase project with the CLI.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  weekly_goal_minutes integer not null default 300 check (weekly_goal_minutes between 30 and 10080),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  subject text not null default '',
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.learning_topics(id) on delete set null,
  topic_name text not null check (length(trim(topic_name)) between 1 and 120),
  subject text not null default '',
  studied_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 0 and 1440),
  study_method text not null default 'Practice',
  difficulty text not null default 'Medium' check (difficulty in ('Easy','Medium','Hard')),
  problems_attempted integer not null default 0 check (problems_attempted >= 0),
  problems_correct integer not null default 0 check (problems_correct >= 0 and problems_correct <= problems_attempted),
  constraint study_sessions_have_activity check (duration_minutes > 0 or problems_attempted > 0),
  reflection text not null default '',
  calculation_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists study_sessions_user_studied_at_idx on public.study_sessions(user_id, studied_at desc);
create index if not exists study_sessions_user_topic_idx on public.study_sessions(user_id, topic_id);

create table if not exists public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (length(trim(topic)) between 1 and 120),
  planned_for date not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists planned_sessions_user_date_idx on public.planned_sessions(user_id, planned_for);

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  wins text not null default '',
  difficulties text not null default '',
  lessons text not null default '',
  next_focus text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, week_start)
);

-- Append-only XP audit entries. Corrections use a compensating signed entry.
create table if not exists public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.study_sessions(id) on delete set null,
  amount integer not null check (amount <> 0),
  reason text not null,
  calculation_version integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists xp_transactions_user_created_idx on public.xp_transactions(user_id, created_at desc);

-- Historical corrections and deletions are append-only records. The browser
-- can insert and read its own events, but cannot update or erase the audit.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('session.corrected','session.deleted')),
  record_type text not null,
  record_id uuid not null,
  before_data jsonb not null,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_user_created_idx on public.audit_logs(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.learning_topics enable row level security;
alter table public.study_sessions enable row level security;
alter table public.planned_sessions enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles owner select" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles owner insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles owner update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "topics owner access" on public.learning_topics for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sessions owner access" on public.study_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "plans owner access" on public.planned_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reviews owner access" on public.weekly_reviews for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "xp owner read" on public.xp_transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "audit owner read" on public.audit_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy "audit owner insert" on public.audit_logs for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on public.xp_transactions from anon, authenticated;
grant select on public.xp_transactions to authenticated;
revoke all on public.audit_logs from anon, authenticated;
grant select, insert on public.audit_logs to authenticated;

-- XP inserts are intentionally not available to browser clients. Add a trusted
-- server-side function after the source workbook's scoring rules are verified.
