const deviceRegistry = require('../config/deviceRegistry');
const { CONTROL_DP } = require('../config/dpProfiles');
const tuyaRestClient = require('./tuyaRestClient');
const {
  buildRootMenu,
  buildCategoryMenu,
  buildDeviceMenu,
  buildManageMenu,
  buildHouseMenu,
  buildArmDisarmConfirm,
  buildGreeting,
  queryableDevices,
  armDisarmAvailable
} = require('../templates/menuBuilders');
const { buildStatusCard, buildAllStatusTable, buildConfirmPrompt } = require('../templates/statusCard');
const logger = require('../utils/logger');

const BOT_NAME = process.env.LINE_BOT_NAME || 'รักยม';

// เมนู opens the root [สถานะ/จัดการ/ดูแลบ้าน] picker. /status and สถานะ are
// more specific shortcuts straight into the สถานะ branch's category picker
// (buildCategoryMenu), skipping the root step — matches how ALL_STATUS/ARM/
// DISARM triggers below skip straight past their own parent menus too.
const MENU_TRIGGERS = new Set(['เมนู']);
const STATUS_MENU_TRIGGERS = new Set(['/status', 'สถานะ']);

// Same shortcut idea as MENU_TRIGGERS, but jumps straight to the "all
// devices" carousel (also reachable by tapping "📋 ทั้งหมด" in the category
// menu) instead of the top-level menu.
const ALL_STATUS_TRIGGERS = new Set(['/status all', 'สถานะทั้งหมด']);

// Shortcut straight into the arm/disarm confirm step (buildArmDisarmConfirm)
// — also reachable via "🏠 ดูแลบ้าน" in the root menu -> buildHouseMenu.
// Both converge on the same confirm prompt; neither skips it.
const ARM_TRIGGERS = new Set(['/arm', 'เฝ้าบ้าน']);
const DISARM_TRIGGERS = new Set(['/disarm', 'ไปพัก']);

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

    if (STATUS_MENU_TRIGGERS.has(text)) {
      await this.lineService.replyMessage(event.replyToken, buildCategoryMenu());
      return;
    }

    if (MENU_TRIGGERS.has(text)) {
      await this.lineService.replyMessage(event.replyToken, buildRootMenu());
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
  // but can't receive downlink commands. This app tracks no armed/disarmed
  // state of its own; Tuya's automation engine (enabled/disabled by the
  // scene's own actions) already is that state.
  async _executeArmDisarm(replyToken, mode) {
    const sceneId = mode === 'arm' ? process.env.TUYA_ARM_SCENE_ID : process.env.TUYA_DISARM_SCENE_ID;
    const label = mode === 'arm' ? 'เฝ้าบ้าน' : 'ไปพัก';
    if (!sceneId) {
      await this.lineService.replyMessage(replyToken, { type: 'text', text: `${label}ผ่านนี้ยังไม่ได้ครับ` });
      return;
    }

    try {
      await tuyaRestClient.triggerScene(sceneId);
      logger.info(`[INTERACTION_ROUTER] Triggered scene ${sceneId} (${mode})`);
      await this.lineService.replyMessage(replyToken, { type: 'text', text: `${label}เรียบร้อยครับ` });
    } catch (err) {
      logger.error(`[INTERACTION_ROUTER] Arm/disarm scene trigger failed (${mode}):`, err);
      await this.lineService.replyMessage(replyToken, { type: 'text', text: `ขอโทษครับ ${label}ไม่สำเร็จ ลองใหม่อีกครั้งนะครับ` });
    }
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

    await this.lineService.replyMessage(replyToken, buildAllStatusTable(results));
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
}

module.exports = InteractionRouter;
