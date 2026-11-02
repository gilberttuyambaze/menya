-- Keep the server fallback inside the difficulty check constraint.
alter table public.study_sessions
  alter column difficulty set default 'Medium';
