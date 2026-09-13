-- Signing out ends the session in the database: a session issued before the
-- sign-out is refused, and signing in again works.
\set ON_ERROR_STOP on

do $$
declare r jsonb; v_id uuid; v_issued timestamptz;
begin
  r := app.portal_create_owner('signout.owner');
  v_id := (r->>'auth_user_id')::uuid;
  perform app.portal_complete_setup(r->>'setup_token', 'signout-password-1');
  -- Sessions carry whole seconds; issue one a second after setup.
  update portal_logins set sessions_valid_after = now() - interval '10 seconds' where auth_user_id = v_id;
  v_issued := date_trunc('second', now() - interval '5 seconds');
  assert app.portal_session(v_id, v_issued) is not null, 'the session is valid before signing out';

  perform app.portal_sign_out(v_id);
  assert app.portal_session(v_id, v_issued) is null, 'a session issued before sign-out is refused';
  assert (app.portal_sign_in('signout.owner', 'signout-password-1', 'test-source')->>'status') = 'ok', 'signing in again works';
  assert app.portal_session(v_id, date_trunc('second', now()) + interval '1 second') is not null, 'a new session is valid';
  raise notice 'PASS portal: signing out ends the session on the server';
end $$;
