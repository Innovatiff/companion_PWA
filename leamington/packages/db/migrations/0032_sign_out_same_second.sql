-- 0032_sign_out_same_second.sql
-- Signing out also ends a session issued in the same second.
--
-- Session tokens carry their issue time in whole seconds, and portal_session
-- (0018) accepts a token issued at or after the truncated second of
-- sessions_valid_after. So a cookie issued at 10:00:07.2 still passed after a
-- sign-out at 10:00:07.9. The admin smoke run caught it intermittently.
--
-- Sign-out now moves sessions_valid_after to the start of the next second. The
-- only cost: signing in again within the same second as signing out needs one
-- more attempt.

create or replace function app.portal_sign_out(p_auth_user_id uuid)
returns void
language sql
volatile
set search_path = public, app
as $$
  update portal_logins
     set sessions_valid_after = date_trunc('second', now()) + interval '1 second'
   where auth_user_id = p_auth_user_id
$$;

revoke execute on function app.portal_sign_out(uuid) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app.portal_sign_out(uuid) from %I', r);
    end if;
  end loop;
end $$;
