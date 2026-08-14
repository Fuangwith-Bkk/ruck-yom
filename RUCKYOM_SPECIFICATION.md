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
LINE_BOT_NAME=รักยม                            # Used as {{botName}} in alert templates. Optional, defaults to รักยม.

# Event Consolidation
EVENT_CORRELATION_WINDOW_MS=15000              # Door->motion->alarm consolidation window (ms). Optional, defaults to 15000.

# Logging (rotating file, in addition to console/pm2 output)
LOG_DIR=./logs                                 # Optional, defaults to ./logs
LOG_MAX_SIZE=10M                               # Rotate when the active log file hits this size. Optional, defaults to 10M.
LOG_MAX_FILES=7                                # Keep only the N most recent rotated files. Optional, defaults to 7.
LOG_LEVEL=info                                 # debug|info|error. debug also logs raw Tuya SDK per-message payloads. Optional, defaults to info.

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
│   │   ├── dateTime.js             # Asia/Bangkok date-time formatter
│   │   └── logger.js               # Console + size/day-rotated file logger, bounded by LOG_MAX_FILES
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
| **Door Contact Sensor** | `doorcontact_state` or `switch` | `true` | `DOOR_OPENED` | 🚪 เปิดประตูแล้ว |
|  | `doorcontact_state` or `switch` | `false` | `DOOR_CLOSED` | 🚪 ปิดประตูแล้ว |
| **PIR Motion Sensor** | `pir` | `"pir"` / `true` | `MOTION_DETECTED` | 🏃 ตรวจพบการเคลื่อนไหว |
| **Water Leak Sensor** | `watersensor_state` | `"alarm"` / `true` | `WATER_LEAK` | 💦 ตรวจพบน้ำรั่วซึม |
| **Battery Level** | `battery_percentage` or `battery` | `number` (0–100) | `BATTERY_LOW` | ⚠️ แบตเตอรี่ต่ำ (< 20%) |
| **Relay Switch** | `switch_1` | `true` | `RELAY_ON` | 🔌 เปิดสวิตช์แล้ว |
|  | `switch_1` | `false` | `RELAY_OFF` | 🔌 ปิดสวิตช์แล้ว |
| **Siren** (`sgbj`) | `alarm_switch` | `true` | `ALARM_ON` | !!! สัญญาณเตือนในบ้านดังครับ |
|  | `alarm_switch` | `false` | `ALARM_OFF` | เรียบร้อยครับ สัญญาณเตือนหยุดแล้ว ปลอดภัยแล้วนะครับ |

Routine/non-alert telemetry — PIR `pir` = `"none"`/`false` (motion clear), water sensor `"normal"`, and battery ≥ 20% — is intentionally **not** mapped to an event and produces no LINE message (see Section 9 DoD). `sensorNormalizer.transform()` returns `null` for these rather than an `UNKNOWN_EVENT`. `alarm_switch = false` used to follow this same pattern, but as of `ALARM_OFF` it's now a real event (see Section 7) — anyone alerted by `ALARM_ON` gets a corresponding "all clear" message once the siren stops, rather than being left to check the Smart Life app.

Some devices report battery under DP code `battery` instead of `battery_percentage` (observed in production on a door sensor) — `sensorNormalizer.js` treats both codes identically, same `<20%` threshold. Before this alias was added, `battery` fell through to `UNKNOWN_EVENT` and spammed the group on every routine reading, including healthy ones.

The same door sensor also reports contact state under DP code `switch` instead of `doorcontact_state`, same `true = open` polarity — confirmed by cross-referencing production events against the Smart Life app's History log (see `TUYA_DEVICE_DP_REGISTRY.md`, `qt` category). `switch` is distinct from `switch_1` (relay/light control, Section 6 table above) — same code name pattern as the `battery`/`battery_percentage` aliasing, different DP.

Every event also carries a short `time` field (`HH:MM:ss`, Bangkok) alongside the full `timestamp` (`DD/MM/YY HH:MM:ss`) — `time` is only used by the Event Correlator (Section 8.8) for the per-line stamps inside a consolidated chain message; every standalone message still renders the full `timestamp`.

---

## 7. Decoupled Thai Message Templates

### `src/templates/securityAlerts.json`

