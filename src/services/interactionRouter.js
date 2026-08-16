const deviceRegistry = require('../config/deviceRegistry');
const { CONTROL_DP } = require('../config/dpProfiles');
const tuyaRestClient = require('./tuyaRestClient');
const quietMode = require('./quietMode');
const houseMode = require('./houseMode');
const {
  buildRootMenu,
  buildCategoryMenu,
  buildDeviceMenu,
  buildManageMenu,
  buildHouseMenu,
  buildArmDisarmConfirm,
  buildGreeting,
  buildQuietPrompt,
  queryableDevices,
  armDisarmAvailable
} = require('../templates/menuBuilders');
const { buildStatusCard, buildAllStatusTable, buildConfirmPrompt } = require('../templates/statusCard');
const { buildHistoryMessage } = require('../templates/historyCard');
const logger = require('../utils/logger');

const BOT_NAME = process.env.LINE_BOT_NAME || 'รักยม';

// เมนู opens the root [สถานะ/จัดการ/ดูแลบ้าน] picker. /status and สถานะ are
// more specific shortcuts straight into the สถานะ branch's category picker
// (buildCategoryMenu), skipping the root step — matches how ALL_STATUS/ARM/
// DISARM triggers below skip straight past their own parent menus too.
const MENU_TRIGGERS = new Set(['เมนู']);
const STATUS_MENU_TRIGGERS = new Set(['/status', 'สถานะ']);

// Same shortcut idea as MENU_TRIGGERS, but jumps straight to the "all
// devices + mode" report table (also reachable by tapping "📊 รายงาน" in the
// category menu/greeting) instead of the top-level menu. รายงาน is the
// current label everywhere it's shown; the older สถานะทั้งหมด/-all phrasing
// still works too since there's no reason to break it.
const ALL_STATUS_TRIGGERS = new Set(['/status all', 'สถานะทั้งหมด', 'รายงาน']);

// Shortcut straight into the arm/disarm confirm step (buildArmDisarmConfirm)
// — also reachable via "🏠 ดูแลบ้าน" in the root menu -> buildHouseMenu.
// Both converge on the same confirm prompt; neither skips it.
const ARM_TRIGGERS = new Set(['/arm', 'เฝ้าบ้าน']);
const DISARM_TRIGGERS = new Set(['/disarm', 'ไปพัก']);

// เงียบๆหน่อย opens the duration picker (same convergence pattern as
// ARM/DISARM above); a plain /quiet N is a direct, stateless shortcut that
// skips the picker entirely. ตื่นแล้ว cancels an active quiet period early.
const QUIET_TRIGGERS = new Set(['เงียบๆหน่อย']);
const WAKE_TRIGGERS = new Set(['ตื่นแล้ว', 'กลับบ้าน']);
const QUIET_COMMAND_RE = /^\/quiet\s+(\d+)$/;
const MIN_QUIET_MINUTES = 1;
const MAX_QUIET_MINUTES = 1440;

class InteractionRouter {
  constructor(lineService) {
    this.lineService = lineService;
  }

  // One LINE webhook request can carry several events; dispatch each
  // independently so one failure doesn't block the others.
  async handleEvents(events) {
    await Promise.all(
      events.map((event) =>
        this._handleEvent(event).catch((err) =>
          logger.error('[INTERACTION_ROUTER] Error handling event:', err)
        )
      )
    );
  }

  async _handleEvent(event) {
    if (event.type === 'message' && event.message.type === 'text') {
      return this._handleText(event);
    }
    if (event.type === 'postback') {
      return this._handlePostback(event);
    }
    // Follow/join/other event types: nothing to do yet.
  }

