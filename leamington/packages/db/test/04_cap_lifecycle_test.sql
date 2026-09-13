-- CAP message lifecycle: Alert / Update / Cancel / Ack / Error, and expiry.
--
-- "A man believing a cancelled warning is still live is the mirror of a missed
-- alert." Both are SILENCE IS NEVER EVIDENCE failures.
\set ON_ERROR_STOP on

insert into affiliates (id, name) values
  ('55555555-5555-5555-5555-555555555555','Lifecycle Test') on conflict do nothing;
insert into municipalities (country, admin_region, name, lat, lng, timezone)
  values ('JM','LifeParish','Life Town', 18.1, -77.1,'America/Jamaica') on conflict do nothing;
insert into clients (id, affiliate_id, code, full_name, country, municipality_id,
                     municipality, municipality_lat, municipality_lng, timezone)
select 'dddd4444-0000-0000-0000-00000000000d','55555555-5555-5555-5555-555555555555',
       'LIFE0001','Life Client','JM', m.id, m.name, m.lat, m.lng,'America/Jamaica'
from municipalities m where m.name='Life Town' on conflict do nothing;
insert into alert_sources (country, agency, kind, feed_url, active)
  values ('JM','LIFE-TEST','cap','https://example.invalid/f', false) on conflict do nothing;

-- Helper: insert a message of a given msgType.
create or replace function pg_temp.msg(p_ident text, p_type text, p_event text,
                                       p_expires timestamptz default null)
returns bigint language sql as $$
  insert into weather_alerts (source_id, country, cap_identifier, cap_sent, msg_type,
                              event, level, issued_at, expires_at, source_url)
  select s.id,'JM',p_ident, now(), p_type, p_event,'red', now(), p_expires,
         'https://example.invalid/a'
    from alert_sources s where s.agency='LIFE-TEST'
  returning id;
$$;

-- --------------------------------------------------------------------------
-- Alert -> active
-- --------------------------------------------------------------------------
do $$
declare a bigint; n int;
begin
  a := pg_temp.msg('LIFE-A1','Alert','Hurricane Warning');
  select count(*) into n from active_weather_alerts where id = a;
  assert n = 1, 'a plain Alert should be active';
  raise notice 'PASS lifecycle: Alert is active';
end $$;

-- --------------------------------------------------------------------------
-- Update -> supersedes the referenced message; only the Update stays active
-- --------------------------------------------------------------------------
do $$
declare a1 bigint; a2 bigint; affected int; n int;
begin
  select id into a1 from weather_alerts where cap_identifier='LIFE-A1';
  a2 := pg_temp.msg('LIFE-A2','Update','Hurricane Warning (track shifted)');
  affected := app.apply_cap_lifecycle(a2, array['LIFE-A1']);
  assert affected = 1, format('Update should supersede 1 prior, got %s', affected);

  select count(*) into n from active_weather_alerts where id = a1;
  assert n = 0, 'superseded alert must no longer be active';
  select count(*) into n from active_weather_alerts where id = a2;
  assert n = 1, 'the Update must be active';

  select superseded_by_id into a1 from weather_alerts where cap_identifier='LIFE-A1';
  assert a1 = a2, 'supersession must record which message replaced it';
  raise notice 'PASS lifecycle: Update supersedes prior by identifier';
end $$;

-- --------------------------------------------------------------------------
-- Cancel -> referenced message inactive; the Cancel itself is not an
-- "active alert" (it is news that the warning ended)
-- --------------------------------------------------------------------------
do $$
declare a2 bigint; c bigint; affected int; n int;
begin
  select id into a2 from weather_alerts where cap_identifier='LIFE-A2';
  c := pg_temp.msg('LIFE-C1','Cancel','Hurricane Warning cancelled');
  affected := app.apply_cap_lifecycle(c, array['LIFE-A2']);
  assert affected = 1, format('Cancel should clear 1 prior, got %s', affected);

  select count(*) into n from active_weather_alerts where id = a2;
  assert n = 0, 'cancelled alert must not remain active';
  select count(*) into n from active_weather_alerts where id = c;
  assert n = 0, 'a Cancel message is not itself an active alert';
  select count(*) into n from weather_alerts where id = a2 and cancelled_at is not null;
  assert n = 1, 'cancellation time must be recorded';
  raise notice 'PASS lifecycle: Cancel clears active state, is not itself active';
end $$;

