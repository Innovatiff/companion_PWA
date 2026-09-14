-- Crests are flagged only when stored; home extras return real rows or null,
-- with the right validity. Clock pinned: 2026-09-13 14:00 UTC.
\set ON_ERROR_STOP on

insert into affiliates (id, name) values ('99990000-0000-4000-8000-000000000019', 'Extras Test') on conflict do nothing;
insert into leagues (country, name, source, source_league_id) values ('MX', 'Extras League', 'test', 'extras-league') on conflict do nothing;
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'MX', t.name, 'test', t.sid from leagues l, (values ('Extras FC', 'x-1'), ('Rival Extras', 'x-2')) t(name, sid)
 where l.name = 'Extras League' on conflict do nothing;

insert into clients (id, affiliate_id, code, full_name, country, language, team_id, timezone) values
  ('99990000-0000-4000-8000-0000000001c1', '99990000-0000-4000-8000-000000000019', 'XTRAMX23', 'Extras Uno', 'MX', 'es',
   (select id from teams where name = 'Extras FC'), 'America/Toronto'),
  ('99990000-0000-4000-8000-0000000001c2', '99990000-0000-4000-8000-000000000019', 'XTRAGT23', 'Extras Dos', 'GT', 'es', null, 'America/Toronto')
on conflict do nothing;

insert into holidays (country, holiday_date, name, verified_at) values
  ('MX', '2026-09-16', 'Día de la Independencia', '2026-09-13'),
  ('MX', '2026-11-16', 'Día de la Revolución', '2026-09-13'),
  ('MX', '2026-09-01', 'Ya pasó', '2026-09-13')
on conflict do nothing;
insert into emergency_contacts (country, region, label, number, verified_at) values
  ('CA', 'Ontario', 'Emergency (police, fire, ambulance)', '911', '2026-09-13') on conflict do nothing;
insert into consulates (country, city, phone, verified_at) values ('MX', 'Leamington', '(519) 325-1460', '2026-09-13') on conflict do nothing;
insert into lottery_games (country, operator, name, draw_times_local, timezone, results_url, parser_implemented, active)
values ('MX', 'Extras Operator', 'Extras Lotto', '{21:00}', 'America/Mexico_City', 'https://example.invalid/', true, true) on conflict do nothing;
insert into lottery_results (game_id, draw_date, draw_time_local, numbers, source_url)
select id, '2026-09-12', '21:00', array['04','15','23'], 'https://example.invalid/' from lottery_games where name = 'Extras Lotto';

do $$
declare x jsonb; f jsonb;
begin
  x := app.home_extras('99990000-0000-4000-8000-0000000001c1', '2026-09-13 14:00:00+00');
  assert x->'next_holiday'->>'name' = 'Día de la Independencia' and (x->'next_holiday'->>'days_until')::int = 3, format('%s', x->'next_holiday');
  assert x->'emergency'->>'number' = '911', format('%s', x);
  assert x->'consulate'->>'phone' = '(519) 325-1460';
  assert x->'lottery'->>'game' = 'Extras Lotto' and x->'lottery'->'numbers'->>0 = '04', format('%s', x->'lottery');
  assert x->'team'->>'name' = 'Extras FC' and not (x->'team'->>'crest')::boolean, 'no crest stored yet';

  x := app.home_extras('99990000-0000-4000-8000-0000000001c1', '2026-09-20 14:00:00+00');
  assert x->'lottery' = 'null'::jsonb, 'a draw older than 2 days is not shown';
  assert x->'next_holiday'->>'name' = 'Día de la Revolución', 'the next holiday moves on once one passes';

  x := app.home_extras('99990000-0000-4000-8000-0000000001c2', '2026-09-13 14:00:00+00');
  -- (Another test file adds a real Guatemala draw, so lottery is not asserted here.)
  assert x->'consulate' = 'null'::jsonb and x->'team' = 'null'::jsonb and x->'next_holiday' = 'null'::jsonb,
    format('no record means null, never a placeholder: %s', x);

  insert into team_crests (team_id, content_type, bytes, sha256, source_url)
  select id, 'image/png', decode('89504e470d0a1a0a', 'hex'), 'test', 'https://media.api-sports.io/football/teams/1.png'
    from teams where name = 'Extras FC';
  x := app.home_extras('99990000-0000-4000-8000-0000000001c1', '2026-09-13 14:00:00+00');
  assert (x->'team'->>'crest')::boolean, 'a stored crest is flagged';
  f := app.football_page('99990000-0000-4000-8000-0000000001c1', '2026-09-13 14:00:00+00');
  assert (f->>'team_crest')::boolean and (f->>'team_id')::bigint = (select id from teams where name = 'Extras FC'), format('%s', f);
  raise notice 'PASS extras: home cards are real rows with validity or null; crests are flagged only when stored';
end $$;
