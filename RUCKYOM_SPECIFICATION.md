# Comprehensive Architecture & Requirements Specification

**Project Code Name:** RuckYom ("รักยม")  
**Target Execution Paradigm:** Vibe Coding (Cursor AI / Claude Code)  
**Target SLA (Alert Latency):** < 1.5 seconds (Warm Instance)  
**Target Operational Cost:** $0.00 / month (Zero-Cost Infrastructure)  
**System Timezone:** Asia/Bangkok (UTC+7 / ICT)  
**Primary Notification Language:** Thai (ไทย)  

---

## 1. Executive Summary & Project Identity

**RuckYom ("รักยม")** is an enterprise-grade, real-time smart home security engine. Inspired by the traditional Thai guardian spirits ("รักยม") that watch over the home and warn occupants of impending harm, this engine consumes live IoT sensor event streams from the Tuya Developer Cloud via Pulsar WebSockets and dispatches direct push notification alerts to a designated LINE Group.

### Key Design Principles
* **Language Separation:** System notification alerts pushed to users are formatted in clear **Thai** with relevant emojis. Source code, variable names, documentation, and technical artifacts remain strictly in **English**.
* **Zero Native C++ Dependencies:** Pure JavaScript/TypeScript dependencies (`node-gyp` free) to ensure seamless compilation across ARM and x86_64 architectures without native build toolchains.
* **Network Deduplication vs. Physical Events:** Filter duplicate Pulsar network re-deliveries (`messageId`) via memory cache within a 5-minute window. Rapid physical re-trigger events (Door Open $\rightarrow$ Close $\rightarrow$ Open) produce unique payload IDs and are strictly preserved and alerted.
* **Credential Isolation:** Strict separation of application code from secrets using environment variable injection across cloud and edge platforms.

---

## 2. Phased Development Roadmap

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 0: Proof of Concept Validation (Completed)                                │
│ • Validated Pulsar WebSocket (tuya-listener.js) & Tuya REST APIs (all-status.js)│
│ • Verified LINE Bot Push & Express Webhook local tunneling (ngrok)             │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Core Event Streaming & Thai Notification Pipeline (Active Scope)       │
│ • Persistent Tuya Pulsar WS stream client with explicit message acknowledgement │
│ • Pure JS `lru-cache` network deduplication filtering duplicate `messageId`s    │
│ • Sensor Event Normalizer mapping Tuya DP codes to unified event schemas        │
│ • Decoupled Template Engine rendering localized Thai messages                   │
│ • Sub-1.5s LINE Group Push delivery via `@line/bot-sdk` v11                     │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Interactive Webhook & Status Querying                                  │
│ • Express `/webhook` server receiving LINE chat events                         │
│ • Thai Command Router (`/status`, `/arm`, `/disarm` or `/สถานะ`)                 │
│ • Dynamic batch device status querying via Tuya REST OpenAPI endpoints          │
│ • Rich Thai Flex Messages and Interactive Layout Cards                          │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Upstash Redis State Management & Quotas                               │
│ • Serverless Redis integration (`SETNX tuya:dedupe:{messageId}`)                │
│ • Persistent Security Modes (`ARMED_AWAY`, `ARMED_HOME`, `DISARMED`)            │
│ • Atomic Push Quota Tracking (500 free messages/mo limit)                       │
│ • Warm execution ping endpoint (`GET /healthz`) for UptimeRobot / Cron-Job.org  │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: CCTV Fast-Follow Camera Snapshots                                      │
│ • Local LAN agent (`hik-agent`) pulling RTSP/HTTP snapshots from NVR             │
│ • Secondary fast-follow image delivery to LINE group upon security trigger      │
└─────────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: Web UI
│ • Implement web UI to manage this app                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

validated local POC scripts (`./poc/all-status.js`, `./poc/get-group-id.js`, `./poc/index.js`, `./poc/tuya-listener.js`).

---

