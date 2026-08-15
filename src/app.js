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
  // The SDK invokes this as logger(level, timestampString, ...messageParts)
  // — the real content is in the 3rd+ args, not the 2nd (a bare "Date.now() "
  // prefix), so all of them must be forwarded or the actual payload is
  // silently dropped. SDK-level INFO is routed to `debug` (raw per-message
  // payload dumps are the dominant source of log volume — silent unless
  // LOG_LEVEL=debug is set); ERROR always surfaces via our own error level.
  logger: (level, ...info) => {
    if (level === 'ERROR') {
      logger.error(`[SDK:${level}]`, ...info);
    } else {
      logger.debug(`[SDK:${level}]`, ...info);
    }
  }
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
    // Decrypted device payload only (devId, status[]) — easier to grep/read
    // than the SDK's own [SDK:INFO] dumps, which include the base64/crypto
    // envelope. debug-only since this is per-message volume.
    logger.debug('[TUYA_IN]', rawData);
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
