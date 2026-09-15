/**
 * Delivering the two notification queues as Web Push.
 *
 *   notify:send  every minute. Claims due notifications, alerts first, and
 *                pushes each to every working subscription of its client.
 *   notify:plan  every 15 minutes. Queues the day's single engagement
 *                notification for clients whose notify hour it is (0021).
 *
 * Every outcome is recorded on the notification, in words:
 *   sent        at least one phone's push service accepted it
 *   suppressed  the client has no working subscription, so no phone could show it
 *   queued      delivery failed and will be retried (up to 5 attempts), with the error
 *   failed      5 attempts failed
 * A failure never disappears: it stays on the row, in /health's feed state and
 * in the admin alert delivery log.
 */
import { query } from "../db.mjs";
import { sendPush, vapidFromEnv } from "../push/webpush.mjs";

const MAX_ATTEMPTS = 5;
const ENGAGEMENT_URL = { match_day: "/futbol", rate_reminder: "/mas/tasa", fx_30d_high: "/mas/tasa", lottery: "/mas/loteria" };

/**
 * What the phone receives; public/sw.js shows it. Each alert has its own tag.
 * Tapping an alert opens Clima's warnings focused on that message (0052).
 */
export function payloadFor(n) {
  const alert = n.channel === "alert";
  return {
    title: n.title,
    body: n.body,
    queue: n.channel,
    url: alert
      ? (n.weather_alert_id ? `/clima?aviso=${n.weather_alert_id}#avisos` : "/clima#avisos")
      : ENGAGEMENT_URL[n.trigger] ?? "/",
    tag: alert ? `alert-${n.id}` : "engagement",
  };
}

const finish = (id, status, delivered, error) =>
  query("select app.finish_notification($1, $2::notification_status, $3, $4)", [id, status, delivered, error]);

export async function sendDueNotifications(ctx, { limit = 50, send = sendPush, vapid = vapidFromEnv() } = {}) {
  const { rows: claimed } = await query("select * from app.claim_due_notifications($1)", [limit]);
  // The claim picks alerts first, but UPDATE ... RETURNING does not keep that
  // order, so it is applied here: alerts first, then oldest.
  const due = claimed.sort((a, b) =>
    (a.channel === "alert" ? 0 : 1) - (b.channel === "alert" ? 0 : 1)
    || new Date(a.scheduled_for) - new Date(b.scheduled_for)
    || a.id - b.id);
  let sent = 0;

  for (const n of due) {
    const retryOrFail = n.attempts >= MAX_ATTEMPTS ? "failed" : "queued";
    const { rows: subs } = await query(
      `select id, endpoint, p256dh, auth from push_subscriptions
        where client_id = $1 and disabled_at is null order by id`, [n.client_id]);

    if (subs.length === 0) {
      await finish(n.id, "suppressed", 0, "no working push subscription");
      continue;
    }
    if (!vapid) {
      await finish(n.id, retryOrFail, 0, "push is not configured: VAPID keys are not set");
      ctx.warnings.push(`notification ${n.id}: VAPID keys are not set`);
      continue;
    }

    const alert = n.channel === "alert";
    const payload = payloadFor(n);
    let delivered = 0;
    const errors = [];
    for (const s of subs) {
      const r = await send(s, payload, vapid, {
        ttlSeconds: alert ? 24 * 3600 : 12 * 3600,
        urgency: alert ? "high" : "normal",
        // A newer engagement message replaces an undelivered one; alerts never do.
        topic: alert ? undefined : "engagement",
      });
      if (r.ok) {
        delivered++;
        await query("update push_subscriptions set last_success_at = now(), failures = 0, last_error = null where id = $1", [s.id]);
      } else if (r.gone) {
        await query("update push_subscriptions set disabled_at = now(), last_failure_at = now(), last_error = $2 where id = $1", [s.id, r.error]);
      } else {
        errors.push(r.error);
        await query("update push_subscriptions set failures = failures + 1, last_failure_at = now(), last_error = $2 where id = $1", [s.id, r.error]);
      }
    }

    if (delivered > 0) {
      await finish(n.id, "sent", delivered, errors.length ? errors.join("; ").slice(0, 500) : null);
      sent++;
    } else if (errors.length === 0) {
      await finish(n.id, "suppressed", 0, "every push subscription for this client has expired");
    } else {
      await finish(n.id, retryOrFail, 0, errors.join("; ").slice(0, 500));
      ctx.warnings.push(`notification ${n.id}: ${errors[0]}`);
    }
  }

  ctx.log.info("notify.sent", { claimed: due.length, sent });
  return { recordsWritten: sent };
}

export async function planEngagement() {
  const { rows } = await query("select app.plan_engagement(now()) as queued");
  return { recordsWritten: rows[0]?.queued ?? 0 };
}
