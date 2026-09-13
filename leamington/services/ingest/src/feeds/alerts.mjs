/**
 * Weather alert ingest.
 *
 * Route preference per source:
 *   1. the agency's own CAP endpoint (canonical)
 *   2. the Alert Hub country feed, FILTERED to the national issuing source
 *
 * Route 2 is a fallback, never a shortcut: the hub's country feeds are
 * geographic filters. Without the hub_source_id filter, Honduras's feed is
 * 100% Belize-issued.
 */

import { query, withTransaction } from "../db.mjs";
import { fetchText } from "../run-feed.mjs";
import { extractFeedLinks, sourceIdFromUrl, parseCapDocument } from "./cap.mjs";

export async function loadActiveSources() {
  const { rows } = await query(
    `select id, country, agency, kind, feed_url, hub_feed_url, hub_source_id,
            push_levels, include_area_desc
       from alert_sources where active and kind = 'cap' order by country`,
  );
  return rows;
}

/** Fetch the list of candidate CAP document URLs for a source. */
async function collectLinks(source, log) {
  const errors = [];

  if (source.feed_url) {
    try {
      const { body } = await fetchText(source.feed_url);
      const links = extractFeedLinks(body);
      if (links.length) {
        log.info("route.agency", { url: source.feed_url, items: links.length });
        return { links, route: "agency", errors };
      }
      // Answered but empty: a real fact, not an error. Fall through to the hub
      // only because an agency feed with zero items may simply be quiet.
      log.info("route.agency.empty", { url: source.feed_url });
      return { links: [], route: "agency", errors };
    } catch (err) {
      errors.push(`agency: ${err.message}`);
      log.warn("route.agency.failed", { url: source.feed_url, error: err.message });
    }
  }

  if (source.hub_feed_url) {
    const { body } = await fetchText(source.hub_feed_url);
    const all = extractFeedLinks(body);
    // THE FILTER. Everything not issued by the national source is discarded.
    const links = all.filter((l) => sourceIdFromUrl(l.link) === source.hub_source_id);
    const discarded = all.length - links.length;
    log.info("route.hub", {
      url: source.hub_feed_url, items: all.length,
      national: links.length, discardedForeign: discarded,
      hubSourceId: source.hub_source_id,
    });
    if (all.length && links.length === 0) {
      log.warn("route.hub.no_national_items", {
        hubSourceId: source.hub_source_id,
        note: "country feed carried only foreign-issued alerts; nothing ingested",
      });
    }
    return { links, route: "hub", errors };
  }

  // No route answered. This is INCONCLUSIVE, not "no alerts".
  const e = new Error(`no usable route (${errors.join("; ") || "no feed configured"})`);
  e.inconclusive = true;
  throw e;
}

/** Which of these CAP identifiers do we already have? */
async function filterNew(sourceId, docs) {
  if (!docs.length) return [];
  const { rows } = await query(
    `select cap_identifier, cap_sent from weather_alerts
      where source_id = $1 and cap_identifier = any($2::text[])`,
    [sourceId, docs.map((d) => d.capIdentifier).filter(Boolean)],
  );
  const seen = new Set(rows.map((r) => `${r.cap_identifier}|${r.cap_sent?.toISOString?.() ?? r.cap_sent}`));
  return docs.filter((d) => {
    const sent = d.capSent ? new Date(d.capSent).toISOString() : null;
    return !seen.has(`${d.capIdentifier}|${sent}`);
  });
}

