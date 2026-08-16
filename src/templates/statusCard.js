// Flex Bubble builder for a single device's live status. JS function, not
// static JSON — content (name, state, battery) is per-device and per-query.
//
// Reads DP codes generically across the profiles a category can span (e.g.
// door covers both `mcs`'s doorcontact_state and `qt`'s switch) rather than
// routing through dpProfiles.js's alert resolvers — those intentionally
// suppress routine readings (e.g. healthy battery returns null, since it's
// not alert-worthy), but a status query needs to always show the current
// battery level, healthy or not. Display and alerting are different jobs
// even when they read the same DPs.

const { DEVICE_CATEGORIES } = require('../config/deviceCategories');
const { CONTROL_DP } = require('../config/dpProfiles');

function dpMapFrom(rawStatus) {
  return Object.fromEntries((rawStatus || []).map((dp) => [dp.code, dp.value]));
}

function describeState(category, dpMap) {
  switch (category) {
    case 'door': {
      const isOpen = dpMap.doorcontact_state === true || dpMap.switch === true;
      return { stateText: isOpen ? 'เปิดอยู่' : 'ปิดอยู่', stateEmoji: isOpen ? '🔓' : '🔒' };
    }
    case 'relay': {
      const isOn = dpMap.switch_1 === true;
      return { stateText: isOn ? 'เปิดอยู่' : 'ปิดอยู่', stateEmoji: isOn ? '💡' : '⚫' };
    }
    case 'alarm': {
      const isOn = dpMap.alarm_switch === true;
      return { stateText: isOn ? 'กำลังดังอยู่' : 'ปกติ', stateEmoji: isOn ? '🚨' : '✅' };
    }
    case 'water': {
      const isLeak = dpMap.watersensor_state === 'alarm' || dpMap.watersensor_state === true;
      return { stateText: isLeak ? 'ตรวจพบน้ำรั่ว!' : 'ปกติ', stateEmoji: isLeak ? '💧' : '✅' };
    }
    case 'motion':
    default:
      return { stateText: 'พร้อมใช้งาน', stateEmoji: '🏃' };
  }
}

// Bubble content only (no altText/message wrapper) — used by the
// single-device status card (buildStatusCard). The "all devices" table
// (buildAllStatusTable/buildStatusRow below) renders its own compact row
// layout instead of reusing this bubble; both draw on the same
// dpMapFrom/describeState helpers so they can never disagree on a device's
// state, just on how much of it they show.
function buildStatusBubble(device, rawStatus, error) {
  const cat = DEVICE_CATEGORIES[device.category] || {};

  const bodyContents = [];

  if (error) {
    bodyContents.push({
      type: 'text',
      text: '⚠️ เช็คสถานะไม่ได้',
      size: 'lg',
      weight: 'bold',
      color: '#CC3333'
    });
  } else {
    const dpMap = dpMapFrom(rawStatus);
    const { stateText, stateEmoji } = describeState(device.category, dpMap);
    const battery = dpMap.battery_percentage ?? dpMap.battery;

    bodyContents.push({
      type: 'text',
      text: `${stateEmoji} ${stateText}`,
      size: 'xl',
      weight: 'bold'
    });

    if (typeof battery === 'number') {
      bodyContents.push({
        type: 'text',
        text: `🔋 แบตเหลือ ${battery}%`,
        size: 'sm',
        color: '#888888',
        margin: 'md'
      });
    }
  }

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: `${cat.emoji || ''} ${device.name}`.trim(), weight: 'bold', wrap: true }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents
    }
  };
}

// Increment 2 (device control): a toggle Quick Reply item for any device
// whose dpProfile has a CONTROL_DP entry — currently relay (tdq) and alarm
// (sgbj). The button reflects the opposite of the device's current on/off
// state (currently off -> "turn on" button, and vice versa) so tapping it
// always makes sense as the next action, not a fixed "toggle" whose effect
// depends on state the user can't see at a glance. Tapping only opens a
// confirm prompt (buildConfirmPrompt) — it never sends the real command
// directly, per the "confirm before acting on physical hardware" rule.
function toggleQuickReplyItem(device, dpMap) {
  const controlDp = CONTROL_DP[device.dpProfile];
  if (!controlDp) return null;

  const isOn = dpMap[controlDp] === true;
  const nextCmd = isOn ? 'off' : 'on';
  const label = isOn ? '⚪ ปิด' : '🔴 เปิด';

  return {
    type: 'action',
    action: {
      type: 'postback',
      label,
      data: `a=confirm&id=${device.id}&cmd=${nextCmd}`,
      displayText: label
    }
  };
}

// Increment 3: every queryable device (control or not) gets a "recent
// activity" shortcut on its status card, not just controllable ones — device
// history is a query action, same category as the status card itself.
function historyQuickReplyItem(device) {
  return {
    type: 'action',
    action: {
      type: 'postback',
      label: '🕘 ประวัติ',
      data: `a=history&id=${device.id}`,
      displayText: '🕘 ประวัติ'
    }
  };
}

function buildStatusCard(device, rawStatus) {
  const dpMap = dpMapFrom(rawStatus);
  const { stateText } = describeState(device.category, dpMap);

  const items = [toggleQuickReplyItem(device, dpMap), historyQuickReplyItem(device)].filter(Boolean);

  return {
    type: 'flex',
    altText: `${device.name}: ${stateText}`,
    contents: buildStatusBubble(device, rawStatus),
    quickReply: { items }
  };
}