```json
{
  "DOOR_OPENED": "มีคนเปิด {{deviceName}} ครับ\n{{timestamp}}",
  "DOOR_CLOSED": "มีคนปิด {{deviceName}} ครับ\n{{timestamp}}",
  "MOTION_DETECTED": "มี {{deviceName}} ครับ\n{{timestamp}}",
  "ALARM_ON": "!!! สัญญาณเตือนในบ้านดังครับ\n{{timestamp}}",
  "ALARM_OFF": "เรียบร้อยครับ สัญญาณเตือนหยุดแล้ว ปลอดภัยแล้วนะครับ\n{{timestamp}}",
  "WATER_LEAK": "{{botName}} วิ่งมาบอกครับ! เจอน้ำรั่วที่ {{deviceName}} ครับ รีบมาดูหน่อยนะครับ กลัวบ้านเปียกหมดครับ\n{{timestamp}}",
  "RELAY_ON": "{{deviceName}} เปิดแล้วนะครับ\n{{timestamp}}",
  "RELAY_OFF": "{{deviceName}} ปิดแล้วนะครับ\n{{timestamp}}",
  "BATTERY_LOW": "{{botName}} วิ่งมาบอกครับ! {{deviceName}} แบตใกล้หมดแล้ว เหลือ {{batteryLevel}}% เอง กลัวมันหมดแล้วเฝ้าบ้านไม่ได้ครับ ช่วยไปเปลี่ยนแบตให้หน่อยนะครับ\n{{timestamp}}",
  "UNKNOWN_EVENT": "{{botName}} ได้รับแจ้งว่า\nอุปกรณ์ {{deviceName}}\nตรวจพบว่า {{rawPayload}}\nช่วย {{botName}} ดูหน่อยนะครับ\n{{timestamp}}",
  "CHAIN_ESCALATION": "{{botName}}วิ่งมาบอกครับ! มีเหตุการณ์ต่อเนื่องเกิดขึ้นครับ:\n{{lines}}\n{{timestamp}}"
}

```

Voice: `รักยม` is written as a small child assigned to watch the house, running over to tell you what happened — direct/urgent for the events the user specified exact wording for (door, alarm, motion, breaker, unknown), and that same "ran to tell you" framing for the two event types that had no user-specified wording (`WATER_LEAK`, `BATTERY_LOW`).

`{{botName}}` resolves from `LINE_BOT_NAME` (default `รักยม`, see Section 4 env vars) — it's a `TemplateEngine` constructor default, not a LINE API lookup, so changing it costs nothing at runtime (Section 8.6).

`CHAIN_ESCALATION` is the one template that isn't rendered from a flat event object — its `{{lines}}` value is built dynamically by the Event Correlator (Section 8.8) as one bullet per buffered event, in the order they occurred, each with its own `HH:MM:ss` stamp. `MOTION_CLEAR` has been removed — it was already dead code (`sensorNormalizer.js` never emitted it).

---

## 8. Complete Implementation Reference Code

### 8.1 Dependencies Configuration (`package.json`)

