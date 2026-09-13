-- Section page views are recorded for active clients only; push subscriptions
-- are validated, move with the phone, and can be turned off.
\set ON_ERROR_STOP on

insert into affiliates (id, name) values ('99990000-0000-4000-8000-000000000016', 'Views Test') on conflict do nothing;
insert into clients (id, affiliate_id, code, full_name, country, language, active) values
  ('99990000-0000-4000-8000-0000000001a1', '99990000-0000-4000-8000-000000000016', 'VJEWMX23', 'Views Uno', 'MX', 'es', true),
  ('99990000-0000-4000-8000-0000000001a2', '99990000-0000-4000-8000-000000000016', 'VJEWMX24', 'Views Dos', 'MX', 'es', true),
  ('99990000-0000-4000-8000-0000000001a3', '99990000-0000-4000-8000-000000000016', 'VJEWMX26', 'Views Off', 'MX', 'es', false)
on conflict do nothing;

do $$
declare ok boolean;
  k256 text := repeat('A', 87);
  kauth text := repeat('b', 22);
begin
  perform app.record_page_view('99990000-0000-4000-8000-0000000001a1', 'clima', '{"alerts_state": "stale"}');
  perform app.record_page_view('99990000-0000-4000-8000-0000000001a3', 'clima', '{}');
  assert (select count(*) from page_views where client_id = '99990000-0000-4000-8000-0000000001a1'
            and states->>'alerts_state' = 'stale') = 1;
  assert (select count(*) from page_views where client_id = '99990000-0000-4000-8000-0000000001a3') = 0,
    'an inactive client records nothing';
  begin
    perform app.record_page_view('99990000-0000-4000-8000-0000000001a1', 'nowhere', '{}');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'unknown pages are refused';
  raise notice 'PASS views: section views are recorded with their states, for active clients only';

  perform app.save_push_subscription('99990000-0000-4000-8000-0000000001a1', 'https://push.example.invalid/abc', k256, kauth, 'Android');
  assert (app.push_status('99990000-0000-4000-8000-0000000001a1')->>'subscriptions')::int = 1;

  -- The same phone, signed in with another code.
  perform app.save_push_subscription('99990000-0000-4000-8000-0000000001a2', 'https://push.example.invalid/abc', k256, kauth, 'Android');
  assert (app.push_status('99990000-0000-4000-8000-0000000001a1')->>'subscriptions')::int = 0, 'the endpoint moved';
  assert (app.push_status('99990000-0000-4000-8000-0000000001a2')->>'subscriptions')::int = 1;

  perform app.remove_push_subscription('99990000-0000-4000-8000-0000000001a1', 'https://push.example.invalid/abc');
  assert (app.push_status('99990000-0000-4000-8000-0000000001a2')->>'subscriptions')::int = 1,
    'a client cannot turn off a subscription that is not theirs';
  perform app.remove_push_subscription('99990000-0000-4000-8000-0000000001a2', 'https://push.example.invalid/abc');
  assert (app.push_status('99990000-0000-4000-8000-0000000001a2')->>'subscriptions')::int = 0;

  begin
    perform app.save_push_subscription('99990000-0000-4000-8000-0000000001a1', 'http://push.example.invalid/x', k256, kauth, null);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'a non-https endpoint is refused';
  begin
    perform app.save_push_subscription('99990000-0000-4000-8000-0000000001a3', 'https://push.example.invalid/y', k256, kauth, null);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'an inactive client cannot subscribe';
  raise notice 'PASS push: subscriptions are validated, follow the phone, and can be turned off';
end $$;