-- A cancellation is still SURFACED to the user, with cancel wording.
do $$
declare cid uuid := 'dddd4444-0000-0000-0000-00000000000d'; c bigint; r text; t text;
begin
  select id into c from weather_alerts where cap_identifier='LIFE-C1';
  r := app.queue_alert_notification(cid, c);
  assert r = 'queued', format('a cancellation must reach the user, got %s', r);
  select title into t from notifications where weather_alert_id = c;
  assert t like 'Cancelado:%', format('cancellation should be labelled, got %s', t);
  raise notice 'PASS lifecycle: cancellation is sent, labelled "%"', t;
end $$;

-- --------------------------------------------------------------------------
-- Expiry with NO Cancel message
-- --------------------------------------------------------------------------
do $$
declare e bigint; n int;
begin
  e := pg_temp.msg('LIFE-E1','Alert','Flash Flood Warning', now() - interval '1 hour');
  select count(*) into n from active_weather_alerts where id = e;
  assert n = 0, 'an expired alert must not be active even without a Cancel';

  -- and one that has not expired yet
  e := pg_temp.msg('LIFE-E2','Alert','Flash Flood Warning', now() + interval '3 hours');
  select count(*) into n from active_weather_alerts where id = e;
  assert n = 1, 'an unexpired alert should still be active';
  raise notice 'PASS lifecycle: expiry transitions without a Cancel message';
end $$;

-- --------------------------------------------------------------------------
-- Ack / Error -> ingested, never surfaced
-- --------------------------------------------------------------------------
do $$
declare cid uuid := 'dddd4444-0000-0000-0000-00000000000d'; k bigint; r text; n int;
begin
  k := pg_temp.msg('LIFE-ACK','Ack','Acknowledgement');
  assert not app.alert_is_surfaceable('Ack'), 'Ack must not be surfaceable';
  assert not app.alert_is_surfaceable('Error'), 'Error must not be surfaceable';
  assert app.alert_is_surfaceable('Alert'), 'Alert must be surfaceable';
  assert app.alert_is_surfaceable(null), 'a missing msgType defaults to surfaceable';

  r := app.queue_alert_notification(cid, k);
  assert r = 'skipped_not_surfaceable', format('Ack must not notify, got %s', r);

  select count(*) into n from weather_alerts where id = k;
  assert n = 1, 'Ack must still be stored for the record';
  select count(*) into n from active_weather_alerts where id = k;
  assert n = 0, 'Ack must not appear as an active alert';
  raise notice 'PASS lifecycle: Ack/Error ingested but never surfaced';
end $$;

-- --------------------------------------------------------------------------
-- OUT OF ORDER: the Update arrives BEFORE the alert it supersedes.
-- Observed on the live feed, where most Updates reference messages outside the
-- fetch window. Without backward application the late alert stays active.
-- --------------------------------------------------------------------------
do $$
declare u bigint; late bigint; applied int; n int;
begin
  -- Update arrives first, referencing an identifier we have not seen yet.
  u := pg_temp.msg('LIFE-U-EARLY','Update','Warning updated');
  update weather_alerts set cap_reference_ids = array['LIFE-LATE'] where id = u;
  assert app.apply_cap_lifecycle(u, array['LIFE-LATE']) = 0,
    'nothing to supersede yet';

  -- The referenced alert arrives afterwards.
  late := pg_temp.msg('LIFE-LATE','Alert','Warning');
  select count(*) into n from active_weather_alerts where id = late;
  assert n = 1, 'before backward application the late alert looks active';

  applied := app.apply_pending_lifecycle(late);
  assert applied = 1, format('pending Update should apply to the late alert, got %s', applied);

  select count(*) into n from active_weather_alerts where id = late;
  assert n = 0, 'a late-arriving superseded alert must not be active';
  raise notice 'PASS lifecycle: out-of-order Update applied to a late-arriving alert';
end $$;

-- Same, for Cancel arriving before the alert it cancels.
do $$
declare c bigint; late bigint; n int;
begin
  c := pg_temp.msg('LIFE-C-EARLY','Cancel','Warning cancelled');
  update weather_alerts set cap_reference_ids = array['LIFE-LATE2'] where id = c;

  late := pg_temp.msg('LIFE-LATE2','Alert','Warning');
  assert app.apply_pending_lifecycle(late) = 1, 'pending Cancel should apply';

  select count(*) into n from active_weather_alerts where id = late;
  assert n = 0, 'a late-arriving cancelled alert must not be active';
  select count(*) into n from weather_alerts where id = late and cancelled_at is not null;
  assert n = 1, 'cancellation time must be recorded on the late alert';
  raise notice 'PASS lifecycle: out-of-order Cancel applied to a late-arriving alert';
end $$;
