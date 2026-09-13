-- 0028_portal_sign_out.sql
-- Signing out of a portal ends the session on the server, not only in the
-- browser.
--
-- A portal cookie is valid until sessions_valid_after moves past its issue time
-- (0018). Clearing the cookie alone left a copied cookie usable for up to 12
-- hours. "Salir" now moves sessions_valid_after, which ends every session for
-- that login, on every device: on a shared counter computer that is the safe
-- reading of "sign out".

create or replace function app.portal_sign_out(p_auth_user_id uuid)
returns void
language sql
volatile
set search_path = public, app
as $$
  update portal_logins set sessions_valid_after = now() where auth_user_id = p_auth_user_id
$$;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app.portal_sign_out(uuid) from %I', r);
    end if;
  end loop;
end $$;
revoke execute on function app.portal_sign_out(uuid) from public;
