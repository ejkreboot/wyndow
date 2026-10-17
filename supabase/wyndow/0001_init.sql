-- Wyndow schema. Apply with: supabase db query --linked -f supabase/wyndow/0001_init.sql
begin;

create schema if not exists wyndow;

revoke all on schema wyndow from public, anon;
grant usage on schema wyndow to authenticated, service_role;

create or replace function wyndow.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function wyndow.set_updated_at() from public, anon;

-- ---------- tables ----------

create table wyndow.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  timezone text not null default 'America/Detroit',
  block_hours numeric(3,1) not null default 2 check (block_hours between 0.5 and 8),
  chunk_min_hours numeric(3,1) not null default 3 check (chunk_min_hours between 0.5 and 24),
  school_days smallint[] not null default '{1,2,3,4,5}' check (school_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wyndow.kinds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  focus_hours numeric(3,1) not null default 0 check (focus_hours between 0 and 16),
  focus_start time,
  school_mode text not null default 'live' check (school_mode in ('live','async')),
  next_day_kind_id uuid,
  builtin text check (builtin in ('open_weekday','open_weekend')),
  sort int not null default 0,
  unique (user_id, id),
  unique (user_id, builtin),
  foreign key (user_id, next_day_kind_id) references wyndow.kinds (user_id, id)
    on delete set null (next_day_kind_id)
);

create table wyndow.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  ics_url text not null check (ics_url ~ '^https://'),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table wyndow.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id uuid not null,
  uid text not null,
  title text not null,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day_start date,
  all_day_end date,
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (source_id, uid),
  check (starts_at is not null or all_day_start is not null),
  foreign key (user_id, source_id) references wyndow.calendar_sources (user_id, id) on delete cascade
);
create index calendar_events_user_starts_idx on wyndow.calendar_events (user_id, starts_at);
create index calendar_events_user_allday_idx on wyndow.calendar_events (user_id, all_day_start);
create index calendar_events_source_idx on wyndow.calendar_events (user_id, source_id);

create table wyndow.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id uuid,
  match text not null default 'equals' check (match in ('equals','prefix')),
  pattern text not null check (char_length(pattern) between 1 and 120),
  kind_id uuid not null,
  priority int not null default 0,
  unique (user_id, id),
  unique nulls not distinct (user_id, source_id, match, pattern),
  foreign key (user_id, source_id) references wyndow.calendar_sources (user_id, id) on delete cascade,
  foreign key (user_id, kind_id) references wyndow.kinds (user_id, id) on delete cascade
);
create index rules_kind_idx on wyndow.rules (user_id, kind_id);
create index rules_source_idx on wyndow.rules (user_id, source_id);

create table wyndow.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  area text not null check (area in ('venture','family','homeschool')),
  github_repo text check (github_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  milestone text,
  blocks_done int not null default 0 check (blocks_done >= 0),
  archived boolean not null default false,
  sort int not null default 0,
  unique (user_id, id)
);

create table wyndow.block_allocations (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  block_index smallint not null check (block_index >= 0 and block_index < 16),
  project_id uuid not null,
  primary key (user_id, day, block_index),
  foreign key (user_id, project_id) references wyndow.projects (user_id, id) on delete cascade
);
create index block_allocations_project_idx on wyndow.block_allocations (user_id, project_id);

create table wyndow.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null,
  day date not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  note text check (char_length(note) <= 2000),
  unique (user_id, id),
  foreign key (user_id, project_id) references wyndow.projects (user_id, id) on delete cascade
);
create unique index focus_sessions_one_open_idx on wyndow.focus_sessions (user_id) where ended_at is null;
create index focus_sessions_project_idx on wyndow.focus_sessions (user_id, project_id, started_at desc);

create table wyndow.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  student text not null check (char_length(student) between 1 and 80),
  wyrkbook_ref text,
  current_unit text,
  packets_ready int not null default 0 check (packets_ready >= 0),
  sort int not null default 0,
  unique (user_id, id)
);

-- ---------- updated_at triggers ----------

create trigger settings_set_updated_at before update on wyndow.settings
  for each row execute function wyndow.set_updated_at();
create trigger calendar_events_set_updated_at before update on wyndow.calendar_events
  for each row execute function wyndow.set_updated_at();

-- ---------- RLS ----------

do $$
declare
  t text;
begin
  foreach t in array array['settings','kinds','calendar_sources','calendar_events','rules',
                           'projects','block_allocations','focus_sessions','classes']
  loop
    execute format('alter table wyndow.%I enable row level security', t);
    execute format('alter table wyndow.%I force row level security', t);
    execute format('create policy %I on wyndow.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select', t);
    execute format('create policy %I on wyndow.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on wyndow.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update', t);
    execute format('create policy %I on wyndow.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete', t);
  end loop;
end $$;

-- ---------- ensure_defaults ----------

create or replace function wyndow.ensure_defaults()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  insert into wyndow.settings (user_id) values ((select auth.uid()))
    on conflict (user_id) do nothing;

  insert into wyndow.kinds (name, focus_hours, focus_start, school_mode, builtin, sort)
  values ('Open weekday', 4, time '11:00', 'live', 'open_weekday', -2),
         ('Open weekend', 2, time '14:00', 'live', 'open_weekend', -1)
  on conflict (user_id, builtin) do nothing;

  insert into wyndow.projects (name, color, area)
  select 'Family', '#B59CFF', 'family'
  where not exists (select 1 from wyndow.projects p where p.area = 'family');
end;
$$;

-- ---------- grants ----------

revoke all on all tables in schema wyndow from public, anon;
revoke all on all functions in schema wyndow from public, anon;
revoke all on all sequences in schema wyndow from public, anon;

grant select, insert, update, delete on all tables in schema wyndow to authenticated;
grant all on all tables in schema wyndow to service_role;
grant execute on function wyndow.ensure_defaults() to authenticated, service_role;

alter default privileges in schema wyndow revoke all on tables from public, anon;
alter default privileges in schema wyndow grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema wyndow grant all on tables to service_role;
alter default privileges in schema wyndow revoke all on functions from public, anon;
alter default privileges in schema wyndow revoke all on sequences from public, anon;

commit;
