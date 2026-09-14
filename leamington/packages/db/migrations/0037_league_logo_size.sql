-- 0037_league_logo_size.sql
-- League logos may be up to 150 KB.
--
-- The provider's league logos are 110–135 KB, over the 50 KB team crest budget,
-- so none could be stored. There are four, each downloaded once per phone and
-- cached for 30 days, shown on the Fútbol page only. Team crests stay at 50 KB,
-- and the provider's stock "logo soon" image is still refused (ingest crests feed).

alter table league_crests drop constraint league_crests_bytes_check;
alter table league_crests add constraint league_crests_bytes_check check (octet_length(bytes) between 1 and 150000);
