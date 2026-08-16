// Declarative DP interpretation table, keyed by Tuya Product Category code
// (the same codes used as section headers in TUYA_DEVICE_DP_REGISTRY.md —
// `mcs`, `qt`, `tdq`, `sgbj`, `pir`, ...). Each device in deviceRegistry.json
// is registered with a `dpProfile` naming exactly one of these keys, so
// sensorNormalizer.js interprets a DP code only against the profile that
// specific device is known to use — never globally across all devices.
//
// This matters because different categories reuse the same DP code name for
// different meanings (`tdq`'s `switch_1` is a relay; a door sensor's state
// is never `switch_1`) — and, more subtly, the same *concept* can appear
// under different code names per category (`mcs` reports door state as
// `doorcontact_state`; `qt` reports the identical concept as `switch`).
// Global code matching can't safely distinguish either case; per-device
// profile lookup can.
//
// Adding a new device that uses an EXISTING profile here (i.e. Tuya already
// assigns it one of these category codes) requires zero code changes — just
// register it in deviceRegistry.json with the matching `dpProfile`. Only a
// genuinely new Tuya category needs a new entry in this file.
//
// Each resolver: (value) => { eventType, extra? } | null. Returning null
// means the reading is routine telemetry (e.g. healthy battery, motion
// clear) and should not become an event — matches the existing Section 9 DoD
// contract that routine telemetry produces zero LINE messages.

const isTrue = (value) => value === true || value === 'true';

function batteryLow(value) {
  if (typeof value !== 'number' || value >= 20) return null;
  return { eventType: 'BATTERY_LOW', extra: { batteryLevel: value } };
}

function doorState(value) {
  return { eventType: isTrue(value) ? 'DOOR_OPENED' : 'DOOR_CLOSED' };
}

function relayState(value) {
  return { eventType: isTrue(value) ? 'RELAY_ON' : 'RELAY_OFF' };
}

function alarmState(value) {
  return { eventType: isTrue(value) ? 'ALARM_ON' : 'ALARM_OFF' };
}

function motionDetected(value) {
  if (value !== 'pir' && !isTrue(value)) return null;
  return { eventType: 'MOTION_DETECTED' };
}

function waterLeak(value) {
  if (value !== 'alarm' && !isTrue(value)) return null;
  return { eventType: 'WATER_LEAK' };
}

function remoteArmed() {
  return { eventType: 'REMOTE_ARMED' };
}

function remoteDisarmed() {
  return { eventType: 'REMOTE_DISARMED' };
}

const DP_PROFILES = {
  // Contact Sensor (door/window) — confirmed via Tuya IoT Platform Product
  // Category for ประตูระเบียงห้องพ่อ, ประตูครัว, ประตูหน้าบ้าน (2026-08-15).
  mcs: {
    doorcontact_state: doorState,
    battery_percentage: batteryLow
  },
  // "Others" category, Product Name 门窗磁传感器 (door/window magnetic
  // sensor) — confirmed via Tuya IoT Platform for ประตูห้องป้าแสง and
  // ประตูห้องพ่อ (2026-08-15); polarity separately confirmed against the
  // Smart Life app's History log. Same concept as `mcs` above, different DP
  // code names — this is exactly why profiles are per-device, not global.
  qt: {
    switch: doorState,
    battery: batteryLow
  },
  // Breaker.
  tdq: {
    switch_1: relayState
  },
  // Siren.
  sgbj: {
    alarm_switch: alarmState
  },
  // Motion Detector.
  pir: {
    pir: motionDetected,
    battery_percentage: batteryLow
  },
  // Water Leak Sensor — real Tuya Product Category code not yet confirmed
  // against a registered device (none owned yet); key name is a placeholder
  // to rename once one is added. `watersensor_state` mapping itself is
  // carried over unchanged from the pre-dpProfiles normalizer.
  watersensor: {
    watersensor_state: waterLeak
  },
  // Security Remote Control (Emergency Button / รีโมท) — per
  // TUYA_DEVICE_DP_REGISTRY.md, its 4 physical buttons (home, arm, disarm,
  // sos) each transmit as their own single-value-range Enum DP, so the DP
  // *code* itself (not the value, which is always identical to the code) is
  // what identifies the button pressed. Only `arm`/`disarmed` are handled —
  // these drive houseMode/quietMode the same way the LINE-side เฝ้าบ้าน/
  // ไปพัก commands do (app.js). `home` and `sos` fall through to
  // UNKNOWN_EVENT for now; this device can't receive cloud commands either
  // way (Tuya error 2008), so nothing here ever needs a CONTROL_DP entry.
  sos: {
    arm: remoteArmed,
    disarmed: remoteDisarmed
  }
};

// Increment 2 (device control): which DP code a profile's on/off toggle
// actually writes, per profile — same rationale as DP_PROFILES itself.
// Lives here rather than deviceCategories.js because it's a per-Tuya-category
// fact (tdq writes switch_1; sgbj writes alarm_switch), not a user-facing
// grouping concern. Only profiles that support a toggle action need an
// entry; a category with no entry here just doesn't offer a toggle button
// regardless of deviceCategories.js's `controllable` flag.
const CONTROL_DP = {
  tdq: 'switch_1',
  sgbj: 'alarm_switch'
};

module.exports = { DP_PROFILES, CONTROL_DP };
