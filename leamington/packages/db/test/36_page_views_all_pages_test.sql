-- Every page Hoy records a view for is accepted (0053); an unknown name is still refused.
\set ON_ERROR_STOP on

insert into affiliates (id, name) values ('99990000-0000-4000-8000-000000000053', 'Page Views Test') on conflict do nothing;
insert into clients (id, affiliate_id, code, full_name, country, language, active) values
  ('99990000-0000-4000-8000-000000000531', '99990000-0000-4000-8000-000000000053', 'PVWXMX34', 'Page Views', 'MX', 'es', true)
on conflict do nothing;

do $$
declare ok boolean;
  p text;
begin
  foreach p in array array['aqui', 'futbol_videos', 'miembro', 'noticias', 'semana', 'rastrear_envio'] loop
    perform app.record_page_view('99990000-0000-4000-8000-000000000531', p, '{}');
  end loop;
  assert (select count(distinct page) from page_views where client_id = '99990000-0000-4000-8000-000000000531') = 6,
    'every page added after 0029 records its view';
  begin
    perform app.record_page_view('99990000-0000-4000-8000-000000000531', 'nowhere', '{}');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'unknown pages are still refused';
  raise notice 'PASS page views: every Hoy page records its view; unknown names are refused';
end $$;
