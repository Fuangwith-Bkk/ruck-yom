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
// what this deployment runs on. LINE counts a group push once per member,
// so with the family group's 6 members every push costs ~6: the old
// default of 280 left only ~3 pushes of headroom, and a burst skipped
// straight past it to 300 with the warning itself rejected (2026-10-26).
// 240 leaves ~10 pushes.
const warnAt = () => Number(process.env.LINE_QUOTA_WARN_AT) || 240;

const warned = new Set();
let checking = false;
// Set when a push lands while a check is already in flight, so that push's
// usage still gets checked once the current check finishes — otherwise a
// burst's pushes are never looked at and can carry usage from below the
// threshold to the limit unseen.
let recheck = false;

function monthKey(role) {
  const month = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.TIMEZONE || 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date());
  return `${role}:${month}`;
}

// With three switchable bots, the first configured one may itself be spent
// this month — so recommend whichever other bot has the most quota left.
// A bot whose quota can't be read is skipped; if none can be read, fall
// back to the first configured one rather than recommending nothing.
async function pickSwitchTarget(lineService, role) {
  const others = botIdentity.SWITCHABLE_ROLES.filter((r) => r !== role && botIdentity.isConfigured(r));
  let best = null;
  for (const r of others) {
    try {
      const { quota, consumption } = await lineService.getQuota(r);
      const remaining =
        quota?.type === 'limited' && typeof quota.value === 'number'
          ? quota.value - (consumption?.totalUsage ?? 0)
          : Infinity;
      if (!best || remaining > best.remaining) best = { role: r, remaining };
    } catch (err) {
      logger.error(`[QUOTA_WATCH] Quota check for bot-${r} failed:`, err);
    }
  }
  if (best) return best;
  return others.length > 0 ? { role: others[0], remaining: null } : null;
}

function buildWarning(role, used, limit, target) {
  const header = `⚠️ โควต้าส่งข้อความ LINE ของ bot-${role} เดือนนี้ใกล้หมดแล้วครับ ใช้ไป ${used}/${limit}`;
  if (!target || target.remaining === 0) {
    return `${header}\nถ้าหมดแล้วผมจะแจ้งเตือนไม่ได้จนถึงเดือนหน้านะครับ`;
  }
  const left = Number.isFinite(target.remaining) ? ` (เหลือ ${target.remaining} ครั้ง)` : '';
  return (
    `${header}\nถ้าหมดแล้วผมจะแจ้งเตือนไม่ได้นะครับ ` +
    `แนะนำให้พิมพ์ /switch ${target.role}${left} แล้วเอา bot-${role} ออกจากกลุ่ม เชิญ bot-${target.role} เข้ากลุ่มแทนครับ`
  );
}

// Once a bot's quota is actually spent, pushes can't say so — but replies
// are free, so lineMessaging.js's replyMessage appends a note to whatever
// the group next asks for. Marked from a push rejected for the monthly
// limit (lineMessaging.js) or a check that sees usage at the limit, keyed
// by role + month like `warned` so it clears itself when the quota resets.
// In-memory: after a restart the next failed push marks it again.
const exhausted = new Set();

function markExhausted(role) {
  const key = monthKey(role);
  if (exhausted.has(key)) return;
  exhausted.add(key);
  logger.info(`[QUOTA_WATCH] bot-${role} has used up its monthly push quota`);
}

function isExhausted(role) {
  return exhausted.has(monthKey(role));
}

async function buildExhaustedNote(lineService, role) {
  const header = `⚠️ โควต้าส่งข้อความ LINE ของ bot-${role} เดือนนี้หมดแล้วครับ ตอนนี้ผมส่งแจ้งเตือนเข้ากลุ่มไม่ได้ ตอบกลับได้อย่างเดียว`;
  const target = await pickSwitchTarget(lineService, role);
  if (!target || target.remaining === 0) {
    return `${header}\nbot ตัวอื่นก็หมดโควต้าแล้ว จะแจ้งเตือนได้อีกทีเดือนหน้านะครับ`;
  }
  const left = Number.isFinite(target.remaining) ? ` (เหลือ ${target.remaining} ครั้ง)` : '';
  return (
    `${header}\nแนะนำให้พิมพ์ /switch ${target.role}${left} ` +
    `แล้วเอา bot-${role} ออกจากกลุ่ม เชิญ bot-${target.role} เข้ากลุ่มแทนครับ`
  );
}

// Called (not awaited) by lineMessaging.js after each successful push.
// `checking` stops a burst of pushes from firing overlapping checks that
// could each send the warning; those pushes set `recheck` instead, and one
// follow-up check runs when the current one finishes. The warning's own
// push lands here too and returns early because the month is already
// marked warned.
async function checkAfterPush(lineService) {
  const role = botIdentity.getActiveRole();
  const key = monthKey(role);
  if (warned.has(key) || quietMode.isIndefiniteQuiet()) return;
  if (checking) {
    recheck = true;
    return;
  }

  checking = true;
  try {
    const { quota, consumption } = await lineService.getQuota();
    // type 'none' = unlimited plan, nothing to run out of.
    if (quota?.type !== 'limited' || typeof quota.value !== 'number') return;

    const used = consumption?.totalUsage ?? 0;
    logger.debug(`[QUOTA_WATCH] bot-${role}: ${used}/${quota.value}`);
    if (used >= quota.value) markExhausted(role);
    if (used < warnAt()) return;

    warned.add(key);
    try {
      const target = await pickSwitchTarget(lineService, role);
      await lineService.pushMessage(buildWarning(role, used, quota.value, target));
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
    if (recheck) {
      recheck = false;
      checkAfterPush(lineService);
    }
  }
}

module.exports = { checkAfterPush, markExhausted, isExhausted, buildExhaustedNote };
