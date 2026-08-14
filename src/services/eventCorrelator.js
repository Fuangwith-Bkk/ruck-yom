const logger = require('../utils/logger');

// Short, timestamp-free clause per eventType — used to build one line of a
// CHAIN_ESCALATION message. Every eventType the normalizer can emit needs an
// entry here, since any of them can now land inside a consolidated window.
const CLAUSES = {
  DOOR_OPENED: (event) => `เปิด ${event.deviceName}`,
  DOOR_CLOSED: (event) => `ปิด ${event.deviceName}`,
  MOTION_DETECTED: (event) => `มี ${event.deviceName}`,
  ALARM_ON: () => 'สัญญาณเตือนดังแล้ว',
  ALARM_OFF: () => 'สัญญาณเตือนหยุดแล้ว',
  RELAY_ON: (event) => `เปิด ${event.deviceName}`,
  RELAY_OFF: (event) => `ปิด ${event.deviceName}`,
  WATER_LEAK: (event) => `น้ำรั่วที่ ${event.deviceName}`,
  BATTERY_LOW: (event) => `${event.deviceName} แบตเหลือ ${event.batteryLevel}%`,
  UNKNOWN_EVENT: (event) => `${event.deviceName} มีเหตุการณ์ไม่ทราบสาเหตุ`
};

// The eventType that always flushes an open window immediately instead of
// waiting out the full WINDOW_MS — there's no benefit to delaying once the
// worst-case event has already happened.
const TERMINAL_EVENT = 'ALARM_ON';

const windowMs = () => Number(process.env.EVENT_CORRELATION_WINDOW_MS) || 15000;

class EventCorrelator {
  constructor(templateEngine, lineService) {
    this.templateEngine = templateEngine;
    this.lineService = lineService;
    // Only one window active at a time by design — this is a single-house
    // system with no per-zone device metadata, so there's no reliable way
    // to tell two concurrent incidents apart anyway.
    this.openWindow = null;
  }

  // Any eventType from any device can open a window or join one already
  // open — the goal is simply "don't send N separate pings for activity
  // that's clearly part of one burst." The first event of a burst always
  // sends immediately (no delay); everything else in that burst gets
  // buffered and folded into one CHAIN_ESCALATION when the window closes.
  async process(event) {
    const { eventType } = event;

    if (this.openWindow) {
      this.openWindow.events.push(event);
      logger.info(`[CORRELATOR] Buffered (${eventType}) into open window`);
      if (eventType === TERMINAL_EVENT) {
        await this._flush();
      }
      return;
    }

    await this._push(event);
    this._openWindow();
    this.openWindow.events.push(event);
  }

  _openWindow() {
    this.openWindow = {
      events: [],
      timer: setTimeout(() => {
        this._flush().catch((err) => logger.error('[CORRELATOR] Flush failed:', err));
      }, windowMs())
    };
  }

  async _flush() {
    if (!this.openWindow) return;
    const { events, timer } = this.openWindow;
    clearTimeout(timer);
    this.openWindow = null;

    // events[0] is the opener, already sent standalone above. If nothing
    // followed it, there's nothing more to report.
    if (events.length <= 1) return;

    const followUps = events.slice(1);

    // Exactly one follow-up: send it as its own normal alert rather than
    // wrapping a single line in a CHAIN_ESCALATION.
    if (followUps.length === 1) {
      await this._push(followUps[0]);
      return;
    }

    const lines = followUps
      .filter((event) => CLAUSES[event.eventType])
      .map((event) => `- ${CLAUSES[event.eventType](event)} (${event.time})`);

    if (lines.length === 0) return;

    await this._push({
      eventType: 'CHAIN_ESCALATION',
      lines: lines.join('\n'),
      timestamp: events[events.length - 1].timestamp
    });
  }

  async _push(event) {
    const text = this.templateEngine.render(event);
    await this.lineService.pushMessage(text);
    logger.info(`[ALERT_SENT] (${event.eventType}) Delivered notification for ${event.deviceName || 'chain escalation'}`);
  }
}

module.exports = EventCorrelator;
