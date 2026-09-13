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
 *
 * Every run reports what the sources said -- listed alerts, confirmed nothing
 * is active, or did not answer -- as source_result.
 */

import { query, withTransaction } from "../db.mjs";
import { fetchText } from "../run-feed.mjs";
import { extractFeedLinks, sourceIdFromUrl, parseCapDocument, parseFeedIndex } from "./cap.mjs";

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
      const { documents, placeholders } = parseFeedIndex(body, source.feed_url);
      if (documents.length) {
        log.info("route.agency", { url: source.feed_url, items: documents.length });
        return { links: documents, route: "agency", result: "items", errors };
      }
      // Answered, with nothing active: a confirmed fact from the authority, not
      // an error and not a partial run. A placeholder entry linking back to the
      // feed is not fetched as a document, and the hub is not consulted -- the
      // agency has already answered.
      log.info("route.agency.confirmed_empty", {
        url: source.feed_url, placeholders: placeholders.length,
        agencyText: placeholders[0]?.title ?? null,
      });
      return { links: [], route: "agency", result: "confirmed_empty", errors };
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
    // The hub is only reached when the agency did not answer or has no feed. A
    // hub with nothing national is not the authority confirming quiet, so it is
    // never recorded as confirmed_empty.
    return { links, route: "hub", result: links.length ? "items" : "no_answer", errors };
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
        area_geog, center_geog, radius_m, source_url, raw, cap_references, cap_reference_ids)
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
        $19, $20, jsonb_build_object('xml', $21::text), $22, coalesce($23::text[], '{}'))
     on conflict (source_id, cap_identifier, cap_sent) do nothing
     returning id`,
    [
      source.id, source.country, doc.capIdentifier, doc.capSender, doc.capSent, doc.msgType,
      doc.event, doc.headline, doc.description, doc.instruction, doc.areaDesc,
      doc.severityRaw, doc.level, doc.issuedAt, doc.effectiveAt, doc.expiresAt,
      doc.polygonWkts.length ? doc.polygonWkts : null,
      doc.centerWkt, doc.radiusM, doc.sourceUrl, doc.raw, doc.capReferences ?? null,
      doc.referencedIdentifiers?.length ? doc.referencedIdentifiers : null,
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

  // ALERT QUEUE: uncapped and immediate. An alert never competes with the
  // engagement slot, and a second same-severity alert (a shifted hurricane
  // track) always sends -- it is the message that changes what a person does.
  let queued = 0;
  const outcomes = {};
  for (const m of matches) {
    const { rows: [r] } = await client.query(
      `select app.queue_alert_notification($1, $2) as outcome`, [m.client_id, alertId]);
    outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    if (r?.outcome === "queued") queued++;
  }

  log.info("alert.queued", {
    alertId, alertLevel: policy.level, matched: matches.length, queued, outcomes,
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
  const results = [];

  for (const source of sources) {
    const { links, route, result, errors } = await collectLinks(source, log);
    results.push(result);
    if (result === "no_answer") {
      ctx.warnings.push(
        `${source.country}: no national alerts via hub (${errors.join("; ") || "no agency feed configured"})`);
    }

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

        // FORWARD: this message supersedes/cancels the alerts it references.
        if (doc.referencedIdentifiers?.length) {
          const { rows: [lc] } = await client.query(
            `select app.apply_cap_lifecycle($1, $2::text[]) as affected`,
            [id, doc.referencedIdentifiers]);
          if (lc.affected > 0) {
            log.info("alert.lifecycle.forward", {
              alertId: id, msgType: doc.msgType, affectedPriorAlerts: lc.affected,
            });
          } else {
            // The referenced messages are not in our store (older than the fetch
            // window, or not yet arrived). Recorded, not silently ignored.
            log.info("alert.lifecycle.unresolved_refs", {
              alertId: id, msgType: doc.msgType, references: doc.referencedIdentifiers,
              note: "referenced alerts not stored; will apply if they arrive later",
            });
          }
        }

        // BACKWARD: an Update/Cancel we already hold may reference THIS alert
        // (feeds are not ordered). Without this, a late-arriving superseded or
        // cancelled alert would display as live forever.
        const { rows: [pending] } = await client.query(
          `select app.apply_pending_lifecycle($1) as applied`, [id]);
        if (pending.applied > 0) {
          log.info("alert.lifecycle.backward", {
            alertId: id, note: "a stored Update/Cancel already superseded this alert",
          });
        }

        // Ack/Error are ingested for the record but never reach a person.
        if (!doc.surfaceable) {
          log.info("alert.not_surfaceable", { alertId: id, msgType: doc.msgType });
          return;
        }
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

  // items if any source listed alerts; confirmed_empty only when every source
  // said so itself; anything else is no answer.
  const sourceResult = results.includes("items") ? "items"
    : results.every((r) => r === "confirmed_empty") ? "confirmed_empty"
    : "no_answer";
  return { recordsWritten: written, sourceResult };
}
