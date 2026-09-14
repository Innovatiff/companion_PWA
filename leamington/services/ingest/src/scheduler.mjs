/**
 * Scheduling.
 *
 * Cadence per CLAUDE.md. Lottery is the interesting one: its schedule is built
 * from each game's published draw times rather than a fixed interval, because
 * Cash Pot draws six times a day and a periodic poller would show a stale
 * number for most of it.
 */
import { Cron } from "croner";
import { query } from "./db.mjs";
import { runFeed } from "./run-feed.mjs";
import { logger } from "./log.mjs";
import { checkStaleness } from "./monitor/staleness.mjs";

import { ingestAlerts } from "./feeds/alerts.mjs";
import { ingestFx } from "./feeds/fx.mjs";
import { ingestForecast } from "./feeds/forecast.mjs";
import { ingestCurrent } from "./feeds/current.mjs";
import { ingestLottery } from "./feeds/lottery.mjs";
import { ingestStatic } from "./feeds/static.mjs";
import { ingestFixtures } from "./feeds/fixtures.mjs";
import { sendDueNotifications, planEngagement } from "./feeds/notify.mjs";
import { ingestTownPhotos } from "./feeds/town-photos.mjs";
import { ingestCrests } from "./feeds/crests.mjs";

const log = logger("scheduler");

export const FIXED_JOBS = [
  { feed: "alerts:JM", cron: "*/15 * * * *", tz: "UTC",              fn: ingestAlerts,   label: "Jamaica CAP alerts" },
  { feed: "fx",        cron: "15 6 * * *",   tz: "America/Toronto",  fn: ingestFx,       label: "FX daily" },
  { feed: "forecast",  cron: "0 */6 * * *",  tz: "UTC",              fn: ingestForecast, label: "Forecast (3 providers)" },
  // OpenWeather only on the run in minutes 0-14 (its free quota; current.mjs).
  { feed: "current",   cron: "*/30 * * * *", tz: "UTC",              fn: ingestCurrent,  label: "Current conditions (3 providers)" },
  { feed: "static",    cron: "30 5 * * 1",   tz: "America/Toronto",  fn: ingestStatic,   label: "Static records (weekly)" },
  // Football by date query: 24 + 1 + 1 = 26 API-Football requests/day.
  { feed: "fixtures",  cron: "5 * * * *",    tz: "UTC", fn: (ctx) => ingestFixtures(ctx, { offsetDays: 0 }),  label: "Football fixtures today (hourly)" },
  { feed: "fixtures",  cron: "35 4 * * *",   tz: "UTC", fn: (ctx) => ingestFixtures(ctx, { offsetDays: -1 }), label: "Football results yesterday (late kickoffs)" },
  { feed: "fixtures",  cron: "35 12 * * *",  tz: "UTC", fn: (ctx) => ingestFixtures(ctx, { offsetDays: 1 }),  label: "Football fixtures tomorrow" },
  // Push: alerts go out within a minute of being queued; engagement is planned per client hour.
  { feed: "notify:send", cron: "* * * * *",         tz: "UTC", fn: (ctx) => sendDueNotifications(ctx), label: "Push delivery (alerts first)" },
  { feed: "notify:plan", cron: "2,17,32,47 * * * *", tz: "UTC", fn: (ctx) => planEngagement(ctx),       label: "Daily engagement planner" },
  // Pictures for new clients' towns and newly seen teams, from our own copies.
  { feed: "photos", cron: "40 5 * * *", tz: "America/Toronto", fn: (ctx) => ingestTownPhotos(ctx), label: "Hometown photos (daily, missing only)" },
  { feed: "crests", cron: "45 5 * * *", tz: "America/Toronto", fn: (ctx) => ingestCrests(ctx),     label: "Team crests (daily, missing only)" },
];

/**
 * Build one cron per draw time per game, firing a few minutes AFTER the draw so
 * the operator has published by the time we look.
 */
export async function lotteryJobs(delayMinutes = 4) {
  const { rows } = await query(
    `select id, country, operator, name, timezone, draw_times_local, draw_weekdays
       from lottery_games where active and array_length(draw_times_local,1) > 0`);

  const jobs = [];
  for (const g of rows) {
    const dow = g.draw_weekdays?.length ? g.draw_weekdays.join(",") : "*";
    for (const t of g.draw_times_local) {
      const [h, m] = String(t).split(":").map(Number);
      const total = h * 60 + m + delayMinutes;
      const cron = `${total % 60} ${Math.floor(total / 60) % 24} * * ${dow}`;
      jobs.push({
        feed: "lottery",
        cron, tz: g.timezone,
        label: `${g.name} draw ${String(t).slice(0, 5)} ${g.timezone}`,
        fn: ingestLottery,
      });
    }
  }
  // Several games share a draw slot (e.g. 21:04 Mexico City). One run covers
  // every game, so one job per (cron, timezone) is enough.
  const bySlot = new Map();
  for (const j of jobs) {
    const key = `${j.cron}|${j.tz}`;
    if (bySlot.has(key)) bySlot.get(key).label += `; ${j.label}`;
    else bySlot.set(key, { ...j });
  }
  return [...bySlot.values()];
}

// croner does not catch a job that throws unless given a handler, and the
// uncaught rejection exits the process -- one bad cycle would stop every feed.
const onJobError = (feed) => (err) =>
  log.error("job.threw", { feed, error: String(err?.message ?? err) });

export async function startScheduler({ dryRun = false } = {}) {
  const jobs = [...FIXED_JOBS, ...(await lotteryJobs())];
  const handles = [];

  for (const j of jobs) {
    log.info("job.registered", { feed: j.feed, cron: j.cron, tz: j.tz, label: j.label });
    if (dryRun) continue;
    handles.push(new Cron(j.cron, { timezone: j.tz, protect: true, catch: onJobError(j.feed) },
      () => runFeed(j.feed, j.fn)));
  }

  // Staleness runs often; it is the thing that notices everything else stopping.
  log.info("job.registered", { feed: "monitor:staleness", cron: "*/5 * * * *", tz: "UTC" });
  if (!dryRun) handles.push(new Cron("*/5 * * * *", { protect: true, catch: onJobError("monitor:staleness") },
    () => checkStaleness()));

  return { jobs, handles };
}
