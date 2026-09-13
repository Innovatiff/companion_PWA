-- 0003_feeds.sql — feed tables. Written ONLY by services/ingest, read by apps.
-- Client apps never call external APIs; everything here is our own copy.

-- ---------------------------------------------------------------------------
-- FX — daily, so we can compute 30-day high/low and day-over-day direction
-- ---------------------------------------------------------------------------

create type fx_currency as enum ('MXN','HNL','GTQ','JMD');

create table fx_rates (
  rate_date     date not null,
  base          text not null default 'CAD' check (base = 'CAD'),
  quote         fx_currency not null,
  rate          numeric(18,6) not null check (rate > 0),
  fetched_at    timestamptz not null default now(),
  primary key (rate_date, quote)
);

create index fx_rates_quote_date_idx on fx_rates (quote, rate_date desc);

-- Day-over-day direction and 30-day window, computed in the DB so the PWA ships
-- one number and an arrow instead of 30 rows.
-- NOTE: the UI labels this "tasa de referencia" only. Never name the provider,
-- never rank, never predict.
create view fx_latest_with_context as
select
  f.quote,
  f.rate_date,
  f.rate,
  lag(f.rate) over w                                     as prev_rate,
  case
    when lag(f.rate) over w is null then null
    when f.rate > lag(f.rate) over w then 'up'
    when f.rate < lag(f.rate) over w then 'down'
    else 'flat'
  end                                                    as direction,
  max(f.rate) over w30                                   as high_30d,
  min(f.rate) over w30                                   as low_30d,
  -- "más alto en 12 días" — days since the rate was last this high.
  f.rate >= max(f.rate) over w30                         as is_30d_high
from fx_rates f
window
  w   as (partition by f.quote order by f.rate_date),
  w30 as (partition by f.quote order by f.rate_date
          rows between 29 preceding and current row);

-- ---------------------------------------------------------------------------
-- Football
-- ---------------------------------------------------------------------------

create table leagues (
  id            bigint generated always as identity primary key,
  country       country_code not null,
  name          text not null,
  -- Provider identity is recorded so a provider swap is a data migration,
  -- not a schema change.
  source        text not null,
  source_league_id text,
  active        boolean not null default true,
  unique (country, name)
);

create table teams (
  id            bigint generated always as identity primary key,
  league_id     bigint not null references leagues(id) on delete cascade,
  country       country_code not null,
  name          text not null,
  short_name    text,
  source        text not null,
  source_team_id text,
  unique (league_id, name)
);

create index teams_country_idx on teams (country);

alter table clients
  add constraint clients_team_fk
  foreign key (team_id) references teams(id) on delete set null;

create type fixture_status as enum ('scheduled','live','finished','postponed','cancelled');

create table fixtures (
  id              bigint generated always as identity primary key,
  league_id       bigint not null references leagues(id) on delete cascade,
  home_team_id    bigint not null references teams(id),
  away_team_id    bigint not null references teams(id),
  kickoff_utc     timestamptz not null,
  status          fixture_status not null default 'scheduled',
  home_score      smallint,
  away_score      smallint,
  source          text not null,
  source_fixture_id text,
  fetched_at      timestamptz not null default now(),
  unique (source, source_fixture_id)
);

create index fixtures_kickoff_idx   on fixtures (kickoff_utc);
create index fixtures_home_idx      on fixtures (home_team_id, kickoff_utc);
create index fixtures_away_idx      on fixtures (away_team_id, kickoff_utc);

-- ---------------------------------------------------------------------------
-- Weather forecast — MULTI-SOURCE. Store all three, display median/consensus.
-- ---------------------------------------------------------------------------

create type forecast_provider as enum ('open-meteo','openweather','weatherapi');

create table forecasts (
  id              bigint generated always as identity primary key,
  municipality_id bigint not null references municipalities(id) on delete cascade,
  provider        forecast_provider not null,
  target_date     date not null,
  temp_min_c      numeric(5,2),
  temp_max_c      numeric(5,2),
  precip_prob     numeric(5,2) check (precip_prob between 0 and 100),
  precip_mm       numeric(6,2),
  summary         text,
  fetched_at      timestamptz not null default now(),
  unique (municipality_id, provider, target_date)
);

create index forecasts_lookup_idx on forecasts (municipality_id, target_date);

-- Median temperature and precipitation consensus across whichever providers
-- answered. Spread is exposed so the UI can show a RANGE where they disagree
-- materially, rather than false precision.
create view forecast_consensus as
select
  municipality_id,
  target_date,
  count(*)                                              as provider_count,
  percentile_cont(0.5) within group (order by temp_min_c) as temp_min_median,
  percentile_cont(0.5) within group (order by temp_max_c) as temp_max_median,
  max(temp_max_c) - min(temp_max_c)                     as temp_max_spread,
  percentile_cont(0.5) within group (order by precip_prob) as precip_prob_median,
  -- Consensus = majority of reporting providers expect measurable rain.
  (count(*) filter (where precip_prob >= 50))::numeric / nullif(count(*),0)
                                                        as precip_agreement,
  min(fetched_at)                                       as oldest_fetch,
  max(fetched_at)                                       as newest_fetch
from forecasts
group by municipality_id, target_date;

