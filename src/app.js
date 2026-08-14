require('dotenv').config();
const path = require('path');

const { validateEnv } = require('./config/environment');
validateEnv();

const TuyaWebsocket = require(path.join(__dirname, '../tuya-pulsar-ws-node/dist')).default;

const LRUDeduplicator = require('./adapters/memory/lruDeduplicator');
const SensorNormalizer = require('./services/sensorNormalizer');
const TemplateEngine = require('./services/templateEngine');
const LineMessagingService = require('./services/lineMessaging');
const EventCorrelator = require('./services/eventCorrelator');
const logger = require('./utils/logger');

const deduplicator = new LRUDeduplicator(300000, 2000);
const normalizer = new SensorNormalizer();
const templateEngine = new TemplateEngine();
const lineService = new LineMessagingService();
const correlator = new EventCorrelator(templateEngine, lineService);

const client = new TuyaWebsocket({
  accessId: process.env.TUYA_ACCESS_ID,
  accessKey: process.env.TUYA_ACCESS_SECRET,
  url: process.env.TUYA_MQ_URL,
  env: process.env.TUYA_MQ_ENV === 'TEST' ? TuyaWebsocket.env.TEST : TuyaWebsocket.env.PROD,
  maxRetryTimes: parseInt(process.env.TUYA_PULSAR_MAX_RETRIES, 10) || 50,
  // The SDK's own per-message INFO logs (raw payload dumps) are the
  // dominant source of log volume — route them through our rotating
  // logger too, instead of leaving them as unbounded console.log output.
  logger: (level, message) => logger.info(`[SDK:${level}]`, message)
});

// SDK emits (ws, message) — confirmed by tuya-pulsar-ws-node's README/example
// and poc/tuya-listener.js. The device event itself is nested under
// message.payload.data (devId, status), not on message directly.
client.message(async (ws, message) => {
  try {
    // 1. Always ACK incoming message to prevent infinite Pulsar retry loops
    client.ackMessage(message.messageId);

    // 2. Perform Network Deduplication
    const isDup = await deduplicator.isDuplicate(message.messageId);
    if (isDup) {
      logger.info(`[DEDUPE] Ignored repeat Pulsar messageId: ${message.messageId}`);
      return;
    }

    // 3. Normalize raw event payload (may yield 0, 1, or several events —
    //    see Section 8.5 note on multi-DP Pulsar messages)
    const rawData = message && message.payload && message.payload.data;
    const events = normalizer.transform(rawData);
    if (!events) return;

    // 4-5. Route each event through the correlator, which decides whether
    // to push it immediately, buffer it as part of an in-progress
    // consolidation window, or flush a consolidated message — see
    // Section 8.8.
    for (const event of events) {
      await correlator.process(event);
    }

  } catch (err) {
    logger.error('[PROCESSING_ERROR] Error handling incoming Pulsar event:', err);
  }
});

client.open(() => logger.info('Connected to Tuya Pulsar Message Service.'));
client.reconnect(() => logger.info('Reconnecting to Tuya Pulsar Message Service...'));
// The SDK's error event has inconsistent arity: connection-level errors
// (subError) emit (ws, err), but message parse/decrypt failures (subMessage's
// catch block) emit only (err). Normalize both shapes so the real error is
// never lost in the `ws` slot.
client.error((wsOrErr, maybeErr) => {
  const err = maybeErr !== undefined ? maybeErr : wsOrErr;
  logger.error('Tuya Pulsar WebSocket Error:', err);
});

client.start();
