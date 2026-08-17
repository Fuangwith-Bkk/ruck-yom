const logger = require('../utils/logger');
const statusReport = require('./statusReport');
const reportMode = require('./reportMode');

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ms until the next occurrence of `hhmm` (HH:mm) in the app's configured
// timezone (TIMEZONE, default Asia/Bangkok — no DST, so no transition
// handling is needed here unlike a general-purpose cron implementation).
// Wraps to tomorrow if that time has already passed today.
function msUntilNext(hhmm) {
  const [hour, minute] = hhmm.split(':').map(Number);
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.TIMEZONE || 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
    .formatToParts(now)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const nowSeconds = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  const targetSeconds = hour * 3600 + minute * 60;

  let diffSeconds = targetSeconds - nowSeconds;
  if (diffSeconds <= 0) diffSeconds += 24 * 3600;
  return diffSeconds * 1000;
}

// Starts the daily รายงาน push, if DAILY_REPORT_TIME is set — feature is
// entirely opt-in, same "quietly disables itself if unconfigured" pattern
// as เฝ้าบ้าน/ไปพัก's TUYA_ARM_SCENE_ID/TUYA_DISARM_SCENE_ID. Purely
// in-memory: a restart around the scheduled time just skips that day's
// report rather than replaying it — same best-effort tier as houseMode.js/
// quietMode.js's in-memory state, not worth a persistence layer for a daily
// nicety. Deliberately pushes directly via lineService rather than routing
// through eventCorrelator, so it always bypasses quiet mode/ไปพัก — a
// deliberate daily heartbeat shouldn't go missing during a quiet period the
// same way routine door/motion alerts are meant to.
function start(lineService) {
  const time = process.env.DAILY_REPORT_TIME;
  if (!time) return;

  if (!TIME_RE.test(time)) {
    logger.error(`[DAILY_REPORT] Invalid DAILY_REPORT_TIME "${time}" — expected HH:mm. Daily summary disabled.`);
    return;
  }

  const scheduleNext = () => {
    const delay = msUntilNext(time);
    logger.info(`[DAILY_REPORT] Next summary in ${Math.round(delay / 60000)} minute(s)`);

    setTimeout(async () => {
      try {
        // Checked here, not at start() — so /report off (reportMode.js)
        // takes effect on the very next scheduled run without needing a
        // restart, and toggling it back on doesn't require re-arming
        // anything either.
        if (!reportMode.isEnabled()) {
          logger.info('[DAILY_REPORT] Skipped — disabled via /report off');
          return;
        }
        const message = await statusReport.buildReport(lineService);
        await lineService.pushMessage(message);
        logger.info('[DAILY_REPORT] Sent daily summary');
      } catch (err) {
        logger.error('[DAILY_REPORT] Failed to send daily summary:', err);
      } finally {
        // Reschedule regardless of success/failure — one bad day (e.g. a
        // transient Tuya/LINE outage) shouldn't kill the recurring schedule.
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();
}

module.exports = { start };
