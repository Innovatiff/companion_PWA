-- 0002_core.sql — affiliates, clients, subscriptions, geography catalog.

-- ---------------------------------------------------------------------------
-- Reference geography
-- ---------------------------------------------------------------------------

create type country_code as enum ('HN','GT','MX','JM');

-- Municipalities are stored as name AND lat/lng (CLAUDE.md), because alert
-- polygons are geographic and name matching fails on accents and on duplicate
-- place names (there are several "San Pedro" in every one of these countries).
create table municipalities (
  id              bigint generated always as identity primary key,
  country         country_code not null,
  admin_region    text not null,              -- departamento / estado / parish
  name            text not null,
  lat             double precision not null check (lat between -90 and 90),
  lng             double precision not null check (lng between -180 and 180),
  -- Generated so it can never drift from lat/lng.
  geog            extensions.geography(Point,4326)
                    generated always as (
                      extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography
                    ) stored,
  population      integer,
  timezone        text not null,
  created_at      timestamptz not null default now(),
  unique (country, admin_region, name)
);

create index municipalities_geog_idx on municipalities using gist (geog);
create index municipalities_country_idx on municipalities (country);
-- Accent-insensitive fuzzy search for the first-run picker.
create index municipalities_name_trgm_idx
  on municipalities using gin (app.immutable_unaccent(name) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Affiliates
-- ---------------------------------------------------------------------------

create table affiliates (
  id              uuid primary key default extensions.gen_random_uuid(),
  auth_user_id    uuid unique,                -- -> auth.users(id); null until portal invite accepted
  name            text not null,
  business_name   text,
  contact         text,
  -- Default 8/20 = 0.40. Stored per-affiliate so a renegotiated split is data,
  -- not a deploy.
  commission_rate numeric(5,4) not null default 0.4000
                    check (commission_rate >= 0 and commission_rate <= 1),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index affiliates_auth_user_idx on affiliates (auth_user_id);

-- Owner role. Membership here (not a guessable JWT claim) grants read-all.
create table owners (
  auth_user_id    uuid primary key,
  note            text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------

create type client_segment as enum ('seasonal','settled');
create type ui_language    as enum ('es','en');

create table clients (
  id                uuid primary key default extensions.gen_random_uuid(),
  affiliate_id      uuid not null references affiliates(id) on delete restrict,

  -- THE CODE IS THE ACCOUNT. No email, no password, no SMS.
  -- Stored uppercase, unique, and re-enterable on a new phone.
  code              text not null unique
                      check (code ~ '^[A-Z0-9]{8}$'),

  full_name         text not null,
  country           country_code not null,
  language          ui_language not null default 'es',

  -- Denormalised location (the brief's columns) plus a FK to the catalog.
  -- The FK is what ingest and alert-matching use; the text columns survive a
  -- catalog edit and keep the record readable on its own.
  municipality_id   bigint references municipalities(id),
  admin_region      text,
  municipality      text,
  municipality_lat  double precision,
  municipality_lng  double precision,
  municipality_geog extensions.geography(Point,4326)
                      generated always as (
                        case
                          when municipality_lat is null or municipality_lng is null then null
                          else extensions.ST_SetSRID(
                                 extensions.ST_MakePoint(municipality_lng, municipality_lat), 4326
                               )::extensions.geography
                        end
                      ) stored,

  team_id           bigint,                  -- -> teams(id), FK added in 0003
  segment           client_segment not null default 'seasonal',
  has_kids          boolean not null default false,

  -- Seasonal: counts down to departure. Settled: user-set next trip.
  departure_date    date,
  next_trip_date    date,

  -- ONE notification per day, at a fixed hour, in the user's local time.
  notify_hour       smallint not null default 7 check (notify_hour between 0 and 23),
  timezone          text not null default 'America/Toronto',

  setup_completed_at timestamptz,            -- first-run setup is done by the user
  last_seen_at      timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),

  -- A seasonal client without a departure date has an empty countdown slot on
  -- the home screen; allowed during registration, expected after first-run setup.
  constraint clients_segment_dates_ck check (
    segment <> 'settled' or departure_date is null
  )
);

create index clients_affiliate_idx    on clients (affiliate_id);
create index clients_code_idx         on clients (code);
create index clients_municipality_idx on clients (municipality_id);
create index clients_geog_idx         on clients using gist (municipality_geog);
create index clients_country_idx      on clients (country);

-- Additional towns to watch (first-run setup). Alerts and forecasts fan out
-- over home municipality + these.
create table client_watch_locations (
  client_id         uuid not null references clients(id) on delete cascade,
  municipality_id   bigint not null references municipalities(id),
  created_at        timestamptz not null default now(),
  primary key (client_id, municipality_id)
);

create table client_kids (
  id                bigint generated always as identity primary key,
  client_id         uuid not null references clients(id) on delete cascade,
  birth_year        smallint check (birth_year between 1990 and 2100),
  grade_label       text
);

create index client_kids_client_idx on client_kids (client_id);

create type remittance_pref as enum ('bank','pickup','both','unset');

create table client_preferences (
  client_id         uuid primary key references clients(id) on delete cascade,
  remittance        remittance_pref not null default 'unset',
  notes             text,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Subscriptions — $20 / 6 months, affiliate keeps $8
-- ---------------------------------------------------------------------------

create table subscriptions (
  id                uuid primary key default extensions.gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  period_start      date not null,
  period_end        date not null,
  amount            numeric(10,2) not null default 20.00 check (amount >= 0),
  affiliate_payout  numeric(10,2) not null default 8.00  check (affiliate_payout >= 0),
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  check (period_end > period_start),
  check (affiliate_payout <= amount)
);

create index subscriptions_client_idx on subscriptions (client_id);
create index subscriptions_period_idx on subscriptions (period_end);
-- Renewal pipeline (admin) reads this; one active period per client at a time.
create unique index subscriptions_no_overlap_idx
  on subscriptions (client_id, period_start);
