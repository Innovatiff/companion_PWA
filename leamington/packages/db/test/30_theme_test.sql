-- Modo noche (0046): auto by default, light or dark by choice, nothing else.
-- Uses the client of test 13.
\set ON_ERROR_STOP on
begin;

do $$
declare v_client uuid := '99990000-0000-4000-8000-0000000000b1';
begin
  assert (select theme from clients where id = v_client) = 'auto', 'auto by default';
  assert app.set_theme(v_client, 'dark') = 'dark';
  assert (select theme from clients where id = v_client) = 'dark';
  assert app.set_theme(v_client, 'light') = 'light';
  assert app.set_theme(v_client, 'auto') = 'auto';
  assert app.set_theme('00000000-0000-4000-8000-000000000000', 'dark') is null, 'no such client';
  begin
    perform app.set_theme(v_client, 'sepia');
    assert false, 'an unknown theme is refused';
  exception when check_violation then null;
  end;
  begin
    perform app.set_theme(v_client, null);
    assert false, 'null is refused';
  exception when check_violation then null;
  end;
  raise notice 'PASS theme: auto, light or dark, nothing else';
end $$;

rollback;
