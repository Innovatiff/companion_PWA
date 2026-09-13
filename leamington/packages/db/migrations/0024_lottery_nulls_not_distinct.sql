-- 0024_lottery_nulls_not_distinct.sql
-- One row per game, draw date and draw time, even when the operator publishes
-- no draw time.
--
-- Guatemala's Lotería Santa Lucía publishes no draw time, so draw_time_local is
-- null. A plain unique constraint treats nulls as distinct, so re-ingesting the
-- same draw could insert a duplicate. `nulls not distinct` (PostgreSQL 15+)
-- makes the upsert match.

alter table lottery_results drop constraint lottery_results_game_id_draw_date_draw_time_local_key;
alter table lottery_results
  add constraint lottery_results_one_per_draw unique nulls not distinct (game_id, draw_date, draw_time_local);