## 3. Multi-Platform Hardware & Runtime Constraints

The Phase 1 codebase must execute cleanly across three primary runtime environments:

1. **Raspberry Pi (Edge Deployment):** ARM32 / ARM64 Linux running Node.js v18+.
2. **Render.com Free Tier (Cloud Container):** x86_64 Linux container capped at **512MB V8 Heap RAM**.


3. **Oracle Cloud Always Free Tier (Virtual Machine):** ARM Ampere / AMD x86 Linux VM running 24/7.

### Memory & Execution Boundaries

* In-memory cache is bounded to **maximum 2,000 entries** ($\approx 1.5\text{ MB}$ RAM overhead), eliminating memory leaks on low-memory devices.
* Node.js runtime must be **>= 18.0.0 LTS**.

---

## 4. Security & Environment Configuration

### Secret Management Principles

1. **Never Commit Secrets:** `.env` is explicitly ignored in `.gitignore`.


2. **Template Provisioning:** `.env.example` provides an unpopulated schema committed to Git.


3. **Platform Injections:**
* **Render.com:** Injected via the **Environment** tab in Render Dashboard.


* **Raspberry Pi / Oracle Cloud:** Injected via `/etc/systemd/system/ruckyom.service` or local `.env` file.



### `.gitignore` Specification

```gitignore
# Secret Files
.env
.env.local
.env.production.local
!.env.example

# Device registry (contains real Tuya device IDs)
src/config/deviceRegistry.json
!src/config/deviceRegistry.example.json

# Dependencies
node_modules/

# OS & Editor Assets
.DS_Store
.vscode/
.idea/
.claude/
*.log

# Temp Files
npm-debug.log*
yarn-debug.log*

```

### Environment Variables Template (`.env.example`)

```ini
# System Configuration
NODE_ENV=development
PORT=3000                          # Unused until Phase 2 (Express webhook server)
TIMEZONE=Asia/Bangkok
TUYA_PULSAR_MAX_RETRIES=50         # Was hardcoded in app.js; externalized for tunability

# Tuya Cloud OpenAPI Credentials
TUYA_BASE_URL=https://openapi-sg.iotbing.com
TUYA_ACCESS_ID=your_tuya_access_id
TUYA_ACCESS_SECRET=your_tuya_access_secret
TUYA_SMART_LIFE_UID=your_smart_life_uid   # Unused until Phase 2 (REST device status queries)

# Tuya Pulsar Message Service
TUYA_MQ_URL=wss://mqe-sg.iotbing.com:8285/
TUYA_MQ_ENV=PROD

# LINE Messaging API Credentials
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret   # Unused until Phase 2 (webhook signature verification)
LINE_GROUP_ID=your_target_line_group_id

```

Vars marked "Unused until Phase X" are still declared now (and validated as optional) so the schema is stable across phases, but Section 8.2's `REQUIRED_ENV` list should only enforce the ones Phase 1 actually needs — see below.

---

**Note on phasing:** the full tree below shows the project's *end-state* layout for reference. Only files tagged `[Phase 1]` should be scaffolded during initial project setup (Prompt 1 in Section 10). Files tagged `[Phase 3]` are documented here for architectural context but are out of scope until Phase 3 begins — do not generate empty stub files for them prematurely, as unused stubs invite dead `require()` paths and confuse later diffs.

## 5. Complete Directory Layout (`ruck-yom`)

