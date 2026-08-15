// User-facing grouping for the Phase 2 interactive menu — a coarser axis
// than dpProfiles.js's per-Tuya-category DP interpretation. E.g. the "door"
// category spans both the `mcs` and `qt` dpProfiles; a family member picking
// "ประตู/หน้าต่าง" from the menu shouldn't need to know or care which one a
// given door actually uses. This table has no bearing on Phase 1 alerting,
// which is driven entirely by dpProfiles.js — it only shapes what shows in
// the tap-menu and which actions are offered per category.
//
// Adding a same-category device later needs zero changes here — just a
// deviceRegistry.json entry with that `category`. Only a genuinely new
// category needs a new entry in this table.
//
// `inMenu: false` categories (remote, gateway) are infrastructure/physical
// controls with nothing meaningful for the bot to query or act on — they're
// excluded from the top-level category menu entirely, and the menu only
// ever lists a category if deviceRegistry.json has >=1 device registered
// under it (built dynamically, not hardcoded — see interactionRouter.js).
//
// `label` is kept short deliberately: LINE Quick Reply's button `label`
// field has a hard 20-character limit (emoji + space + label, combined) —
// anything longer gets silently truncated mid-word by the LINE client, not
// rejected by the API, so this only surfaces as an ugly button in testing.

const DEVICE_CATEGORIES = {
  door: {
    label: 'ประตู/หน้าต่าง',
    emoji: '🚪',
    inMenu: true,
    queryable: true,
    controllable: false
  },
  motion: {
    label: 'ความเคลื่อนไหว',
    emoji: '🏃',
    inMenu: true,
    queryable: true,
    controllable: false
  },
  water: {
    label: 'น้ำรั่ว',
    emoji: '💧',
    inMenu: true,
    queryable: true,
    controllable: false
  },
  relay: {
    label: 'สวิตช์ไฟ',
    emoji: '💡',
    inMenu: true,
    queryable: true,
    controllable: true,
    // Increment 2 (device control): which actions this category exposes.
    actions: ['toggle', 'timer']
  },
  alarm: {
    label: 'สัญญาณเตือนภัย',
    emoji: '🚨',
    inMenu: true,
    queryable: true,
    controllable: true,
    actions: ['toggle']
  },
  remote: {
    label: 'รีโมท',
    emoji: '📱',
    inMenu: false,
    queryable: false,
    controllable: false
  },
  gateway: {
    label: 'เกตเวย์',
    emoji: '📡',
    inMenu: false,
    queryable: false,
    controllable: false
  }
};

module.exports = { DEVICE_CATEGORIES };
