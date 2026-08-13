require('dotenv').config();
const path = require('path');

const { validateEnv } = require('./config/environment');
validateEnv();

const TuyaWebsocket = require(path.join(__dirname, '../tuya-pulsar-ws-node/dist')).default;

const LRUDeduplicator = require('./adapters/memory/lruDeduplicator');
const SensorNormalizer = require('./services/sensorNormalizer');
const TemplateEngine = require('./services/templateEngine');
const LineMessagingService = require('./services/lineMessaging');

const deduplicator = new LRUDeduplicator(300000, 2000);
const normalizer = new SensorNormalizer();
const templateEngine = new TemplateEngine();
const lineService = new LineMessagingService();

const client = new TuyaWebsocket({
  accessId: process.env.TUYA_ACCESS_ID,
  accessKey: process.env.TUYA_ACCESS_SECRET,
  url: process.env.TUYA_MQ_URL,
  env: TuyaWebsocket.env.PROD,
  maxRetryTimes: parseInt(process.env.TUYA_PULSAR_MAX_RETRIES, 10) || 50
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
      console.log(`[DEDUPE] Ignored repeat Pulsar messageId: ${message.messageId}`);
      return;
    }

    // 3. Normalize raw event payload (may yield 0, 1, or several events —
    //    see Section 8.5 note on multi-DP Pulsar messages)
    const rawData = message && message.payload && message.payload.data;
    const events = normalizer.transform(rawData);
    if (!events) return;

    // 4-5. Format and deliver each event independently, so one slow/failed
    // push doesn't block the others in the same message.
    for (const event of events) {
      const formattedText = templateEngine.render(event);
      await lineService.pushMessage(formattedText);
      console.log(`[ALERT_SENT] (${event.eventType}) Delivered notification for ${event.deviceName}`);
    }

  } catch (err) {
    console.error('[PROCESSING_ERROR] Error handling incoming Pulsar event:', err);
  }
});

client.open(() => console.log('Connected to Tuya Pulsar Message Service.'));
client.reconnect(() => console.log('Reconnecting to Tuya Pulsar Message Service...'));
// The SDK's error event has inconsistent arity: connection-level errors
// (subError) emit (ws, err), but message parse/decrypt failures (subMessage's
// catch block) emit only (err). Normalize both shapes so the real error is
// never lost in the `ws` slot.
client.error((wsOrErr, maybeErr) => {
  const err = maybeErr !== undefined ? maybeErr : wsOrErr;
  console.error('Tuya Pulsar WebSocket Error:', err);
});

client.start();
