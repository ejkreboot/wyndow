-- Atomically replace block allocations for one or more days.
-- p maps 'YYYY-MM-DD' to an array of project ids (or nulls for open blocks), e.g.
-- {"2026-10-16": ["<uuid>", null]}. Runs as the caller, so RLS and the composite
-- foreign keys still ensure every row belongs to the signed-in user.
begin;

create or replace function wyndow.set_allocations(p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p) <> 'object' then
    raise exception 'allocations must be a JSON object';
  end if;

  delete from wyndow.block_allocations
  where user_id = (select auth.uid())
    and day in (select key::date from jsonb_each(p));

  insert into wyndow.block_allocations (day, block_index, project_id)
  select e.key::date, (a.ord - 1)::smallint, (a.val #>> '{}')::uuid
  from jsonb_each(p) as e
  cross join lateral jsonb_array_elements(e.value) with ordinality as a(val, ord)
  where jsonb_typeof(a.val) = 'string';
end;
$$;

revoke all on function wyndow.set_allocations(jsonb) from public, anon, service_role;
grant execute on function wyndow.set_allocations(jsonb) to authenticated;

commit;
