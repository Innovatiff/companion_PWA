-- 0030_voided_periods_do_not_block.sql
-- A voided payment no longer blocks the next renewal.
--
-- subscriptions_no_overlap_idx (0002) kept one row per (client_id, period_start)
-- including voided rows. Renewal dates are computed from paid, unvoided
-- periods only (0029), so after a voided renewal the next one got the voided
-- row's start date and failed with a unique violation: the client could never
-- be renewed again, from the affiliate portal or from admin.
--
-- One active period per start date still holds; voided rows are history.

drop index subscriptions_no_overlap_idx;
create unique index subscriptions_no_overlap_idx
  on subscriptions (client_id, period_start)
  where voided_at is null;
