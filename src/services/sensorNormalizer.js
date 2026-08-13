const deviceRegistry = require('../config/deviceRegistry');
const { getBangkokTimestamp } = require('../utils/dateTime');

class SensorNormalizer {
  transform(rawMessage) {
    if (!rawMessage || !rawMessage.devId || !Array.isArray(rawMessage.status)) {
      return null;
    }

    const deviceId = rawMessage.devId;
    const deviceName = deviceRegistry[deviceId] || `Sensor (${deviceId.substring(0, 6)}...)`;
    const timestamp = getBangkokTimestamp(new Date(rawMessage.eventTime || Date.now()));

    // NOTE: a single Pulsar message's `status` array can carry multiple DPs
    // (e.g. a battery reading riding along with a door-state change). We
    // process every DP into its own event rather than returning on the
    // first match, so none are silently dropped.
    const events = [];

    for (const dp of rawMessage.status) {
      const { code, value } = dp;

      if (code === 'doorcontact_state') {
        const isOpened = value === true || value === 'true';
        events.push({
          deviceId,
          deviceName,
          eventType: isOpened ? 'DOOR_OPENED' : 'DOOR_CLOSED',
          timestamp
        });
        continue;
      }

      if (code === 'pir') {
        const isMotion = value === 'pir' || value === true || value === 'true';
        // Only the motion-detected transition is alert-worthy (Section 9 DoD).
        // "Clear" is routine telemetry — PIR sensors can fire it very
        // frequently while idle, unlike a door's closed transition — so it
        // must not be emitted as an event, matching the water/battery
        // pattern below.
        if (isMotion) {
          events.push({
            deviceId,
            deviceName,
            eventType: 'MOTION_DETECTED',
            timestamp
          });
        }
        continue;
      }

      if (code === 'switch_1') {
        const isOn = value === true || value === 'true';
        events.push({
          deviceId,
          deviceName,
          eventType: isOn ? 'RELAY_ON' : 'RELAY_OFF',
          timestamp
        });
        continue;
      }

      if (code === 'watersensor_state') {
        const isAlarm = value === 'alarm' || value === true || value === 'true';
        // Only the alarm transition is alert-worthy. A "normal"/cleared
        // reading is routine telemetry, not an event — do NOT emit
        // anything for it (previously fell through to UNKNOWN_EVENT and
        // spammed the LINE group on every routine status poll).
        if (isAlarm) {
          events.push({
            deviceId,
            deviceName,
            eventType: 'WATER_LEAK',
            timestamp
          });
        }
        continue;
      }

      if (code === 'battery_percentage' && typeof value === 'number') {
        // Only low-battery is alert-worthy; a healthy reading is routine
        // telemetry and must not be emitted as an event.
        if (value < 20) {
          events.push({
            deviceId,
            deviceName,
            eventType: 'BATTERY_LOW',
            batteryLevel: value,
            timestamp
          });
        }
        continue;
      }

      // Any other DP code is genuinely unrecognized — surface it once per
      // occurrence so it's visible for triage, but this should be rare in
      // steady state, not the default outcome of routine telemetry.
      events.push({
        deviceId,
        deviceName,
        eventType: 'UNKNOWN_EVENT',
        rawPayload: JSON.stringify(dp),
        timestamp
      });
    }

    // Return null (not an empty array) when nothing alert-worthy occurred,
    // so callers can `if (!event) return;` as in Section 8.8 without change.
    // Callers that need multi-event handling should iterate this array;
    // see the updated app.js snippet in Section 8.8.
    return events.length > 0 ? events : null;
  }
}

module.exports = SensorNormalizer;
