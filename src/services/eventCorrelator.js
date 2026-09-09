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
  REMOTE_ARMED: () => 'กดรีโมท ให้เฝ้าบ้าน',
  REMOTE_DISARMED: () => 'กดรีโมท ให้ไปพัก',
  UNKNOWN_EVENT: (event) => `${event.deviceName} มีเหตุการณ์ไม่ทราบสาเหตุ`
};

// The eventType that always flushes an open window immediately instead of
// waiting out the full WINDOW_MS — there's no benefit to delaying once the
// worst-case event has already happened.
const TERMINAL_EVENT = 'ALARM_ON';

// The two mode acknowledgements. These are not incidents — they're the
// bot confirming it heard you — so they get their own path in process()
// below: never buffered into a correlation window, never folded into a
// CHAIN_ESCALATION, and never suppressed by quiet mode. Without the last
// part the ไปพัก confirmation would silence itself, since app.js and
// interactionRouter.js both turn quiet mode on *before* the confirmation
// is pushed.
const MODE_CONFIRMATION_EVENT_TYPES = new Set(['REMOTE_ARMED', 'REMOTE_DISARMED']);

// Emergencies that still get through a *timed* เงียบๆหน่อย. That flavour of
// quiet means "stop the routine chatter for N minutes" while the house is
// still armed, so a real siren or a leak must not be swallowed. ไปพัก is a
// different promise entirely — see the isIndefiniteQuiet() branch in
// _push(). SMOKE_DETECTED is listed pre-emptively for when a smoke sensor
// is added (no such device/dpProfile exists yet — see
// TUYA_DEVICE_DP_REGISTRY.md/dpProfiles.js) so it bypasses timed quiet the
// moment one appears, without anyone having to remember this list.
//
// ALARM_OFF is deliberately NOT here. It used to be, so the "all clear"
// would follow an ALARM_ON that had already got through — but because a
// chain escalation inherited criticality from any single line, one ALARM_OFF
// dragged every routine door/motion line in its window out to LINE as well.
// That is exactly what produced the stale 10:09:23 chain on 2026-09-04.
const EMERGENCY_EVENT_TYPES = new Set([
  'ALARM_ON',
  'WATER_LEAK',
  'SMOKE_DETECTED'
]);

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

    // Mode acknowledgements short-circuit everything: push once, immediately,
    // and don't touch the window. Letting one open a window was what put the
    // 10:08:22 ไปพัก confirmation at the head of a 60s window that then
    // collected the user walking out the door at 10:08:53; letting one be
    // *buffered* would instead hide the confirmation inside a chain that
    // ไปพัก's own quiet mode would go on to suppress.
    if (MODE_CONFIRMATION_EVENT_TYPES.has(eventType)) {
      if (eventType === 'REMOTE_DISARMED') this._discardWindow();
      await this._push(event);
      return;
    }

    // In ไปพัก nothing but the acknowledgement above is ever sent, so there
    // is nothing worth correlating — drop the event here rather than
    // buffering it into a chain _push() would only suppress at flush time.
    if (quietMode.isIndefiniteQuiet()) {
      logger.info(`[QUIET_MODE] Suppressed (${eventType}) for ${event.deviceName || 'chain escalation'} — ไปพัก`);
      return;
    }

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

  // Drop an in-progress window without flushing it. Used when ไปพัก starts:
  // whatever is buffered is pre-ไปพัก activity the user has just declared to
  // be themselves, and leaving the timer armed would fire a chain escalation
  // up to a full window later, after the house has gone quiet.
  _discardWindow() {
    if (!this.openWindow) return;
    clearTimeout(this.openWindow.timer);
    const buffered = this.openWindow.events.length;
    this.openWindow = null;
    logger.info(`[CORRELATOR] Discarded open window (${buffered} buffered event(s)) — ไปพัก`);
  }

  _openWindow() {
    this.openWindow = {
      events: [],
      openedAt: Date.now(),
      timer: setTimeout(() => {
        this._flush().catch((err) => logger.error('[CORRELATOR] Flush failed:', err));
      }, windowMs())
    };
  }

  async _flush() {
    if (!this.openWindow) return;
    const { events, timer, openedAt } = this.openWindow;
    clearTimeout(timer);
    this.openWindow = null;

    // ไปพัก started after this window opened, so everything buffered here is
    // pre-ไปพัก activity the user has since declared to be themselves. Drop
    // it rather than reporting it late. _discardWindow() already handles the
    // remote-button path the moment it happens; this covers ไปพัก arriving
    // as a LINE command, which the correlator never sees — including the
    // case where a เฝ้าบ้าน has already ended that ไปพัก by the time the
    // window's timer fires, so the isIndefiniteQuiet() gate in _push() would
    // no longer catch it.
    if (quietMode.indefiniteQuietStartedAt() >= openedAt) {
      logger.info(`[CORRELATOR] Dropped window that spanned a ไปพัก (${events.length} event(s))`);
      return;
    }

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
      // Only a real emergency line lets the whole chain through a timed
      // เงียบๆหน่อย — an ALARM_ON folded into a burst shouldn't go missing.
      // Anything less (an ALARM_OFF, a mode change) does not, or every
      // routine door line sharing its window rides out with it.
      containsEmergency: followUps.some((e) => EMERGENCY_EVENT_TYPES.has(e.eventType))
    });
  }

  async _push(event) {
    // Quiet mode suppresses only this final push — dedup, window buffering
    // and CHAIN_ESCALATION composition above all keep running exactly as
    // normal, so state stays consistent and nothing needs replaying once the
    // quiet period ends.
    //
    // Two flavours, two rules:
    //   ไปพัก (indefinite)  — the house is disarmed and you're in it. Send
    //                         nothing at all except the mode acknowledgement
    //                         that announced ไปพัก in the first place.
    //   เงียบๆหน่อย (timed) — the house is still armed, you just want the
    //                         routine chatter to stop. A genuine emergency
    //                         (EMERGENCY_EVENT_TYPES) still gets through.
    if (!MODE_CONFIRMATION_EVENT_TYPES.has(event.eventType) && quietMode.isQuiet()) {
      const target = event.deviceName || 'chain escalation';
      if (quietMode.isIndefiniteQuiet()) {
        logger.info(`[QUIET_MODE] Suppressed (${event.eventType}) push for ${target} — ไปพัก`);
        return;
      }
      const isEmergency = EMERGENCY_EVENT_TYPES.has(event.eventType) || event.containsEmergency;
      if (!isEmergency) {
        logger.info(`[QUIET_MODE] Suppressed (${event.eventType}) push for ${target}`);
        return;
      }
      logger.info(`[QUIET_MODE] Bypassed for emergency (${event.eventType})`);
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
