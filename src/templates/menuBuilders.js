// Quick Reply builders for the tap-through menu flow. JS functions, not
// static JSON like securityAlerts.json, since content is structurally
// dynamic — the category list and device list both depend on what's
// actually in deviceRegistry.json, not a fixed template.
//
// Postback `data` encodes the whole next step as a plain query string
// (parsed with URLSearchParams in interactionRouter.js) — no server-side
// session needed; every tap is a self-contained request.

const deviceRegistry = require('../config/deviceRegistry');
const { DEVICE_CATEGORIES } = require('../config/deviceCategories');

// Only categories that are meant to appear in the menu (deviceCategories.js
// `inMenu: true`) AND actually have >=1 device registered — so the menu
// scales automatically as devices are added/removed, never listing an empty
// category or one like "remote"/"gateway" that has nothing to query.
function categoriesWithDevices() {
  const present = new Set(Object.values(deviceRegistry).map((d) => d.category));
  return Object.entries(DEVICE_CATEGORIES)
    .filter(([key, cat]) => cat.inMenu && present.has(key));
}

function devicesInCategory(category) {
  return Object.entries(deviceRegistry)
    .filter(([, device]) => device.category === category)
    .map(([id, device]) => ({ id, ...device }));
}

// Every registered device whose category is queryable (deviceCategories.js
// `queryable: true`) — excludes remote/gateway, same as the category menu
// itself. Registry order, so repeated queries return devices in a stable
// order.
function queryableDevices() {
  return Object.entries(deviceRegistry)
    .filter(([, device]) => DEVICE_CATEGORIES[device.category]?.queryable)
    .map(([id, device]) => ({ id, ...device }));
}

// Every registered device whose category is controllable (deviceCategories.js
// `controllable: true`) — currently relay + alarm. Feeds the จัดการ (Manage)
// menu, a flat shortcut list skipping the category step entirely since
// there are typically few controllable devices compared to queryable ones.
function controllableDevices() {
  return Object.entries(deviceRegistry)
    .filter(([, device]) => DEVICE_CATEGORIES[device.category]?.controllable)
    .map(([id, device]) => ({ id, ...device }));
}

// เฝ้าบ้าน/ไปพัก are available once both Tap-to-Run scene rule_ids are
// configured (see .env.example) — trying to command the Security Remote
// Control device directly to simulate its physical button press was tried
// first and rejected by Tuya (a battery-powered Zigbee end device can send
// events but can't receive downlink commands); triggering the pre-built
// Tap-to-Run Scenes that replicate the same actions works instead.
function armDisarmAvailable() {
  return Boolean(process.env.TUYA_ARM_SCENE_ID && process.env.TUYA_DISARM_SCENE_ID);
}

// เมนู -> [สถานะ / จัดการ / ดูแลบ้าน] top-level router. Each branch is only
// offered if it'd actually have something to show — จัดการ/ดูแลบ้าน hide
// themselves automatically if there are no controllable devices / no remote
// registered yet, same "scales with the registry" pattern as the rest of
// this file.
function buildRootMenu() {
  const items = [
    {
      type: 'action',
      action: { type: 'postback', label: '📋 สถานะ', data: 'a=statusmenu', displayText: '📋 สถานะ' }
    }
  ];

  if (controllableDevices().length > 0) {
    items.push({
      type: 'action',
      action: { type: 'postback', label: '🔧 จัดการ', data: 'a=managemenu', displayText: '🔧 จัดการ' }
    });
  }

  if (armDisarmAvailable()) {
    items.push({
      type: 'action',
      action: { type: 'postback', label: '🏠 ดูแลบ้าน', data: 'a=house', displayText: '🏠 ดูแลบ้าน' }
    });
  }

  items.push({
    type: 'action',
    action: { type: 'postback', label: '🤫 เงียบๆ', data: 'a=quietprompt', displayText: '🤫 เงียบๆหน่อย' }
  });

  return {
    type: 'text',
    text: 'มีอะไรให้ช่วยครับ',
    quickReply: { items }
  };
}

