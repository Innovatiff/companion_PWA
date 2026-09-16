-- 0053_page_views_all_pages.sql
-- Every Hoy page that records a view is an allowed page name.
--
-- 0029 listed the pages that existed then. Pages added since call
-- app.record_page_view with names the check refused: Hoy en Leamington (aqui),
-- Videos (futbol_videos), Miembro, Noticias, Tu semana, and Rastrear envío
-- (rastrear_envio). The app swallows the error so a page never fails for its
-- instrumentation, so those views were silently lost. That also kept those
-- opens out of what reads page_views: the explorador and fiel badges (0041) and
-- the days opened on Tu semana (0045).
--
-- apps/app/test/page-views.test.mjs checks that every recordView name in the
-- app is in the newest version of this constraint.

alter table page_views drop constraint page_views_page_check;
alter table page_views add constraint page_views_page_check
  check (page in ('futbol', 'clima', 'mas', 'tasa', 'feriados', 'escuela', 'consulado',
                  'emergencias', 'transporte', 'loteria', 'setup', 'avisos', 'expiry',
                  'aqui', 'futbol_videos', 'miembro', 'noticias', 'semana', 'rastrear_envio'));
