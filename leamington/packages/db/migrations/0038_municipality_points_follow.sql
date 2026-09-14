-- 0038_municipality_points_follow.sql
-- When the catalog corrects a municipality's point, everything built on the old
-- point follows.
--
-- The seeds now place each municipio at its seat (cabecera) instead of the
-- GeoNames ADM2 point, which could be far from town: La Ceiba's was 10 km away
-- and 1,200 m up Pico Bonito, so its forecast ran 7° cold. Clients keep a copy
-- of the point for alert matching (0002, 0020), and forecasts are fetched for
-- it. On a move, the copies are updated, and the move's forecasts made for the
-- old point are deleted so they are never shown as the new point's. The page
-- shows no forecast for that town until the next forecast run, never a wrong one.

create or replace function app.municipality_point_moved()
returns trigger language plpgsql set search_path = public, app as $$
begin
  update clients set municipality_lat = new.lat, municipality_lng = new.lng
   where municipality_id = new.id;
  delete from forecasts where municipality_id = new.id;
  return new;
end $$;

create trigger municipalities_point_moved
  after update of lat, lng on municipalities
  for each row when (old.lat is distinct from new.lat or old.lng is distinct from new.lng)
  execute function app.municipality_point_moved();

-- Copies that already differ from their municipality.
update clients c
   set municipality_lat = m.lat, municipality_lng = m.lng
  from municipalities m
 where m.id = c.municipality_id
   and (c.municipality_lat is distinct from m.lat or c.municipality_lng is distinct from m.lng);