```text
ruck-yom/
├── .gitignore                      # Excludes secrets, node_modules, and logs
├── .env                            # Local secrets (Untracked)
├── .env.example                    # Secret template (Tracked)
├── package.json                    # Dependencies & scripts configuration
├── README.md                       # Setup and operating instructions
├── RUCKYOM_SPECIFICATION.md        # Master specification document
├── src/
│   ├── config/
│   │   ├── environment.js              # Boot validation for required env vars
│   │   ├── deviceRegistry.js           # Loads deviceRegistry.json, mapping Tuya device_id to human Thai names
│   │   ├── deviceRegistry.json         # Actual device_id -> name map (Untracked — real device IDs, like .env)
│   │   └── deviceRegistry.example.json # Template committed to Git (shape reference, no real device IDs)
│   ├── contracts/
│   │   ├── IDeduplicator.js        # Deduplication contract interface [Phase 1]
│   │   ├── IStateManager.js        # System security mode contract [Phase 3 — interface only, see note below]
│   │   └── IQuotaTracker.js        # Push quota manager contract [Phase 3 — interface only, see note below]
│   ├── adapters/
│   │   └── memory/
│   │       ├── lruDeduplicator.js     # Pure JS LRU deduplication adapter [Phase 1 — implemented now]
│   │       ├── memoryStateManager.js  # In-memory security state stub [Phase 3 — NOT scaffolded in Phase 1]
│   │       └── memoryQuotaTracker.js  # In-memory push quota stub [Phase 3 — NOT scaffolded in Phase 1]
│   ├── services/
│   │   ├── tuyaPulsarListener.js   # Pulsar WS connection manager
│   │   ├── sensorNormalizer.js     # Maps Tuya DP codes to event schema
│   │   ├── templateEngine.js       # Renders localized Thai JSON templates
│   │   └── lineMessaging.js        # LINE messagingApi wrapper
│   ├── templates/
│   │   ├── securityAlerts.json     # Localized Thai message templates
│   │   └── statusReports.json      # Status layout templates (Phase 2 placeholder)
│   ├── utils/
│   │   └── dateTime.js             # Asia/Bangkok date-time formatter
│   └── app.js                      # Application bootstrap & event loop
└── tuya-pulsar-ws-node/            # Compiled local Pulsar SDK package
    ├── dist/                       # Compiled JavaScript output
    └── package.json
```

**Before vendoring `tuya-pulsar-ws-node`:** confirm its own dependency tree is free of native (`node-gyp`) bindings — the "Zero Native C++ Dependencies" principle in Section 1 only holds if this vendored package meets it too, since it bypasses npm's normal audit path. Check its `package.json` and `dist/` for any `.node` binaries before committing it.

---

## 6. Sensor DP Code Mapping Schema

| Device Category | Tuya DP Code (`code`) | Payload Value (`value`) | Event Key (`eventType`) | Default Thai Event Text |
| --- | --- | --- | --- | --- |
| **Door Contact Sensor** | `doorcontact_state` | `true` | `DOOR_OPENED` | 🚪 เปิดประตูแล้ว |
|  | `doorcontact_state` | `false` | `DOOR_CLOSED` | 🚪 ปิดประตูแล้ว |
| **PIR Motion Sensor** | `pir` | `"pir"` / `true` | `MOTION_DETECTED` | 🏃 ตรวจพบการเคลื่อนไหว |
| **Water Leak Sensor** | `watersensor_state` | `"alarm"` / `true` | `WATER_LEAK` | 💦 ตรวจพบน้ำรั่วซึม |
| **Battery Level** | `battery_percentage` | `number` (0–100) | `BATTERY_LOW` | ⚠️ แบตเตอรี่ต่ำ (< 20%) |
| **Relay Switch** | `switch_1` | `true` | `RELAY_ON` | 🔌 เปิดสวิตช์แล้ว |
|  | `switch_1` | `false` | `RELAY_OFF` | 🔌 ปิดสวิตช์แล้ว |

Routine/non-alert telemetry — PIR `pir` = `"none"`/`false` (motion clear), water sensor `"normal"`, and battery ≥ 20% — is intentionally **not** mapped to an event and produces no LINE message (see Section 9 DoD). `sensorNormalizer.transform()` returns `null` for these rather than an `UNKNOWN_EVENT`.

---

## 7. Decoupled Thai Message Templates

### `src/templates/securityAlerts.json`

