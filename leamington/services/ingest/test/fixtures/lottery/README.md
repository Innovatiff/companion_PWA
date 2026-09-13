# Lottery fixtures

Real responses from each operator's own site, fetched on **2026-09-13** with a
desktop Chrome User-Agent. The parsers in `src/feeds/lottery/` were written
against these files. Refresh one only by fetching it again from the same URL.

| File | URL | Fetched (UTC, approx.) |
| --- | --- | --- |
| `jm-svl-cash-pot.json` | `https://test-results.supremeventures.com/public/game/result/gameId/1/no/12` (header `Authorization: Bearer <ivr_api_key from supremeventures.com>`) | 2026-09-13 21:20 |
| `jm-svl-pick-3.json` | `.../public/game/result/gameId/7/no/10` | 2026-09-13 21:20 |
| `jm-svl-lotto.json` | `.../public/game/result/gameId/5/no/4` | 2026-09-13 21:20 |
| `mx-melate-resultados.html` | `https://www.loterianacional.gob.mx/Melate/Resultados` | 2026-09-13 21:35 |
| `mx-chispazo-resultados.html` | `https://www.loterianacional.gob.mx/Chispazo/Resultados` | 2026-09-13 21:35 |
| `mx-tris-resultados.html` | `https://www.loterianacional.gob.mx/Tris/Resultados` | 2026-09-13 21:35 |
| `gt-resultados-index.html` | `https://prociegosysordos.org.gt/resultados/` | 2026-09-13 21:15 |
| `gt-ordinario-3136.html` | `https://prociegosysordos.org.gt/resultados/ordinario/3136/` | 2026-09-13 21:30 |
| `gt-extraordinario-414.html` | `https://prociegosysordos.org.gt/resultados/extraordinario/414/` | 2026-09-13 21:40 |
| `hn-diaria-2026-09-12.json`, `hn-diaria-2026-09-13.json` | `https://loto.hn/api/resultados_diaria_por_fecha.php?fecha=<date>` | 2026-09-13 21:43 |
| `hn-juga3-2026-09-12.json`, `hn-juga3-2026-09-13.json` | `https://loto.hn/api/resultados_juga3_por_fecha.php?fecha=<date>` | 2026-09-13 21:43 |
| `hn-superpremio-2026-09-09.json`, `-12`, `-13` | `https://loto.hn/api/resultados_superpremio_por_fecha.php?fecha=<date>` | 2026-09-13 21:43-21:51 |

Local times at fetch: Mexico City and Tegucigalpa were ~15:45 on 2026-09-13
(so the 2026-09-13 21:00 draws were not yet out), Kingston ~16:20.

## Trimmed

- `gt-ordinario-3136.html` (395 KB) and `gt-extraordinario-414.html` (697 KB):
  the "Números premiados" table was cut to its first 20 and last 5 rows (870 of
  895 and 1583 of 1608 rows removed). The cut is marked in the file with a
  `FIXTURE TRIM` HTML comment. Everything the parser reads (heading, date,
  reintegros, main prizes) is untouched.

All other files are byte-for-byte as received.
