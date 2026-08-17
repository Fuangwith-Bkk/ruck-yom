const botIdentity = require('../services/botIdentity');

const REQUIRED_ENV = [
  'TUYA_ACCESS_ID',
  'TUYA_ACCESS_SECRET',
  'TUYA_MQ_URL',
  // Phase 2 (interactive status query & control): TUYA_BASE_URL is used by
  // tuyaRestClient.js; PORT is the webhook Express server's listen port.
  'TUYA_BASE_URL',
  'PORT'
];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

  // LINE credentials are role-prefixed (botIdentity.js) rather than flat
  // vars, since /switch dr|prod can point this process at a different
  // credential set without a restart — only the *currently* active role's
  // token+secret need to exist at boot; the other role(s) are only
  // required once actually switched to.
  const activeRole = botIdentity.getActiveRole();
  if (!botIdentity.isConfigured(activeRole)) {
    missing.push(`LINE_${activeRole.toUpperCase()}_CHANNEL_ACCESS_TOKEN/SECRET`);
  }

  if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

module.exports = { validateEnv };