async function insertAlert(client, source, doc) {
  const { rows } = await client.query(
    `insert into weather_alerts (
        source_id, country, cap_identifier, cap_sender, cap_sent, msg_type,
        event, headline, description, instruction, area_desc,
        severity_raw, level, issued_at, effective_at, expires_at,
        area_geog, center_geog, radius_m, source_url, raw)
     values (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13::alert_level,$14,$15,$16,
        case when array_length($17::text[],1) is null then null
             else extensions.ST_Multi(extensions.ST_Collect(
                    array(select extensions.ST_GeomFromText(w,4326)
                            from unnest($17::text[]) w)))::extensions.geography
        end,
        case when $18::text is null then null
             else extensions.ST_GeomFromText($18,4326)::extensions.geography end,
        $19, $20, jsonb_build_object('xml', $21::text))
     on conflict (source_id, cap_identifier, cap_sent) do nothing
     returning id`,
    [
      source.id, source.country, doc.capIdentifier, doc.capSender, doc.capSent, doc.msgType,
      doc.event, doc.headline, doc.description, doc.instruction, doc.areaDesc,
      doc.severityRaw, doc.level, doc.issuedAt, doc.effectiveAt, doc.expiresAt,
      doc.polygonWkts.length ? doc.polygonWkts : null,
      doc.centerWkt, doc.radiusM, doc.sourceUrl, doc.raw,
    ],
  );
  return rows[0]?.id ?? null;
}

/**
 * Queue notifications for one alert, by polygon match.
 * Push policy is per-source (Jamaica red+orange; Mexico red only + areaDesc).
 */
async function queueForAlert(client, alertId, log) {
  const { rows: [policy] } = await client.query(
    `select app.should_push($1) as should_push,
            app.alert_notification_body($1) as body,
            a.event, a.level, a.country
       from weather_alerts a where a.id = $1`, [alertId]);

  if (!policy?.should_push) {
    log.info("alert.no_push", { alertId, alertLevel: policy?.level,
      note: "displays in-app only, per source push policy" });
    return 0;
  }

  // Point-in-polygon against client municipality coordinates.
  const { rows: matches } = await client.query(
    `select client_id, is_home from app.clients_for_alert($1)`, [alertId]);

  let queued = 0;
  for (const m of matches) {
    const { rows: [r] } = await client.query(
      `select app.queue_notification(
         c.id,
         (now() at time zone c.timezone)::date,
         'weather_alert',
         $2,
         app.alert_notification_body($1),
         now(),
         $1,
         null) as outcome
       from clients c where c.id = $3`,
      [alertId, policy.event, m.client_id],
    );
    if (r?.outcome === "queued" || r?.outcome === "replaced") queued++;
  }

  log.info("alert.queued", {
    alertId, alertLevel: policy.level, matched: matches.length, queued,
  });
  return queued;
}

export async function ingestAlerts(ctx) {
  const { log } = ctx;
  const sources = await loadActiveSources();
  if (!sources.length) {
    log.warn("no_active_sources", { note: "alerts launch one country at a time" });
    return { recordsWritten: 0 };
  }

  let written = 0;

  for (const source of sources) {
    const { links, route } = await collectLinks(source, log);

    // Newest first, and cap the per-run fetch so a backfill cannot stall a
    // 15-minute cadence.
    const limit = Number(process.env.ALERT_FETCH_LIMIT || 25);
    const candidates = links.slice(0, limit);

    const docs = [];
    for (const l of candidates) {
      try {
        const { body } = await fetchText(l.link, { timeoutMs: 20_000 });
        const doc = parseCapDocument(body, l.link);
        if (doc?.capIdentifier) docs.push(doc);
        else ctx.warnings.push(`unparseable CAP document: ${l.link}`);
      } catch (err) {
        // One bad document must not fail the run; record it as partial.
        ctx.warnings.push(`fetch failed ${l.link}: ${err.message}`);
        log.warn("document.failed", { url: l.link, error: err.message });
      }
    }

    const fresh = await filterNew(source.id, docs);
    log.info("documents", {
      country: source.country, route,
      fetched: docs.length, new: fresh.length, alreadyStored: docs.length - fresh.length,
    });

    for (const doc of fresh) {
      await withTransaction(async (client) => {
        const id = await insertAlert(client, source, doc);
        if (!id) return;                       // raced with another run
        written++;
        if (!doc.polygonWkts.length && !doc.centerWkt) {
          // Without geometry we cannot do municipality matching, and we will
          // not fall back to name matching.
          ctx.warnings.push(`alert ${doc.capIdentifier} has no geometry; stored, not matched`);
          log.warn("alert.no_geometry", { alertId: id, areaDesc: doc.areaDesc });
          return;
        }
        await queueForAlert(client, id, log);
      });
    }
  }

  return { recordsWritten: written };
}
