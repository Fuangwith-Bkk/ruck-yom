const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// At most two BATTERY_LOW pushes per device per battery: one when it first
// drops below BATTERY_LOW_THRESHOLD (default 20%), and one last warning below
// BATTERY_CRITICAL_THRESHOLD (default 5%). A low battery isn't an emergency,
// but devices keep reporting it on their own schedule (รีโมท re-sends
// battery_percentage every hour), and without this every one of those
// readings became a fresh LINE push: six identical "รีโมท แบตเหลือ 19%"
// messages overnight on 2026-09-27, each one burning LINE quota. The pulsar
// messageId dedup in app.js can't catch this — each hourly reading is a
// genuinely new message.
//
// Re-armed only when the same device later reports a clearly fresh reading
// (>= BATTERY_REARM_THRESHOLD, default 50%), i.e. the battery was actually
// changed. Not merely >= BATTERY_LOW_THRESHOLD: readings wobble by a point
// near the line (รีโมท read 20% then 19% an hour apart on 2026-09-27), and
// each 19 -> 20 -> 19 bounce would otherwise re-arm and re-alert.
//
// Persisted ({ deviceId: 'low' | 'critical' }) so a restart doesn't
// re-announce a battery the user was already told about — same runtime-state
// tier as report-state.json.
const STATE_FILE = process.env.BATTERY_STATE_FILE || path.join(__dirname, '../../battery-alert-state.json');

// Re-read on every call, same as dpProfiles.js's batteryLowThreshold().
const batteryCriticalThreshold = () => Number(process.env.BATTERY_CRITICAL_THRESHOLD) || 5;
const batteryRearmThreshold = () => Number(process.env.BATTERY_REARM_THRESHOLD) || 50;

// Both DP codes batteryLow() handles in dpProfiles.js (`qt` uses `battery`).
const BATTERY_CODES = new Set(['battery_percentage', 'battery']);

let alerted = load();

function load() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    logger.error('[BATTERY] Failed to load alert state, starting empty:', err);
    return {};
  }
}

function persist() {
  try {
    if (Object.keys(alerted).length === 0) {
      if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    } else {
      fs.writeFileSync(STATE_FILE, JSON.stringify(alerted));
    }
  } catch (err) {
    logger.error('[BATTERY] Failed to persist alert state:', err);
  }
}

// Called with every raw Tuya payload, before normalization — healthy battery
// readings never become events (batteryLow() returns null), so this is the
// only place a replaced battery can be seen.
function observe(rawData) {
  if (!rawData || !rawData.devId || !Array.isArray(rawData.status)) return;
  if (!alerted[rawData.devId]) return;
  const recovered = rawData.status.some(
    (dp) => BATTERY_CODES.has(dp.code) && typeof dp.value === 'number' && dp.value >= batteryRearmThreshold()
  );
  if (!recovered) return;
  delete alerted[rawData.devId];
  persist();
  logger.info(`[BATTERY] ${rawData.devId} battery replaced — low-battery alerts re-armed`);
}

// True if this BATTERY_LOW should go out; records which stage was sent.
// While quiet (ไปพัก or a timed เงียบๆหน่อย) the push would be suppressed
// anyway, so the stage isn't spent — the next reading after quiet ends
// delivers it instead.
function shouldAlert(event, isQuiet) {
  const stage = event.batteryLevel < batteryCriticalThreshold() ? 'critical' : 'low';
  const sent = alerted[event.deviceId];
  if (sent === 'critical' || sent === stage) {
    logger.info(`[BATTERY] Suppressed repeat (BATTERY_LOW ${event.batteryLevel}%) for ${event.deviceName} — ${sent} alert already sent`);
    return false;
  }
  if (isQuiet) return true;
  alerted[event.deviceId] = stage;
  persist();
  return true;
}

module.exports = { observe, shouldAlert };