  async _handleText(event) {
    const text = event.message.text.trim();

    if (ALL_STATUS_TRIGGERS.has(text)) {
      await this._replyAllStatus(event.replyToken);
      return;
    }

    if (ARM_TRIGGERS.has(text)) {
      await this._replyArmDisarmConfirm(event.replyToken, 'arm');
      return;
    }

    if (DISARM_TRIGGERS.has(text)) {
      await this._replyArmDisarmConfirm(event.replyToken, 'disarm');
      return;
    }

    if (QUIET_TRIGGERS.has(text)) {
      await this._replyQuietPrompt(event.replyToken);
      return;
    }

    if (WAKE_TRIGGERS.has(text)) {
      await this._wakeQuiet(event.replyToken);
      return;
    }

    const quietMatch = text.match(QUIET_COMMAND_RE);
    if (quietMatch) {
      await this._activateQuiet(event.replyToken, Number(quietMatch[1]));
      return;
    }

    if (STATUS_MENU_TRIGGERS.has(text)) {
      await this.lineService.replyMessage(event.replyToken, buildCategoryMenu());
      return;
    }

    if (MENU_TRIGGERS.has(text)) {
      await this.lineService.replyMessage(event.replyToken, buildRootMenu());
      return;
    }

    // Fallback only — checked after every explicit command/keyword above, so
    // an unambiguous command always wins. A bare positive integer is only
    // treated as a quiet-mode duration if we're within the short window
    // after _replyQuietPrompt armed it; otherwise it's just ignored text.
    if (quietMode.isDurationPromptPending() && /^\d+$/.test(text)) {
      await this._activateQuiet(event.replyToken, Number(text));
      return;
    }

    // Calling the bot by its own name is a friendlier, more discoverable
    // entry point than remembering เมนู — same pattern researched for
    // Phase 2 (ขุนทอง-style keyword trigger).
    if (text === BOT_NAME) {
      await this.lineService.replyMessage(event.replyToken, buildGreeting(BOT_NAME));
    }
  }

  async _handlePostback(event) {
    const params = new URLSearchParams(event.postback.data);
    const action = params.get('a');

    if (action === 'devices') {
      const category = params.get('c');
      await this.lineService.replyMessage(event.replyToken, buildDeviceMenu(category));
      return;
    }

    if (action === 'status') {
      const deviceId = params.get('id');
      await this._replyDeviceStatus(event.replyToken, deviceId);
      return;
    }

    if (action === 'history') {
      const deviceId = params.get('id');
      await this._replyDeviceHistory(event.replyToken, deviceId);
      return;
    }

    if (action === 'all') {
      await this._replyAllStatus(event.replyToken);
      return;
    }

    if (action === 'confirm') {
      const deviceId = params.get('id');
      const cmd = params.get('cmd');
      await this._replyConfirmPrompt(event.replyToken, deviceId, cmd);
      return;
    }

    if (action === 'cmd') {
      const deviceId = params.get('id');
      const cmd = params.get('cmd');
      await this._executeCommand(event.replyToken, deviceId, cmd);
      return;
    }

    if (action === 'cancel') {
      await this.lineService.replyMessage(event.replyToken, { type: 'text', text: 'ยกเลิกแล้วครับ' });
      return;
    }

    if (action === 'house') {
      await this.lineService.replyMessage(event.replyToken, buildHouseMenu());
      return;
    }

    if (action === 'root') {
      await this.lineService.replyMessage(event.replyToken, buildRootMenu());
      return;
    }

    if (action === 'statusmenu') {
      await this.lineService.replyMessage(event.replyToken, buildCategoryMenu());
      return;
    }

    if (action === 'managemenu') {
      await this.lineService.replyMessage(event.replyToken, buildManageMenu());
      return;
    }

    if (action === 'armconfirm') {
      const mode = params.get('mode');
      await this._replyArmDisarmConfirm(event.replyToken, mode);
      return;
    }

    if (action === 'armexec') {
      const mode = params.get('mode');
      await this._executeArmDisarm(event.replyToken, mode);
      return;
    }

    if (action === 'quietprompt') {
      await this._replyQuietPrompt(event.replyToken);
      return;
    }

    if (action === 'quiet') {
      const minutes = Number(params.get('min'));
      await this._activateQuiet(event.replyToken, minutes);
      return;
    }

    if (action === 'wake') {
      await this._wakeQuiet(event.replyToken);
      return;
    }

    logger.debug('[INTERACTION_ROUTER] Unrecognized postback action:', action);
  }

  async _replyArmDisarmConfirm(replyToken, mode) {
    if (!armDisarmAvailable()) {
      await this.lineService.replyMessage(replyToken, { type: 'text', text: 'ยังตั้งค่าเฝ้าบ้าน/ไปพักไม่เสร็จครับ' });
      return;
    }
    await this.lineService.replyMessage(replyToken, buildArmDisarmConfirm(mode));
  }