```json
{
  "DOOR_OPENED": "🚨 แจ้งเตือนความปลอดภัย!\nอุปกรณ์: {{deviceName}}\nสถานะ: 🚪 เปิดประตูแล้ว\nเวลา: {{timestamp}}",
  "DOOR_CLOSED": "ℹ️ แจ้งเตือนระบบ\nอุปกรณ์: {{deviceName}}\nสถานะ: 🚪 ปิดประตูแล้ว\nเวลา: {{timestamp}}",
  "MOTION_DETECTED": "🚨 แจ้งเตือนความปลอดภัย!\nอุปกรณ์: {{deviceName}}\nสถานะ: 🏃 ตรวจพบการเคลื่อนไหว\nเวลา: {{timestamp}}",
  "MOTION_CLEAR": "ℹ️ แจ้งเตือนระบบ\nอุปกรณ์: {{deviceName}}\nสถานะ: 🏃 ไม่พบการเคลื่อนไหวแล้ว\nเวลา: {{timestamp}}",
  "WATER_LEAK": "⚠️ แจ้งเตือนภัยเร่งด่วน!\nอุปกรณ์: {{deviceName}}\nสถานะ: 💦 ตรวจพบน้ำรั่วซึม\nเวลา: {{timestamp}}",
  "BATTERY_LOW": "⚠️ แจ้งเตือนแบตเตอรี่ต่ำ\nอุปกรณ์: {{deviceName}}\nระดับแบตเตอรี่คงเหลือ: {{batteryLevel}}%\nเวลา: {{timestamp}}",
  "RELAY_ON": "ℹ️ แจ้งเตือนระบบ\nอุปกรณ์: {{deviceName}}\nสถานะ: 🔌 เปิดสวิตช์แล้ว\nเวลา: {{timestamp}}",
  "RELAY_OFF": "ℹ️ แจ้งเตือนระบบ\nอุปกรณ์: {{deviceName}}\nสถานะ: 🔌 ปิดสวิตช์แล้ว\nเวลา: {{timestamp}}",
  "UNKNOWN_EVENT": "🔔 แจ้งเตือนสถานะอุปกรณ์\nอุปกรณ์: {{deviceName}}\nข้อมูล: {{rawPayload}}\nเวลา: {{timestamp}}"
}

```

Note: `MOTION_CLEAR` remains defined above for completeness/history, but `sensorNormalizer.js` (Section 8.5) no longer emits that `eventType` — it is unreachable in practice.

---

## 8. Complete Implementation Reference Code

### 8.1 Dependencies Configuration (`package.json`)

```json
{
  "name": "ruck-yom",
  "version": "1.0.0",
  "description": "Smart Home Security Engine for Tuya & LINE Bot",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "node --watch src/app.js"
  },
  "dependencies": {
    "@line/bot-sdk": "^11.1.0",
    "dotenv": "^16.4.5",
    "lru-cache": "^10.2.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}

```

### 8.2 Environment Schema Validator (`src/config/environment.js`)

```javascript
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

```

### 8.3 Timezone Utility (`src/utils/dateTime.js`)

```javascript
function getBangkokTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.TIMEZONE || 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date) + ' (Bangkok)';
}

module.exports = { getBangkokTimestamp };

```

### 8.4 In-Memory LRU Deduplicator (`src/adapters/memory/lruDeduplicator.js`)

```javascript
const { LRUCache } = require('lru-cache');
const IDeduplicator = require('../../contracts/IDeduplicator');

class LRUDeduplicator extends IDeduplicator {
  constructor(ttlMs = 300000, maxItems = 2000) {
    super();
    this.cache = new LRUCache({
      max: maxItems,
      ttl: ttlMs,
      allowStale: false,
      updateAgeOnGet: false,
    });
  }

  async isDuplicate(messageId) {
    if (!messageId) return false;

    if (this.cache.has(messageId)) {
      return true;
    }

    this.cache.set(messageId, true);
    return false;
  }
}

module.exports = LRUDeduplicator;

```

