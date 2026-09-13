-- 0010_cap_lifecycle.sql
--
-- Full CAP message lifecycle.
--
--   Alert  -> new, send
--   Update -> send, supersede the messages it references
--   Cancel -> send a cancellation, mark the referenced messages inactive
--   Ack / Error -> ingested for the record, never surfaced to a person
--
-- And `expires` is honoured: an alert stops being active when it expires, even
-- if no Cancel ever arrives.
--
-- A man believing a cancelled warning is still live is the mirror of a missed
-- alert. Both are SILENCE IS NEVER EVIDENCE failures: the absence of a further
-- message is not evidence the danger persists, and it is not evidence it ended.

alter table weather_alerts
  -- Raw CAP <references>: space-separated "sender,identifier,sent" triples.
  add column cap_references text,
  -- Set when a later Update supersedes this message.
  add column superseded_by_id bigint references weather_alerts(id) on delete set null,
  -- Set when a Cancel references this message.
  add column cancelled_at timestamptz;

create index weather_alerts_superseded_idx on weather_alerts (superseded_by_id)
  where superseded_by_id is not null;
create index weather_alerts_identifier_idx on weather_alerts (source_id, cap_identifier);

/** Is this message one a person should ever see? Ack/Error never are. */
create or replace function app.alert_is_surfaceable(p_msg_type text)
returns boolean language sql immutable as $$
  select coalesce(p_msg_type, 'Alert') not in ('Ack','Error');
$$;

/**
 * The set of alerts that are CURRENTLY IN FORCE.
 *
 * Excludes: Cancel messages themselves (a cancellation is news, not a live
 * warning), superseded messages, cancelled messages, and expired ones.
 */
create or replace view active_weather_alerts as
select a.*
  from weather_alerts a
 where coalesce(a.msg_type,'Alert') in ('Alert','Update')
   and a.superseded_by_id is null
   and a.cancelled_at is null
   and (a.expires_at is null or a.expires_at > now());

/**
 * Apply an incoming message's references to the messages it supersedes or
 * cancels. Matching is by (source, identifier) -- never by area name.
 *
 * Returns the number of prior alerts affected.
 */
create or replace function app.apply_cap_lifecycle(
  p_alert_id    bigint,
  p_identifiers text[]
) returns integer
language plpgsql
as $$
declare
  a        weather_alerts%rowtype;
  affected integer := 0;
begin
  select * into a from weather_alerts where id = p_alert_id;
  if not found or p_identifiers is null or array_length(p_identifiers,1) is null then
    return 0;
  end if;

  if coalesce(a.msg_type,'Alert') = 'Update' then
    update weather_alerts
       set superseded_by_id = p_alert_id
     where source_id = a.source_id
       and cap_identifier = any(p_identifiers)
       and id <> p_alert_id
       and superseded_by_id is null;
    get diagnostics affected = row_count;

  elsif coalesce(a.msg_type,'Alert') = 'Cancel' then
    update weather_alerts
       set cancelled_at = coalesce(a.cap_sent, now())
     where source_id = a.source_id
       and cap_identifier = any(p_identifiers)
       and id <> p_alert_id
       and cancelled_at is null;
    get diagnostics affected = row_count;
  end if;

  return affected;
end $$;

-- Feed tables are read-only to portal users; the view inherits that.
alter view active_weather_alerts owner to current_user;