  // The only place a real arm/disarm command is ever sent — only reachable
  // after the confirm prompt's "✅ ใช่" tap, same pattern as
  // _executeCommand. Triggers the pre-built "Arm"/"Disarm" Tap-to-Run Scene
  // (TUYA_ARM_SCENE_ID / TUYA_DISARM_SCENE_ID) rather than commanding the
  // Security Remote Control directly — that was tried first and rejected by
  // Tuya (error 2008), since that device can transmit button-press events
  // but can't receive downlink commands. Tuya's own automation engine
  // (enabled/disabled by the scene's own actions) remains the authoritative
  // armed/disarmed state; houseMode.js only remembers the bot's own last
  // action for display purposes (รายงาน), and is not treated as fact here.
  //
  // Also drives quiet mode automatically: ไปพัก ("I'm home, resting") means
  // routine door/motion activity is just the household, not alert-worthy —
  // enters indefinite quiet until เฝ้าบ้าน or กลับบ้าน. เฝ้าบ้าน ("watching
  // the house," away) is the opposite: you want full vigilance, so it always
  // resumes alerts even if a previous ไปพัก/เงียบๆหน่อย left quiet mode on.
  async _executeArmDisarm(replyToken, mode) {
    const sceneId = mode === 'arm' ? process.env.TUYA_ARM_SCENE_ID : process.env.TUYA_DISARM_SCENE_ID;
    const label = mode === 'arm' ? 'เฝ้าบ้าน' : 'ไปพัก';
    if (!sceneId) {
      await this.lineService.replyMessage(replyToken, { type: 'text', text: `${label}ผ่านนี้ยังไม่ได้ครับ` });
      return;
    }

    try {
      await tuyaRestClient.triggerScene(sceneId);
      logger.info(`[INTERACTION_ROUTER] Triggered scene (${mode})`);
      houseMode.setMode(mode);

      let text = `${label}เรียบร้อยครับ`;
      if (mode === 'disarm') {
        quietMode.setIndefiniteQuiet();
        text += ' 🤫 จะไม่แจ้งเตือนจนกว่าจะเฝ้าบ้านหรือกลับบ้านนะครับ';
      } else {
        quietMode.clearQuiet();
        text += ' แจ้งเตือนตามปกติครับ';
      }
      await this.lineService.replyMessage(replyToken, { type: 'text', text });
    } catch (err) {
      logger.error(`[INTERACTION_ROUTER] Arm/disarm scene trigger failed (${mode}):`, err);
      await this.lineService.replyMessage(replyToken, { type: 'text', text: `ขอโทษครับ ${label}ไม่สำเร็จ ลองใหม่อีกครั้งนะครับ` });
    }
  }

  async _replyQuietPrompt(replyToken) {
    quietMode.armDurationPrompt();
    await this.lineService.replyMessage(replyToken, buildQuietPrompt());
  }

