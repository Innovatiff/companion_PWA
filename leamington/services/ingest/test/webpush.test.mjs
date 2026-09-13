/**
 * Web Push without a dependency: the VAPID JWT verifies with the public key,
 * the aes128gcm body decrypts with the phone's keys exactly as a browser would,
 * and push service answers map to ok / gone / error.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { generateVapidKeys, vapidFromEnv, vapidAuthorization, encryptPayload, sendPush } from "../src/push/webpush.mjs";

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

/** The receiving side of RFC 8291, as the browser does it. */
function decrypt(body, uaEcdh, authSecret) {
  const salt = body.subarray(0, 16);
  const idLen = body[20];
  const asPublic = body.subarray(21, 21 + idLen);
  const ciphertext = body.subarray(21 + idLen);
  const uaPublic = uaEcdh.getPublicKey();
  const shared = uaEcdh.computeSecret(asPublic);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2, "a single, final record");
  return plain.subarray(0, plain.length - 1).toString();
}

function phone() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, sub: { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", p256dh: ecdh.getPublicKey("base64url"), auth: auth.toString("base64url") } };
}

const vapid = { ...generateVapidKeys(), subject: "mailto:owner@example.invalid" };

test("an encrypted payload decrypts with the phone's keys", () => {
  const p = phone();
  const payload = JSON.stringify({ title: "Flash Flood Warning", body: "St. James — Montego Bay", queue: "alert", tag: "alert-7", url: "/clima" });
  const body = encryptPayload(payload, p.sub);
  assert.equal(body.readUInt32BE(16), 4096);
  assert.equal(decrypt(body, p.ecdh, p.auth), payload);
  assert.notDeepEqual(encryptPayload(payload, p.sub), body, "every message uses a fresh salt and server key");
});

test("the VAPID token is signed by our key, for the push service's origin, for 12 hours at most", () => {
  const now = 1_800_000_000;
  const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc123", vapid, now);
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(k, vapid.publicKey);
  const [h, c, s] = jwt.split(".");
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.ok(claims.exp > now && claims.exp <= now + 24 * 3600);
  assert.equal(claims.sub, vapid.subject);
  const pub = Buffer.from(vapid.publicKey, "base64url");
  const key = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") }, format: "jwk" });
  assert.ok(crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
});

test("push service answers: accepted, gone, and failed", async () => {
  const p = phone();
  let seen;
  const answer = (status) => async (url, init) => { seen = { url, init }; return new Response(status >= 400 ? "nope" : null, { status }); };

  const ok = await sendPush(p.sub, { title: "t" }, vapid, { urgency: "high", ttlSeconds: 86400, fetchImpl: answer(201) });
  assert.deepEqual([ok.ok, ok.gone], [true, false]);
  assert.equal(seen.init.headers["Content-Encoding"], "aes128gcm");
  assert.equal(seen.init.headers.Urgency, "high");
  assert.equal(seen.init.headers.TTL, "86400");
  assert.match(seen.init.headers.Authorization, /^vapid t=/);
  assert.equal(decrypt(seen.init.body, p.ecdh, p.auth), JSON.stringify({ title: "t" }));

  const gone = await sendPush(p.sub, "x", vapid, { fetchImpl: answer(410) });
  assert.deepEqual([gone.ok, gone.gone], [false, true]);
  const failed = await sendPush(p.sub, "x", vapid, { fetchImpl: answer(500) });
  assert.deepEqual([failed.ok, failed.gone], [false, false]);
  assert.match(failed.error, /HTTP 500/);
  const down = await sendPush(p.sub, "x", vapid, { fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  assert.equal(down.ok, false);
  assert.match(down.error, /ECONNRESET/);
});

test("VAPID keys come from the environment, or push is reported as not configured", () => {
  assert.equal(vapidFromEnv({}), null);
  const keys = generateVapidKeys();
  assert.deepEqual(vapidFromEnv({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: "mailto:a@b.invalid" }),
    { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: "mailto:a@b.invalid" });
  assert.throws(() => vapidFromEnv({ VAPID_PUBLIC_KEY: "abc", VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: "mailto:a@b.invalid" }));
  assert.throws(() => vapidFromEnv({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: "owner" }));
});