### 8.5 Sensor Event Normalizer (`src/services/sensorNormalizer.js`)

```javascript
const deviceRegistry = require('../config/deviceRegistry');
const { getBangkokTimestamp } = require('../utils/dateTime');

class SensorNormalizer {
  transform(rawMessage) {
    if (!rawMessage || !rawMessage.devId || !Array.isArray(rawMessage.status)) {
      return null;
    }

    const deviceId = rawMessage.devId;
    const deviceName = deviceRegistry[deviceId] || `Sensor (${deviceId.substring(0, 6)}...)`;
    const timestamp = getBangkokTimestamp(new Date(rawMessage.eventTime || Date.now()));

    // NOTE: a single Pulsar message's `status` array can carry multiple DPs
    // (e.g. a battery reading riding along with a door-state change). We
    // process every DP into its own event rather than returning on the
    // first match, so none are silently dropped.
    const events = [];

    for (const dp of rawMessage.status) {
      const { code, value } = dp;

      if (code === 'doorcontact_state') {
        const isOpened = value === true || value === 'true';
        events.push({
          deviceId,
          deviceName,
          eventType: isOpened ? 'DOOR_OPENED' : 'DOOR_CLOSED',
          timestamp
        });
        continue;
      }

      if (code === 'pir') {
        const isMotion = value === 'pir' || value === true || value === 'true';
        // Only the motion-detected transition is alert-worthy (Section 9 DoD).
        // "Clear" is routine telemetry — PIR sensors can fire it very
        // frequently while idle, unlike a door's closed transition — so it
        // must not be emitted as an event, matching the water/battery
        // pattern below.
        if (isMotion) {
          events.push({
            deviceId,
            deviceName,
            eventType: 'MOTION_DETECTED',
            timestamp
          });
        }
        continue;
      }

      if (code === 'switch_1') {
        const isOn = value === true || value === 'true';
        events.push({
          deviceId,
          deviceName,
          eventType: isOn ? 'RELAY_ON' : 'RELAY_OFF',
          timestamp
        });
        continue;
      }

      if (code === 'watersensor_state') {
        const isAlarm = value === 'alarm' || value === true || value === 'true';
        // Only the alarm transition is alert-worthy. A "normal"/cleared
        // reading is routine telemetry, not an event — do NOT emit
        // anything for it (previously fell through to UNKNOWN_EVENT and
        // spammed the LINE group on every routine status poll).
        if (isAlarm) {
          events.push({
            deviceId,
            deviceName,
            eventType: 'WATER_LEAK',
            timestamp
          });
        }
        continue;
      }

      if (code === 'battery_percentage' && typeof value === 'number') {
        // Only low-battery is alert-worthy; a healthy reading is routine
        // telemetry and must not be emitted as an event.
        if (value < 20) {
          events.push({
            deviceId,
            deviceName,
            eventType: 'BATTERY_LOW',
            batteryLevel: value,
            timestamp
          });
        }
        continue;
      }

      // Any other DP code is genuinely unrecognized — surface it once per
      // occurrence so it's visible for triage, but this should be rare in
      // steady state, not the default outcome of routine telemetry.
      events.push({
        deviceId,
        deviceName,
        eventType: 'UNKNOWN_EVENT',
        rawPayload: JSON.stringify(dp),
        timestamp
      });
    }

    // Return null (not an empty array) when nothing alert-worthy occurred,
    // so callers can `if (!event) return;` as in Section 8.8 without change.
    // Callers that need multi-event handling should iterate this array;
    // see the updated app.js snippet in Section 8.8.
    return events.length > 0 ? events : null;
  }
}

module.exports = SensorNormalizer;

```

### 8.6 Template Engine (`src/services/templateEngine.js`)

