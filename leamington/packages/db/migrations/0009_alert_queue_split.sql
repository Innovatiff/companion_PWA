-- 0009_alert_queue_split.sql
--
-- CORRECTION: the one-push-per-day cap was written for ENGAGEMENT notifications
-- (lottery, fixtures, FX) and was wrongly applied to civil protection alerts.
--
-- The severity tiebreak added in 0007 was only a partial fix. It still drops
-- this case, which is the one that matters most:
--
--     06:00  red hurricane warning        -> queued
--     16:00  red, track shifted           -> DROPPED (same severity, same day)
--
-- The second message is the one that changes what a person does. It must send.
--
-- So there are now TWO queues:
--   ALERT      — uncapped, immediate, never contends for the engagement slot.
--                Every distinct CAP identifier sends once; resends do not.
--   ENGAGEMENT — capped at one per local day, rotating trigger, fixed hour.

create type notification_channel as enum ('alert','engagement');

alter table notifications
  add column channel notification_channel not null default 'engagement',
  -- Denormalised for the alert dedupe key. An Update carries a NEW identifier
  -- (referencing the old one), so updates send; only true resends are suppressed.
  add column cap_identifier text;

-- Backfill any existing rows before the constraints change under them.
update notifications n
   set channel = 'alert',
       cap_identifier = a.cap_identifier
  from weather_alerts a
 where n.weather_alert_id = a.id;

-- The old cap applied to everything. Replace it with one that applies only to
-- engagement, so an alert can never consume a person's daily slot.
drop index if exists notifications_one_per_day_idx;

create unique index notifications_engagement_one_per_day_idx
  on notifications (client_id, local_date)
  where channel = 'engagement' and status in ('queued','sent');

-- Every distinct alert identifier reaches a client at most once.
create unique index notifications_alert_identifier_idx
  on notifications (client_id, cap_identifier)
  where channel = 'alert' and cap_identifier is not null;

create index notifications_channel_idx on notifications (channel, status, scheduled_for);

-- ---------------------------------------------------------------------------
-- The old combined function is gone. Callers must choose a queue explicitly:
-- picking the wrong one is now a missing-function error rather than a silently
-- dropped hurricane warning.
-- ---------------------------------------------------------------------------
drop function if exists app.queue_notification(uuid, date, notification_trigger, text, text, timestamptz, bigint, bigint);

/**
 * ALERT queue. Uncapped and immediate.
 * Returns 'queued' or 'skipped_duplicate_identifier'.
 */
create or replace function app.queue_alert_notification(
  p_client_id uuid,
  p_alert_id  bigint
) returns text
language plpgsql
as $$
declare
  a           weather_alerts%rowtype;
  v_local     date;
  v_title     text;
  v_body      text;
begin
  select * into a from weather_alerts where id = p_alert_id;
  if not found then return 'skipped_no_alert'; end if;

  -- Ack and Error are machine bookkeeping and are never shown to a person.
  if a.msg_type is not null and a.msg_type in ('Ack','Error') then
    return 'skipped_not_surfaceable';
  end if;

  select (now() at time zone c.timezone)::date into v_local
    from clients c where c.id = p_client_id;

  v_title := case when a.msg_type = 'Cancel'
                  then 'Cancelado: ' || a.event
                  else a.event end;
  v_body  := app.alert_notification_body(p_alert_id);

  insert into notifications (client_id, local_date, channel, trigger, title, body,
                             weather_alert_id, cap_identifier, scheduled_for)
  values (p_client_id, v_local, 'alert', 'weather_alert', v_title, v_body,
          p_alert_id, a.cap_identifier, now())
  on conflict (client_id, cap_identifier)
    where channel = 'alert' and cap_identifier is not null
  do nothing;

  if found then return 'queued'; end if;
  return 'skipped_duplicate_identifier';
end $$;

/**
 * ENGAGEMENT queue. One per client per local day, higher-priority trigger wins.
 * Rejects weather alerts outright -- they belong in the alert queue.
 */
create or replace function app.queue_engagement_notification(
  p_client_id     uuid,
  p_local_date    date,
  p_trigger       notification_trigger,
  p_title         text,
  p_body          text,
  p_scheduled_for timestamptz,
  p_fixture_id    bigint default null
) returns text
language plpgsql
as $$
declare
  existing notifications%rowtype;
begin
  if p_trigger = 'weather_alert' then
    raise exception 'weather alerts must use app.queue_alert_notification (uncapped)';
  end if;

  select * into existing
    from notifications
   where client_id = p_client_id and local_date = p_local_date
     and channel = 'engagement' and status in ('queued','sent')
   limit 1;

  if not found then
    insert into notifications (client_id, local_date, channel, trigger, title, body,
                               fixture_id, scheduled_for)
    values (p_client_id, p_local_date, 'engagement', p_trigger, p_title, p_body,
            p_fixture_id, p_scheduled_for);
    return 'queued';
  end if;

  if existing.status = 'sent' then return 'skipped_already_sent'; end if;

  if app.trigger_priority(p_trigger) >= app.trigger_priority(existing.trigger) then
    return 'skipped_lower_priority';
  end if;

  update notifications
     set trigger = p_trigger, title = p_title, body = p_body,
         fixture_id = p_fixture_id, scheduled_for = p_scheduled_for
   where id = existing.id;
  return 'replaced';
end $$;
