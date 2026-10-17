begin;
revoke execute on function wyndow.ensure_defaults() from service_role;
commit;