// สถานะ branch: category -> device -> status+control (reuses the same
// buildDeviceMenu/status-card flow จัดการ also ends up at, since a
// controllable device's status card already includes its control buttons —
// สถานะ and จัดการ are two different *entry points* into the same view, not
// two different views).
function buildCategoryMenu() {
  const categories = categoriesWithDevices();
  const items = [
    ...categories.map(([key, cat]) => ({
      type: 'action',
      action: {
        type: 'postback',
        label: `${cat.emoji} ${cat.label}`.slice(0, 20),
        data: `a=devices&c=${key}`,
        displayText: `${cat.emoji} ${cat.label}`
      }
    })),
    {
      type: 'action',
      action: {
        type: 'postback',
        label: '📊 รายงาน',
        data: 'a=all',
        displayText: '📊 รายงาน'
      }
    }
  ];

  return {
    type: 'text',
    text: 'เลือกหมวดหมู่อุปกรณ์ที่ต้องการเช็คสถานะครับ',
    quickReply: { items }
  };
}

// จัดการ branch: flat list of controllable devices only (relay + alarm
// today), skipping the category step — there are typically few enough that
// grouping adds a tap without adding clarity. No "ทั้งหมด" batch action:
// "turn everything on/off at once" has no unambiguous single meaning with
// only 2 controllable devices, so it's not offered; tapping a device here
// reaches the same status+control card สถานะ would.
function buildManageMenu() {
  const devices = controllableDevices();

  if (devices.length === 0) {
    return { type: 'text', text: 'ยังไม่มีอุปกรณ์ที่จัดการผ่านนี้ได้ครับ' };
  }

  return {
    type: 'text',
    text: 'เลือกอุปกรณ์ที่ต้องการจัดการครับ',
    quickReply: {
      items: devices.map((device) => ({
        type: 'action',
        action: {
          type: 'postback',
          label: device.name.slice(0, 20),
          data: `a=status&id=${device.id}`,
          displayText: device.name
        }
      }))
    }
  };
}

// Triggered by typing the bot's own name — a friendly, discoverable entry
// point (matching the ขุนทอง-style pattern researched for Phase 2) distinct
// from เมนู itself: a short greeting plus direct shortcuts to the most
// common actions, rather than making the user navigate เมนู -> สถานะ first.
function buildGreeting(botName) {
  const items = [
    {
      type: 'action',
      action: { type: 'postback', label: '📋 เมนู', data: 'a=root', displayText: '📋 เมนู' }
    },
    {
      type: 'action',
      action: { type: 'postback', label: '📊 รายงาน', data: 'a=all', displayText: '📊 รายงาน' }
    }
  ];

  if (armDisarmAvailable()) {
    items.push(
      {
        type: 'action',
        action: { type: 'postback', label: '🛡️ เฝ้าบ้าน', data: 'a=armconfirm&mode=arm', displayText: '🛡️ เฝ้าบ้าน' }
      },
      {
        type: 'action',
        action: { type: 'postback', label: '🛌 ไปพัก', data: 'a=armconfirm&mode=disarm', displayText: '🛌 ไปพัก' }
      }
    );
  }

  items.push({
    type: 'action',
    action: { type: 'postback', label: '🤫 เงียบๆ', data: 'a=quietprompt', displayText: '🤫 เงียบๆหน่อย' }
  });

  return {
    type: 'text',
    text: `มีอะไรให้${botName}ช่วยครับ`,
    quickReply: { items }
  };
}

