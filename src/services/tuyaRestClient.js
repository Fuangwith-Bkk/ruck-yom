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

module.exports = { getAccessToken, getDeviceStatus, sendCommand, triggerScene };
