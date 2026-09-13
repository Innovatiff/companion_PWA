/**
 * Owner alerts sent to a Telegram Bot API URL arrive as a Telegram message, are
 * judged by Telegram's own answer, and never leak the bot token.
 *
 *   npm test
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sendOwnerAlert, isTelegram, telegramText } from "../src/monitor/notify.mjs";

const TOKEN = "123456:SECRET-bot-token";
const BASE = `https://api.telegram.org/bot${TOKEN}/sendMessage`;

const ALERT = {
  kind: "feed_stale", feed: "fx", summary: "FX reference rates: has never run",
  detail: { health: "never_run", latestError: null,
    meaning: "our copy of this feed is not current; it is NOT a statement that no events occurred" },
};

const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

/** Answer every request with `status` and `json`; record what was sent. */
function telegramAnswers(status, json) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(json), { status });
  };
  return calls;
}

test("recognises only Bot API sendMessage URLs as Telegram", () => {
  assert.equal(isTelegram(`${BASE}?chat_id=1`), true);
  assert.equal(isTelegram(`https://api.telegram.org/bot${TOKEN}/getMe`), false);
  assert.equal(isTelegram("https://hooks.example.invalid/owner"), false);
  assert.equal(isTelegram("not a url"), false);
});

test("a Telegram URL is sent chat_id and text, and ok:true is delivery", async () => {
  const calls = telegramAnswers(200, { ok: true, result: { message_id: 1 } });
  const outcome = await sendOwnerAlert(`${BASE}?chat_id=987654`, ALERT);

  assert.deepEqual(outcome, { delivered: true, status: 200, error: null });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, BASE, "chat_id moves from the query string into the body");
  assert.equal(calls[0].body.chat_id, "987654");
  assert.match(calls[0].body.text, /FX reference rates: has never run/);
  assert.match(calls[0].body.text, /NOT a statement that no events occurred/);
});

test("every query parameter is dropped, so Telegram reads the JSON body", async () => {
  // The production URL carried "?chat_id=...&text=". Telegram reads a query
  // string in preference to the body and answered "message text is empty".
  const calls = telegramAnswers(200, { ok: true });
  const outcome = await sendOwnerAlert(`${BASE}?chat_id=987654&text=`, ALERT);

  assert.equal(outcome.delivered, true);
  assert.equal(calls[0].url, BASE, "no query string may reach Telegram");
  assert.equal(calls[0].body.chat_id, "987654");
  assert.match(calls[0].body.text, /FX reference rates: has never run/);
});

test("the chat id can come from OWNER_ALERT_TELEGRAM_CHAT_ID", async () => {
  const calls = telegramAnswers(200, { ok: true });
  const outcome = await sendOwnerAlert(BASE, ALERT, { OWNER_ALERT_TELEGRAM_CHAT_ID: "-1001234" });
  assert.equal(outcome.delivered, true);
  assert.equal(calls[0].body.chat_id, "-1001234");
});

test("Telegram's refusal is a failed delivery with its reason, and no token", async () => {
  telegramAnswers(400, { ok: false, error_code: 400, description: "Bad Request: chat not found" });
  const outcome = await sendOwnerAlert(`${BASE}?chat_id=1`, ALERT);

  assert.equal(outcome.delivered, false);
  assert.equal(outcome.status, 400);
  assert.equal(outcome.error, "Telegram: Bad Request: chat not found");
  assert.ok(!JSON.stringify(outcome).includes(TOKEN), "the bot token must never appear in an outcome");
});

test("HTTP 200 without ok:true is not delivery", async () => {
  telegramAnswers(200, { ok: false, description: "Forbidden: bot was blocked by the user" });
  const outcome = await sendOwnerAlert(`${BASE}?chat_id=1`, ALERT);
  assert.equal(outcome.delivered, false);
  assert.equal(outcome.error, "Telegram: Forbidden: bot was blocked by the user");
});

test("a Telegram URL with no chat id fails without calling Telegram", async () => {
  const calls = telegramAnswers(200, { ok: true });
  const outcome = await sendOwnerAlert(BASE, ALERT, {});
  assert.equal(outcome.delivered, false);
  assert.match(outcome.error, /no chat_id/);
  assert.equal(calls.length, 0);
});

test("a non-Telegram webhook still receives the alert as JSON", async () => {
  const calls = telegramAnswers(200, {});
  const outcome = await sendOwnerAlert("https://hooks.example.invalid/owner", ALERT);
  assert.equal(outcome.delivered, true);
  assert.deepEqual(calls[0].body, ALERT);
});

test("an invalid webhook URL fails without quoting it", async () => {
  const outcome = await sendOwnerAlert(`api.telegram.org/bot${TOKEN}/sendMessage`, ALERT);
  assert.equal(outcome.delivered, false);
  assert.equal(outcome.error, "OWNER_ALERT_WEBHOOK is not a valid URL");
});

test("a recovery message says so", () => {
  const text = telegramText({ kind: "recovered", feed: "fx", summary: "FX reference rates: recovered", detail: {} });
  assert.match(text, /^Leamington ingest: RECOVERED/);
});
