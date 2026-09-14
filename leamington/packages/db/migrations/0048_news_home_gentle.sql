-- 0048_news_home_gentle.sql
-- Home's news card never leads with deaths or violence.
--
-- The first home card showed two headlines about shootings under the lead
-- story: the first thing a member reads in the morning. Stories whose picture is
-- suppressed for death or violence (0047, news_items.image_suppressed) stay on
-- the Noticias page, unchanged; the home card picks its two headlines from the
-- other stories. The lead already needs a picture, so it could never be one.

create or replace function app.news_home(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_p     jsonb;
  v_lead  jsonb;
  v_more  jsonb;
begin
  v_p := app.news_page(p_client_id, p_now, 30);
  if v_p is null then
    return null;
  end if;
  select e into v_lead from (
    select e, 1 as sec, o from jsonb_array_elements(v_p->'local') with ordinality a(e, o) where (e->>'image')::boolean
    union all
    select e, 2, o from jsonb_array_elements(v_p->'national') with ordinality a(e, o) where (e->>'image')::boolean
  ) s order by sec, o limit 1;

  select jsonb_agg(e order by sec, o) into v_more from (
    select e, sec, o from (
      select e, 1 as sec, o from jsonb_array_elements(v_p->'local') with ordinality a(e, o)
      union all
      select e, 2, o from jsonb_array_elements(v_p->'region') with ordinality a(e, o)
      union all
      select e, 3, o from jsonb_array_elements(v_p->'national') with ordinality a(e, o)
    ) all_items
    where (v_lead is null or (e->>'id') <> (v_lead->>'id'))
      and not exists (select 1 from news_items ni
                       where ni.id = (e->>'id')::bigint and ni.image_suppressed is not null)
    order by sec, o limit 2
  ) s;

  if v_lead is null and v_more is null then
    return null;
  end if;
  return jsonb_build_object('lead', v_lead, 'more', coalesce(v_more, '[]'::jsonb),
                            'updated_at', v_p->'updated_at', 'stale', v_p->'stale');
end $$;
