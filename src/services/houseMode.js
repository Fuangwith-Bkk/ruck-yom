// Best-effort, in-memory record of the last เฝ้าบ้าน/ไปพัก this app observed
// — triggered via LINE (interactionRouter.js's _executeArmDisarm), pressed
// on the physical Security Remote Control (app.js, on REMOTE_ARMED/
// REMOTE_DISARMED), or read back from Tuya's own "Alarm" automation at boot
// (app.js, TUYA_ALARM_AUTOMATION_ID) — NOT a continuously verified live
// query against Tuya, just seeded from one at startup. This app otherwise
// tracks no authoritative armed/disarmed state of its own ("Tuya's
// automation engine already is that state"); this is only for the รายงาน
// summary line, and still goes stale/wrong if someone arms or disarms
// directly from the Smart Life app instead of through this bot or the
// remote, or if TUYA_ALARM_AUTOMATION_ID is unset (then a restart still
// resets to unknown, same as before). Same tier as quietMode.js's state — a
// display nicety, not a security-relevant fact.
let lastMode = null; // 'arm' | 'disarm' | null

function setMode(mode) {
  lastMode = mode;
}

function getMode() {
  return lastMode;
}

module.exports = { setMode, getMode };
