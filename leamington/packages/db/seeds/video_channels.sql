-- Football video channels: official YouTube channels whose public upload feed
-- (https://www.youtube.com/feeds/videos.xml?channel_id=…) was read live on
-- 2026-09-14 (0049) and 2026-09-15 (0050: national teams, more broadcasters,
-- Concacaf). Stance and findings: docs/OPEN-DECISIONS.md 3.25 and 3.26.
--
-- Every channel_id was taken from the channel's own page (its canonical link and
-- externalId agreeing), never guessed. league_id comes from seeds/leagues.sql.
-- A club channel names its club (club_key, an entry of
-- services/ingest/src/feeds/videos/team-aliases.json); ingest sets team_id once
-- the fixtures feed has created that team. A national channel is its country's
-- federation's (women: a women's national team's own channel; none was found,
-- FMF and JFF post both teams). A confederation's channel has no country.
--
-- active = false: the channel answers but is not worth fetching (talk shows with
-- no highlights, or no uploads for months). It is kept so the finding is recorded
-- and switching it on is one update. Idempotent on key.
insert into video_channels (key, name, youtube_channel_id, country, league_id, club_key, kind, women, active, verified_at, notes)
select v.key, v.name, v.channel_id, v.country::country_code,
       case when v.kind = 'league' then (select l.id from leagues l where l.country = v.country::country_code and l.name = v.league) end,
       v.club_key, v.kind, false, v.active, v.verified::date, v.notes
  from (values
    -- Mexico: the league, the broadcasters that post highlights, and the clubs.
    ('mx-liga-bbva-mx',      'LIGA BBVA MX',          'UCq8BPLXtFeiSFOvmJrknWGg', 'MX', 'league',      'Liga MX', null, true,  '2026-09-14', 'The league''s own channel. Every match summary as "SANTOS 2-1 JUÁREZ J8 AP26"; most uploads are Shorts (kept only when highlights or goals).'),
    ('mx-tudn',              'TUDN México',           'UCTIyEyDNHPrwVFPhpi5dm0A', 'MX', 'broadcaster', null, null, true,  '2026-09-14', 'Televisa. "RESUMEN Y GOLES - Santos vs Juárez | Liga MX"; also clips and talk shows (not highlights).'),
    ('mx-tudn-usa',          'TUDN USA',              'UCSo19KhHogXxu3sFsOpqrcQ', 'MX', 'broadcaster', null, null, true,  '2026-09-15', 'TelevisaUnivision''s US channel, Liga MX rights. "SUPER EXTENDED HIGHLIGHTS - León vs Atlético San Luis", "MINI RESUMEN" Shorts; 7 of 15 highlights. Some matches also on TUDN México as separate videos.'),
    ('mx-espn-mx',           'ESPN MX',               'UC4vmPjKs8tJM0HMd9JmgZ-g', 'MX', 'broadcaster', null, null, true,  '2026-09-14', 'Liga MX and European "Resumen" videos; Futbol Picante talk is not a highlight.'),
    ('mx-azteca-deportes',   'TV Azteca Deportes',    'UCe3Ev4a4Sm9L5aO9sJJ_WXw', 'MX', 'broadcaster', null, null, true,  '2026-09-14', 'Rights holder for several Liga MX clubs. On 2026-09-14 its feed was boxing and baseball; kept for the match days it carries.'),
    ('mx-fox-sports-mx',     'FOX Sports MX',         'UCUf4RLsG_TsjinvtL2jT-VA', 'MX', 'broadcaster', null, null, false, '2026-09-15', 'Answers; rechecked 2026-09-15: 0 of 11 uploads were highlights (talk shows: La Última Palabra).'),
    ('mx-espn-deportes',     'ESPN Deportes',         'UC08mnbiC4FykqpHqbEWgFcg', 'MX', 'broadcaster', null, null, false, '2026-09-14', 'Answers; US channel, 0 of 11 uploads were highlights (Fuera de Juego, Raza Deportiva talk).'),
    ('mx-seleccion-mexicana', 'Selección Nacional de México', 'UC3D3rXIt1zy-TC_wJ3V8Z_w', 'MX', 'national', null, null, true, '2026-09-15', 'FMF''s official channel, men''s and women''s national teams (told apart by title words). 15 uploads in 30 days, 8 Shorts; 5 of 15 highlights.'),
    ('mx-club-america',      'Club América',          'UC3j75twE_C1Y3TKgkN2iffA', 'MX', 'club', null, 'mx-america',       true,  '2026-09-14', 'Official. Mostly Shorts, presentations and press conferences.'),
    ('mx-chivas',            'Chivas',                'UCbtodmCOE5CDdVvVvUzwQfQ', 'MX', 'club', null, 'mx-guadalajara',   true,  '2026-09-14', 'Official (CHIVASTV). Goals and full summaries of its matches.'),
    ('mx-cruz-azul',         'Club de Futbol Cruz Azul', 'UC20Js1LPo3Quksjpo7k48Wg', 'MX', 'club', null, 'mx-cruz-azul',  true,  '2026-09-14', 'Official. Also its women''s and Expansión sides (never matched to the first team).'),
    ('mx-pumas',             'PumasMX',               'UCBXP2OK41YuDIxOJrt27LKA', 'MX', 'club', null, 'mx-pumas',         true,  '2026-09-14', 'Official. Press conferences and match-day color.'),
    ('mx-tigres',            'Tigres Oficial',        'UCUpZKAvgQbvHyXAerkmxhSQ', 'MX', 'club', null, 'mx-tigres',        true,  '2026-09-14', 'Official.'),
    ('mx-monterrey',         'Club de Futbol Monterrey', 'UCg8j46H9oH4Q7n9PGo-Wavg', 'MX', 'club', null, 'mx-monterrey',  true,  '2026-09-14', 'Official. "Resumen Monterrey vs Tigres - Clásico 143".'),
    ('mx-toluca',            'TolucaFC',              'UCo848Wecd3bEdo5gojhs3pA', 'MX', 'club', null, 'mx-toluca',        true,  '2026-09-14', 'Official. "El resumen J8 | Toluca 🆚 Atlas".'),
    ('mx-leon',              'Club León Oficial',     'UC03nwjwKgU-goGWrsbG1K6A', 'MX', 'club', null, 'mx-leon',          true,  '2026-09-14', 'Official. Few uploads (3 in 30 days), press conferences.'),
    ('mx-pachuca',           'tuzostvoficial',        'UCBiVSznvgtMdYEoPfZWS27A', 'MX', 'club', null, 'mx-pachuca',       true,  '2026-09-14', 'Official (Club de Futbol Pachuca).'),
    ('mx-santos-laguna',     'Club Santos Laguna',    'UC51-rRe-cnJn5V670538Lrw', 'MX', 'club', null, 'mx-santos-laguna', true,  '2026-09-14', 'Official.'),
    ('mx-atlas',             'AtlasFC',               'UCHqgfi07qgscpyjlvibkYjw', 'MX', 'club', null, 'mx-atlas',         true,  '2026-09-14', 'Official.'),
    ('mx-necaxa',            'Club Necaxa',           'UC9MFlukQZouuvQYCOFQZM_g', 'MX', 'club', null, 'mx-necaxa',        true,  '2026-09-14', 'Official. Media availability videos.'),
    ('mx-puebla',            'Club Puebla',           'UCYfsbb6LEbTfgfQmeZ56DoQ', 'MX', 'club', null, 'mx-puebla',        true,  '2026-09-14', 'Official.'),
    ('mx-queretaro',         'clubqueretaro',         'UCJtXEm9B7sY2ZeCATgRt--A', 'MX', 'club', null, 'mx-queretaro',     true,  '2026-09-14', 'Official.'),
    ('mx-tijuana',           'Xolos',                 'UCLowRs-GNZ2lSDqHB50YXgQ', 'MX', 'club', null, 'mx-tijuana',       true,  '2026-09-14', 'Official (Club Tijuana Xoloitzcuintles).'),
    ('mx-juarez',            'FC Juárez Oficial',     'UCBG46z8mfj69eSbzpLJIv_Q', 'MX', 'club', null, 'mx-juarez',        true,  '2026-09-14', 'Official.'),
    ('mx-san-luis',          'Atlético de San Luis',  'UCF-kaaSSk9rBEHa9MsfsGjA', 'MX', 'club', null, 'mx-san-luis',      true,  '2026-09-14', 'Official.'),
    ('mx-mazatlan',          'Mazatlán F. C.',        'UCm9E5Kxn7bS-nDvY1gNOnzg', 'MX', 'club', null, 'mx-mazatlan',      false, '2026-09-14', 'Answers; farewell video "¡GRACIAS, MAZATLÁN! ¡Hasta Siempre!" 2026-04-30, no uploads since (Atlante plays Apertura 2026).'),

    -- Honduras
    ('hn-liga-hondubet',     'Liga Hondubet',         'UCFqKZtftTE89-_9BSgNkHbA', 'HN', 'league',      'Liga Nacional de Honduras', null, true, '2026-09-14', 'The league''s own channel (Liga Nacional de Fútbol Profesional; the name is its sponsor''s, the channel is not a betting channel). Full matches, "Jornada 2 | Juticalpa 🆚 Olimpia"; last upload 2026-08-31.'),
    ('hn-deportes-tvc',      'Deportes TVC',          'UC4f_is0qbF8WTiJlPWqn8Rw', 'HN', 'broadcaster', null, null, true,  '2026-09-14', 'Televicentro, Honduras (not Mexico''s TVC Deportes). "Marathón 1 - 0 Olimpia | Jornada 7 | Liga Nacional", goals of the round.'),
    ('hn-multicable-tv',     'Multicable TV',         'UCtn76AnUkrOfY8RsDUS0pUg', 'HN', 'broadcaster', null, null, true,  '2026-09-15', 'Honduran cable broadcaster. "Resumen: Independiente 2 - 1 Juticalpa FC | Liga Nacional Hondubet | Jornada #7"; 8 of 15 highlights, some Liga de Ascenso. Owner review: no channel description.'),
    ('hn-todo-deportes-tv',  'Todo Deportes Televisión', 'UCTRG9mFx-cXwS7gLDempIUw', 'HN', 'broadcaster', null, null, false, '2026-09-14', 'Answers; 0 of 12 uploads were highlights (live streams and talk).'),
    ('hn-fox-deportes-hn',   'FOX Deportes Honduras', 'UCIJ3wcqSJLVTpbiqiAXlCIg', 'HN', 'broadcaster', null, null, false, '2026-09-14', 'Answers; 0 of 15 uploads were highlights (Cuadro Titular, Nación CA talk).'),
    ('hn-ffh-plus',          'FFH +',                 'UCXsRTXF0dnHYJ6ovw48C-Uw', 'HN', 'national', null, null, true, '2026-09-15', 'The Federación de Fútbol de Honduras'' own channel. 12 uploads in 30 days, 3 Shorts: media days with the national coach, podcast, referee analysis (only titles naming the national team count for it). FENAFUTH TV (2021) and older channels are dead.'),
    ('hn-motagua',           'Fútbol Club Motagua',   'UC3vyoFgqX3OcPpeeFKRo6Eg', 'HN', 'club', null, 'hn-motagua',       true,  '2026-09-14', 'Official ("Videos del Club Deportivo Motagua"). Quiet: last upload 2026-06-01.'),
    ('hn-olimpia',           'Club Olimpia Deportivo', 'UCIw0Cl5h-_ryNXdiQ-bd9eQ', 'HN', 'club', null, 'hn-olimpia',       true,  '2026-09-14', 'Official. "Olimpia 4-1 Platense | Noche de goles en Comayagua | Resumen Jornada 6".'),
    ('hn-real-espana',       'Real Club Deportivo España', 'UCyCaWyXKAn7rnB4I4-Rlcsg', 'HN', 'club', null, 'hn-real-espana', true, '2026-09-14', 'Official. Press conferences.'),
    ('hn-victoria',          'Club Deportivo Victoria', 'UCjeCcl63pLxIZElWxYBZTDw', 'HN', 'club', null, 'hn-victoria',     true,  '2026-09-14', 'Official (La Ceiba). Mostly Shorts; plays Tela FC and Brasilia (Liga de Ascenso) in 2026.'),

    -- Guatemala
    ('gt-guatefutbol-tv',    'Guatefutbol TV',        'UCrQPjh78VarES_UlQx7lcvQ', 'GT', 'broadcaster', null, null, true,  '2026-09-14', 'Guatefutbol, the sports outlet (since 2004), not a rights holder: the only Guatemalan channel found posting Liga Nacional highlights ("Guastatoya 2-1 Xelajú MC | Jornada 9").'),
    ('gt-tikitaka',          'Tiki Taka de Guatemala', 'UCrBfPiS8j0qbWpLQ8eLfwqA', 'GT', 'broadcaster', null, null, true, '2026-09-15', 'Radio sports show, not a rights holder. "Goles: Cobán 2 Comunicaciones 2"; 5 of 15 goals, the rest its daily talk show. Owner review, like Guatefutbol.'),
    ('gt-fox-deportes-gt',   'FOX Deportes Guatemala', 'UCfyCsDRRaATpnl4DjBWaYDw', 'GT', 'broadcaster', null, null, true, '2026-09-14', 'Answers; about 450 uploads a month, mostly Cuadro Titular talk, with match summaries.'),
    ('gt-nuestro-diario',    'Nuestro Diario',        'UCWf3wqYFaQFG1691Hnz5M2w', 'GT', 'broadcaster', null, null, false, '2026-09-15', 'Answers; 14 of 15 uploads general-news Shorts, one match summary.'),
    ('gt-fedefut',           'FEDEFUT Guatemala',     'UCM61_vHqR8XM0Kv9ol9-fNQ', 'GT', 'national', null, null, false, '2026-09-15', 'The federation''s official channel. Answers; last upload 2022-12 (youth sides). Guatemala''s national team reaches members only through other channels'' titles.'),
    ('gt-comunicaciones',    'Comunicaciones FC',     'UCxAz8u_qidmGIXgkurm3Axg', 'GT', 'club', null, 'gt-comunicaciones', true, '2026-09-14', 'Official. Quiet: last upload 2026-07-16.'),

    -- Jamaica
    ('jm-jpl-tv',            'Jamaica Premier League TV', 'UCF46mF1YoLQV_PNZL3rlDEg', 'JM', 'league', 'Jamaica Premier League', null, true, '2026-09-14', 'The league''s channel. Full matches live ("LIVE: Tivoli Gardens vs Humble Lion FC | Match Day 1"), no highlights.'),
    ('jm-tvj',               'Television Jamaica',    'UC1Ga-Hv1-dLz9zoAz81d9tA', 'JM', 'broadcaster', null, null, true, '2026-09-15', 'TVJ Sports: JPL goal clips and matches ("3–2! Arnett Gardens Fight Back After Tajay Grant''s Second | JPL | TVJ Sports"); about half its uploads are news and Smile Jamaica (not highlights).'),
    ('jm-jfflive',           'JFFLIVE',               'UCUwYHdAcd69ewlQ0Nq2J1Tw', 'JM', 'national', null, null, true, '2026-09-15', 'The Jamaica Football Federation''s channel: Reggae Boyz and Reggae Girlz (told apart by title words; titles naming neither count for no one). Quiet: last upload 2026-07-22. Three older JFF channels are dead (2016, 2019, 2023).'),
    ('jm-montego-bay-united', 'Montego Bay United FC TV', 'UCaP-36FJZuOoIvahfNFq3CA', 'JM', 'club', null, 'jm-montego-bay-united', true, '2026-09-14', 'Official. "Montego Bay United vs Harbour View - Extended Match Highlights".'),
    ('jm-mount-pleasant',    'Mount Pleasant FA TV',  'UCShU46qUVJvCwrzcs4V7DBA', 'JM', 'club', null, 'jm-mount-pleasant', true,  '2026-09-14', 'Official. Highlights and press conferences (JPL and Caribbean Cup).'),
    ('jm-waterhouse',        'Waterhouse Football Club', 'UC6c-gPAf-emhWgDnCuZbCgg', 'JM', 'club', null, 'jm-waterhouse',  true,  '2026-09-14', 'Official. "Match Highlights | Waterhouse 1-0 Montego Bay United"; long uploads last 2026-03-11.'),
    ('jm-humble-lions',      'HumblelionFC',          'UCD7AH8uN1FQNVMr3TKJcZ5A', 'JM', 'club', null, 'jm-humble-lions',  true,  '2026-09-14', 'Official. Full matches.'),
    ('jm-portmore-united',   'Portmore United FC',    'UC6PvwWuog7i1-FjJwXuvRpA', 'JM', 'club', null, 'jm-portmore-united', true, '2026-09-14', 'Official. Quiet: last upload 2026-05-12.'),
    ('jm-harbour-view',      'Harbour View FC',       'UCWSyKiyk_-FjgsZ9X0vbuxw', 'JM', 'club', null, 'jm-harbour-view',  true,  '2026-09-14', 'Official. Quiet: last upload 2026-03-15.'),
    ('jm-arnett-gardens',    'Arnett Gardens FC',     'UCyJ_s3Su5vZuekygIiwaMvQ', 'JM', 'club', null, 'jm-arnett-gardens', false, '2026-09-14', 'Answers; no uploads since 2025-12-30.'),
    ('jm-molynes-united',    'Molynes United',        'UCcZXBvlhElNxOcP3GIG_RjQ', 'JM', 'club', null, 'jm-molynes-united', false, '2026-09-14', 'Answers; no uploads since 2024-10-09.'),

    -- The confederation: its club tournaments (Copa Centroamericana, Caribbean Cup) and national-team tournaments.
    ('cc-concacaf',          'Concacaf',              'UCqn7r-so0mBLaJTtTms9dAQ', null, 'confederation', null, null, true, '2026-09-15', 'Official. "Motagua toma ventaja en los Cuartos de Final | Extended Highlights | Copa Centroamericana"; 8 of 15 highlights. Its videos reach members only by a stored club or national-team match.')
  ) v(key, name, channel_id, country, kind, league, club_key, active, verified, notes)
on conflict (key) do update
  set name = excluded.name, youtube_channel_id = excluded.youtube_channel_id, country = excluded.country,
      league_id = excluded.league_id, club_key = excluded.club_key, kind = excluded.kind, women = excluded.women, active = excluded.active,
      verified_at = excluded.verified_at, notes = excluded.notes;

do $$
begin
  if exists (select 1 from video_channels where kind = 'league' and league_id is null) then
    raise exception 'a league channel''s league is not in leagues';
  end if;
end $$;
