-- Two notification queues.
--
-- ALERT: uncapped, immediate, never contends for the engagement slot.
-- ENGAGEMENT: one per local day, higher-priority trigger wins.
\set ON_ERROR_STOP on

insert into affiliates (id, name) values
  ('44444444-4444-4444-4444-444444444444','Queue Test') on conflict do nothing;
insert into municipalities (country, admin_region, name, lat, lng, timezone)
  values ('JM','TestParish','Queue Town', 18.0, -77.0,'America/Jamaica')
  on conflict do nothing;
insert into clients (id, affiliate_id, code, full_name, country, municipality_id,
                     municipality, municipality_lat, municipality_lng, timezone)
select 'cccc3333-0000-0000-0000-00000000000c','44444444-4444-4444-4444-444444444444',
       'QUEUE001','Queue Client','JM', m.id, m.name, m.lat, m.lng,'America/Jamaica'
from municipalities m where m.name='Queue Town' on conflict do nothing;

insert into alert_sources (country, agency, kind, feed_url, active)
  values ('JM','QUEUE-TEST','cap','https://example.invalid/f', false) on conflict do nothing;

-- Two DISTINCT red alerts on the same day: the morning warning and the
-- afternoon track shift.
insert into weather_alerts (source_id, country, cap_identifier, cap_sent, msg_type,
                            event, level, issued_at, source_url)
select s.id,'JM', v.ident, v.sent::timestamptz, 'Alert', v.ev, v.lvl::alert_level, v.sent::timestamptz,
       'https://example.invalid/a'
from alert_sources s,
     (values ('JM-0600','Hurricane Warning','red','2026-10-01T06:00:00-05:00'),
             ('JM-1600','Hurricane Warning','red','2026-10-01T16:00:00-05:00'),
             ('JM-YEL', 'Thunderstorm Watch','yellow','2026-10-01T09:00:00-05:00')) as v(ident,ev,lvl,sent)
where s.agency='QUEUE-TEST' on conflict do nothing;

do $$
declare
  cid uuid := 'cccc3333-0000-0000-0000-00000000000c';
  d date := '2026-10-01';
  a6 bigint; a16 bigint; r text; n int;
begin
  select id into a6  from weather_alerts where cap_identifier='JM-0600';
  select id into a16 from weather_alerts where cap_identifier='JM-1600';

  -- 06:00 red hurricane warning
  r := app.queue_alert_notification(cid, a6);
  assert r = 'queued', format('06:00 alert should queue, got %s', r);

  -- 16:00 red, track shifted. THIS IS THE CASE THE OLD TIEBREAK DROPPED.
  r := app.queue_alert_notification(cid, a16);
  assert r = 'queued', format('16:00 track-shift alert MUST send, got %s', r);

  select count(*) into n from notifications
   where client_id = cid and channel = 'alert';
  assert n = 2, format('both alerts must be queued, got %s', n);
  raise notice 'PASS uncapped alerts: 06:00 red and 16:00 red both sent (old rule dropped the second)';

  -- A resend of the SAME identifier must not send again.
  r := app.queue_alert_notification(cid, a6);
  assert r = 'skipped_duplicate_identifier', format('resend should be suppressed, got %s', r);
  select count(*) into n from notifications where client_id = cid and channel = 'alert';
  assert n = 2, format('resend must not add a row, got %s', n);
  raise notice 'PASS same-identifier resend suppressed';
end $$;

-- An alert must NOT consume the engagement slot.
do $$
declare
  cid uuid := 'cccc3333-0000-0000-0000-00000000000c';
  d date := (now() at time zone 'America/Jamaica')::date;
  r text; alerts int; eng int;
begin
  r := app.queue_engagement_notification(cid, d, 'lottery','Cash Pot','12 34', now());
  assert r = 'queued', format('engagement should queue alongside alerts, got %s', r);

  select count(*) into alerts from notifications where client_id=cid and channel='alert';
  select count(*) into eng    from notifications where client_id=cid and channel='engagement';
  assert eng = 1, format('expected 1 engagement, got %s', eng);
  assert alerts >= 1, 'alerts should still be present';
  raise notice 'PASS separate queues: % alert(s) + % engagement coexist same day', alerts, eng;
end $$;

-- Engagement remains capped at one per day, priority-ordered.
do $$
declare
  cid uuid := 'cccc3333-0000-0000-0000-00000000000c';
  d date := (now() at time zone 'America/Jamaica')::date;
  r text; n int; t notification_trigger;
begin
  r := app.queue_engagement_notification(cid, d, 'fx_30d_high','Tasa','alta', now());
  assert r = 'replaced', format('fx should outrank lottery, got %s', r);

  r := app.queue_engagement_notification(cid, d, 'lottery','Cash Pot','again', now());
  assert r = 'skipped_lower_priority', format('lottery should not displace fx, got %s', r);

  select count(*) into n from notifications where client_id=cid and channel='engagement' and local_date=d;
  assert n = 1, format('engagement cap must hold, got %s', n);
  select trigger into t from notifications where client_id=cid and channel='engagement' and local_date=d;
  assert t = 'fx_30d_high', format('surviving engagement should be fx, got %s', t);
  raise notice 'PASS engagement still capped 1/day with priority ordering';
end $$;

-- A weather alert routed to the engagement queue is a programming error.
do $$
declare cid uuid := 'cccc3333-0000-0000-0000-00000000000c'; ok boolean := false;
begin
  begin
    perform app.queue_engagement_notification(cid, '2026-10-02','weather_alert','x','y', now());
  exception when others then ok := true;
  end;
  assert ok, 'queueing a weather alert as engagement must raise';
  raise notice 'PASS weather alerts cannot enter the engagement queue';
end $$;
