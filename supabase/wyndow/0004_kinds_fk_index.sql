-- Covering index for the kinds -> next-day kind foreign key (advisor: unindexed_foreign_keys).
begin;
create index if not exists kinds_user_next_day_idx on wyndow.kinds (user_id, next_day_kind_id);
commit;