```json
{
  "name": "ruck-yom",
  "version": "1.3.0",
  "description": "Smart Home Security Engine for Tuya & LINE Bot",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "node --watch src/app.js"
  },
  "dependencies": {
    "@line/bot-sdk": "^11.1.0",
    "dotenv": "^16.4.5",
    "lru-cache": "^10.2.0",
    "rotating-file-stream": "^3.2.10"
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
function getBangkokDateParts(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.TIMEZONE || 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
}

// DD/MM/YY HH:MM:ss — used at the end of every LINE alert message.
function getBangkokTimestamp(date = new Date()) {
  const p = getBangkokDateParts(date);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

// HH:MM:ss only — used for the per-line timestamps inside a consolidated
// (multi-event) chain escalation message, where each line needs its own
// time but repeating the full date on every line would be noise.
function getBangkokTime(date = new Date()) {
  const p = getBangkokDateParts(date);
  return `${p.hour}:${p.minute}:${p.second}`;
}

module.exports = { getBangkokTimestamp, getBangkokTime };

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
const { getBangkokTimestamp, getBangkokTime } = require('../utils/dateTime');

class SensorNormalizer {
  transform(rawMessage) {
    if (!rawMessage || !rawMessage.devId || !Array.isArray(rawMessage.status)) {
      return null;
    }

    const deviceId = rawMessage.devId;
    const deviceName = deviceRegistry[deviceId] || `Sensor (${deviceId.substring(0, 6)}...)`;
    const eventDate = new Date(rawMessage.eventTime || Date.now());
    const timestamp = getBangkokTimestamp(eventDate);
    // Short HH:MM:ss, used for per-line stamps in a consolidated chain
    // escalation message (see eventCorrelator.js) — the full `timestamp`
    // above is still what every standalone message renders.
    const time = getBangkokTime(eventDate);

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
          timestamp,
          time
        });
        continue;
      }

      // Some door/window sensors (Tuya's "qt"/Others category) report
      // contact state under the generic `switch` code instead of
      // `doorcontact_state`, with the same true=open polarity — confirmed
      // 2026-08-14 against a real device (ประตูห้องพ่อ) by cross-referencing
      // production events against the Smart Life app's History log.
      // Distinct from `switch_1` below, which is a relay/light, not a door.
      if (code === 'switch') {
        const isOpened = value === true || value === 'true';
        events.push({
          deviceId,
          deviceName,
          eventType: isOpened ? 'DOOR_OPENED' : 'DOOR_CLOSED',
          timestamp,
          time
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
            timestamp,
            time
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
          timestamp,
          time
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
            timestamp,
            time
          });
        }
        continue;
      }

      if ((code === 'battery_percentage' || code === 'battery') && typeof value === 'number') {
        // Only low-battery is alert-worthy; a healthy reading is routine
        // telemetry and must not be emitted as an event.
        if (value < 20) {
          events.push({
            deviceId,
            deviceName,
            eventType: 'BATTERY_LOW',
            batteryLevel: value,
            timestamp,
            time
          });
        }
        continue;
      }

      if (code === 'alarm_switch') {
        const isOn = value === true || value === 'true';
        events.push({
          deviceId,
          deviceName,
          eventType: isOn ? 'ALARM_ON' : 'ALARM_OFF',
          timestamp,
          time
        });
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
        timestamp,
        time
      });
    }

    // Return null (not an empty array) when nothing alert-worthy occurred,
    // so callers can `if (!event) return;` as in Section 8.9 without change.
    // Callers that need multi-event handling should iterate this array;
    // see the updated app.js snippet in Section 8.9.
    return events.length > 0 ? events : null;
  }
}

module.exports = SensorNormalizer;

```

### 8.6 Template Engine (`src/services/templateEngine.js`)

```javascript
const alertsTemplate = require('../templates/securityAlerts.json');

class TemplateEngine {
  constructor(templates = alertsTemplate, botName = process.env.LINE_BOT_NAME || 'รักยม') {
    this.templates = templates;
    this.botName = botName;
  }

  render(event) {
    const templateStr = this.templates[event.eventType] || this.templates['UNKNOWN_EVENT'];
    const context = { botName: this.botName, ...event };

    return templateStr.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      if (key in context) {
        return context[key];
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

### 8.8 Event Correlator (`src/services/eventCorrelator.js`)

Solves the message-bombardment problem: bursts of activity from *any*
sensor(s) close together in time previously sent one separate LINE ping per
event, no matter how obviously related they were (e.g. a door
opening/closing a few times, or a light switching on then off a moment
later). The **first event of a burst always sends immediately** — no delay,
since it might be security-critical — but every event of *any* type that
arrives while that window is still open gets buffered instead of sent
standalone, then folded into one `CHAIN_ESCALATION` message when the window
closes. This is a general debounce, not a hardcoded door→motion→alarm
sequence: any device, any event type, can open a window or join one already
open. The window flushes early the moment `ALARM_ON` arrives (`TERMINAL_EVENT`),
since there's nothing to gain from waiting once the worst-case event is
already confirmed.

Each buffered event contributes one line to `CHAIN_ESCALATION`'s `{{lines}}`,
via a short per-eventType clause (`CLAUSES`) plus its own `time` — every
eventType the normalizer can emit has an entry, since any of them can now
land inside a window. If a window closes with **exactly one** follow-up
event, that event is sent as its own normal standalone alert instead of
being wrapped in a single-line `CHAIN_ESCALATION` — consolidation only
kicks in once there's actually more than one thing to summarize.

```javascript
const logger = require('../utils/logger');

