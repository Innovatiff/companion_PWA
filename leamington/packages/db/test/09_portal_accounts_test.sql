-- Portal accounts: login name + password, one-time setup, throttled sign-in,
-- sessions that end on reset or deactivation, and no access for `authenticated`.
\set ON_ERROR_STOP on

-- --------------------------------------------------------------------------
-- An owner account: setup link, then password, then sign-in
-- --------------------------------------------------------------------------
do $$
declare r jsonb; v_token text; v_id uuid;
begin
  r := app.portal_create_owner('Owner.Test');
  v_token := r->>'setup_token';
  v_id := (r->>'auth_user_id')::uuid;
  assert length(v_token) = 48, 'a 48-character one-time token';
  assert (select login from portal_logins where auth_user_id = v_id) = 'owner.test', 'login names are stored lowercase';
  assert exists (select 1 from owners where auth_user_id = v_id), 'an owner login is an owner';
  assert (select setup_token_hash <> v_token from portal_logins where auth_user_id = v_id), 'only a hash of the token is stored';

  assert app.portal_sign_in('owner.test', 'anything-at-all', 'src-1')->>'status' = 'setup_required';
  assert app.portal_complete_setup(v_token, 'short')->>'status' = 'weak_password';
  assert app.portal_complete_setup('not-the-token', 'a-long-enough-password')->>'status' = 'invalid_token';
  assert app.portal_complete_setup(v_token, 'a-long-enough-password')->>'status' = 'ok';
  assert app.portal_complete_setup(v_token, 'a-long-enough-password')->>'status' = 'invalid_token', 'the token works once';

  assert app.portal_sign_in('owner.test', 'wrong-password-here', 'src-1')->>'status' = 'invalid';
  r := app.portal_sign_in('  OWNER.test ', 'a-long-enough-password', 'src-1');
  assert r->>'status' = 'ok' and r->>'role' = 'owner' and (r->>'auth_user_id')::uuid = v_id, r::text;
  raise notice 'PASS portal: owner setup link, password, sign-in';
end $$;

-- --------------------------------------------------------------------------
-- Sessions end when the password is reset
-- --------------------------------------------------------------------------
do $$
declare v_id uuid := (select auth_user_id from portal_logins where login = 'owner.test');
        v_issued timestamptz := date_trunc('second', now()) + interval '1 second';
begin
  assert app.portal_session(v_id, v_issued) is not null, 'a current session is valid';
  perform app.portal_issue_setup(v_id);
  assert app.portal_session(v_id, now() - interval '1 minute') is null, 'a session issued before a reset is not';
  assert app.portal_sign_in('owner.test', 'a-long-enough-password', 'src-1')->>'status' = 'setup_required',
    'a reset clears the password';
  raise notice 'PASS portal: a reset ends sessions and requires a new password';
end $$;

-- --------------------------------------------------------------------------
-- An expired setup link does not work
-- --------------------------------------------------------------------------
do $$
declare v_id uuid := (select auth_user_id from portal_logins where login = 'owner.test'); v_token text;
begin
  v_token := app.portal_issue_setup(v_id);
  update portal_logins set setup_expires_at = now() - interval '1 minute' where auth_user_id = v_id;
  assert app.portal_complete_setup(v_token, 'a-long-enough-password')->>'status' = 'expired';
  v_token := app.portal_issue_setup(v_id);
  assert app.portal_complete_setup(v_token, 'a-long-enough-password')->>'status' = 'ok';
  raise notice 'PASS portal: an expired setup link is refused';
end $$;

-- --------------------------------------------------------------------------
-- Throttling: 10 failures for a login name block it, even with the password
-- --------------------------------------------------------------------------
do $$
declare i int;
begin
  for i in 1..10 loop perform app.portal_sign_in('owner.test', 'guess-' || i || '-wrong', 'src-' || i); end loop;
  assert app.portal_sign_in('owner.test', 'a-long-enough-password', 'src-fresh')->>'status' = 'throttled',
    'guessing one account from many sources is still blocked';
  delete from login_attempts where subject = 'owner.test';
  assert app.portal_sign_in('owner.test', 'a-long-enough-password', 'src-fresh')->>'status' = 'ok';
  raise notice 'PASS portal: sign-in is throttled per login name';
end $$;

-- --------------------------------------------------------------------------
-- An affiliate login ends when the affiliate is deactivated
-- --------------------------------------------------------------------------
do $$
declare v_owner uuid := (select auth_user_id from portal_logins where login = 'owner.test');
        r jsonb; v_aff uuid; v_auth uuid;
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, false);
  r := app.create_affiliate('Afiliada Portal', null, null, 0.40, 'portal.aff');
  v_aff := (r->>'affiliate_id')::uuid;
  v_auth := (select auth_user_id from portal_logins where affiliate_id = v_aff);
  assert (select auth_user_id from affiliates where id = v_aff) = v_auth, 'the affiliate is linked to its login';
  assert app.portal_complete_setup(r->>'setup_token', 'affiliate-password-1')->>'status' = 'ok';
  assert app.portal_sign_in('portal.aff', 'affiliate-password-1', 'src-aff')->>'affiliate_id' = v_aff::text;

  perform app.update_affiliate(v_aff, false, 0.40);
  assert app.portal_sign_in('portal.aff', 'affiliate-password-1', 'src-aff')->>'status' = 'inactive';
  assert app.portal_session(v_auth, now() + interval '1 second') is null, 'a deactivated affiliate has no session';
  perform app.update_affiliate(v_aff, true, 0.40);
  perform set_config('request.jwt.claim.sub', '', false);
  raise notice 'PASS portal: deactivating an affiliate ends sign-in and sessions';
end $$;

-- --------------------------------------------------------------------------
-- The `authenticated` role cannot read accounts
-- --------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', (select auth_user_id::text from portal_logins where login = 'portal.aff'), false);
do $$
declare n int;
begin
  begin
    select count(*) into n from portal_logins;
  exception when insufficient_privilege then n := 0;
  end;
  assert n = 0, format('authenticated must not read portal_logins, saw %s', n);
  raise notice 'PASS portal: accounts are not readable from a portal request';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
