/**
 * Owner alert delivery over OWNER_ALERT_WEBHOOK.
 *
 * Telegram's Bot API rejects an arbitrary JSON body -- sendMessage needs chat_id
 * and text -- so a Telegram URL gets a Telegram message. Any other URL still
 * receives the alert as JSON.
 *
 *   OWNER_ALERT_WEBHOOK=https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>
 *   (or set OWNER_ALERT_TELEGRAM_CHAT_ID instead of the query parameter)
 *
 * Telegram answers HTTP 200 with {"ok": false, ...} for some failures, so
 * delivery means ok: true, not a 2xx. The URL carries the bot token, so it never
 * appears in a log line or a stored error.
 */

const TIMEOUT_MS = 15_000;

export function isTelegram(url) {
  try {
    const u = new URL(url);
    return u.hostname === "api.telegram.org" && /^\/bot[^/]+\/sendMessage$/.test(u.pathname);
  } catch {
    return false;
  }
}

/** Plain text with no parse_mode, so error or agency text never needs escaping. */
export function telegramText(alert) {
  const lines = [
    alert.kind === "recovered" ? "Leamington ingest: RECOVERED" : "Leamington ingest: OWNER ALERT",
    alert.summary,
  ];
  if (alert.detail?.latestError) lines.push("", `Error: ${alert.detail.latestError}`);
  if (alert.detail?.meaning) lines.push("", alert.detail.meaning);
  lines.push("", `feed ${alert.feed} · ${alert.kind}`);
  return lines.join("\n").slice(0, 4096);   // Telegram's message limit
}

/** Returns { delivered, status?, error? }. Network failures throw to the caller. */
export async function sendOwnerAlert(url, alert, env = process.env) {
  if (!url) return { delivered: false, error: "no OWNER_ALERT_WEBHOOK configured" };
  try { new URL(url); } catch {
    // fetch's own parse error would quote the URL, secret and all.
    return { delivered: false, error: "OWNER_ALERT_WEBHOOK is not a valid URL" };
  }

  const post = (target, body) => fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!isTelegram(url)) {
    const res = await post(url, alert);
    return { delivered: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  }

  const target = new URL(url);
  const chatId = target.searchParams.get("chat_id") || env.OWNER_ALERT_TELEGRAM_CHAT_ID;
  if (!chatId) {
    return {
      delivered: false,
      error: "Telegram webhook has no chat_id: add ?chat_id=<id> to OWNER_ALERT_WEBHOOK or set OWNER_ALERT_TELEGRAM_CHAT_ID",
    };
  }
  // Send to the bare method URL. When a query string is present Telegram reads
  // parameters from it and ignores the JSON body, so a leftover "?text=" in the
  // configured URL produced "Bad Request: message text is empty" in production.
  target.search = "";

  const res = await post(target, { chat_id: chatId, text: telegramText(alert), disable_web_page_preview: true });
  let answer = null;
  try { answer = await res.json(); } catch { /* not JSON: judged on status below */ }
  const delivered = res.ok && answer?.ok === true;
  return {
    delivered,
    status: res.status,
    error: delivered ? null : `Telegram: ${answer?.description ?? `HTTP ${res.status}`}`,
  };
}