-- ---------------------------------------------------------------------------
-- Weather ALERTS — single authoritative source per country.
-- Verbatim passthrough. Never rewritten, summarised, or AI-paraphrased.
-- ---------------------------------------------------------------------------

create type alert_level as enum ('red','orange','yellow','green','unknown');

create table alert_sources (
  id              bigint generated always as identity primary key,
  country         country_code not null,
  agency          text not null,              -- shown to the user, verbatim
  agency_full     text,
  -- 'cap' > 'wmo_hub' > 'scrape'. Recorded because a scrape is fragile and the
  -- feed-health dashboard must show which countries are on one.
  kind            text not null check (kind in ('cap','wmo_hub','scrape')),
  feed_url        text not null,
  poll_seconds    integer not null default 900,   -- every 15 min
  -- Staleness monitoring: alert the OWNER if silent this long during storm
  -- season. Silent failure is the worst outcome here.
  stale_after_seconds integer not null default 43200,  -- 12h
  active          boolean not null default false,      -- opt-in, one country at launch
  created_at      timestamptz not null default now(),
  unique (country, agency, kind)
);

create table weather_alerts (
  id              bigint generated always as identity primary key,
  source_id       bigint not null references alert_sources(id) on delete cascade,
  country         country_code not null,

  -- CAP identity. Dedupe key across polls.
  cap_identifier  text,
  cap_sender      text,
  cap_sent        timestamptz,
  msg_type        text,                      -- Alert / Update / Cancel

  -- VERBATIM agency wording. Never rewritten or paraphrased.
  event           text not null,
  headline        text,
  description     text,
  instruction     text,
  area_desc       text,

  -- Raw agency level plus our normalised mapping.
  severity_raw    text,                      -- CAP Severity, or scraped colour
  level           alert_level not null default 'unknown',

  -- Push only red/orange equivalents. Yellow displays in-app, no notification.
  push_eligible   boolean generated always as (level in ('red','orange')) stored,

  issued_at       timestamptz not null,
  effective_at    timestamptz,
  expires_at      timestamptz,

  -- Geography. Polygon matching is the whole point; department-level matching
  -- produces false positives.
  area_geog       extensions.geography(MultiPolygon,4326),
  -- Some agencies give a circle (point + radius) instead of a polygon.
  center_geog     extensions.geography(Point,4326),
  radius_m        double precision,

  source_url      text not null,             -- always linked from the UI
  raw             jsonb,                     -- untouched original, for audit
  fetched_at      timestamptz not null default now(),

  unique (source_id, cap_identifier, cap_sent)
);

create index weather_alerts_area_idx    on weather_alerts using gist (area_geog);
create index weather_alerts_center_idx  on weather_alerts using gist (center_geog);
create index weather_alerts_active_idx  on weather_alerts (country, expires_at desc);
create index weather_alerts_push_idx    on weather_alerts (push_eligible, issued_at desc);

-- ---------------------------------------------------------------------------
-- Static / slow. Every record carries verified_at -> "Verificado: 3 de marzo".
-- ---------------------------------------------------------------------------

create table holidays (
  id            bigint generated always as identity primary key,
  country       country_code not null,
  holiday_date  date not null,
  name          text not null,
  verified_at   date not null,
  source_url    text,
  unique (country, holiday_date, name)
);

create index holidays_country_date_idx on holidays (country, holiday_date);

-- NATIONAL school calendars only. Department-level data does not exist as a feed.
create table school_calendar (
  id            bigint generated always as identity primary key,
  country       country_code not null,
  school_year   text not null,
  event_name    text not null,
  start_date    date not null,
  end_date      date,
  verified_at   date not null,
  source_url    text,
  unique (country, school_year, event_name, start_date)
);

create index school_calendar_country_idx on school_calendar (country, start_date);

create table consulates (
  id              bigint generated always as identity primary key,
  country         country_code not null,      -- country represented
  city            text not null,              -- host city (Toronto, etc.)
  address         text,
  hours           text,
  phone           text,
  email           text,
  booking_url     text,                       -- link only; we never scrape availability
  services        jsonb,                      -- [{name, cost, documents[]}]
  verified_at     date not null,
  source_url      text,
  unique (country, city)
);

-- ---------------------------------------------------------------------------
-- Lottery — official draw results only. Never odds, predictions, or buy links.
-- ---------------------------------------------------------------------------

create table lottery_games (
  id              bigint generated always as identity primary key,
  country         country_code not null,
  operator        text not null,
  name            text not null,
  -- Cash Pot draws 6x daily; cadence is per-game and driven by actual draw
  -- times, not a fixed interval.
  draw_times_local time[] not null default '{}',
  draw_weekdays   smallint[],                 -- 0=Sun; null = every day
  timezone        text not null,
  active          boolean not null default true,
  unique (country, operator, name)
);

create table lottery_results (
  id              bigint generated always as identity primary key,
  game_id         bigint not null references lottery_games(id) on delete cascade,
  draw_date       date not null,
  draw_time_local time,
  numbers         text[] not null,
  extras          jsonb,                      -- bonus ball, multiplier, etc.
  verified_at     timestamptz not null default now(),
  source_url      text not null,
  fetched_at      timestamptz not null default now(),
  unique (game_id, draw_date, draw_time_local)
);

create index lottery_results_recent_idx on lottery_results (game_id, draw_date desc);
