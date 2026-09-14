-- News outlets for Noticias (0047). Idempotent on key.
-- Rules (docs/OPEN-DECISIONS.md 3.24):
--   * only the publisher's own RSS/Atom feed, served from its own domain, whether
--     or not its pages link to it (no scraping, no third-party aggregators);
--   * active only while the feed answers with fresh, dated items (re-verified
--     live 2026-09-14); a feed that stops doing so is set inactive with a note;
--   * admin_region is null for a national outlet, else the exact
--     municipalities.admin_region text (checked by a trigger);
--   * show_images false keeps an outlet's stories and drops its pictures.
-- Items/day and pictures are what the verification saw on 2026-09-14.
insert into news_sources (key, name, country, admin_region, homepage_url, feed_url, language, active, verified_at, notes) values
  -- Mexico, national
  ('mx-el-financiero', 'El Financiero', 'MX', null, 'https://www.elfinanciero.com.mx/',
   'https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml', 'es', true, '2026-09-14',
   'Listed on its /rss/ page. ~60/day, media:content pictures on every item (its image CDN often drops connections; retried once).'),
  ('mx-sdp-noticias', 'SDPnoticias', 'MX', null, 'https://www.sdpnoticias.com/',
   'https://www.sdpnoticias.com/arc/outboundfeeds/rss/?outputType=xml', 'es', true, '2026-09-14',
   'Advertised by <link rel="alternate">. ~75/day, media:content pictures on every item.'),
  ('mx-infobae-mexico', 'Infobae México', 'MX', null, 'https://www.infobae.com/mexico/',
   'https://www.infobae.com/arc/outboundfeeds/rss/category/mexico/', 'es', true, '2026-09-14',
   'Advertised by <link rel="alternate"> on its Mexico section. ~100/day, media:content pictures on every item.'),
  ('mx-el-universal', 'El Universal', 'MX', null, 'https://www.eluniversal.com.mx/',
   'https://www.eluniversal.com.mx/arc/outboundfeeds/rss/?outputType=xml', 'es', true, '2026-09-14',
   'Own feed on its domain, not linked from its pages. ~100/day, media:content pictures on every item.'),
  ('mx-la-jornada', 'La Jornada', 'MX', null, 'https://www.jornada.com.mx/',
   'https://www.jornada.com.mx/rss/edicion.xml', 'es', true, '2026-09-14',
   'Own feed on its domain, not linked. The daily print edition (~107 items, all stamped at publication). No pictures: og:image is a 404 default.'),
  -- Mexico, Michoacán
  ('mx-la-voz-de-michoacan', 'La Voz de Michoacán', 'MX', 'Michoacán', 'https://www.lavozdemichoacan.com.mx/',
   'https://www.lavozdemichoacan.com.mx/feed/', 'es', true, '2026-09-14',
   'Morelia. Advertised by <link rel="alternate">. Only the latest 5 items (~50/day). og:image pictures (~60 KB JPEG).'),
  ('mx-quadratin-michoacan', 'Quadratín Michoacán', 'MX', 'Michoacán', 'https://www.quadratin.com.mx/',
   'https://www.quadratin.com.mx/feed/', 'es', true, '2026-09-14',
   'Morelia. Own feed on its domain, not linked. Latest 10 items (~160/day, with national items). media:content pictures.'),
  -- Mexico, Chiapas
  ('mx-el-orbe', 'El Orbe', 'MX', 'Chiapas', 'https://elorbe.com/',
   'https://elorbe.com/feed', 'es', true, '2026-09-14',
   'Tapachula. Advertised by <link rel="alternate">. 10 items, ~20/day including national wire stories. og:image pictures (~70 KB JPEG).'),
  ('mx-alerta-chiapas', 'Alerta Chiapas', 'MX', 'Chiapas', 'https://alertachiapas.com/',
   'https://alertachiapas.com/feed/', 'es', true, '2026-09-14',
   'Tuxtla Gutiérrez. Advertised by <link rel="alternate">. Low volume (~1 per 2 days). Pictures as <img> in the description.'),
  ('mx-diario-del-sur', 'Diario del Sur', 'MX', 'Chiapas', 'https://oem.com.mx/diariodelsur',
   'https://oem.com.mx/diariodelsur/rss', 'es', true, '2026-09-14',
   'Tapachula (OEM). Own feed on its domain, not linked. ~16/day. og:image pictures.'),
  ('mx-el-heraldo-de-chiapas', 'El Heraldo de Chiapas', 'MX', 'Chiapas', 'https://oem.com.mx/elheraldodechiapas',
   'https://oem.com.mx/elheraldodechiapas/rss', 'es', true, '2026-09-14',
   'Tuxtla Gutiérrez (OEM). Own feed on its domain, not linked. ~14/day. og:image pictures.'),
  -- Guatemala, national
  ('gt-prensa-libre', 'Prensa Libre', 'GT', null, 'https://www.prensalibre.com/',
   'https://www.prensalibre.com/feed/', 'es', true, '2026-09-14',
   'Advertised by <link rel="alternate">. ~60/day. media:content url is empty; og:image pictures.'),
  ('gt-la-hora', 'La Hora', 'GT', null, 'https://lahora.gt/',
   'https://lahora.gt/feed/', 'es', true, '2026-09-14',
   'Advertised by <link rel="alternate">. Only the latest 10 items (~190/day). og:image pictures.'),
  ('gt-publinews', 'Publinews Guatemala', 'GT', null, 'https://www.publinews.gt/gt',
   'https://www.publinews.gt/arc/outboundfeeds/rss/?outputType=xml', 'es', true, '2026-09-14',
   'Own feed on its domain, not linked. ~30/day, pictures on every item.'),
  ('gt-republica', 'República', 'GT', null, 'https://republica.com/',
   'https://republica.com/feed', 'es', true, '2026-09-14',
   'Own feed on its domain, not linked; republica.gt/feed/ redirects here. ~15/day, og:image pictures.'),
  ('gt-emisoras-unidas', 'Emisoras Unidas', 'GT', null, 'https://emisorasunidas.com/',
   'https://emisorasunidas.com/feed/', 'es', true, '2026-09-14',
   'Own feed on its domain, not linked. ~18/day, pictures in the description.'),
  -- Honduras, national
  ('hn-la-prensa', 'La Prensa', 'HN', null, 'https://www.laprensa.hn/',
   'https://www.laprensa.hn/rss/portada', 'es', true, '2026-09-14',
   'San Pedro Sula-based, national in scope (it has no San Pedro Sula feed: rss/san-pedro-sula and rss/zona-norte are 404); mentions carry San Pedro Sula. Own feed on its domain, not linked. Front page, ~27/day, pictures on every item.'),
  ('hn-el-heraldo', 'El Heraldo', 'HN', null, 'https://www.elheraldo.hn/',
   'https://www.elheraldo.hn/rss/portada', 'es', true, '2026-09-14',
   'Tegucigalpa-based, national in scope. Own feed on its domain, not linked. Front page, ~27/day, pictures on every item.'),
  ('hn-proceso-digital', 'Proceso Digital', 'HN', null, 'https://proceso.hn/',
   'https://proceso.hn/feed/', 'es', true, '2026-09-14',
   'Own feed on its domain, not linked. ~95/day. No pictures: none in the feed, and article pages answer a bot check.'),
  ('hn-hch', 'HCH', 'HN', null, 'https://hch.tv/',
   'https://hch.tv/feed/', 'es', true, '2026-09-14',
   'Advertised by <link rel="alternate">. Latest 10 items (~70/day), much crime news. Some summaries empty. og:image pictures, watermarked.'),
  ('hn-hondudiario', 'Hondudiario', 'HN', null, 'https://www.hondudiario.com/',
   'https://www.hondudiario.com/feed/', 'es', true, '2026-09-14',
   'Advertised by <link rel="alternate">. Latest 10 items (~250/day, much international wire). og:image often AVIF or PNG (AVIF is not used).'),
  ('hn-criterio', 'Criterio.hn', 'HN', null, 'https://criterio.hn/',
   'https://criterio.hn/feed/', 'es', true, '2026-09-14',
   'Advertised by <link rel="alternate">. ~3/day, investigative. og:image often WebP (not used). Answers HTTP 429 to rapid repeated fetches.'),
  -- Honduras, Francisco Morazán (Tegucigalpa)
  ('hn-el-heraldo-tegucigalpa', 'El Heraldo (Tegucigalpa)', 'HN', 'Francisco Morazán', 'https://www.elheraldo.hn/',
   'https://www.elheraldo.hn/rss/tegucigalpa', 'es', true, '2026-09-14',
   'El Heraldo''s own Tegucigalpa section feed. ~5/day, pictures on every item.'),
  -- Jamaica, national
  ('jm-gleaner', 'The Gleaner', 'JM', null, 'https://jamaica-gleaner.com/',
   'https://jamaica-gleaner.com/feed/news.xml', 'en', true, '2026-09-14',
   'Listed on its /rss page. Latest 10 news items (~20/day). http links (upgraded to https). No feed pictures: og:image, often unreachable.'),
  ('jm-observer', 'Jamaica Observer', 'JM', null, 'https://www.jamaicaobserver.com/',
   'https://www.jamaicaobserver.com/app/news/', 'en', true, '2026-09-14',
   'Listed on its /rssfeeds page (redirects to app-feed-category/?category=news). 25 items, ~15/day, media:content pictures.'),
  ('jm-observer-western', 'Jamaica Observer (Western)', 'JM', null, 'https://www.jamaicaobserver.com/',
   'https://www.jamaicaobserver.com/app/westernnews/', 'en', true, '2026-09-14',
   'Listed on its /rssfeeds page. Western bureau (Montego Bay): St James, Hanover, Westmoreland, Trelawny, so no single parish; ~1/day, media:content pictures. Its towns reach members through mentions.'),
  ('jm-jis', 'Jamaica Information Service', 'JM', null, 'https://jis.gov.jm/',
   'https://jis.gov.jm/feed/', 'en', true, '2026-09-14',
   'Government news agency. Advertised by <link rel="alternate">. ~8/day, no pictures in feed or og:image.')
on conflict (key) do update
  set name = excluded.name, country = excluded.country, admin_region = excluded.admin_region,
      homepage_url = excluded.homepage_url, feed_url = excluded.feed_url, language = excluded.language,
      active = excluded.active, verified_at = excluded.verified_at, notes = excluded.notes;
