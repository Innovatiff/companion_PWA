-- Regression: a RED alert must displace a queued ORANGE alert on the same day.
-- Found by running the live Jamaica feed: both carry trigger 'weather_alert',
-- so equal trigger priority caused the red one to be dropped entirely.
\set ON_ERROR_STOP on

insert into affiliates (id, name) values
  ('44444444-4444-4444-4444-444444444444','Prio Test') on conflict do nothing;
insert into municipalities (country, admin_region, name, lat, lng, timezone)
  values ('JM','TestParish','Prio Town', 18.0, -77.0,'America/Jamaica')
  on conflict do nothing;
insert into clients (id, affiliate_id, code, full_name, country, municipality_id,
                     municipality, municipality_lat, municipality_lng, timezone)
select 'cccc3333-0000-0000-0000-00000000000c','44444444-4444-4444-4444-444444444444',
       'PRIO0001','Prio Client','JM', m.id, m.name, m.lat, m.lng,'America/Jamaica'
from municipalities m where m.name='Prio Town' on conflict do nothing;

insert into alert_sources (country, agency, kind, feed_url, active)
  values ('JM','PRIO-TEST','cap','https://example.invalid/f', false) on conflict do nothing;

insert into weather_alerts (source_id, country, cap_identifier, event, level, issued_at, source_url)
select s.id,'JM', v.ident, v.ev, v.lvl::alert_level, now(), 'https://example.invalid/a'
from alert_sources s,
     (values ('PRIO-ORANGE','Wind Advisory','orange'),
             ('PRIO-RED','Hurricane Warning','red'),
             ('PRIO-YELLOW','Thunderstorm Watch','yellow')) as v(ident,ev,lvl)
where s.agency='PRIO-TEST' on conflict do nothing;

do $$
declare
  cid uuid := 'cccc3333-0000-0000-0000-00000000000c';
  d date := '2026-10-01';
  a_orange bigint; a_red bigint; a_yellow bigint;
  r text; final_trigger notification_trigger; final_body text; n int;
begin
  select id into a_orange from weather_alerts where cap_identifier='PRIO-ORANGE';
  select id into a_red    from weather_alerts where cap_identifier='PRIO-RED';
  select id into a_yellow from weather_alerts where cap_identifier='PRIO-YELLOW';

  -- morning: orange advisory
  r := app.queue_notification(cid, d, 'weather_alert','Wind Advisory','body', now(), a_orange);
  assert r = 'queued', format('expected queued, got %s', r);

  -- afternoon: yellow watch must NOT displace the orange
  r := app.queue_notification(cid, d, 'weather_alert','Thunderstorm Watch','body', now(), a_yellow);
  assert r = 'skipped_not_more_severe', format('yellow should not displace orange, got %s', r);

  -- evening: RED hurricane warning MUST displace the orange
  r := app.queue_notification(cid, d, 'weather_alert','Hurricane Warning','red body', now(), a_red);
  assert r = 'replaced', format('RED must displace orange, got %s', r);

  select trigger, body into final_trigger, final_body from notifications
   where client_id = cid and local_date = d;
  assert final_body = 'red body', format('surviving notification should be the red one, got %s', final_body);

  -- still exactly one notification that day
  select count(*) into n from notifications where client_id = cid and local_date = d;
  assert n = 1, format('one-per-day must hold, got %s', n);
  raise notice 'PASS severity tiebreak: red displaced orange; yellow did not; still 1/day';

  -- a lottery result must never displace a weather alert
  r := app.queue_notification(cid, d, 'lottery','Loto','nums', now());
  assert r = 'skipped_lower_priority', format('lottery must not displace alert, got %s', r);
  raise notice 'PASS lottery never overrides a weather alert';
end $$;
