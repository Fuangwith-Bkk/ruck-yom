const logger = require('../utils/logger');
const deviceRegistry = require('../config/deviceRegistry');
const tuyaRestClient = require('./tuyaRestClient');
const { getBangkokTimestamp } = require('../utils/dateTime');

// Gateway online/offline watchdog. Polls Tuya's REST device detail rather
// than listening on Pulsar: on 2026-09-22 the "ครหวัน Zigbee LAN GW" gateway
// went offline (the Smart Life app alerted at 15:22:03) and Pulsar delivered
// nothing at all — no online/offline bizCode events reach this app, only
// protocol-4 DP reports. Tuya's own `online` flag is what the Smart Life
// app's alert is based on, so reading it directly matches that alert without
// depending on any Message Service subscription setting.
//
// Gateways only (category "gateway") by default: when a gateway drops, every
// Zigbee sensor behind it goes blind, so its one alert is the one that
// matters — watching every sensor would turn a single outage into a flood,
// and sleepy battery sensors flap on their own. A registry entry can opt
// out with `"watchOnline": false` (e.g. a spare/test gateway that is
// unplugged on purpose) or opt in any other device with `"watchOnline": true`.
//
// Deliberately bypasses quiet mode — both timed เงียบๆหน่อย and ไปพัก. A
// dead gateway means the alarm system itself can't see anything, which is
// exactly what someone resting at home still needs to know; it's rare, not
// routine chatter. Pushes straight through lineService (same as
// dailyReport.js) rather than eventCorrelator, so it's never buffered into a
// chain escalation either.
//
// In-memory state only: a restart forgets which devices were already known
// offline, so a gateway still offline at boot is announced again once —
// accepted, since "the gateway is down" is worth repeating after a restart.

const intervalMs = () => (Number(process.env.DEVICE_ONLINE_CHECK_INTERVAL_SEC) || 120) * 1000;

// deviceId -> { online: boolean, offlineSince: number|null }
const state = new Map();

function watchedDevices() {
  return Object.entries(deviceRegistry)
    .filter(([, device]) => device.watchOnline ?? device.category === 'gateway')
    .map(([deviceId, device]) => ({ deviceId, name: device.name }));
}

// "23 นาที" / "1 ชั่วโมง 5 นาที" — rounded to whole minutes; the poll
// interval already makes anything finer meaningless.
function formatDowntime(ms) {
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} นาที`;
  return minutes === 0 ? `${hours} ชั่วโมง` : `${hours} ชั่วโมง ${minutes} นาที`;
}

async function checkDevice({ deviceId, name }, templateEngine, lineService) {
  let info;
  try {
    info = await tuyaRestClient.getDeviceInfo(deviceId);
  } catch (err) {
    // Can't tell — leave the known state alone rather than guessing. If this
    // host's own internet is down, LINE is unreachable anyway.
    logger.error(`[DEVICE_HEALTH] Failed to check ${name}:`, err);
    return;
  }

  const online = info.online === true;
  const previous = state.get(deviceId);
  const now = Date.now();

  // First reading: an online device just sets the baseline silently; one
  // already offline is announced, since nobody has been told yet.
  if (!previous) {
    state.set(deviceId, { online, offlineSince: online ? null : now });
    logger.info(`[DEVICE_HEALTH] ${name} baseline: ${online ? 'online' : 'offline'}`);
    if (online) return;
  } else if (previous.online === online) {
    return;
  } else {
    state.set(deviceId, { online, offlineSince: online ? null : now });
  }

  const event = online
    ? {
        eventType: 'DEVICE_ONLINE',
        deviceName: name,
        downtime: formatDowntime(now - previous.offlineSince),
        timestamp: getBangkokTimestamp(new Date(now))
      }
    : { eventType: 'DEVICE_OFFLINE', deviceName: name, timestamp: getBangkokTimestamp(new Date(now)) };

  logger.info(`[DEVICE_HEALTH] ${name} is now ${online ? 'online' : 'offline'}`);
  try {
    await lineService.pushMessage(templateEngine.render(event));
    logger.info(`[ALERT_SENT] (${event.eventType}) Delivered notification for ${name}`);
  } catch (err) {
    logger.error(`[DEVICE_HEALTH] Failed to send ${event.eventType} for ${name}:`, err);
  }
}

function start(templateEngine, lineService) {
  const devices = watchedDevices();
  if (devices.length === 0) {
    logger.info('[DEVICE_HEALTH] No devices to watch — online/offline alerts disabled');
    return;
  }
  logger.info(
    `[DEVICE_HEALTH] Watching ${devices.map((d) => d.name).join(', ')} every ${intervalMs() / 1000}s`
  );

  // setTimeout chain rather than setInterval, so a slow Tuya response can
  // never stack overlapping checks.
  const tick = async () => {
    for (const device of devices) {
      await checkDevice(device, templateEngine, lineService);
    }
    setTimeout(tick, intervalMs());
  };
  tick();
}

module.exports = { start };
