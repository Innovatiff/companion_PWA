/**
 * Web Push, with node:crypto only: VAPID (RFC 8292) and aes128gcm message
 * encryption (RFC 8291 / RFC 8188).
 *
 * No third-party push account and no dependency: the phone's browser gives us
 * an endpoint on its own push service (Google, Mozilla, Apple) and two keys;
 * we encrypt the payload to those keys and sign a short-lived JWT with ours.
 *
 * Keys (base64url, as Railway variables):
 *   VAPID_PUBLIC_KEY   65-byte uncompressed P-256 point; Hoy's page gives it to the browser
 *   VAPID_PRIVATE_KEY  32-byte P-256 private scalar
 *   VAPID_SUBJECT      mailto: or https: contact for the push services
 */
import crypto from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(String(s), "base64url");

export function generateVapidKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

/** The VAPID keys from the environment, or null when push is not configured. */
export function vapidFromEnv(env = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (unb64u(publicKey).length !== 65 || unb64u(privateKey).length !== 32) {
    throw new Error("VAPID_PUBLIC_KEY must be a 65-byte and VAPID_PRIVATE_KEY a 32-byte base64url P-256 key");
  }
  if (!/^(mailto:|https:\/\/)/.test(subject)) throw new Error("VAPID_SUBJECT must start with mailto: or https://");
  return { publicKey, privateKey, subject };
}

function privateKeyObject({ publicKey, privateKey }) {
  const pub = unb64u(publicKey);
  return crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
}

/** The Authorization header value for one push service origin. */
export function vapidAuthorization(endpoint, vapid, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: vapid.subject }));
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${claims}`),
    { key: privateKeyObject(vapid), dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${vapid.publicKey}`;
}

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

/**
 * Encrypt a payload for one subscription (a single aes128gcm record).
 * `salt` and `serverKeys` are injectable for tests only.
 */
export function encryptPayload(payload, { p256dh, auth }, { salt = crypto.randomBytes(16), serverKeys } = {}) {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("p256dh is not an uncompressed P-256 key");
  if (authSecret.length < 16) throw new Error("auth secret is too short");

  const ecdh = crypto.createECDH("prime256v1");
  if (serverKeys) ecdh.setPrivateKey(serverKeys); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);

  const plaintext = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // last-record delimiter
  if (plaintext.length > 3993) throw new Error("push payload too large");
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/**
 * Send one push. Returns {ok, gone, status, error}:
 *   ok    the push service accepted it (201/202/200)
 *   gone  the subscription no longer exists (404/410): stop sending to it
 */
export async function sendPush(subscription, payload, vapid, { ttlSeconds = 12 * 3600, urgency = "normal", topic, timeoutMs = 15_000, fetchImpl = fetch } = {}) {
  const body = encryptPayload(typeof payload === "string" ? payload : JSON.stringify(payload), subscription);
  const headers = {
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(ttlSeconds),
    Urgency: urgency,
    Authorization: vapidAuthorization(subscription.endpoint, vapid),
  };
  if (topic) headers.Topic = topic;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(subscription.endpoint, { method: "POST", headers, body, signal: ac.signal });
    const text = res.ok ? "" : (await res.text().catch(() => "")).slice(0, 300);
    return {
      ok: res.status >= 200 && res.status < 300,
      gone: res.status === 404 || res.status === 410,
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status}${text ? `: ${text}` : ""}`,
    };
  } catch (err) {
    return { ok: false, gone: false, status: null, error: err?.name === "AbortError" ? "timeout" : String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}
