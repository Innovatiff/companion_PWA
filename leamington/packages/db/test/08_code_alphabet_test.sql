-- Access codes outside the unambiguous alphabet are rejected by the database,
-- not just by the app. A code nobody can type is an account nobody can open.
\set ON_ERROR_STOP on

insert into affiliates (id, name) values ('88888888-8888-4888-8888-888888888888', 'Code Alphabet Test')
on conflict do nothing;

-- --------------------------------------------------------------------------
-- Ambiguous characters, lowercase, wrong length and separators are rejected
-- --------------------------------------------------------------------------
do $$
declare
  bad      text;
  rejected integer := 0;
begin
  foreach bad in array array[
    'QQQQQQQO', 'QQQQQQQ0', 'QQQQQQQI', 'QQQQQQQ1', 'QQQQQQQL',
    'QQQQQQQS', 'QQQQQQQ5', 'QQQQQQQB', 'QQQQQQQ8', 'QQQQQQQU',
    'qqqqqqqq', 'QQQQQQQ', 'QQQQQQQQQ', 'QQQQ-QQQ'
  ] loop
    begin
      insert into clients (affiliate_id, code, full_name, country)
      values ('88888888-8888-4888-8888-888888888888', bad, 'Alphabet Test', 'HN');
      raise exception 'code % was accepted', bad;
    exception when check_violation then
      rejected := rejected + 1;
    end;
  end loop;
  assert rejected = 14, format('expected 14 rejections, got %s', rejected);
  raise notice 'PASS codes: O/0, I/1, L, S/5, B/8, U, lowercase, wrong length and separators are rejected';
end $$;

-- --------------------------------------------------------------------------
-- Every symbol of the alphabet is accepted
-- --------------------------------------------------------------------------
do $$
begin
  insert into clients (affiliate_id, code, full_name, country) values
    ('88888888-8888-4888-8888-888888888888', 'ACDEFGHJ', 'Alphabet Test', 'HN'),
    ('88888888-8888-4888-8888-888888888888', 'KMNPQRTV', 'Alphabet Test', 'HN'),
    ('88888888-8888-4888-8888-888888888888', 'WXYZ2346', 'Alphabet Test', 'HN');
  assert (select count(*) from clients where code in ('ACDEFGHJ', 'KMNPQRTV', 'WXYZ2346')) = 3;
  raise notice 'PASS codes: every symbol of the alphabet is accepted';
end $$;