// Yes/No confirm step before a state-changing command actually fires —
// required for every toggle regardless of category, so a mis-tap on the
// status card's button can't flip a real relay/alarm without a second,
// deliberate tap.
function buildConfirmPrompt(device, cmd) {
  const actionLabel = cmd === 'on' ? 'เปิด' : 'ปิด';
  return {
    type: 'text',
    text: `ยืนยันจะ${actionLabel} ${device.name} ใช่ไหมครับ?`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: `✅ ใช่ ${actionLabel}เลย`,
            data: `a=cmd&id=${device.id}&cmd=${cmd}`,
            displayText: `✅ ยืนยัน${actionLabel} ${device.name}`
          }
        },
        {
          type: 'action',
          action: {
            type: 'postback',
            label: '❌ ยกเลิก',
            data: 'a=cancel',
            displayText: '❌ ยกเลิก'
          }
        }
      ]
    }
  };
}

// One row of the "all devices" table: name on its own full-width line
// (wraps freely for long names without disturbing anything else), then
// state + battery on a second line below it. An earlier version put all
// three on one horizontal line — a long wrapped name then visually detached
// from the state/battery columns, which stayed pinned to the row's top.
// Stacking avoids that regardless of name length. A per-device error (e.g.
// that one Tuya call timed out) still renders its own row rather than
// failing the whole table; devices that succeeded still show their real
// status.
function buildStatusRow(device, rawStatus, error) {
  const cat = DEVICE_CATEGORIES[device.category] || {};
  let stateCell = '⚠️ เช็คไม่ได้';
  let stateColor = '#CC3333';
  let batteryCell = '-';

  if (!error) {
    const dpMap = dpMapFrom(rawStatus);
    const { stateText, stateEmoji } = describeState(device.category, dpMap);
    const battery = dpMap.battery_percentage ?? dpMap.battery;
    stateCell = `${stateEmoji} ${stateText}`;
    stateColor = '#111111';
    batteryCell = typeof battery === 'number' ? `${battery}%` : '-';
  }

  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: `${cat.emoji || ''} ${device.name}`.trim(),
        size: 'sm',
        weight: 'bold',
        wrap: true
      },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          {
            type: 'text',
            text: stateCell,
            flex: 3,
            size: 'sm',
            color: stateColor
          },
          {
            type: 'text',
            text: batteryCell,
            flex: 1,
            size: 'xs',
            color: '#888888',
            align: 'end'
          }
        ]
      }
    ]
  };
}

// Mode summary lines shown above the device table — armMode reflects only
// the last เฝ้าบ้าน/ไปพัก this app observed, either via LINE or the physical
// remote (houseMode.js), not a verified live query against Tuya, so it's
// labeled as such rather than presented as fact. Omitted entirely if
// neither is currently known/active, rather than showing a misleading
// "unknown" placeholder.
function buildModeSection({ armMode, quietMinutes } = {}) {
  const lines = [];

  if (armMode === 'arm') {
    lines.push('🛡️ เฝ้าบ้าน (ล่าสุดที่ทราบ)');
  } else if (armMode === 'disarm') {
    lines.push('🛌 ไปพัก (ล่าสุดที่ทราบ)');
  }

  // quietMinutes: null = indefinite (quietMode.remainingMinutes() returns
  // null while quietMode.isQuiet() is still true — see quietMode.js), a
  // number > 0 = a timed countdown, 0/undefined = not quiet.
  if (quietMinutes === null) {
    lines.push('🤫 อยู่เงียบๆ (จนกว่าจะเฝ้าบ้านหรือกลับบ้าน)');
  } else if (quietMinutes > 0) {
    lines.push(`🤫 อยู่เงียบๆ อีก ${quietMinutes} นาที`);
  }

  if (lines.length === 0) return [];

  return [
    {
      type: 'box',
      layout: 'vertical',
      contents: lines.map((text) => ({ type: 'text', text, size: 'sm', weight: 'bold' }))
    },
    { type: 'separator', margin: 'md' }
  ];
}

// LINE's monthly push-message quota (lineMessaging.js's getQuota) — best
// effort, same tier as armMode/quietMinutes above: omitted entirely rather
// than shown as "unknown" if the query failed or wasn't attempted. `quota`
// is LINE's raw MessageQuotaResponse ({ type: 'limited'|'none', value? });
// `type: 'none'` means an unlimited plan, so there's no denominator to show.
function buildQuotaSection({ quota, quotaConsumed } = {}) {
  if (quota == null || quotaConsumed == null) return [];

  const text =
    quota.type === 'limited' && typeof quota.value === 'number'
      ? `📨 ส่งข้อความไปแล้ว ${quotaConsumed}/${quota.value} ครั้งเดือนนี้`
      : `📨 ส่งข้อความไปแล้ว ${quotaConsumed} ครั้งเดือนนี้ (ไม่จำกัดโควต้า)`;

  return [
    {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'text', text, size: 'sm', color: '#888888' }]
    },
    { type: 'separator', margin: 'md' }
  ];
}

// `results` is an array of { device, rawStatus, error } — one entry per
// queryable device, in registry order. `modeInfo` ({ armMode, quietMinutes,
// quota, quotaConsumed }) is optional context beyond device status
// (Increment 3, plus daily summary). Single Flex Bubble, one row per device
// — reads as a table, no swiping needed (the earlier Flex Carousel version
// required tapping through one card per device, which was harder to scan at
// a glance for the whole house at once).
function buildAllStatusTable(results, modeInfo) {
  const deviceRows = results.flatMap(({ device, rawStatus, error }, i) => {
    const row = buildStatusRow(device, rawStatus, error);
    return i === 0 ? [row] : [{ type: 'separator', margin: 'md' }, row];
  });
  const rows = [...buildModeSection(modeInfo), ...buildQuotaSection(modeInfo), ...deviceRows];

  return {
    type: 'flex',
    altText: 'รายงาน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: '📊 รายงาน', weight: 'bold' }]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: rows
      }
    }
  };
}

module.exports = { buildStatusCard, buildAllStatusTable, buildConfirmPrompt };
