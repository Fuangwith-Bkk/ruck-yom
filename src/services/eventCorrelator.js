const logger = require('../utils/logger');
const quietMode = require('./quietMode');

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

// Genuinely critical eventTypes always push, regardless of quiet mode —
// neither the manual เงียบๆหน่อย nor the automatic ไปพัก-indefinite quiet
// should be able to hide a real emergency. ALARM_OFF rides along with
// ALARM_ON so the "all clear" follow-up is never silently swallowed while
// the ALARM_ON itself got through. SMOKE_DETECTED is included pre-emptively
// for when a smoke sensor is added — no such device/dpProfile exists yet
// (TUYA_DEVICE_DP_REGISTRY.md/dpProfiles.js), but the moment one is, it
// should bypass quiet mode without anyone having to remember to update this
// list again.
const CRITICAL_EVENT_TYPES = new Set(['ALARM_ON', 'ALARM_OFF', 'WATER_LEAK', 'SMOKE_DETECTED']);

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
      timestamp: events[events.length - 1].timestamp,
      // CHAIN_ESCALATION's own eventType isn't itself critical, but if any
      // consolidated line inside it is, the whole message must still bypass
      // quiet mode — a real ALARM_ON shouldn't go missing just because it
      // got folded into a burst with other, routine events.
      containsCritical: followUps.some((e) => CRITICAL_EVENT_TYPES.has(e.eventType))
    });
  }

  async _push(event) {
    // Quiet mode (Increment 3) suppresses only this final push — dedup,
    // window buffering, and CHAIN_ESCALATION composition above all keep
    // running exactly as normal, so state stays consistent and nothing
    // needs to be replayed once the quiet period ends. Critical events
    // (CRITICAL_EVENT_TYPES above) always bypass this gate — neither a
    // manual เงียบๆหน่อย nor an automatic ไปพัก-quiet should be able to hide
    // a real emergency.
    const isCritical = CRITICAL_EVENT_TYPES.has(event.eventType) || event.containsCritical;
    if (quietMode.isQuiet() && !isCritical) {
      logger.info(`[QUIET_MODE] Suppressed (${event.eventType}) push for ${event.deviceName || 'chain escalation'}`);
      return;
    }
    if (quietMode.isQuiet() && isCritical) {
      logger.info(`[QUIET_MODE] Bypassed for critical event (${event.eventType})`);
    }

    const text = this.templateEngine.render(event);
    // Exact rendered text, before it's sent — debug-only since it's
    // effectively a duplicate of the [ALERT_SENT] line below, but useful
    // to confirm the actual wording delivered vs. what a template change
    // was expected to produce.
    logger.debug(`[LINE_OUT] (${event.eventType})`, text);
    await this.lineService.pushMessage(text);
    logger.info(`[ALERT_SENT] (${event.eventType}) Delivered notification for ${event.deviceName || 'chain escalation'}`);
  }
}

module.exports = EventCorrelator;
