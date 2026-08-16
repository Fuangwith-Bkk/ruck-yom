const crypto = require('crypto');
const logger = require('../utils/logger');

// Increment 1: token minting + read-only status queries.
// Increment 2: signed POST command support (device control) added below.
//
// Deliberately hand-rolled rather than using the official
// @tuya/tuya-connector-nodejs package — that package hard-pins a vulnerable
// axios version (^0.21.1, multiple known CVEs: SSRF, ReDoS, prototype
// pollution) that npm can't resolve past due to the caret-on-0.x pin. Node
// 18+ (already required by this project) has built-in `fetch` and `crypto`,
// so this needs zero new dependencies.
//
// Tuya Cloud API signature (sign_method HMAC-SHA256) — reconstructed from
// Tuya's documented signing scheme, not copied from any existing code in
// this repo (none existed). Verify against a real request/response before
// relying on this in production; see RUCKYOM_SPECIFICATION.md Section 9 DoD
// for the verification step.
//   stringToSign = method + "\n" + sha256Hex(body) + "\n" + "" + "\n" + path
//   signBase     = client_id + [access_token] + t + stringToSign
//   sign         = HMAC-SHA256(signBase, client_secret), uppercase hex
// access_token is included in signBase for every call except the initial
// token-mint request, which has none yet.

const BASE_URL = process.env.TUYA_BASE_URL;
const ACCESS_ID = process.env.TUYA_ACCESS_ID;
const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET;

// In-memory only — a restart re-mints a token, which is cheap and avoids
// needing Phase 3's persistence layer for something this short-lived (~2h).
let cachedToken = null;
// Tracks an in-flight mint request so concurrent callers (e.g. the "all
// devices" status query firing N parallel getDeviceStatus calls) await the
// same request instead of each independently minting their own token —
// without this, every one of them sees cachedToken as null/expired at the
// same instant, before any single mint has had a chance to complete.
let pendingMint = null;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function hmacSha256Hex(input, secret) {
  return crypto.createHmac('sha256', secret).update(input, 'utf8').digest('hex').toUpperCase();
}

function sign({ method, path, body, accessToken }) {
  const t = Date.now().toString();
  const stringToSign = [method, sha256Hex(body), '', path].join('\n');
  const signBase = ACCESS_ID + (accessToken || '') + t + stringToSign;
  return { t, sign: hmacSha256Hex(signBase, ACCESS_SECRET) };
}

async function request(method, path, { body, accessToken } = {}) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const { t, sign: signature } = sign({ method, path, body: bodyStr, accessToken });

  const headers = {
    client_id: ACCESS_ID,
    sign: signature,
    t,
    sign_method: 'HMAC-SHA256',
    'Content-Type': 'application/json'
  };
  if (accessToken) headers.access_token = accessToken;

  logger.debug('[TUYA_REST_OUT]', method, path);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: bodyStr || undefined
  });

  if (!res.ok) {
    throw new Error(`Tuya API HTTP ${res.status} [${path}]`);
  }

  const json = await res.json();
  logger.debug('[TUYA_REST_IN]', method, path, json);

  if (!json.success) {
    throw new Error(`Tuya API error [${path}]: ${json.code} ${json.msg}`);
  }
  return json.result;
}

// Access tokens last ~2h server-side; cache and refresh a minute early to
// avoid a request racing right past expiry.
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return cachedToken.accessToken;
  }

  if (!pendingMint) {
    pendingMint = request('GET', '/v1.0/token?grant_type=1')
      .then((result) => {
        cachedToken = {
          accessToken: result.access_token,
          expiresAt: Date.now() + result.expire_time * 1000
        };
        logger.info('[TUYA_REST] Minted new access token');
        return cachedToken.accessToken;
      })
      .finally(() => {
        pendingMint = null;
      });
  }

  return pendingMint;
}

async function getDeviceStatus(deviceId) {
  const accessToken = await getAccessToken();
  return request('GET', `/v1.0/devices/${deviceId}/status`, { accessToken });
}

// commands: [{ code, value }, ...] — e.g. [{ code: 'alarm_switch', value: true }].
async function sendCommand(deviceId, commands) {
  const accessToken = await getAccessToken();
  return request('POST', `/v1.0/devices/${deviceId}/commands`, {
    accessToken,
    body: { commands }
  });
}

// Fires a Tap-to-Run Scene by its rule_id (Scene Linkage Rules API, v2.0).
// Used for เฝ้าบ้าน/ไปพัก (arm/disarm) — an earlier attempt tried commanding
// the Security Remote Control device directly to simulate its physical
// button press, which Tuya rejected (error 2008, "command or value not
// support"): that device is a battery-powered Zigbee end device that can
// transmit button-press events but can't receive downlink commands.
// Triggering the Tap-to-Run Scene that already replicates the same "Then"
// actions sidesteps that entirely — Scenes are specifically meant to be
// triggered externally, unlike a sleepy end device.
async function triggerScene(ruleId) {
  const accessToken = await getAccessToken();
  return request('POST', `/v2.0/cloud/scene/rule/${ruleId}/actions/trigger`, { accessToken });
}

// Device operation history — 7-day free retention per Tuya's Device Log
// Service. Defaults to the full 7-day window with size=10 — a wider time
// window with the same row cap can never return fewer rows than a narrower
// one (e.g. 24h), only ever the same or more, so this single query already
// gives "whichever of {last 24h, last 10 rows} has more history" without
// needing two separate calls: a busy device still gets capped at its most
// recent 10 rows, while a quiet device reaches back as far as 7 days to
// fill that same quota instead of coming back empty.
//
// The first endpoint this client calls with a query string — Tuya's
// signature requires query params to appear in the signed URL sorted
// alphabetically by key (ASCII order), not request/insertion order. Every
// other call so far (status, commands, scene trigger) has no query string,
// so this requirement was latent until now; sorting keys here keeps the
// exact same string used for both the real request and its signature
// (sign() just signs whatever `path` it's given), so they can never drift
// apart.
async function getDeviceLogs(deviceId, { startTime, endTime, size = 10 } = {}) {
  const accessToken = await getAccessToken();
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const query = {
    end_time: String(endTime ?? now),
    size: String(size),
    start_time: String(startTime ?? now - SEVEN_DAYS_MS),
    // Required by Tuya (missing it causes "40000303 Parameter error!", not a
    // default-to-all). type=7 is "data point report" — the only log
    // category that maps to dpProfiles.js's resolvers (historyCard.js);
    // online/offline/firmware/etc. (the other type codes) aren't state
    // changes this app's DP_PROFILES vocabulary can interpret anyway.
    type: '7'
  };
  const sortedQuery = Object.keys(query)
    .sort()
    .map((key) => `${key}=${query[key]}`)
    .join('&');
  return request('GET', `/v1.0/devices/${deviceId}/logs?${sortedQuery}`, { accessToken });
}

module.exports = { getAccessToken, getDeviceStatus, sendCommand, triggerScene, getDeviceLogs };