```javascript
const alertsTemplate = require('../templates/securityAlerts.json');

class TemplateEngine {
  constructor(templates = alertsTemplate) {
    this.templates = templates;
  }

  render(event) {
    const templateStr = this.templates[event.eventType] || this.templates['UNKNOWN_EVENT'];
    
    return templateStr.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      if (key in event) {
        return event[key];
      }
      return match;
    });
  }
}

module.exports = TemplateEngine;

```

### 8.7 LINE Messaging Service (`src/services/lineMessaging.js`)

```javascript
const { messagingApi } = require('@line/bot-sdk');

class LineMessagingService {
  constructor() {
    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
    });
    this.groupId = process.env.LINE_GROUP_ID;
  }

  async pushMessage(text) {
    if (!this.groupId) {
      throw new Error('LINE_GROUP_ID is missing from environment.');
    }

    await this.client.pushMessage({
      to: this.groupId,
      messages: [{ type: 'text', text }]
    });
  }
}

module.exports = LineMessagingService;

```

### 8.8 Application Entry Point (`src/app.js`)

```javascript
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

```

---

## 9. Phase 1 Definition of Done

Phase 1 is complete when all of the following hold:

* A live door, PIR, or water-leak trigger on any linked device results in a Thai-language LINE group push within the 1.5s warm-instance SLA.
* Routine telemetry (battery ≥20%, water sensor "normal", motion clear) produces **no** LINE message — verified by leaving the system running for a period and confirming no `UNKNOWN_EVENT` or duplicate pushes appear in logs.
* A duplicated Pulsar redelivery (same `messageId` within 5 minutes) is suppressed and logged as `[DEDUPE]`, while a genuine rapid re-trigger (open→close→open) is not suppressed.
* A single Pulsar message carrying multiple DPs (e.g. door state + battery reading together) results in one LINE message per relevant DP, not just the first.
* The process survives a forced network interruption and reconnects without manual restart, honoring `TUYA_PULSAR_MAX_RETRIES`.
* `node src/app.js` boots cleanly with only the Phase 1 `REQUIRED_ENV` vars set (Section 8.2) — no failures from Phase 2/3 vars being absent.

## 10. Vibe Coding Prompting Sequence for Cursor / Claude Code

When importing this project into Cursor or Claude Code, execute the following prompt sequence:

### Prompt 1: Project Initialization & Directory Scaffolding

> "Create a new Node.js project named `ruck-yom` following the layout defined in Section 5 of `RUCKYOM_SPECIFICATION.md`. Initialize `package.json`, `.gitignore`, and `.env.example`. Ensure `tuya-pulsar-ws-node` is referenced at the root directory level."

### Prompt 2: Abstraction Contracts & Memory Adapters

> "Implement `src/contracts/IDeduplicator.js` and `src/adapters/memory/lruDeduplicator.js` using the `lru-cache` package. Ensure it adheres to the max 2,000 item capacity and 5-minute TTL constraints."

### Prompt 3: Sensor Normalization & Thai Templates

> "Create `src/templates/securityAlerts.json` using the Thai templates from Section 7. Implement `src/services/sensorNormalizer.js` to map Tuya DP codes (`doorcontact_state`, `pir`, `watersensor_state`, `battery_percentage`) into standardized events per Section 8.5 — processing every DP in a message's `status` array, returning `null` for routine/non-alert telemetry (not an `UNKNOWN_EVENT`), and returning an array of events for messages that contain more than one alert-worthy DP."

### Prompt 4: LINE Integration & Pipeline Bootstrap

> "Implement `src/services/lineMessaging.js` using `@line/bot-sdk` v11 `messagingApi.MessagingApiClient`. Assemble the complete pipeline in `src/app.js` connecting `tuya-pulsar-ws-node` $\rightarrow$ `lruDeduplicator` $\rightarrow$ `sensorNormalizer` $\rightarrow$ `templateEngine` $\rightarrow$ `lineMessaging`."