// Short, timestamp-free clause per eventType — used to build one line of a
// CHAIN_ESCALATION message. Every eventType the normalizer can emit needs an
// entry here, since any of them can now land inside a consolidated window.
const CLAUSES = {
  DOOR_OPENED: (event) => `เปิด ${event.deviceName}`,
  DOOR_CLOSED: (event) => `ปิด ${event.deviceName}`,
  MOTION_DETECTED: (event) => `มี ${event.deviceName}`,
  ALARM_ON: () => 'สัญญาณเตือนดังแล้ว',
  ALARM_OFF: () => 'สัญญาณเตือนหยุดแล้ว',
  RELAY_ON: (event) => `เปิด ${event.deviceName}`,
  RELAY_OFF: (event) => `ปิด ${event.deviceName}`,
  WATER_LEAK: (event) => `น้ำรั่วที่ ${event.deviceName}`,
  BATTERY_LOW: (event) => `${event.deviceName} แบตเหลือ ${event.batteryLevel}%`,
  UNKNOWN_EVENT: (event) => `${event.deviceName} มีเหตุการณ์ไม่ทราบสาเหตุ`
};

// The eventType that always flushes an open window immediately instead of
// waiting out the full WINDOW_MS — there's no benefit to delaying once the
// worst-case event has already happened.
const TERMINAL_EVENT = 'ALARM_ON';

const windowMs = () => Number(process.env.EVENT_CORRELATION_WINDOW_MS) || 15000;

class EventCorrelator {
  constructor(templateEngine, lineService) {
    this.templateEngine = templateEngine;
    this.lineService = lineService;
    // Only one window active at a time by design — this is a single-house
    // system with no per-zone device metadata, so there's no reliable way
    // to tell two concurrent incidents apart anyway.
    this.openWindow = null;
  }

  // Any eventType from any device can open a window or join one already
  // open — the goal is simply "don't send N separate pings for activity
  // that's clearly part of one burst." The first event of a burst always
  // sends immediately (no delay); everything else in that burst gets
  // buffered and folded into one CHAIN_ESCALATION when the window closes.
  async process(event) {
    const { eventType } = event;

    if (this.openWindow) {
      this.openWindow.events.push(event);
      logger.info(`[CORRELATOR] Buffered (${eventType}) into open window`);
      if (eventType === TERMINAL_EVENT) {
        await this._flush();
      }
      return;
    }

    await this._push(event);
    this._openWindow();
    this.openWindow.events.push(event);
  }

  _openWindow() {
    this.openWindow = {
      events: [],
      timer: setTimeout(() => {
        this._flush().catch((err) => logger.error('[CORRELATOR] Flush failed:', err));
      }, windowMs())
    };
  }

  async _flush() {
    if (!this.openWindow) return;
    const { events, timer } = this.openWindow;
    clearTimeout(timer);
    this.openWindow = null;

    // events[0] is the opener, already sent standalone above. If nothing
    // followed it, there's nothing more to report.
    if (events.length <= 1) return;

    const followUps = events.slice(1);

    // Exactly one follow-up: send it as its own normal alert rather than
    // wrapping a single line in a CHAIN_ESCALATION.
    if (followUps.length === 1) {
      await this._push(followUps[0]);
      return;
    }

    const lines = followUps
      .filter((event) => CLAUSES[event.eventType])
      .map((event) => `- ${CLAUSES[event.eventType](event)} (${event.time})`);

    if (lines.length === 0) return;

    await this._push({
      eventType: 'CHAIN_ESCALATION',
      lines: lines.join('\n'),
      timestamp: events[events.length - 1].timestamp
    });
  }

  async _push(event) {
    const text = this.templateEngine.render(event);
    await this.lineService.pushMessage(text);
    logger.info(`[ALERT_SENT] (${event.eventType}) Delivered notification for ${event.deviceName || 'chain escalation'}`);
  }
}

module.exports = EventCorrelator;

```

### 8.9 Application Entry Point (`src/app.js`)

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

```

### 8.10 Rotating Logger (`src/utils/logger.js`)

