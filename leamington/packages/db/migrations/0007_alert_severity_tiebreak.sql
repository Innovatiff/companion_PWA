-- 0007_alert_severity_tiebreak.sql
--
-- Fixes a suppression bug found running the live Jamaica feed:
-- a RED alert arriving after an ORANGE alert on the same local day was dropped,
-- because both carry trigger 'weather_alert' and the one-per-day rule treated
-- equal trigger priority as "already satisfied".
--
-- Within weather alerts, SEVERITY breaks the tie. A red alert always displaces
-- a queued orange or yellow one. The one-per-day cap is preserved: this
-- replaces the queued notification, it never adds a second.

create or replace function app.alert_level_rank(l alert_level)
returns smallint language sql immutable as $$
  select case l
    when 'red'     then 1
    when 'orange'  then 2
    when 'yellow'  then 3
    when 'green'   then 4
    else 5
  end::smallint;
$$;

create or replace function app.queue_notification(
  p_client_id      uuid,
  p_local_date     date,
  p_trigger        notification_trigger,
  p_title          text,
  p_body           text,
  p_scheduled_for  timestamptz,
  p_alert_id       bigint default null,
  p_fixture_id     bigint default null
) returns text
language plpgsql
as $$
declare
  existing      notifications%rowtype;
  new_prio      smallint := app.trigger_priority(p_trigger);
  existing_prio smallint;
  new_rank      smallint;
  existing_rank smallint;
begin
  select * into existing
  from notifications
  where client_id = p_client_id
    and local_date = p_local_date
    and status in ('queued','sent')
  limit 1;

  if not found then
    insert into notifications (client_id, local_date, trigger, title, body,
                               weather_alert_id, fixture_id, scheduled_for)
    values (p_client_id, p_local_date, p_trigger, p_title, p_body,
            p_alert_id, p_fixture_id, p_scheduled_for);
    return 'queued';
  end if;

  -- Already on the phone. Never rewritten.
  if existing.status = 'sent' then
    return 'skipped_already_sent';
  end if;

  existing_prio := app.trigger_priority(existing.trigger);

  if new_prio < existing_prio then
    -- Higher-priority trigger wins outright (alert over match day, etc.).
    null;
  elsif new_prio > existing_prio then
    return 'skipped_lower_priority';
  else
    -- Same trigger class. For weather alerts, severity decides; for anything
    -- else, first-queued wins so we do not churn an already-queued message.
    if p_trigger <> 'weather_alert' then
      return 'skipped_same_priority';
    end if;

    select app.alert_level_rank(level) into new_rank
      from weather_alerts where id = p_alert_id;
    select app.alert_level_rank(level) into existing_rank
      from weather_alerts where id = existing.weather_alert_id;

    -- Unknown existing alert (or none) -> let the new one through.
    if existing_rank is null then
      null;
    elsif new_rank >= existing_rank then
      return 'skipped_not_more_severe';
    end if;
  end if;

  update notifications
     set trigger = p_trigger, title = p_title, body = p_body,
         weather_alert_id = p_alert_id, fixture_id = p_fixture_id,
         scheduled_for = p_scheduled_for
   where id = existing.id;
  return 'replaced';
end $$;
