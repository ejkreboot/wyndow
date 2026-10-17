-- Links a project to a GitHub milestone (by number) for the board and burndown.
-- The free-text `milestone` column stays for projects without a repo.
begin;
alter table wyndow.projects
  add column if not exists github_milestone integer check (github_milestone > 0);
commit;
