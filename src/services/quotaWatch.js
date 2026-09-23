const logger = require('../utils/logger');
const botIdentity = require('./botIdentity');
const quietMode = require('./quietMode');

// Warns the group once the active LINE bot's monthly push quota is nearly
// spent, and says which bot to /switch to — once it's actually used up,
// every alert silently fails (LINE rejects the push with 429), and by then
// the bot can't even say so. Only warns; never switches by itself, since
// the switch also needs a human to swap the bots' group membership in the
// LINE app (LINE allows only one bot per group — see botIdentity.js).
//
// Checked right after every successful push (lineMessaging.js), not on a
// timer: usage only ever grows when something is pushed, so with no pushes
// there's nothing new to check. replyMessage doesn't count against the
// quota, so it doesn't trigger a check. getQuota() is two lightweight GETs
// against LINE's own API and isn't counted against the push quota either.
//
// Held back during ไปพัก (total silence): the check just doesn't warn, and
// the first push after ไปพัก ends re-checks and delivers it. A quota running
// low is a "switch bots soon" chore, not an emergency like a gateway going
// offline (deviceHealth.js).
//
// In-memory "already warned" memory, keyed by role + month: a restart may
// repeat the warning once, which is harmless.

// Absolute message count, not a percentage — the free plan's 300/month is
// what this deployment runs on, and 280 leaves room for the warning itself
// plus a switch confirmation.
const warnAt = () => Number(process.env.LINE_QUOTA_WARN_AT) || 280;

const warned = new Set();
let checking = false;

function monthKey(role) {
  const month = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.TIMEZONE || 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date());
  return `${role}:${month}`;
}

function buildWarning(role, used, limit) {
  const header = `⚠️ โควต้าส่งข้อความ LINE ของ bot-${role} เดือนนี้ใกล้หมดแล้วครับ ใช้ไป ${used}/${limit}`;
  const others = botIdentity.SWITCHABLE_ROLES.filter((r) => r !== role && botIdentity.isConfigured(r));
  if (others.length === 0) {
    return `${header}\nถ้าหมดแล้วผมจะแจ้งเตือนไม่ได้จนถึงเดือนหน้านะครับ`;
  }
  const target = others[0];
  return (
    `${header}\nถ้าหมดแล้วผมจะแจ้งเตือนไม่ได้นะครับ ` +
    `แนะนำให้พิมพ์ /switch ${target} แล้วเอา bot-${role} ออกจากกลุ่ม เชิญ bot-${target} เข้ากลุ่มแทนครับ`
  );
}

// Called (not awaited) by lineMessaging.js after each successful push.
// `checking` stops a burst of pushes from firing overlapping checks that
// could each send the warning; the warning's own push lands here too and
// returns early because the month is already marked warned.
async function checkAfterPush(lineService) {
  const role = botIdentity.getActiveRole();
  const key = monthKey(role);
  if (checking || warned.has(key) || quietMode.isIndefiniteQuiet()) return;

  checking = true;
  try {
    const { quota, consumption } = await lineService.getQuota();
    // type 'none' = unlimited plan, nothing to run out of.
    if (quota?.type !== 'limited' || typeof quota.value !== 'number') return;

    const used = consumption?.totalUsage ?? 0;
    logger.debug(`[QUOTA_WATCH] bot-${role}: ${used}/${quota.value}`);
    if (used < warnAt()) return;

    warned.add(key);
    try {
      await lineService.pushMessage(buildWarning(role, used, quota.value));
      logger.info(`[ALERT_SENT] (LINE_QUOTA_LOW) bot-${role} at ${used}/${quota.value}`);
    } catch (err) {
      // Let the next push retry the warning.
      warned.delete(key);
      throw err;
    }
  } catch (err) {
    logger.error('[QUOTA_WATCH] Quota check failed:', err);
  } finally {
    checking = false;
  }
}

module.exports = { checkAfterPush };
