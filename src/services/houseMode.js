// Best-effort, in-memory record of the last เฝ้าบ้าน/ไปพัก this bot itself
// successfully triggered — NOT a verified live query against Tuya. This app
// deliberately tracks no authoritative armed/disarmed state of its own
// (interactionRouter.js's _executeArmDisarm: "Tuya's automation engine
// already is that state"); this is only for the รายงาน summary line, and
// goes stale/wrong if someone arms or disarms directly from the Smart Life
// app instead of through this bot. Lost on restart, same tier as
// quietMode.js's state — a display nicety, not a security-relevant fact.
let lastMode = null; // 'arm' | 'disarm' | null

function setMode(mode) {
  lastMode = mode;
}

function getMode() {
  return lastMode;
}

module.exports = { setMode, getMode };