// เฝ้าบ้าน (arm) / ไปพัก (disarm) / กลับบ้าน picker — reached either by
// tapping "🏠 ดูแลบ้าน" in the category menu, or typing เฝ้าบ้าน/ไปพัก/
// กลับบ้าน directly as a shortcut (interactionRouter.js). เฝ้าบ้าน/ไปพัก
// converge on the confirm step (buildArmDisarmConfirm) before anything is
// actually sent; กลับบ้าน ("home now") cancels an active quiet period
// (เงียบๆหน่อย) immediately, same non-destructive/no-confirm-needed
// reasoning as ตื่นแล้ว.
function buildHouseMenu() {
  return {
    type: 'text',
    text: 'เฝ้าบ้านหรือไปพักดีครับ?',
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'postback', label: '🛡️ เฝ้าบ้าน', data: 'a=armconfirm&mode=arm', displayText: '🛡️ เฝ้าบ้าน' }
        },
        {
          type: 'action',
          action: { type: 'postback', label: '🛌 ไปพัก', data: 'a=armconfirm&mode=disarm', displayText: '🛌 ไปพัก' }
        },
        {
          type: 'action',
          action: { type: 'postback', label: '🏡 กลับบ้าน', data: 'a=wake', displayText: '🏡 กลับบ้าน' }
        }
      ]
    }
  };
}

// Yes/No confirm before actually sending the arm/disarm DP command — arming
// or disarming the whole house's security automation is at least as
// consequential as toggling one relay/alarm, so it gets the same
// confirm-before-act treatment (Section 8.12's buildConfirmPrompt).
function buildArmDisarmConfirm(mode) {
  const isArm = mode === 'arm';
  const label = isArm ? 'เฝ้าบ้าน' : 'ไปพัก';
  return {
    type: 'text',
    text: `ยืนยันจะ${label}ใช่ไหมครับ?`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: `✅ ใช่ ${label}เลย`,
            data: `a=armexec&mode=${mode}`,
            displayText: `✅ ยืนยัน${label}`
          }
        },
        {
          type: 'action',
          action: { type: 'postback', label: '❌ ยกเลิก', data: 'a=cancel', displayText: '❌ ยกเลิก' }
        }
      ]
    }
  };
}

// เงียบๆหน่อย picker — preset durations cover the common cases; the prompt
// text also tells the user they can just type a number of minutes instead
// (interactionRouter.js arms a short-lived "awaiting duration" flag right
// after sending this, so a bare typed number that follows is understood).
function buildQuietPrompt() {
  return {
    type: 'text',
    text: 'เดี๋ยวจะไปเล่นข้างนอกสักครู่ ให้เงียบไปนานแค่ไหนดีครับ? (หรือพิมพ์จำนวนนาทีก็ได้ครับ)',
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'postback', label: '30 นาที', data: 'a=quiet&min=30', displayText: '30 นาที' }
        },
        {
          type: 'action',
          action: { type: 'postback', label: '1 ชม', data: 'a=quiet&min=60', displayText: '1 ชม' }
        },
        {
          type: 'action',
          action: { type: 'postback', label: '2 ชม', data: 'a=quiet&min=120', displayText: '2 ชม' }
        }
      ]
    }
  };
}

function buildDeviceMenu(category) {
  const cat = DEVICE_CATEGORIES[category];
  const devices = devicesInCategory(category);

  if (!cat || devices.length === 0) {
    return { type: 'text', text: 'ไม่พบอุปกรณ์ในหมวดนี้ครับ' };
  }

  return {
    type: 'text',
    text: `เลือก${cat.label}ที่ต้องการครับ`,
    quickReply: {
      items: devices.map((device) => ({
        type: 'action',
        action: {
          type: 'postback',
          label: device.name.slice(0, 20),
          data: `a=status&id=${device.id}`,
          displayText: device.name
        }
      }))
    }
  };
}

module.exports = {
  buildRootMenu,
  buildCategoryMenu,
  buildDeviceMenu,
  buildManageMenu,
  buildHouseMenu,
  buildArmDisarmConfirm,
  buildGreeting,
  buildQuietPrompt,
  queryableDevices,
  controllableDevices,
  armDisarmAvailable
};
