-- Wyndow, fresh start: events, subscribed .ics feeds, and a to-do list.
-- Lives in the existing `wyndow` schema (already exposed to the Data API).
-- Earlier-iteration tables in this schema are left untouched.

create schema if not exists wyndow;
grant usage on schema wyndow to authenticated, service_role;

-- updated_at trigger ------------------------------------------------------
create or replace function wyndow.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Own events --------------------------------------------------------------
-- Timed events use starts_at/ends_at. All-day events use start_date/end_date
-- (end_date inclusive) and leave the timestamps null.
create table if not exists wyndow.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  location    text,
  notes       text,
  all_day     boolean not null default false,
  starts_at   timestamptz,
  ends_at     timestamptz,
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint events_shape check (
    (all_day and start_date is not null and end_date is not null and end_date >= start_date
      and starts_at is null and ends_at is null)
    or
    (not all_day and starts_at is not null and ends_at is not null and ends_at >= starts_at
      and start_date is null and end_date is null)
  )
);
create index if not exists events_user_starts on wyndow.events (user_id, starts_at);
create index if not exists events_user_dates on wyndow.events (user_id, start_date, end_date);
drop trigger if exists events_touch on wyndow.events;
create trigger events_touch before update on wyndow.events
  for each row execute function wyndow.touch_updated_at();

-- Subscribed .ics feeds ---------------------------------------------------
create table if not exists wyndow.feeds (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  url             text not null check (url ~* '^https?://'),
  visible         boolean not null default true,
  last_synced_at  timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  unique (user_id, url)
);

-- Expanded occurrences of a feed within a rolling window, replaced on each sync.
create table if not exists wyndow.feed_events (
  id          bigint generated always as identity primary key,
  feed_id     uuid not null references wyndow.feeds (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  uid         text not null,
  title       text not null,
  location    text,
  notes       text,
  all_day     boolean not null,
  starts_at   timestamptz,
  ends_at     timestamptz,
  start_date  date,
  end_date    date
);
create index if not exists feed_events_feed on wyndow.feed_events (feed_id);
create index if not exists feed_events_user_starts on wyndow.feed_events (user_id, starts_at);
create index if not exists feed_events_user_dates on wyndow.feed_events (user_id, start_date, end_date);

-- To-dos ------------------------------------------------------------------
-- position is a float so a moved item can take the midpoint of its neighbours.
create table if not exists wyndow.todos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  done        boolean not null default false,
  position    double precision not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists todos_user_position on wyndow.todos (user_id, position);
drop trigger if exists todos_touch on wyndow.todos;
create trigger todos_touch before update on wyndow.todos
  for each row execute function wyndow.touch_updated_at();

-- Row level security ------------------------------------------------------
alter table wyndow.events      enable row level security;
alter table wyndow.feeds       enable row level security;
alter table wyndow.feed_events enable row level security;
alter table wyndow.todos       enable row level security;

drop policy if exists events_own on wyndow.events;
create policy events_own on wyndow.events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists feeds_own on wyndow.feeds;
create policy feeds_own on wyndow.feeds for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists feed_events_own on wyndow.feed_events;
create policy feed_events_own on wyndow.feed_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists todos_own on wyndow.todos;
create policy todos_own on wyndow.todos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on wyndow.events, wyndow.feeds, wyndow.feed_events, wyndow.todos
  to authenticated, service_role;
grant usage on sequence wyndow.feed_events_id_seq to authenticated, service_role;

-- Carry over subscriptions from the previous iteration, if any.
do $$
begin
  if to_regclass('wyndow.calendar_sources') is not null then
    insert into wyndow.feeds (user_id, name, url)
    select user_id, name, regexp_replace(ics_url, '^webcal://', 'https://')
    from wyndow.calendar_sources
    where ics_url ~* '^(https?|webcal)://'
    on conflict (user_id, url) do nothing;
  end if;
end $$;
