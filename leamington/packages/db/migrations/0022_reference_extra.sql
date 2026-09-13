-- 0022_reference_extra.sql
-- Two more curated reference tables for the Más section: emergency numbers and
-- transit. Loaded by services/ingest/src/feeds/static.mjs from curated files,
-- which refuses any record without verified_at and verified_by. Every record is
-- shown with "Verificado: {date}".

create table emergency_contacts (
  id           bigint generated always as identity primary key,
  country      text not null check (country in ('CA', 'MX', 'GT', 'HN', 'JM')),
  region       text not null default '',
  label        text not null,
  number       text not null,
  notes        text,
  verified_at  date not null,
  source_url   text,
  unique (country, region, label)
);

create table transit (
  id            bigint generated always as identity primary key,
  area          text not null check (area in ('Leamington', 'Windsor', 'Windsor-Essex')),
  operator      text not null,
  kind          text not null check (kind in ('local', 'intercity', 'airport', 'other')),
  name          text not null,
  description   text,
  fares         text,
  schedule_url  text,
  contact       text,
  verified_at   date not null,
  source_url    text,
  unique (area, operator, name)
);

alter table emergency_contacts enable row level security;
alter table transit            enable row level security;
create policy emergency_contacts_read on emergency_contacts
  for select using (auth.role() in ('authenticated', 'service_role'));
create policy transit_read on transit
  for select using (auth.role() in ('authenticated', 'service_role'));
