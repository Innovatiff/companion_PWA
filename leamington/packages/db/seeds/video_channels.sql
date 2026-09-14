-- Football video channels: official YouTube channels whose public upload feed
-- (https://www.youtube.com/feeds/videos.xml?channel_id=…) was read live on
-- 2026-09-14. Stance and findings: docs/OPEN-DECISIONS.md 3.25.
--
-- Every channel_id was taken from the channel's own page (its canonical link and
-- externalId agreeing), never guessed. league_id comes from seeds/leagues.sql.
-- A club channel names its club (club_key, an entry of
-- services/ingest/src/feeds/videos/team-aliases.json); ingest sets team_id once
-- the fixtures feed has created that team.
--
-- active = false: the channel answers but is not worth fetching (talk shows with
-- no highlights, or no uploads for months). It is kept so the finding is recorded
-- and switching it on is one update. Idempotent on key.
insert into video_channels (key, name, youtube_channel_id, country, league_id, club_key, kind, active, verified_at, notes)
select v.key, v.name, v.channel_id, v.country::country_code,
       case when v.kind = 'league' then (select l.id from leagues l where l.country = v.country::country_code and l.name = v.league) end,
       v.club_key, v.kind, v.active, date '2026-09-14', v.notes
  from (values
    -- Mexico: the league, the broadcasters that post highlights, and the clubs.
    ('mx-liga-bbva-mx',      'LIGA BBVA MX',          'UCq8BPLXtFeiSFOvmJrknWGg', 'MX', 'league',      'Liga MX', null, true,  'The league''s own channel. Every match summary as "SANTOS 2-1 JUÁREZ J8 AP26"; most uploads are Shorts (skipped).'),
    ('mx-tudn',              'TUDN México',           'UCTIyEyDNHPrwVFPhpi5dm0A', 'MX', 'broadcaster', null, null, true,  'Televisa. "RESUMEN Y GOLES - Santos vs Juárez | Liga MX"; also clips and talk shows (not highlights).'),
    ('mx-espn-mx',           'ESPN MX',               'UC4vmPjKs8tJM0HMd9JmgZ-g', 'MX', 'broadcaster', null, null, true,  'Liga MX and European "Resumen" videos; Futbol Picante talk is not a highlight.'),
    ('mx-azteca-deportes',   'TV Azteca Deportes',    'UCe3Ev4a4Sm9L5aO9sJJ_WXw', 'MX', 'broadcaster', null, null, true,  'Rights holder for several Liga MX clubs. On 2026-09-14 its feed was boxing and baseball; kept for the match days it carries.'),
    ('mx-fox-sports-mx',     'FOX Sports MX',         'UCUf4RLsG_TsjinvtL2jT-VA', 'MX', 'broadcaster', null, null, false, 'Answers; 0 of 11 uploads were highlights (talk shows: La Última Palabra).'),
    ('mx-espn-deportes',     'ESPN Deportes',         'UC08mnbiC4FykqpHqbEWgFcg', 'MX', 'broadcaster', null, null, false, 'Answers; US channel, 0 of 11 uploads were highlights (Fuera de Juego, Raza Deportiva talk).'),
    ('mx-club-america',      'Club América',          'UC3j75twE_C1Y3TKgkN2iffA', 'MX', 'club', null, 'mx-america',       true,  'Official. Mostly Shorts, presentations and press conferences.'),
    ('mx-chivas',            'Chivas',                'UCbtodmCOE5CDdVvVvUzwQfQ', 'MX', 'club', null, 'mx-guadalajara',   true,  'Official (CHIVASTV). Goals and full summaries of its matches.'),
    ('mx-cruz-azul',         'Club de Futbol Cruz Azul', 'UC20Js1LPo3Quksjpo7k48Wg', 'MX', 'club', null, 'mx-cruz-azul',  true,  'Official. Also its women''s and Expansión sides (never matched to the first team).'),
    ('mx-pumas',             'PumasMX',               'UCBXP2OK41YuDIxOJrt27LKA', 'MX', 'club', null, 'mx-pumas',         true,  'Official. Press conferences and match-day color.'),
    ('mx-tigres',            'Tigres Oficial',        'UCUpZKAvgQbvHyXAerkmxhSQ', 'MX', 'club', null, 'mx-tigres',        true,  'Official.'),
    ('mx-monterrey',         'Club de Futbol Monterrey', 'UCg8j46H9oH4Q7n9PGo-Wavg', 'MX', 'club', null, 'mx-monterrey',  true,  'Official. "Resumen Monterrey vs Tigres - Clásico 143".'),
    ('mx-toluca',            'TolucaFC',              'UCo848Wecd3bEdo5gojhs3pA', 'MX', 'club', null, 'mx-toluca',        true,  'Official. "El resumen J8 | Toluca 🆚 Atlas".'),
    ('mx-leon',              'Club León Oficial',     'UC03nwjwKgU-goGWrsbG1K6A', 'MX', 'club', null, 'mx-leon',          true,  'Official. Few uploads (3 in 30 days), press conferences.'),
    ('mx-pachuca',           'tuzostvoficial',        'UCBiVSznvgtMdYEoPfZWS27A', 'MX', 'club', null, 'mx-pachuca',       true,  'Official (Club de Futbol Pachuca).'),
    ('mx-santos-laguna',     'Club Santos Laguna',    'UC51-rRe-cnJn5V670538Lrw', 'MX', 'club', null, 'mx-santos-laguna', true,  'Official.'),
    ('mx-atlas',             'AtlasFC',               'UCHqgfi07qgscpyjlvibkYjw', 'MX', 'club', null, 'mx-atlas',         true,  'Official.'),
    ('mx-necaxa',            'Club Necaxa',           'UC9MFlukQZouuvQYCOFQZM_g', 'MX', 'club', null, 'mx-necaxa',        true,  'Official. Media availability videos.'),
    ('mx-puebla',            'Club Puebla',           'UCYfsbb6LEbTfgfQmeZ56DoQ', 'MX', 'club', null, 'mx-puebla',        true,  'Official.'),
    ('mx-queretaro',         'clubqueretaro',         'UCJtXEm9B7sY2ZeCATgRt--A', 'MX', 'club', null, 'mx-queretaro',     true,  'Official.'),
    ('mx-tijuana',           'Xolos',                 'UCLowRs-GNZ2lSDqHB50YXgQ', 'MX', 'club', null, 'mx-tijuana',       true,  'Official (Club Tijuana Xoloitzcuintles).'),
    ('mx-juarez',            'FC Juárez Oficial',     'UCBG46z8mfj69eSbzpLJIv_Q', 'MX', 'club', null, 'mx-juarez',        true,  'Official.'),
    ('mx-san-luis',          'Atlético de San Luis',  'UCF-kaaSSk9rBEHa9MsfsGjA', 'MX', 'club', null, 'mx-san-luis',      true,  'Official.'),
    ('mx-mazatlan',          'Mazatlán F. C.',        'UCm9E5Kxn7bS-nDvY1gNOnzg', 'MX', 'club', null, 'mx-mazatlan',      false, 'Answers; farewell video "¡GRACIAS, MAZATLÁN! ¡Hasta Siempre!" 2026-04-30, no uploads since (Atlante plays Apertura 2026).'),

    -- Honduras
    ('hn-liga-hondubet',     'Liga Hondubet',         'UCFqKZtftTE89-_9BSgNkHbA', 'HN', 'league',      'Liga Nacional de Honduras', null, true, 'The league''s own channel (Liga Nacional de Fútbol Profesional). Full matches, "Jornada 2 | Juticalpa 🆚 Olimpia"; last upload 2026-08-31.'),
    ('hn-deportes-tvc',      'Deportes TVC',          'UC4f_is0qbF8WTiJlPWqn8Rw', 'HN', 'broadcaster', null, null, true,  'Televicentro, Honduras (not Mexico''s TVC Deportes). "Marathón 1 - 0 Olimpia | Jornada 7 | Liga Nacional", goals of the round.'),
    ('hn-todo-deportes-tv',  'Todo Deportes Televisión', 'UCTRG9mFx-cXwS7gLDempIUw', 'HN', 'broadcaster', null, null, false, 'Answers; 0 of 12 uploads were highlights (live streams and talk).'),
    ('hn-fox-deportes-hn',   'FOX Deportes Honduras', 'UCIJ3wcqSJLVTpbiqiAXlCIg', 'HN', 'broadcaster', null, null, false, 'Answers; 0 of 15 uploads were highlights (Cuadro Titular, Nación CA talk).'),
    ('hn-motagua',           'Fútbol Club Motagua',   'UC3vyoFgqX3OcPpeeFKRo6Eg', 'HN', 'club', null, 'hn-motagua',       true,  'Official ("Videos del Club Deportivo Motagua"). Quiet: last upload 2026-06-01.'),
    ('hn-olimpia',           'Club Olimpia Deportivo', 'UCIw0Cl5h-_ryNXdiQ-bd9eQ', 'HN', 'club', null, 'hn-olimpia',       true,  'Official. "Olimpia 4-1 Platense | Noche de goles en Comayagua | Resumen Jornada 6".'),
    ('hn-real-espana',       'Real Club Deportivo España', 'UCyCaWyXKAn7rnB4I4-Rlcsg', 'HN', 'club', null, 'hn-real-espana', true, 'Official. Press conferences.'),
    ('hn-victoria',          'Club Deportivo Victoria', 'UCjeCcl63pLxIZElWxYBZTDw', 'HN', 'club', null, 'hn-victoria',     true,  'Official (La Ceiba). Mostly Shorts; plays Tela FC and Brasilia (Liga de Ascenso) in 2026.'),

    -- Guatemala
    ('gt-guatefutbol-tv',    'Guatefutbol TV',        'UCrQPjh78VarES_UlQx7lcvQ', 'GT', 'broadcaster', null, null, true,  'Guatefutbol, the sports outlet (since 2004), not a rights holder: the only Guatemalan channel found posting Liga Nacional highlights ("Guastatoya 2-1 Xelajú MC | Jornada 9").'),
    ('gt-fox-deportes-gt',   'FOX Deportes Guatemala', 'UCfyCsDRRaATpnl4DjBWaYDw', 'GT', 'broadcaster', null, null, true, 'Answers; about 450 uploads a month, mostly Cuadro Titular talk, with match summaries.'),
    ('gt-comunicaciones',    'Comunicaciones FC',     'UCxAz8u_qidmGIXgkurm3Axg', 'GT', 'club', null, 'gt-comunicaciones', true, 'Official. Quiet: last upload 2026-07-16.'),

    -- Jamaica
    ('jm-jpl-tv',            'Jamaica Premier League TV', 'UCF46mF1YoLQV_PNZL3rlDEg', 'JM', 'league', 'Jamaica Premier League', null, true, 'The league''s channel. Full matches live ("LIVE: Tivoli Gardens vs Humble Lion FC | Match Day 1"), no highlights.'),
    ('jm-montego-bay-united', 'Montego Bay United FC TV', 'UCaP-36FJZuOoIvahfNFq3CA', 'JM', 'club', null, 'jm-montego-bay-united', true, 'Official. "Montego Bay United vs Harbour View - Extended Match Highlights".'),
    ('jm-mount-pleasant',    'Mount Pleasant FA TV',  'UCShU46qUVJvCwrzcs4V7DBA', 'JM', 'club', null, 'jm-mount-pleasant', true,  'Official. Highlights and press conferences (JPL and Caribbean Cup).'),
    ('jm-waterhouse',        'Waterhouse Football Club', 'UC6c-gPAf-emhWgDnCuZbCgg', 'JM', 'club', null, 'jm-waterhouse',  true,  'Official. "Match Highlights | Waterhouse 1-0 Montego Bay United"; long uploads last 2026-03-11.'),
    ('jm-humble-lions',      'HumblelionFC',          'UCD7AH8uN1FQNVMr3TKJcZ5A', 'JM', 'club', null, 'jm-humble-lions',  true,  'Official. Full matches.'),
    ('jm-portmore-united',   'Portmore United FC',    'UC6PvwWuog7i1-FjJwXuvRpA', 'JM', 'club', null, 'jm-portmore-united', true, 'Official. Quiet: last upload 2026-05-12.'),
    ('jm-harbour-view',      'Harbour View FC',       'UCWSyKiyk_-FjgsZ9X0vbuxw', 'JM', 'club', null, 'jm-harbour-view',  true,  'Official. Quiet: last upload 2026-03-15.'),
    ('jm-arnett-gardens',    'Arnett Gardens FC',     'UCyJ_s3Su5vZuekygIiwaMvQ', 'JM', 'club', null, 'jm-arnett-gardens', false, 'Answers; no uploads since 2025-12-30.'),
    ('jm-molynes-united',    'Molynes United',        'UCcZXBvlhElNxOcP3GIG_RjQ', 'JM', 'club', null, 'jm-molynes-united', false, 'Answers; no uploads since 2024-10-09.')
  ) v(key, name, channel_id, country, kind, league, club_key, active, notes)
on conflict (key) do update
  set name = excluded.name, youtube_channel_id = excluded.youtube_channel_id, country = excluded.country,
      league_id = excluded.league_id, club_key = excluded.club_key, kind = excluded.kind, active = excluded.active,
      verified_at = excluded.verified_at, notes = excluded.notes;

do $$
begin
  if exists (select 1 from video_channels where kind = 'league' and league_id is null) then
    raise exception 'a league channel''s league is not in leagues';
  end if;
end $$;
