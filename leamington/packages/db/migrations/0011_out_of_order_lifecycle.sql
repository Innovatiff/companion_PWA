-- 0011_out_of_order_lifecycle.sql
--
-- Feeds do not guarantee ordering, and a backfill never has the whole history.
-- Observed on the live jm-jms-en feed: 16 of 17 Update messages referenced
-- alerts outside the fetch window, so only 1 supersession could be applied.
--
-- Without this, an Update ingested BEFORE the alert it supersedes leaves that
-- alert active forever once it finally arrives -- a cancelled or superseded
-- warning still showing as live. Same failure class as a missed alert.
--
-- So references are stored parsed and indexed, and lifecycle is applied in both
-- directions: forward (new message -> prior alerts) and backward (new alert ->
-- Update/Cancel messages already holding a reference to it).

alter table weather_alerts
  add column cap_reference_ids text[] not null default '{}';

-- Backfill from the raw references already stored.
update weather_alerts
   set cap_reference_ids = coalesce((
     select array_agg(split_part(tok, ',', 2))
       from unnest(regexp_split_to_array(trim(cap_references), '\s+')) tok
      where split_part(tok, ',', 2) <> ''
   ), '{}')
 where cap_references is not null;

create index weather_alerts_reference_ids_idx
  on weather_alerts using gin (cap_reference_ids);

/**
 * Apply any ALREADY-STORED Update/Cancel that references this newly arrived
 * alert. The out-of-order case.
 *
 * Returns the number of lifecycle effects applied to p_alert_id (0 or 1).
 */
create or replace function app.apply_pending_lifecycle(p_alert_id bigint)
returns integer
language plpgsql
as $$
declare
  a        weather_alerts%rowtype;
  ref      weather_alerts%rowtype;
  applied  integer := 0;
begin
  select * into a from weather_alerts where id = p_alert_id;
  if not found or a.cap_identifier is null then return 0; end if;

  -- The most recent message referencing this one decides its fate.
  select * into ref
    from weather_alerts m
   where m.source_id = a.source_id
     and m.id <> a.id
     and a.cap_identifier = any(m.cap_reference_ids)
     and coalesce(m.msg_type,'Alert') in ('Update','Cancel')
   order by m.cap_sent desc nulls last, m.id desc
   limit 1;

  if not found then return 0; end if;

  if coalesce(ref.msg_type,'Alert') = 'Cancel' and a.cancelled_at is null then
    update weather_alerts set cancelled_at = coalesce(ref.cap_sent, now())
     where id = a.id;
    applied := 1;
  elsif coalesce(ref.msg_type,'Alert') = 'Update' and a.superseded_by_id is null then
    update weather_alerts set superseded_by_id = ref.id where id = a.id;
    applied := 1;
  end if;

  return applied;
end $$;

-- Keep the forward-direction function matching on the parsed column too.
create or replace function app.apply_cap_lifecycle(
  p_alert_id    bigint,
  p_identifiers text[]
) returns integer
language plpgsql
as $$
declare
  a        weather_alerts%rowtype;
  affected integer := 0;
  ids      text[];
begin
  select * into a from weather_alerts where id = p_alert_id;
  if not found then return 0; end if;

  ids := coalesce(p_identifiers, a.cap_reference_ids);
  if ids is null or array_length(ids,1) is null then return 0; end if;

  if coalesce(a.msg_type,'Alert') = 'Update' then
    update weather_alerts
       set superseded_by_id = p_alert_id
     where source_id = a.source_id and cap_identifier = any(ids)
       and id <> p_alert_id and superseded_by_id is null;
    get diagnostics affected = row_count;
  elsif coalesce(a.msg_type,'Alert') = 'Cancel' then
    update weather_alerts
       set cancelled_at = coalesce(a.cap_sent, now())
     where source_id = a.source_id and cap_identifier = any(ids)
       and id <> p_alert_id and cancelled_at is null;
    get diagnostics affected = row_count;
  end if;

  return affected;
end $$;
