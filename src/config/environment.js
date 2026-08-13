// Phase 1 scope only. TUYA_SMART_LIFE_UID, LINE_CHANNEL_SECRET, and PORT
// are declared in .env.example for schema stability but are not required
// until Phase 2 — add them here when that phase begins, not before,
// or local dev will fail boot on vars the current code never reads.
const REQUIRED_ENV = [
  'TUYA_ACCESS_ID',
  'TUYA_ACCESS_SECRET',
  'TUYA_MQ_URL',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_GROUP_ID'
];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

module.exports = { validateEnv };
