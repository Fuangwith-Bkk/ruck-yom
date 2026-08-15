const REQUIRED_ENV = [
  'TUYA_ACCESS_ID',
  'TUYA_ACCESS_SECRET',
  'TUYA_MQ_URL',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_GROUP_ID',
  // Phase 2 (interactive status query & control): TUYA_BASE_URL is used by
  // tuyaRestClient.js; LINE_CHANNEL_SECRET verifies incoming webhook
  // signatures; PORT is the webhook Express server's listen port.
  'TUYA_BASE_URL',
  'LINE_CHANNEL_SECRET',
  'PORT'
];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

module.exports = { validateEnv };
