-- 0046_theme.sql
-- Modo noche: each member chooses how Hoy looks.
--
-- 'auto' follows the phone's own light or dark setting (the default), 'light'
-- and 'dark' fix it. Stored per member, so it follows their code to a new
-- phone like the text size (0040).

alter table clients
  add column theme text not null default 'auto' check (theme in ('auto', 'light', 'dark'));

-- Returns the stored value, or null when no active client has that id. An
-- unknown theme raises check_violation. Secured like app.set_text_size.
create or replace function app.set_theme(p_client_id uuid, p_theme text)
returns text
language plpgsql
set search_path = public, app
as $$
declare
  v_theme text;
begin
  if p_theme is null or p_theme not in ('auto', 'light', 'dark') then
    raise exception 'unknown theme: %', coalesce(p_theme, 'null') using errcode = 'check_violation';
  end if;
  update clients set theme = p_theme where id = p_client_id and active returning theme into v_theme;
  return v_theme;
end $$;