`console.log`/`console.error` alone are unbounded — under pm2 they get
captured into `~/.pm2/logs/ruck-yom-*.log` forever, and the Tuya SDK's own
per-message `INFO` dumps (raw payload text, one per Pulsar message) are the
dominant source of volume. `logger.js` wraps both console output (so
`pm2 logs` still works for live tailing) and a size/day-rotated file under
`LOG_DIR`, pruned to the `LOG_MAX_FILES` most recent rotated files on every
rotation — bounding worst-case disk usage to roughly
`LOG_MAX_SIZE × LOG_MAX_FILES` regardless of log volume.

The Tuya SDK (`tuya-pulsar-ws-node`) accepts a `logger` config option,
defaulting to `console.log`, invoked internally as
`logger(level, timestampString, ...messageParts)` — the real message content
is in the 3rd+ arguments, not the 2nd (which is just a `Date.now() `
timestamp prefix meant for `console.log`'s default space-joining). `app.js`
must forward all of them (Section 8.9) or the actual payload is silently
dropped, logging only that bare timestamp number.

`logger.js` also gates on a `LOG_LEVEL` env var (`debug` < `info` < `error`,
default `info`) — SDK-level `INFO` (the raw per-message payload dumps, the
dominant source of log volume) is routed to `debug` and is silent by
default, only written (to both console and file) when `LOG_LEVEL=debug` is
explicitly set for a debugging session. SDK-level `ERROR` always surfaces
via the app's own `error` level regardless of `LOG_LEVEL`.

```javascript
const fs = require('fs');
const path = require('path');
const rfs = require('rotating-file-stream');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE || '10M';
const LOG_MAX_FILES = parseInt(process.env.LOG_MAX_FILES, 10) || 7;

const ACTIVE_FILENAME = 'ruck-yom.log';
const ROTATED_PATTERN = /^ruck-yom-\d{4}-\d{2}-\d{2}-\d+\.log$/;

// debug < info < error. Only levels >= the configured LOG_LEVEL are written
// (to both console and file) — debug is where high-volume diagnostics (e.g.
// the Tuya SDK's raw per-message payload dumps) live, so it's silent by
// default and only costs disk/console noise when explicitly opted into.
const LEVELS = { debug: 10, info: 20, error: 30 };
const CONFIGURED_LEVEL = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

fs.mkdirSync(LOG_DIR, { recursive: true });

// Rotate daily or at LOG_MAX_SIZE, whichever comes first. Rotated files get
// a date+index suffix so pruneOldLogs() can pattern-match and age-sort them
// independently of the active (unrotated) file.
function generator(time, index) {
  if (!time) return ACTIVE_FILENAME;
  const date = time.toISOString().slice(0, 10);
  return `ruck-yom-${date}-${index}.log`;
}

const stream = rfs.createStream(generator, {
  path: LOG_DIR,
  size: LOG_MAX_SIZE,
  interval: '1d'
});

stream.on('error', (err) => console.error('[LOGGER] File stream error:', err));
stream.on('rotated', () => {
  pruneOldLogs().catch((err) => console.error('[LOGGER] Prune failed:', err));
});

// Keep only the LOG_MAX_FILES most recently modified rotated files, deleting
// the rest — bounds worst-case disk usage to roughly LOG_MAX_SIZE * LOG_MAX_FILES
// regardless of how often rotation happens.
async function pruneOldLogs() {
  const entries = await fs.promises.readdir(LOG_DIR);
  const rotated = entries.filter((name) => ROTATED_PATTERN.test(name));

  const withStats = await Promise.all(
    rotated.map(async (name) => {
      const filePath = path.join(LOG_DIR, name);
      const stat = await fs.promises.stat(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    })
  );

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const toDelete = withStats.slice(LOG_MAX_FILES);
  await Promise.all(toDelete.map(({ filePath }) => fs.promises.unlink(filePath)));
}

// Errors keep their stack, objects get proper JSON instead of collapsing to
// "[object Object]" under naive String() coercion (e.g. the Tuya SDK's
// decrypted message object passed as a raw arg to its logger callback).
function stringify(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack || arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function write(level, message) {
  const line = `[${new Date().toISOString()}] ${level} ${message}`;
  stream.write(line + '\n');
}

function log(levelName, consoleFn, ...args) {
  if (LEVELS[levelName] < CONFIGURED_LEVEL) return;
  const message = args.map(stringify).join(' ');
  consoleFn(...args);
  write(levelName.toUpperCase(), message);
}

const debug = (...args) => log('debug', console.log, ...args);
const info = (...args) => log('info', console.log, ...args);
const error = (...args) => log('error', console.error, ...args);

module.exports = { debug, info, error };

```

**Companion fix outside app scope:** pm2's own log capture (`~/.pm2/logs/`)
mirrors all stdout/stderr independently of this logger and is not bounded by
`LOG_MAX_FILES`/`LOG_MAX_SIZE` — those only govern this app's own rotated
file. Fully closing the disk-fill risk on the VM also means installing
`pm2-logrotate` once (`pm2 install pm2-logrotate`), which is a pm2-level
concern, not something `.env` can control.

---

## 9. Phase 1 Definition of Done

Phase 1 is complete when all of the following hold:

* A live door, PIR, or water-leak trigger on any linked device results in a Thai-language LINE group push within the 1.5s warm-instance SLA.
* Routine telemetry (battery ≥20%, water sensor "normal", motion clear) produces **no** LINE message — verified by leaving the system running for a period and confirming no `UNKNOWN_EVENT` or duplicate pushes appear in logs.
* A duplicated Pulsar redelivery (same `messageId` within 5 minutes) is suppressed and logged as `[DEDUPE]`, while a genuine rapid re-trigger (open→close→open) is not suppressed.
* A single Pulsar message carrying multiple DPs (e.g. door state + battery reading together) results in one LINE message per relevant DP, not just the first.
* The process survives a forced network interruption and reconnects without manual restart, honoring `TUYA_PULSAR_MAX_RETRIES`.
* `node src/app.js` boots cleanly with only the Phase 1 `REQUIRED_ENV` vars set (Section 8.2) — no failures from Phase 2/3 vars being absent.
* `TUYA_MQ_ENV=TEST` in `.env` actually connects to the Tuya Pulsar test topic (`event-test`), not the production one — verified via `src/app.js`'s `env:` selection (Section 8.9).
* A `DOOR_OPENED` → `MOTION_DETECTED` → `ALARM_ON` sequence within `EVENT_CORRELATION_WINDOW_MS` produces exactly 2 LINE messages (the immediate door alert + one `CHAIN_ESCALATION` with both follow-ups), not 3 — verified per Section 8.8.
* A burst of 3+ events of *any* type (not just door/motion/alarm — e.g. a relay toggling twice) within the window produces exactly 2 messages: the immediate opener + one `CHAIN_ESCALATION` covering everything after it.
* Exactly one follow-up event within a window produces that event's own normal standalone template, not a one-line `CHAIN_ESCALATION`.
* A lone opener with nothing following it produces exactly 1 message (no phantom second message once the window elapses).
* A device reporting battery under DP code `battery` (not just `battery_percentage`) triggers `BATTERY_LOW` correctly below 20%, and produces no message at or above 20% — not an `UNKNOWN_EVENT`.
* A device reporting contact state under DP code `switch` (not just `doorcontact_state`) triggers `DOOR_OPENED`/`DOOR_CLOSED` with `true = open` polarity, using the same door templates and consolidation logic as `doorcontact_state` — not an `UNKNOWN_EVENT`.
* All app-level `console.log`/`console.error` calls, plus the Tuya SDK's own per-message logging, are routed through `src/utils/logger.js` (Section 8.10) — writing to both the console (for `pm2 logs`) and a rotating file under `LOG_DIR`.
* The active log file rotates at `LOG_MAX_SIZE` or daily, whichever comes first, and only the `LOG_MAX_FILES` most recent rotated files are retained — older ones are deleted automatically on each rotation.
* With default `LOG_LEVEL=info`, the Tuya SDK's raw per-message payload dumps do not appear in the log; setting `LOG_LEVEL=debug` makes them appear, with object arguments rendered as JSON (not `[object Object]`) and no dropped content — verified per Section 8.10.
* `ALARM_ON` followed by the alarm being silenced (`alarm_switch: false`) produces a second, distinct `ALARM_OFF` LINE message — not silence.

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