  // Reachable from a preset tap (a=quiet), a direct /quiet N command, or a
  // bare number typed while the duration prompt is pending — all three
  // converge here. No Yes/No confirm gate, unlike device control/arm-disarm:
  // this is non-destructive and self-expiring, so the two-tap pattern
  // reserved for physical hardware changes doesn't apply.
  async _activateQuiet(replyToken, minutes) {
    quietMode.clearDurationPrompt();

    if (!Number.isInteger(minutes) || minutes < MIN_QUIET_MINUTES || minutes > MAX_QUIET_MINUTES) {
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: `บอกเป็นนาทีระหว่าง ${MIN_QUIET_MINUTES}-${MAX_QUIET_MINUTES} นะครับ`
      });
      return;
    }

    quietMode.setQuiet(minutes, () => this.lineService.pushMessage('กลับมาแล้วครับ ✅'));
    await this.lineService.replyMessage(replyToken, { type: 'text', text: `เงียบไป ${minutes} นาทีนะครับ 🤫` });
  }

  async _wakeQuiet(replyToken) {
    if (!quietMode.isQuiet()) {
      await this.lineService.replyMessage(replyToken, { type: 'text', text: 'ตอนนี้ไม่ได้เงียบอยู่ครับ' });
      return;
    }
    quietMode.clearQuiet();
    // Wording kept neutral (not "I'm awake") since this same reply fires for
    // both ตื่นแล้ว and กลับบ้าน — "I'm home" wouldn't fit an "awake" framing.
    await this.lineService.replyMessage(replyToken, { type: 'text', text: 'กลับมาแจ้งเตือนตามปกติแล้วครับ ✅' });
  }

  async _replyConfirmPrompt(replyToken, deviceId, cmd) {
    const device = deviceRegistry[deviceId];
    if (!device) {
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: 'ไม่พบอุปกรณ์นี้แล้วครับ ลองเปิดเมนูใหม่อีกครั้งนะครับ'
      });
      return;
    }
    await this.lineService.replyMessage(replyToken, buildConfirmPrompt({ id: deviceId, ...device }, cmd));
  }

  // The only place a real Tuya command is ever sent — only reachable after
  // the user has tapped the toggle button (opens the confirm prompt) *and*
  // then tapped "ใช่" on that prompt. Never triggered by a single tap.
  async _executeCommand(replyToken, deviceId, cmd) {
    const device = deviceRegistry[deviceId];
    if (!device) {
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: 'ไม่พบอุปกรณ์นี้แล้วครับ ลองเปิดเมนูใหม่อีกครั้งนะครับ'
      });
      return;
    }

    const controlDp = CONTROL_DP[device.dpProfile];
    if (!controlDp) {
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: `${device.name} ยังสั่งเปิด/ปิดผ่านนี้ไม่ได้ครับ`
      });
      return;
    }

    const actionLabel = cmd === 'on' ? 'เปิด' : 'ปิด';
    try {
      await tuyaRestClient.sendCommand(deviceId, [{ code: controlDp, value: cmd === 'on' }]);
      logger.info(`[INTERACTION_ROUTER] Sent command (${controlDp}=${cmd === 'on'}) to ${deviceId}`);
      await this.lineService.replyMessage(replyToken, { type: 'text', text: `${actionLabel} ${device.name} เรียบร้อยครับ` });
    } catch (err) {
      logger.error(`[INTERACTION_ROUTER] Command failed for ${deviceId}:`, err);
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: `ขอโทษครับ ${actionLabel} ${device.name} ไม่สำเร็จ ลองใหม่อีกครั้งนะครับ`
      });
    }
  }

  // Queries every queryable device's status in parallel — a partial failure
  // (one device's Tuya call errors/times out) still shows every device that
  // did succeed, rather than failing the whole carousel over one bad query.
  async _replyAllStatus(replyToken) {
    const devices = queryableDevices();
    if (devices.length === 0) {
      await this.lineService.replyMessage(replyToken, { type: 'text', text: 'ยังไม่มีอุปกรณ์ที่เช็คสถานะได้ครับ' });
      return;
    }

    const settled = await Promise.allSettled(
      devices.map((device) => tuyaRestClient.getDeviceStatus(device.id))
    );

    const results = devices.map((device, i) => {
      const outcome = settled[i];
      if (outcome.status === 'fulfilled') {
        return { device, rawStatus: outcome.value };
      }
      logger.error(`[INTERACTION_ROUTER] Status query failed for ${device.id}:`, outcome.reason);
      return { device, error: true };
    });

    const modeInfo = {
      armMode: houseMode.getMode(),
      quietMinutes: quietMode.isQuiet() ? quietMode.remainingMinutes() : 0
    };
    await this.lineService.replyMessage(replyToken, buildAllStatusTable(results, modeInfo));
  }

  async _replyDeviceStatus(replyToken, deviceId) {
    const device = deviceRegistry[deviceId];
    if (!device) {
      // Registry can change between when a menu was sent and when it's
      // tapped (device removed, .env pointed at a different registry) —
      // don't trust the postback payload blindly.
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: 'ไม่พบอุปกรณ์นี้แล้วครับ ลองเปิดเมนูใหม่อีกครั้งนะครับ'
      });
      return;
    }

    try {
      const rawStatus = await tuyaRestClient.getDeviceStatus(deviceId);
      await this.lineService.replyMessage(
        replyToken,
        buildStatusCard({ id: deviceId, ...device }, rawStatus)
      );
    } catch (err) {
      logger.error(`[INTERACTION_ROUTER] Status query failed for ${deviceId}:`, err);
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: `ขอโทษครับ เช็คสถานะ ${device.name} ไม่ได้ในตอนนี้ ลองใหม่อีกครั้งนะครับ`
      });
    }
  }

  async _replyDeviceHistory(replyToken, deviceId) {
    const device = deviceRegistry[deviceId];
    if (!device) {
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: 'ไม่พบอุปกรณ์นี้แล้วครับ ลองเปิดเมนูใหม่อีกครั้งนะครับ'
      });
      return;
    }

    try {
      const rawLogs = await tuyaRestClient.getDeviceLogs(deviceId);
      await this.lineService.replyMessage(
        replyToken,
        buildHistoryMessage({ id: deviceId, ...device }, rawLogs.logs)
      );
    } catch (err) {
      logger.error(`[INTERACTION_ROUTER] History query failed for ${deviceId}:`, err);
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: `ขอโทษครับ ดูประวัติ ${device.name} ไม่ได้ในตอนนี้ ลองใหม่อีกครั้งนะครับ`
      });
    }
  }
}

module.exports = InteractionRouter;
