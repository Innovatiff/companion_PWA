-- 0017_code_alphabet.sql
-- Access codes must come from the unambiguous alphabet, enforced by the database.
--
-- The code IS the account. An affiliate reads it aloud and the worker types it
-- on a cheap keyboard, so packages/shared/src/code.ts generates codes only from
-- ACDEFGHJKMNPQRTVWXYZ2346 (no O/0, I/1/L, S/5, B/8 or U) and repairs those
-- characters when they are typed ("0" becomes "Q", "1" becomes "J").
--
-- The table accepted any [A-Z0-9]{8}. A code inserted another way, containing
-- an O, a 1 or an S, could never be signed in with: normalisation turns the
-- typed character into a different one. The database now rejects such a code
-- at insert. No codes had been issued when this was applied.

alter table clients drop constraint clients_code_check;

alter table clients add constraint clients_code_alphabet
  check (code ~ '^[ACDEFGHJKMNPQRTVWXYZ2346]{8}$');
