const tuyaRestClient = require('./tuyaRestClient');
const houseMode = require('./houseMode');
const quietMode = require('./quietMode');
const botIdentity = require('./botIdentity');
const quotaWatch = require('./quotaWatch');
const { queryableDevices } = require('../templates/menuBuilders');
const { buildAllStatusTable } = require('../templates/statusCard');
const logger = require('../utils/logger');

// Builds the full รายงาน Flex message — live Tuya device statuses plus
// houseMode/quietMode/LINE-quota context. Shared by the interactive รายงาน
// command (interactionRouter.js's _replyAllStatus) and the automatic daily
// summary (dailyReport.js) so the two can never drift out of sync with each
// other. `lineService` is passed in rather than required directly so this
// stays a plain function of its inputs, same as the rest of this file's
// dependencies.
async function buildReport(lineService) {
  const devices = queryableDevices();

  const [settled, quotaResult] = await Promise.all([
    Promise.allSettled(devices.map((device) => tuyaRestClient.getDeviceStatus(device.id))),
    lineService.getQuota().catch((err) => {
      // Best-effort, same tier as houseMode/quietMode below — a failed
      // quota lookup omits that section (buildQuotaSection) rather than
      // failing the whole report.
      logger.error('[STATUS_REPORT] LINE quota query failed:', err);
      return null;
    })
  ]);

  const results = devices.map((device, i) => {
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      return { device, rawStatus: outcome.value };
    }
    logger.error(`[STATUS_REPORT] Status query failed for ${device.id}:`, outcome.reason);
    return { device, error: true };
  });

  // A report showing the quota already spent is as good a signal as a
  // rejected push — mark it, so the reply carrying this very report also
  // carries the quota-spent note (lineMessaging.js replyMessage). Before
  // this, a รายงาน right after a restart showed 300/300 with no note,
  // because no push had failed yet (2026-10-26).
  const quota = quotaResult?.quota;
  const used = quotaResult?.consumption?.totalUsage;
  if (quota?.type === 'limited' && typeof quota.value === 'number' && used >= quota.value) {
    quotaWatch.markExhausted(botIdentity.getActiveRole());
  }

  const modeInfo = {
    armMode: houseMode.getMode(),
    quietMinutes: quietMode.isQuiet() ? quietMode.remainingMinutes() : 0,
    quota: quotaResult?.quota ?? null,
    quotaConsumed: quotaResult?.consumption?.totalUsage ?? null
  };

  return buildAllStatusTable(results, modeInfo);
}

module.exports = { buildReport };
