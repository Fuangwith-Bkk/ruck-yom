const deviceRegistry = require('../config/deviceRegistry');
const { DP_PROFILES } = require('../config/dpProfiles');
const { getBangkokTimestamp, getBangkokTime } = require('../utils/dateTime');

class SensorNormalizer {
  transform(rawMessage) {
    if (!rawMessage || !rawMessage.devId || !Array.isArray(rawMessage.status)) {
      return null;
    }

    const deviceId = rawMessage.devId;
    const device = deviceRegistry[deviceId];
    const deviceName = device?.name || `Sensor (${deviceId.substring(0, 6)}...)`;
    // Only DP codes defined in this specific device's profile are ever
    // interpreted — never matched globally across all devices. See
    // src/config/dpProfiles.js for why (the same DP code name can mean
    // different things in different Tuya categories, and the same concept
    // can use different code names across categories).
    const profile = device?.dpProfile ? DP_PROFILES[device.dpProfile] : null;

    const eventDate = new Date(rawMessage.eventTime || Date.now());
    const timestamp = getBangkokTimestamp(eventDate);
    // Short HH:MM:ss, used for per-line stamps in a consolidated chain
    // escalation message (see eventCorrelator.js) — the full `timestamp`
    // above is still what every standalone message renders.
    const time = getBangkokTime(eventDate);

    // NOTE: a single Pulsar message's `status` array can carry multiple DPs
    // (e.g. a battery reading riding along with a door-state change). We
    // process every DP into its own event rather than returning on the
    // first match, so none are silently dropped.
    const events = [];

    for (const dp of rawMessage.status) {
      const { code, value } = dp;

      const resolve = profile && profile[code];
      if (!resolve) {
        // Unregistered device (no dpProfile), or a DP code this device's
        // profile doesn't define — surface it for triage rather than
        // guessing at a meaning from another category.
        events.push({
          deviceId,
          deviceName,
          eventType: 'UNKNOWN_EVENT',
          rawPayload: JSON.stringify(dp),
          timestamp,
          time
        });
        continue;
      }

      const result = resolve(value);
      // null means routine telemetry (healthy battery, motion clear, etc.)
      // — intentionally not an event (Section 9 DoD).
      if (!result) continue;

      events.push({
        deviceId,
        deviceName,
        eventType: result.eventType,
        ...result.extra,
        timestamp,
        time
      });
    }

    // Return null (not an empty array) when nothing alert-worthy occurred,
    // so callers can `if (!event) return;` as in Section 8.9 without change.
    // Callers that need multi-event handling should iterate this array;
    // see the updated app.js snippet in Section 8.9.
    return events.length > 0 ? events : null;
  }
}

module.exports = SensorNormalizer;
