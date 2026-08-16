// Recent-activity view for a single device — reuses dpProfiles.js's alert
// resolvers to interpret each Tuya device-log entry's {code, value} into the
// same eventType vocabulary real-time alerts already use, so history and
// live alerts never describe the same state change differently. A log entry
// the resolver treats as routine (returns null — e.g. healthy battery) is
// dropped from history too, same as it would be from a live alert.

const { DP_PROFILES } = require('../config/dpProfiles');
const { getBangkokHistoryTimestamp } = require('../utils/dateTime');

const EVENT_DISPLAY = {
  DOOR_OPENED: { emoji: '🔓', label: 'เปิด' },
  DOOR_CLOSED: { emoji: '🔒', label: 'ปิด' },
  RELAY_ON: { emoji: '💡', label: 'เปิด' },
  RELAY_OFF: { emoji: '⚫', label: 'ปิด' },
  ALARM_ON: { emoji: '🚨', label: 'ดังขึ้น' },
  ALARM_OFF: { emoji: '✅', label: 'หยุดดัง' },
  MOTION_DETECTED: { emoji: '🏃', label: 'ตรวจพบความเคลื่อนไหว' },
  WATER_LEAK: { emoji: '💧', label: 'ตรวจพบน้ำรั่ว' },
  BATTERY_LOW: { emoji: '🔋', label: 'แบตต่ำ' }
};

// logEntries: Tuya's raw /v1.0/devices/{id}/logs `logs` array — each entry
// is { code, value, event_time, ... }. Filters to entries this device's
// dpProfile actually interprets as a real state change, newest first.
function buildHistoryMessage(device, logEntries) {
  const resolvers = DP_PROFILES[device.dpProfile] || {};

  const lines = (logEntries || [])
    .map((entry) => {
      const resolver = resolvers[entry.code];
      if (!resolver) return null;
      const resolved = resolver(entry.value);
      if (!resolved) return null;
      const display = EVENT_DISPLAY[resolved.eventType];
      if (!display) return null;
      return { time: Number(entry.event_time), text: `${display.emoji} ${display.label}` };
    })
    .filter(Boolean)
    .sort((a, b) => b.time - a.time);

  const bodyText = lines.length === 0
    ? 'ไม่มีความเคลื่อนไหวล่าสุดครับ'
    : lines.map((line) => `${getBangkokHistoryTimestamp(new Date(line.time))}  ${line.text}`).join('\n');

  return {
    type: 'text',
    text: `🕘 ประวัติ ${device.name}\n\n${bodyText}`
  };
}

module.exports = { buildHistoryMessage };
