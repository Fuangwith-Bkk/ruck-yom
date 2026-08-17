const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Whether the scheduled daily รายงาน (dailyReport.js) is currently disabled
// via /report off (ปิดรายงาน) — independent of quiet mode/ไปพัก, which the
// daily report deliberately bypasses (see dailyReport.js). Persisted the
// same way quietMode.js's crash-recovery marker is: existence-only signal,
// not a real state store, so a restart doesn't silently re-enable a report
// the user explicitly turned off.
const STATE_FILE = process.env.REPORT_STATE_FILE || path.join(__dirname, '../../report-state.json');

let disabled = fs.existsSync(STATE_FILE);

function isEnabled() {
  return !disabled;
}

function setEnabled(value) {
  disabled = !value;
  try {
    if (disabled) {
      fs.writeFileSync(STATE_FILE, '');
    } else if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
  } catch (err) {
    logger.error('[REPORT_MODE] Failed to persist state:', err);
  }
  logger.info(`[REPORT_MODE] Daily รายงาน ${value ? 'enabled' : 'disabled'}`);
}

module.exports = { isEnabled, setEnabled };
