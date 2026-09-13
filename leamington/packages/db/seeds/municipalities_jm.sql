-- Jamaican towns, for the alerts launch country.
-- Coordinates are what alert matching actually uses; the name is for display.
insert into municipalities (country, admin_region, name, lat, lng, timezone) values
  ('JM','Kingston',      'Kingston',         17.9714, -76.7931,'America/Jamaica'),
  ('JM','St. Andrew',    'Half Way Tree',    18.0107, -76.7975,'America/Jamaica'),
  ('JM','St. Catherine', 'Spanish Town',     17.9910, -76.9574,'America/Jamaica'),
  ('JM','St. Catherine', 'Portmore',         17.9500, -76.8800,'America/Jamaica'),
  ('JM','St. James',     'Montego Bay',      18.4762, -77.8939,'America/Jamaica'),
  ('JM','St. Ann',       'Ocho Rios',        18.4074, -77.1031,'America/Jamaica'),
  ('JM','Westmoreland',  'Negril',           18.2689, -78.3450,'America/Jamaica'),
  ('JM','Westmoreland',  'Savanna-la-Mar',   18.2190, -78.1330,'America/Jamaica'),
  ('JM','Portland',      'Port Antonio',     18.1794, -76.4500,'America/Jamaica'),
  ('JM','Manchester',    'Mandeville',       18.0417, -77.5072,'America/Jamaica'),
  ('JM','Clarendon',     'May Pen',          17.9647, -77.2456,'America/Jamaica'),
  ('JM','St. Mary',      'Port Maria',       18.3687, -76.8900,'America/Jamaica')
on conflict (country, admin_region, name) do nothing;
