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
│ PHASE 2: Interactive Status Query & Device Control (Increments 1-3 shipped)     │
│ • Express `/webhook` server receiving LINE chat events, signature-verified      │
│ • Tap-only device menus (Quick Reply/Flex) — never requires typing a device     │
│   name/ID; argument-less commands (`/status`, `เมนู`) are shortcuts into the     │
│   same menu, not a device-naming command syntax                                 │
│ • Live device status query via a hand-rolled Tuya REST OpenAPI client           │
│ • Device control — relay/alarm on-off, each behind a Yes/No confirm step        │
│ • เฝ้าบ้าน/ไปพัก (arm/disarm) — triggers pre-built Tuya Tap-to-Run Scenes,        │
│   not a direct device command (the security remote is a sleepy Zigbee end       │
│   device that can't receive downlink commands — see Section 8.13); the          │
│   reverse direction also works — pressing arm/disarm on the physical            │
│   remote itself syncs houseMode/quietMode the same way (app.js, on the          │
│   REMOTE_ARMED/REMOTE_DISARMED events from dpProfiles.js's `sos` profile)       │
│ • ประวัติ — per-device recent-activity view via Tuya's Device Log API            │
│ • เงียบๆหน่อย (quiet mode) — app-level LINE-push suppression, timed or           │
│   indefinite; ไปพัก auto-enters it, เฝ้าบ้าน/กลับบ้าน end it. Critical events     │
│   (ALARM_ON/OFF, WATER_LEAK) always bypass it. No Tuya-side API exists to       │
│   pause/resume the Message Service itself — see Section 8.16                    │
│ • รายงาน — device status table plus a best-effort arm/disarm + quiet-mode       │
│   summary line (houseMode.js, Section 8.17), LINE monthly push-quota usage      │
│   (Section 8.7), and an optional once-daily automatic push (DAILY_REPORT_TIME,  │
│   dailyReport.js, Section 8.20) sharing the same builder (statusReport.js,      │
│   Section 8.19) as the manual command                                          │
│ • houseMode boot recovery — if TUYA_ALARM_AUTOMATION_ID is set, app.js queries  │
│   that Tuya automation's enable/disable status at startup and seeds houseMode   │
│   from it, instead of starting every restart with an unknown mode (Section 8.9, │
│   8.13's getSceneRule)                                                          │
│ • Not yet built: breaker timer preset                                           │
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

Note: `./poc/*` scripts referenced in earlier drafts of this document were
never actually committed to this repo — confirmed absent (2026-08-15) when
building Phase 2's Tuya REST client, which had no in-repo reference to draw
from and was built fresh against Tuya's documented signing scheme instead.

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

# Quiet-mode crash-recovery marker (runtime state, not app code)
quiet-state.json

```

### Environment Variables Template (`.env.example`)

```ini
# System Configuration
NODE_ENV=development
PORT=3000                          # Phase 2: Express webhook server listen port. Required.
TIMEZONE=Asia/Bangkok
TUYA_PULSAR_MAX_RETRIES=50         # Was hardcoded in app.js; externalized for tunability

# Tuya Cloud OpenAPI Credentials
TUYA_BASE_URL=https://openapi-sg.iotbing.com   # Phase 2: used by tuyaRestClient.js. Required.
TUYA_ACCESS_ID=your_tuya_access_id
TUYA_ACCESS_SECRET=your_tuya_access_secret
TUYA_SMART_LIFE_UID=your_smart_life_uid   # Not read by any current code path — used manually (via the Tuya API Explorer's "Query Home List") to look up the space_id needed to find the scene rule_ids below. Kept scaffolded for a possible future auto-discovery feature.
TUYA_ARM_SCENE_ID=your_arm_scene_rule_id       # Tap-to-Run scene rule_id for เฝ้าบ้าน — find via Cloud > API Explorer > Scene Linkage Rules > Query Linkage Rules (space_id = your home's id), filter type="scene". Optional — เฝ้าบ้าน/ไปพัก hide themselves from the menu if unset.
TUYA_DISARM_SCENE_ID=your_disarm_scene_rule_id # Same, for ไปพัก.
TUYA_ALARM_AUTOMATION_ID=your_alarm_automation_rule_id # rule_id of the automation (type="automation" in the same Query Linkage Rules list above) that "Arm" enables and "Disarm" disables — used at boot to recover houseMode's เฝ้าบ้าน/ไปพัก instead of starting unknown after every restart (Section 8.9, 8.13). Optional; depends on this exact automation setup existing.

# Tuya Pulsar Message Service
TUYA_MQ_URL=wss://mqe-sg.iotbing.com:8285/
TUYA_MQ_ENV=PROD

# LINE Messaging API Credentials
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret   # Phase 2: verifies incoming webhook signatures. Required — get the real value from the LINE Developers Console, not this placeholder.
LINE_GROUP_ID=your_target_line_group_id
LINE_BOT_NAME=รักยม                            # Used as {{botName}} in alert templates. Optional, defaults to รักยม.

# Event Consolidation
EVENT_CORRELATION_WINDOW_MS=15000              # Door->motion->alarm consolidation window (ms). Optional, defaults to 15000.

# Daily Summary
DAILY_REPORT_TIME=08:00                        # HH:mm, in TIMEZONE. Pushes รายงาน (device status + houseMode/quietMode + LINE quota) once a day, bypassing quiet mode (Section 8.20). Optional — disabled if unset.

# Quiet Mode (เงียบๆหน่อย)
QUIET_STATE_FILE=./quiet-state.json            # Crash-recovery marker file (existence-only signal, not real state persistence). Optional, defaults to ./quiet-state.json.

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
│   │   ├── deviceRegistry.js           # Loads deviceRegistry.json
│   │   ├── deviceRegistry.json         # Actual device_id -> {name, category, dpProfile} map (Untracked — real device IDs, like .env)
│   │   ├── deviceRegistry.example.json # Template committed to Git (shape reference, no real device IDs)
│   │   ├── dpProfiles.js               # [Phase 2] Per-Tuya-category DP code -> event resolver table, keyed by dpProfile
│   │   └── deviceCategories.js         # [Phase 2] User-facing category -> {label, emoji, menu/action flags} table
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
│   │   ├── sensorNormalizer.js     # Maps Tuya DP codes to event schema, via dpProfiles.js (data-driven, not hardcoded per-code branches)
│   │   ├── templateEngine.js       # Renders localized Thai JSON templates
│   │   ├── lineMessaging.js        # LINE messagingApi wrapper (push + reply)
│   │   ├── eventCorrelator.js      # Consolidates bursts of events into one LINE message, gated by quietMode.js; see Section 8.8
│   │   ├── tuyaRestClient.js       # [Phase 2] Hand-rolled Tuya OpenAPI client — token minting, signed status/log queries, device commands, and Tap-to-Run Scene triggering
│   │   ├── interactionRouter.js    # [Phase 2] Webhook event dispatch: trigger keyword/command -> menu -> status/control/arm-disarm/history/quiet-mode
│   │   ├── quietMode.js            # [Phase 2, Increment 3] In-memory quiet-mode state (timed or indefinite) + crash-recovery marker file; see Section 8.16
│   │   ├── houseMode.js            # [Phase 2, Increment 3] Best-effort last-known arm/disarm, for รายงาน display only — seeded via LINE, the physical remote, or a Tuya automation query at boot; see Section 8.17
│   │   ├── statusReport.js         # [Phase 2, Increment 4] Shared รายงาน builder (device status + houseMode/quietMode + LINE quota) — used by both the manual command and the daily push; see Section 8.19
│   │   └── dailyReport.js          # [Phase 2, Increment 4] Optional once-daily automatic รายงาน push (DAILY_REPORT_TIME); see Section 8.20
│   ├── templates/
│   │   ├── securityAlerts.json     # Localized Thai alert message templates (Phase 1)
│   │   ├── menuBuilders.js         # [Phase 2] Quick Reply builders for the full tap-menu tree (status/manage/house/arm-disarm/quiet), dynamic, not static JSON
│   │   ├── statusCard.js           # [Phase 2] Flex builders for a device's live status (single card + all-devices/mode table) and Yes/No confirm prompts
│   │   └── historyCard.js          # [Phase 2, Increment 3] Per-device recent-activity view; see Section 8.18
│   ├── utils/
│   │   ├── dateTime.js             # Asia/Bangkok date-time formatters
│   │   └── logger.js               # Console + size/day-rotated file logger, bounded by LOG_MAX_FILES
│   ├── webhook/
│   │   └── server.js               # [Phase 2] Express app: LINE signature-verified /webhook route
│   └── app.js                      # Application bootstrap — Pulsar client + webhook server + quiet-mode crash-recovery check
└── tuya-pulsar-ws-node/            # Compiled local Pulsar SDK package
    ├── dist/                       # Compiled JavaScript output
    └── package.json
```

**Before vendoring `tuya-pulsar-ws-node`:** confirm its own dependency tree is free of native (`node-gyp`) bindings — the "Zero Native C++ Dependencies" principle in Section 1 only holds if this vendored package meets it too, since it bypasses npm's normal audit path. Check its `package.json` and `dist/` for any `.node` binaries before committing it.

---

## 6. Sensor DP Code Mapping Schema

As of the `dpProfiles.js` refactor (Section 8.11), DP interpretation is
**per-device, not global** — a device is registered in `deviceRegistry.json`
with a `dpProfile` naming exactly one Tuya Product Category, and only DP
codes defined for *that* profile are ever interpreted for it. This matters
because the same DP code name can mean different things in different
categories (`switch_1` is a relay in `tdq`, never a door), and the same
concept can use different code names across categories (`mcs` reports door
state as `doorcontact_state`; `qt` reports the identical concept as
`switch`). The table below is a flattened summary for quick reference — the
authoritative source is `dpProfiles.js` itself, cross-referenced with
`TUYA_DEVICE_DP_REGISTRY.md`'s raw per-category schemas.

| `dpProfile` | Tuya Category | DP Code (`code`) | Value | `eventType` |
| --- | --- | --- | --- | --- |
| `mcs` | Contact Sensor | `doorcontact_state` | `true` / `false` | `DOOR_OPENED` / `DOOR_CLOSED` |
| `mcs` | Contact Sensor | `battery_percentage` | `number` (0–100) | `BATTERY_LOW` (< 20%) |
| `qt` | Others (door/window magnetic sensor) | `switch` | `true` / `false` | `DOOR_OPENED` / `DOOR_CLOSED` |
| `qt` | Others (door/window magnetic sensor) | `battery` | `number` | `BATTERY_LOW` (< 20%) |
| `pir` | Motion Detector | `pir` | `"pir"` / `"none"` | `MOTION_DETECTED` / *(silent)* |
| `pir` | Motion Detector | `battery_percentage` | `number` (0–100) | `BATTERY_LOW` (< 20%) |
| `tdq` | Breaker | `switch_1` | `true` / `false` | `RELAY_ON` / `RELAY_OFF` |
| `sgbj` | Siren | `alarm_switch` | `true` / `false` | `ALARM_ON` / `ALARM_OFF` |
| `watersensor`* | Water Leak Sensor | `watersensor_state` | `"alarm"` / `"normal"` | `WATER_LEAK` / *(silent)* |
| `sos` | Emergency Button (Security Remote Control) | `arm` / `disarmed` | `"arm"` / `"disarmed"` | `REMOTE_ARMED` / `REMOTE_DISARMED` |
| `sos` | Emergency Button (Security Remote Control) | `home` / `sos` | — | *(still `UNKNOWN_EVENT`, see `TUYA_DEVICE_DP_REGISTRY.md`)* |

\* `watersensor` is a placeholder profile key — no device is registered
under it yet, and the real Tuya Product Category code hasn't been confirmed
against an actual device. Rename the key once one is added and confirmed.

Routine/non-alert telemetry — PIR `"none"` (motion clear), water sensor
`"normal"`, and battery ≥ 20% — intentionally returns `null` from its
resolver rather than an event, producing no LINE message (see Section 9
DoD). A DP code not listed for a device's profile (including a device with
no `dpProfile` registered at all) becomes `UNKNOWN_EVENT` — never guessed at
using another profile's meaning.

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
  "REMOTE_ARMED": "มีคนกดเฝ้าบ้านจากรีโมทครับ เฝ้าบ้านเรียบร้อยครับ แจ้งเตือนตามปกติครับ\n{{timestamp}}",
  "REMOTE_DISARMED": "มีคนกดไปพักจากรีโมทครับ ไปพักเรียบร้อยครับ 🤫 จะไม่แจ้งเตือนจนกว่าจะเฝ้าบ้านหรือกลับบ้านนะครับ\n{{timestamp}}",
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
  "version": "2.1.0",
  "description": "Smart Home Security Engine for Tuya & LINE Bot",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "node --watch src/app.js"
  },
  "dependencies": {
    "@line/bot-sdk": "^11.1.0",
    "dotenv": "^16.4.5",
    "express": "^5.2.1",
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

// YYYY-MM-DD HH:mm:ss.SSS (Bangkok) — used for log file lines, so they
// align with `date` on the server instead of the raw UTC that
// `new Date().toISOString()` would give, and sort correctly as plain text.
// getBangkokDateParts() uses a 2-digit year for the DD/MM/YY display
// timestamp above; logs need an unambiguous 4-digit year, so this computes
// its own parts rather than reusing that shared helper.
function getBangkokLogTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.TIMEZONE || 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  // Milliseconds-within-the-second are timezone-invariant, so no conversion needed.
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${ms}`;
}

// DD MMM YY HH:mm:ss (e.g. "16 Aug 26 00:52:01") — used for device history
// lines (historyCard.js, Section 8.18), which can span up to a week. Unlike
// getBangkokTimestamp's DD/MM/YY, a named month reads faster at a glance
// down a list of rows and can't be misread as MM/DD by a reader used to a
// different date convention. Computes its own parts (like
// getBangkokLogTimestamp above) rather than reusing getBangkokDateParts,
// since that helper's month is numeric, not a name.
function getBangkokHistoryTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.TIMEZONE || 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.day} ${parts.month} ${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

module.exports = { getBangkokTimestamp, getBangkokTime, getBangkokLogTimestamp, getBangkokHistoryTimestamp };

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

Rewritten (2026-08-15) from a monolithic `if (code === ...)` chain matching
DP codes globally to a data-driven dispatch through `dpProfiles.js` (Section
8.11), keyed by each device's registered `dpProfile`. The old global-match
approach had a real correctness gap: `qt`'s `switch` DP and `tdq`'s
`switch_1` DP are unrelated concepts (door state vs. relay control) that
happen to use similar code names, and nothing prevented a device from being
misread according to the wrong category's meaning. Per-device profile
lookup closes that gap — see `dpProfiles.js`'s own comments for the full
rationale.

```javascript
const deviceRegistry = require('../config/deviceRegistry');
const { DP_PROFILES } = require('../config/dpProfiles');
const { getBangkokTimestamp, getBangkokTime } = require('../utils/dateTime');

class SensorNormalizer {
  transform(rawMessage) {
    if (!rawMessage || !rawMessage.devId || !Array.isArray(rawMessage.status)) {
      return null;
    }

    const deviceId = rawMessage.devId;
    const device = deviceRegistry[deviceId];
    const deviceName = device?.name || `Sensor (${deviceId.substring(0, 6)}...)`;
    // Only DP codes defined in this specific device's profile are ever
    // interpreted — never matched globally across all devices. See
    // src/config/dpProfiles.js for why (the same DP code name can mean
    // different things in different Tuya categories, and the same concept
    // can use different code names across categories).
    const profile = device?.dpProfile ? DP_PROFILES[device.dpProfile] : null;

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

      const resolve = profile && profile[code];
      if (!resolve) {
        // Unregistered device (no dpProfile), or a DP code this device's
        // profile doesn't define — surface it for triage rather than
        // guessing at a meaning from another category.
        events.push({
          deviceId,
          deviceName,
          eventType: 'UNKNOWN_EVENT',
          rawPayload: JSON.stringify(dp),
          timestamp,
          time
        });
        continue;
      }

      const result = resolve(value);
      // null means routine telemetry (healthy battery, motion clear, etc.)
      // — intentionally not an event (Section 9 DoD).
      if (!result) continue;

      events.push({
        deviceId,
        deviceName,
        eventType: result.eventType,
        ...result.extra,
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

  // `content` is either a plain string (wrapped as a text message, the
  // original/common case — every alert template renders to a string) or a
  // pre-built message object/array (e.g. statusReport.js's Flex รายงาน
  // table for the daily summary) — same accepts-either pattern as
  // replyMessage below.
  async pushMessage(content) {
    if (!this.groupId) {
      throw new Error('LINE_GROUP_ID is missing from environment.');
    }

    const messages =
      typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [content];

    await this.client.pushMessage({
      to: this.groupId,
      messages
    });
  }

  // LINE's monthly push-message quota + how much of it has been used so
  // far this month — surfaced in รายงาน (statusReport.js) so a nearly-spent
  // quota isn't a silent surprise. Both are lightweight GETs against LINE's
  // own API, unrelated to Tuya. Callers decide how to handle a failure
  // (statusReport.js treats it as best-effort, same as houseMode/quietMode).
  async getQuota() {
    const [quota, consumption] = await Promise.all([
      this.client.getMessageQuota(),
      this.client.getMessageQuotaConsumption()
    ]);
    return { quota, consumption };
  }

  // For responding to an incoming webhook event (Phase 2 interactive menu).
  // Uses the event's replyToken instead of pushMessage's fixed groupId — it
  // doesn't count against the push-message quota and works in whichever
  // chat (group or 1:1) the triggering event came from. replyToken expires
  // ~1 minute after the event, so this must be called promptly.
  async replyMessage(replyToken, messages) {
    await this.client.replyMessage({
      replyToken,
      messages: Array.isArray(messages) ? messages : [messages]
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

**Increment 3 addition — quiet mode gate + critical-event bypass.** `_push()`
is the single choke point every LINE alert push goes through, so it's also
where `quietMode.js` (Section 8.16) is checked: if quiet mode is active
(timed, via เงียบๆหน่อย, or indefinite, via an automatic ไปพัก), the push is
skipped and logged instead of sent. `CRITICAL_EVENT_TYPES` (`ALARM_ON`,
`ALARM_OFF`, `WATER_LEAK`, a pre-emptive `SMOKE_DETECTED` for when a smoke
sensor is eventually added, and `REMOTE_ARMED`/`REMOTE_DISARMED`) always
bypass this gate — neither a manual quiet request nor the automatic ไปพัก
quiet should be able to hide a real emergency, and a REMOTE_DISARMED
confirmation must still get through even though it just set the very
indefinite quiet that would otherwise suppress it (app.js, Section 8.5).
Because a burst of routine events can still fold a critical one
into a single `CHAIN_ESCALATION` message, `_flush()` also tags that
synthetic event with `containsCritical` if any of its consolidated lines
were critical, so the whole message still bypasses the gate rather than only
a would-be-standalone critical event doing so.

```javascript
const logger = require('../utils/logger');
const quietMode = require('./quietMode');

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
  REMOTE_ARMED: () => 'กดเฝ้าบ้านจากรีโมท',
  REMOTE_DISARMED: () => 'กดไปพักจากรีโมท',
  UNKNOWN_EVENT: (event) => `${event.deviceName} มีเหตุการณ์ไม่ทราบสาเหตุ`
};

// The eventType that always flushes an open window immediately instead of
// waiting out the full WINDOW_MS — there's no benefit to delaying once the
// worst-case event has already happened.
const TERMINAL_EVENT = 'ALARM_ON';

// Genuinely critical eventTypes always push, regardless of quiet mode —
// neither the manual เงียบๆหน่อย nor the automatic ไปพัก-indefinite quiet
// should be able to hide a real emergency. ALARM_OFF rides along with
// ALARM_ON so the "all clear" follow-up is never silently swallowed while
// the ALARM_ON itself got through. SMOKE_DETECTED is included pre-emptively
// for when a smoke sensor is added — no such device/dpProfile exists yet
// (TUYA_DEVICE_DP_REGISTRY.md/dpProfiles.js), but the moment one is, it
// should bypass quiet mode without anyone having to remember to update this
// list again. REMOTE_ARMED/REMOTE_DISARMED are included too: app.js sets
// quietMode indefinite *before* pushing the REMOTE_DISARMED confirmation, so
// without this the confirmation would suppress itself.
const CRITICAL_EVENT_TYPES = new Set([
  'ALARM_ON',
  'ALARM_OFF',
  'WATER_LEAK',
  'SMOKE_DETECTED',
  'REMOTE_ARMED',
  'REMOTE_DISARMED'
]);

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
      timestamp: events[events.length - 1].timestamp,
      // CHAIN_ESCALATION's own eventType isn't itself critical, but if any
      // consolidated line inside it is, the whole message must still bypass
      // quiet mode — a real ALARM_ON shouldn't go missing just because it
      // got folded into a burst with other, routine events.
      containsCritical: followUps.some((e) => CRITICAL_EVENT_TYPES.has(e.eventType))
    });
  }

  async _push(event) {
    // Quiet mode (Increment 3) suppresses only this final push — dedup,
    // window buffering, and CHAIN_ESCALATION composition above all keep
    // running exactly as normal, so state stays consistent and nothing
    // needs to be replayed once the quiet period ends. Critical events
    // (CRITICAL_EVENT_TYPES above) always bypass this gate — neither a
    // manual เงียบๆหน่อย nor an automatic ไปพัก-quiet should be able to hide
    // a real emergency.
    const isCritical = CRITICAL_EVENT_TYPES.has(event.eventType) || event.containsCritical;
    if (quietMode.isQuiet() && !isCritical) {
      logger.info(`[QUIET_MODE] Suppressed (${event.eventType}) push for ${event.deviceName || 'chain escalation'}`);
      return;
    }
    if (quietMode.isQuiet() && isCritical) {
      logger.info(`[QUIET_MODE] Bypassed for critical event (${event.eventType})`);
    }

    const text = this.templateEngine.render(event);
    // Exact rendered text, before it's sent — debug-only since it's
    // effectively a duplicate of the [ALERT_SENT] line below, but useful
    // to confirm the actual wording delivered vs. what a template change
    // was expected to produce.
    logger.debug(`[LINE_OUT] (${event.eventType})`, text);
    await this.lineService.pushMessage(text);
    logger.info(`[ALERT_SENT] (${event.eventType}) Delivered notification for ${event.deviceName || 'chain escalation'}`);
  }
}

module.exports = EventCorrelator;

```

### 8.9 Application Entry Point (`src/app.js`)

**Increment 3 addition** — right after the webhook server starts listening,
checks `quietMode.readCrashMarker()` (Section 8.16) once at boot. If it
returns non-null, the previous process died while quiet mode was active;
this pushes one explicit "restarted, alerting is back to normal" message to
the group rather than silently resuming with no one told.

**Increment 4 additions** — `dailyReport.start(lineService)` (Section 8.20)
is a no-op unless `DAILY_REPORT_TIME` is set. Separately, if
`TUYA_ALARM_AUTOMATION_ID` is set, boot also queries that automation's
current enable/disable status (`tuyaRestClient.getSceneRule`, Section 8.13)
and seeds `houseMode` from it (`enable` → `arm`, `disable` → `disarm`) —
this deployment's "Arm" Tap-to-Run scene enables that automation and
"Disarm" disables it, so its status is an authoritative stand-in for
เฝ้าบ้าน/ไปพัก at startup, fixing the case where a restart would otherwise
leave รายงาน's mode line unknown until the next LINE command or remote
button press.

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
const { createWebhookServer } = require('./webhook/server');
const quietMode = require('./services/quietMode');
const houseMode = require('./services/houseMode');
const dailyReport = require('./services/dailyReport');
const tuyaRestClient = require('./services/tuyaRestClient');
const { getBangkokTime } = require('./utils/dateTime');
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

// SDK emits (ws, message) — confirmed by tuya-pulsar-ws-node's README/example.
// The device event itself is nested under message.payload.data (devId,
// status), not on message directly.
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
      // Physical Security Remote Control arm/disarm buttons (dpProfiles.js's
      // `sos` profile) are the hardware-side counterpart to interactionRouter
      // .js's _executeArmDisarm — same houseMode/quietMode side effects,
      // just triggered by a button press instead of a LINE tap. Must run
      // before correlator.process() below so the REMOTE_ARMED/REMOTE_DISARMED
      // confirmation message it pushes already reflects the new quiet state.
      if (event.eventType === 'REMOTE_ARMED' || event.eventType === 'REMOTE_DISARMED') {
        const mode = event.eventType === 'REMOTE_ARMED' ? 'arm' : 'disarm';
        houseMode.setMode(mode);
        if (mode === 'disarm') {
          quietMode.setIndefiniteQuiet();
        } else {
          quietMode.clearQuiet();
        }
        logger.info(`[REMOTE] Physical remote ${mode} — synced houseMode/quietMode`);
      }

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

// Phase 2: interactive status query webhook, runs alongside the Pulsar
// client above. Independent of it — a webhook failure doesn't affect
// Phase 1 alerting, and vice versa.
const webhookApp = createWebhookServer();
const port = process.env.PORT || 3000;
webhookApp.listen(port, () => {
  logger.info(`Webhook server listening on port ${port}.`);
});

// Crash/restart recovery for quiet mode (Increment 3): quietMode.js's
// in-memory quietUntil doesn't survive a restart, so without this, alerting
// would silently resume mid-quiet-period with no one told. The marker file
// is only ever deleted through a clean in-process path (manual wake or the
// timer firing) — its presence here means the previous process died while
// quiet mode was still active.
const crashedQuietState = quietMode.readCrashMarker();
if (crashedQuietState) {
  // Two marker shapes: { indefinite: true } from ไปพัก (no expiry to report)
  // vs { quietUntil, minutes } from a timed เงียบๆหน่อย/-quiet.
  const detail = crashedQuietState.indefinite
    ? 'เดิมอยู่ในโหมดไปพัก เงียบไม่จำกัดเวลา'
    : `เดิมเงียบถึง ${getBangkokTime(new Date(crashedQuietState.quietUntil))}`;
  lineService
    .pushMessage(`ระบบรีสตาร์ทครับ กลับมาแจ้งเตือนตามปกติแล้วนะครับ (${detail})`)
    .catch((err) => logger.error('[QUIET_MODE] Failed to send crash-recovery message:', err));
}

// Optional daily รายงาน push (DAILY_REPORT_TIME) — no-ops if unset. See
// dailyReport.js for scheduling details.
dailyReport.start(lineService);

// Boot-time houseMode recovery: without this, every restart starts รายงาน's
// mode line as unknown until the next LINE command or remote button press,
// even though Tuya itself already knows the real state. This deployment's
// "Arm" Tap-to-Run scene enables the "Alarm" automation (rule_id below);
// "Disarm" disables it (and switches the siren off) — so its current
// enable/disable status is an authoritative stand-in for เฝ้าบ้าน/ไปพัก at
// startup. Optional — TUYA_ALARM_AUTOMATION_ID depends on a specific
// automation setup that may not exist/match in every deployment; if unset,
// houseMode just starts unknown as before.
const alarmAutomationId = process.env.TUYA_ALARM_AUTOMATION_ID;
if (alarmAutomationId) {
  tuyaRestClient
    .getSceneRule(alarmAutomationId)
    .then((rule) => {
      const mode = rule.status === 'enable' ? 'arm' : 'disarm';
      houseMode.setMode(mode);
      logger.info(`[HOUSE_MODE] Recovered mode at boot from Tuya "Alarm" automation: ${mode}`);
    })
    .catch((err) => logger.error('[HOUSE_MODE] Failed to recover mode at boot:', err));
}

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

At `LOG_LEVEL=debug`, two focused payload logs are also available for
investigation, separate from the SDK's own noisier `[SDK:INFO]` dumps
(which include the base64/crypto envelope): `[TUYA_IN]` — the decrypted
device payload (`devId`, `status[]`) as received, logged in `app.js` right
after decryption/before normalization (Section 8.9); and `[LINE_OUT]` — the
exact rendered text about to be sent to LINE, logged in `eventCorrelator.js`
just before `pushMessage()` (Section 8.8). Both use `logger.debug()`, so
they cost nothing at the default `LOG_LEVEL=info`.

File log lines use `getBangkokLogTimestamp()` (`src/utils/dateTime.js`,
Section 8.3) instead of `new Date().toISOString()`, so they read in the
server's local time (`TIMEZONE`, default `Asia/Bangkok`) rather than UTC —
otherwise a log timestamp and `date` on the VM could differ by several
hours, complicating investigation.

```javascript
const fs = require('fs');
const path = require('path');
const rfs = require('rotating-file-stream');
const { getBangkokLogTimestamp } = require('./dateTime');

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
  const line = `[${getBangkokLogTimestamp()}] ${level} ${message}`;
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

### 8.11 Device DP Profiles & Categories (`src/config/dpProfiles.js`, `src/config/deviceCategories.js`)

Two config tables added for Phase 2, on different axes (Section 6 explains
the distinction in full). `dpProfiles.js` is per-Tuya-category and drives
alert interpretation (Phase 1 `sensorNormalizer.js`, Section 8.5).
`deviceCategories.js` is the coarser, user-facing grouping that drives the
Phase 2 tap-menu — it has no effect on alerting.

```javascript
// Declarative DP interpretation table, keyed by Tuya Product Category code
// (the same codes used as section headers in TUYA_DEVICE_DP_REGISTRY.md —
// `mcs`, `qt`, `tdq`, `sgbj`, `pir`, ...). Each device in deviceRegistry.json
// is registered with a `dpProfile` naming exactly one of these keys, so
// sensorNormalizer.js interprets a DP code only against the profile that
// specific device is known to use — never globally across all devices.
//
// This matters because different categories reuse the same DP code name for
// different meanings (`tdq`'s `switch_1` is a relay; a door sensor's state
// is never `switch_1`) — and, more subtly, the same *concept* can appear
// under different code names per category (`mcs` reports door state as
// `doorcontact_state`; `qt` reports the identical concept as `switch`).
// Global code matching can't safely distinguish either case; per-device
// profile lookup can.
//
// Adding a new device that uses an EXISTING profile here (i.e. Tuya already
// assigns it one of these category codes) requires zero code changes — just
// register it in deviceRegistry.json with the matching `dpProfile`. Only a
// genuinely new Tuya category needs a new entry in this file.
//
// Each resolver: (value) => { eventType, extra? } | null. Returning null
// means the reading is routine telemetry (e.g. healthy battery, motion
// clear) and should not become an event — matches the existing Section 9 DoD
// contract that routine telemetry produces zero LINE messages.

const isTrue = (value) => value === true || value === 'true';

function batteryLow(value) {
  if (typeof value !== 'number' || value >= 20) return null;
  return { eventType: 'BATTERY_LOW', extra: { batteryLevel: value } };
}

function doorState(value) {
  return { eventType: isTrue(value) ? 'DOOR_OPENED' : 'DOOR_CLOSED' };
}

function relayState(value) {
  return { eventType: isTrue(value) ? 'RELAY_ON' : 'RELAY_OFF' };
}

function alarmState(value) {
  return { eventType: isTrue(value) ? 'ALARM_ON' : 'ALARM_OFF' };
}

function motionDetected(value) {
  if (value !== 'pir' && !isTrue(value)) return null;
  return { eventType: 'MOTION_DETECTED' };
}

function waterLeak(value) {
  if (value !== 'alarm' && !isTrue(value)) return null;
  return { eventType: 'WATER_LEAK' };
}

function remoteArmed() {
  return { eventType: 'REMOTE_ARMED' };
}

function remoteDisarmed() {
  return { eventType: 'REMOTE_DISARMED' };
}

const DP_PROFILES = {
  // Contact Sensor (door/window) — confirmed via Tuya IoT Platform Product
  // Category for ประตูระเบียงห้องพ่อ, ประตูครัว, ประตูหน้าบ้าน (2026-08-15).
  mcs: {
    doorcontact_state: doorState,
    battery_percentage: batteryLow
  },
  // "Others" category, Product Name 门窗磁传感器 (door/window magnetic
  // sensor) — confirmed via Tuya IoT Platform for ประตูห้องป้าแสง and
  // ประตูห้องพ่อ (2026-08-15); polarity separately confirmed against the
  // Smart Life app's History log. Same concept as `mcs` above, different DP
  // code names — this is exactly why profiles are per-device, not global.
  qt: {
    switch: doorState,
    battery: batteryLow
  },
  // Breaker.
  tdq: {
    switch_1: relayState
  },
  // Siren.
  sgbj: {
    alarm_switch: alarmState
  },
  // Motion Detector.
  pir: {
    pir: motionDetected,
    battery_percentage: batteryLow
  },
  // Water Leak Sensor — real Tuya Product Category code not yet confirmed
  // against a registered device (none owned yet); key name is a placeholder
  // to rename once one is added. `watersensor_state` mapping itself is
  // carried over unchanged from the pre-dpProfiles normalizer.
  watersensor: {
    watersensor_state: waterLeak
  },
  // Security Remote Control (Emergency Button / รีโมท) — its arm/disarmed/
  // home/sos Enum DPs are confirmed real (TUYA_DEVICE_DP_REGISTRY.md) but
  // not externally commandable (battery-powered Zigbee end device — see
  // Section 8.13 on triggerScene). Only `arm`/`disarmed` are handled: these
  // sync houseMode/quietMode the same way the LINE-side เฝ้าบ้าน/ไปพัก
  // commands do (app.js, on REMOTE_ARMED/REMOTE_DISARMED) — the hardware
  // counterpart to interactionRouter.js's _executeArmDisarm. `home`/`sos`
  // still fall through to UNKNOWN_EVENT.
  sos: {
    arm: remoteArmed,
    disarmed: remoteDisarmed
  }
};

// Increment 2 (device control): which DP code a profile's on/off toggle
// actually writes, per profile — same rationale as DP_PROFILES itself.
// Lives here rather than deviceCategories.js because it's a per-Tuya-category
// fact (tdq writes switch_1; sgbj writes alarm_switch), not a user-facing
// grouping concern. Only profiles that support a toggle action need an
// entry; a category with no entry here just doesn't offer a toggle button
// regardless of deviceCategories.js's `controllable` flag.
const CONTROL_DP = {
  tdq: 'switch_1',
  sgbj: 'alarm_switch'
};

module.exports = { DP_PROFILES, CONTROL_DP };

```

```javascript
// User-facing grouping for the Phase 2 interactive menu — a coarser axis
// than dpProfiles.js's per-Tuya-category DP interpretation. E.g. the "door"
// category spans both the `mcs` and `qt` dpProfiles; a family member picking
// "ประตู/หน้าต่าง" from the menu shouldn't need to know or care which one a
// given door actually uses. This table has no bearing on Phase 1 alerting,
// which is driven entirely by dpProfiles.js — it only shapes what shows in
// the tap-menu and which actions are offered per category.
//
// Adding a same-category device later needs zero changes here — just a
// deviceRegistry.json entry with that `category`. Only a genuinely new
// category needs a new entry in this table.
//
// `inMenu: false` categories (remote, gateway) are infrastructure/physical
// controls with nothing meaningful for the bot to query or act on — they're
// excluded from the top-level category menu entirely, and the menu only
// ever lists a category if deviceRegistry.json has >=1 device registered
// under it (built dynamically, not hardcoded — see interactionRouter.js).
//
// `label` is kept short deliberately: LINE Quick Reply's button `label`
// field has a hard 20-character limit (emoji + space + label, combined) —
// anything longer gets silently truncated mid-word by the LINE client, not
// rejected by the API, so this only surfaces as an ugly button in testing.

const DEVICE_CATEGORIES = {
  door: {
    label: 'ประตู/หน้าต่าง',
    emoji: '🚪',
    inMenu: true,
    queryable: true,
    controllable: false
  },
  motion: {
    label: 'ความเคลื่อนไหว',
    emoji: '🏃',
    inMenu: true,
    queryable: true,
    controllable: false
  },
  water: {
    label: 'น้ำรั่ว',
    emoji: '💧',
    inMenu: true,
    queryable: true,
    controllable: false
  },
  relay: {
    label: 'สวิตช์ไฟ',
    emoji: '💡',
    inMenu: true,
    queryable: true,
    controllable: true,
    // Increment 2 (device control): which actions this category exposes.
    actions: ['toggle', 'timer']
  },
  alarm: {
    label: 'สัญญาณเตือนภัย',
    emoji: '🚨',
    inMenu: true,
    queryable: true,
    controllable: true,
    actions: ['toggle']
  },
  remote: {
    label: 'รีโมท',
    emoji: '📱',
    inMenu: false,
    queryable: false,
    controllable: false
  },
  gateway: {
    label: 'เกตเวย์',
    emoji: '📡',
    inMenu: false,
    queryable: false,
    controllable: false
  }
};

module.exports = { DEVICE_CATEGORIES };

```

This happened during Increment 1's build — the original `motion` label
(`เซนเซอร์ตรวจจับความเคลื่อนไหว`) was silently truncated to
`"🏃 เซนเซอร์ตรวจจับคว"` before being shortened to fit within the limit.

### 8.12 Menu & Status Card Builders (`src/templates/menuBuilders.js`, `src/templates/statusCard.js`)

JS functions, not static JSON like `securityAlerts.json` — content is
structurally dynamic (the category/device lists depend on what's actually in
`deviceRegistry.json`, and the ดูแลบ้าน/เงียบๆ menu items only appear once
configured). Postback `data` encodes the whole next navigation step as a
plain query string (`a=devices&c=door`, `a=status&id=<deviceId>`, `a=all`,
`a=armconfirm&mode=arm`, `a=armexec&mode=disarm`, `a=quiet&min=30`, `a=wake`,
...) — no server-side session is needed; every tap is a self-contained
request, parsed with `URLSearchParams` in `interactionRouter.js`
(Section 8.14).

`เมนู` opens the root `[📋 สถานะ / 🔧 จัดการ / 🏠 ดูแลบ้าน / 🤫 เงียบๆ]`
picker (`buildRootMenu()`); `/status`/`สถานะ` skip straight into the สถานะ
branch's category picker (`buildCategoryMenu()`); `/status all`/
`สถานะทั้งหมด`/`รายงาน` skip straight to the report table; `/arm`/`เฝ้าบ้าน`
and `/disarm`/`ไปพัก` skip straight to the arm/disarm Yes/No confirm step.
`จัดการ` (`buildManageMenu()`) hides itself if no controllable device is
registered; `🏠 ดูแลบ้าน` hides itself (`armDisarmAvailable()`) unless both
`TUYA_ARM_SCENE_ID`/`TUYA_DISARM_SCENE_ID` are set; `🤫 เงียบๆ` is always
offered (quiet mode itself never depends on Tuya scene config). Calling the
bot by its own name (`LINE_BOT_NAME`) opens `buildGreeting()`, a friendlier
entry point with direct shortcuts to เมนู/รายงาน/(เฝ้าบ้าน/ไปพัก if
available)/เงียบๆ.

```javascript
// Quick Reply builders for the tap-through menu flow. JS functions, not
// static JSON like securityAlerts.json, since content is structurally
// dynamic — the category list and device list both depend on what's
// actually in deviceRegistry.json, not a fixed template.
//
// Postback `data` encodes the whole next step as a plain query string
// (parsed with URLSearchParams in interactionRouter.js) — no server-side
// session needed; every tap is a self-contained request.

const deviceRegistry = require('../config/deviceRegistry');
const { DEVICE_CATEGORIES } = require('../config/deviceCategories');

// Only categories that are meant to appear in the menu (deviceCategories.js
// `inMenu: true`) AND actually have >=1 device registered — so the menu
// scales automatically as devices are added/removed, never listing an empty
// category or one like "remote"/"gateway" that has nothing to query.
function categoriesWithDevices() {
  const present = new Set(Object.values(deviceRegistry).map((d) => d.category));
  return Object.entries(DEVICE_CATEGORIES)
    .filter(([key, cat]) => cat.inMenu && present.has(key));
}

function devicesInCategory(category) {
  return Object.entries(deviceRegistry)
    .filter(([, device]) => device.category === category)
    .map(([id, device]) => ({ id, ...device }));
}

// Every registered device whose category is queryable (deviceCategories.js
// `queryable: true`) — excludes remote/gateway, same as the category menu
// itself. Registry order, so repeated queries return devices in a stable
// order.
function queryableDevices() {
  return Object.entries(deviceRegistry)
    .filter(([, device]) => DEVICE_CATEGORIES[device.category]?.queryable)
    .map(([id, device]) => ({ id, ...device }));
}

// Every registered device whose category is controllable (deviceCategories.js
// `controllable: true`) — currently relay + alarm. Feeds the จัดการ (Manage)
// menu, a flat shortcut list skipping the category step entirely since
// there are typically few controllable devices compared to queryable ones.
function controllableDevices() {
  return Object.entries(deviceRegistry)
    .filter(([, device]) => DEVICE_CATEGORIES[device.category]?.controllable)
    .map(([id, device]) => ({ id, ...device }));
}

// เฝ้าบ้าน/ไปพัก are available once both Tap-to-Run scene rule_ids are
// configured (see .env.example) — trying to command the Security Remote
// Control device directly to simulate its physical button press was tried
// first and rejected by Tuya (a battery-powered Zigbee end device can send
// events but can't receive downlink commands); triggering the pre-built
// Tap-to-Run Scenes that replicate the same actions works instead.
function armDisarmAvailable() {
  return Boolean(process.env.TUYA_ARM_SCENE_ID && process.env.TUYA_DISARM_SCENE_ID);
}

// เมนู -> [สถานะ / จัดการ / ดูแลบ้าน] top-level router. Each branch is only
// offered if it'd actually have something to show — จัดการ/ดูแลบ้าน hide
// themselves automatically if there are no controllable devices / scenes
// aren't configured yet, same "scales with the registry" pattern as the
// rest of this file.
function buildRootMenu() {
  const items = [
    {
      type: 'action',
      action: { type: 'postback', label: '📋 สถานะ', data: 'a=statusmenu', displayText: '📋 สถานะ' }
    }
  ];

  if (controllableDevices().length > 0) {
    items.push({
      type: 'action',
      action: { type: 'postback', label: '🔧 จัดการ', data: 'a=managemenu', displayText: '🔧 จัดการ' }
    });
  }

  if (armDisarmAvailable()) {
    items.push({
      type: 'action',
      action: { type: 'postback', label: '🏠 ดูแลบ้าน', data: 'a=house', displayText: '🏠 ดูแลบ้าน' }
    });
  }

  items.push({
    type: 'action',
    action: { type: 'postback', label: '🤫 เงียบๆ', data: 'a=quietprompt', displayText: '🤫 เงียบๆหน่อย' }
  });

  return {
    type: 'text',
    text: 'มีอะไรให้ช่วยครับ',
    quickReply: { items }
  };
}

// สถานะ branch: category -> device -> status+control (reuses the same
// buildDeviceMenu/status-card flow จัดการ also ends up at, since a
// controllable device's status card already includes its control buttons —
// สถานะ and จัดการ are two different *entry points* into the same view, not
// two different views).
function buildCategoryMenu() {
  const categories = categoriesWithDevices();
  const items = [
    ...categories.map(([key, cat]) => ({
      type: 'action',
      action: {
        type: 'postback',
        label: `${cat.emoji} ${cat.label}`.slice(0, 20),
        data: `a=devices&c=${key}`,
        displayText: `${cat.emoji} ${cat.label}`
      }
    })),
    {
      type: 'action',
      action: {
        type: 'postback',
        label: '📊 รายงาน',
        data: 'a=all',
        displayText: '📊 รายงาน'
      }
    }
  ];

  return {
    type: 'text',
    text: 'เลือกหมวดหมู่อุปกรณ์ที่ต้องการเช็คสถานะครับ',
    quickReply: { items }
  };
}

// จัดการ branch: flat list of controllable devices only (relay + alarm
// today), skipping the category step — there are typically few enough that
// grouping adds a tap without adding clarity. No "ทั้งหมด" batch action:
// "turn everything on/off at once" has no unambiguous single meaning with
// only 2 controllable devices, so it's not offered; tapping a device here
// reaches the same status+control card สถานะ would.
function buildManageMenu() {
  const devices = controllableDevices();

  if (devices.length === 0) {
    return { type: 'text', text: 'ยังไม่มีอุปกรณ์ที่จัดการผ่านนี้ได้ครับ' };
  }

  return {
    type: 'text',
    text: 'เลือกอุปกรณ์ที่ต้องการจัดการครับ',
    quickReply: {
      items: devices.map((device) => ({
        type: 'action',
        action: {
          type: 'postback',
          label: device.name.slice(0, 20),
          data: `a=status&id=${device.id}`,
          displayText: device.name
        }
      }))
    }
  };
}

// Triggered by typing the bot's own name — a friendly, discoverable entry
// point (matching the ขุนทอง-style pattern researched for Phase 2) distinct
// from เมนู itself: a short greeting plus direct shortcuts to the most
// common actions, rather than making the user navigate เมนู -> สถานะ first.
function buildGreeting(botName) {
  const items = [
    {
      type: 'action',
      action: { type: 'postback', label: '📋 เมนู', data: 'a=root', displayText: '📋 เมนู' }
    },
    {
      type: 'action',
      action: { type: 'postback', label: '📊 รายงาน', data: 'a=all', displayText: '📊 รายงาน' }
    }
  ];

  if (armDisarmAvailable()) {
    items.push(
      {
        type: 'action',
        action: { type: 'postback', label: '🛡️ เฝ้าบ้าน', data: 'a=armconfirm&mode=arm', displayText: '🛡️ เฝ้าบ้าน' }
      },
      {
        type: 'action',
        action: { type: 'postback', label: '🛌 ไปพัก', data: 'a=armconfirm&mode=disarm', displayText: '🛌 ไปพัก' }
      }
    );
  }

  items.push({
    type: 'action',
    action: { type: 'postback', label: '🤫 เงียบๆ', data: 'a=quietprompt', displayText: '🤫 เงียบๆหน่อย' }
  });

  return {
    type: 'text',
    text: `มีอะไรให้${botName}ช่วยครับ`,
    quickReply: { items }
  };
}

// เฝ้าบ้าน (arm) / ไปพัก (disarm) / กลับบ้าน picker — reached either by
// tapping "🏠 ดูแลบ้าน" in the category menu, or typing เฝ้าบ้าน/ไปพัก/
// กลับบ้าน directly as a shortcut (interactionRouter.js). เฝ้าบ้าน/ไปพัก
// converge on the confirm step (buildArmDisarmConfirm) before anything is
// actually sent; กลับบ้าน ("home now") cancels an active quiet period
// (เงียบๆหน่อย) immediately, same non-destructive/no-confirm-needed
// reasoning as ตื่นแล้ว.
function buildHouseMenu() {
  return {
    type: 'text',
    text: 'เฝ้าบ้านหรือไปพักดีครับ?',
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'postback', label: '🛡️ เฝ้าบ้าน', data: 'a=armconfirm&mode=arm', displayText: '🛡️ เฝ้าบ้าน' }
        },
        {
          type: 'action',
          action: { type: 'postback', label: '🛌 ไปพัก', data: 'a=armconfirm&mode=disarm', displayText: '🛌 ไปพัก' }
        },
        {
          type: 'action',
          action: { type: 'postback', label: '🏡 กลับบ้าน', data: 'a=wake', displayText: '🏡 กลับบ้าน' }
        }
      ]
    }
  };
}

// Yes/No confirm before actually triggering the arm/disarm Scene — arming or
// disarming the whole house's security automation is at least as
// consequential as toggling one relay/alarm, so it gets the same
// confirm-before-act treatment as buildConfirmPrompt() below.
function buildArmDisarmConfirm(mode) {
  const isArm = mode === 'arm';
  const label = isArm ? 'เฝ้าบ้าน' : 'ไปพัก';
  return {
    type: 'text',
    text: `ยืนยันจะ${label}ใช่ไหมครับ?`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: `✅ ใช่ ${label}เลย`,
            data: `a=armexec&mode=${mode}`,
            displayText: `✅ ยืนยัน${label}`
          }
        },
        {
          type: 'action',
          action: { type: 'postback', label: '❌ ยกเลิก', data: 'a=cancel', displayText: '❌ ยกเลิก' }
        }
      ]
    }
  };
}

// เงียบๆหน่อย picker — preset durations cover the common cases; the prompt
// text also tells the user they can just type a number of minutes instead
// (interactionRouter.js arms a short-lived "awaiting duration" flag right
// after sending this, so a bare typed number that follows is understood).
function buildQuietPrompt() {
  return {
    type: 'text',
    text: 'เดี๋ยวจะไปเล่นข้างนอกสักครู่ ให้เงียบไปนานแค่ไหนดีครับ? (หรือพิมพ์จำนวนนาทีก็ได้ครับ)',
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'postback', label: '30 นาที', data: 'a=quiet&min=30', displayText: '30 นาที' }
        },
        {
          type: 'action',
          action: { type: 'postback', label: '1 ชม', data: 'a=quiet&min=60', displayText: '1 ชม' }
        },
        {
          type: 'action',
          action: { type: 'postback', label: '2 ชม', data: 'a=quiet&min=120', displayText: '2 ชม' }
        }
      ]
    }
  };
}

function buildDeviceMenu(category) {
  const cat = DEVICE_CATEGORIES[category];
  const devices = devicesInCategory(category);

  if (!cat || devices.length === 0) {
    return { type: 'text', text: 'ไม่พบอุปกรณ์ในหมวดนี้ครับ' };
  }

  return {
    type: 'text',
    text: `เลือก${cat.label}ที่ต้องการครับ`,
    quickReply: {
      items: devices.map((device) => ({
        type: 'action',
        action: {
          type: 'postback',
          label: device.name.slice(0, 20),
          data: `a=status&id=${device.id}`,
          displayText: device.name
        }
      }))
    }
  };
}

module.exports = {
  buildRootMenu,
  buildCategoryMenu,
  buildDeviceMenu,
  buildManageMenu,
  buildHouseMenu,
  buildArmDisarmConfirm,
  buildGreeting,
  buildQuietPrompt,
  queryableDevices,
  controllableDevices,
  armDisarmAvailable
};
```

`statusCard.js` reads DP codes generically across the profiles a category
can span (e.g. `door` covers both `mcs`'s `doorcontact_state` and `qt`'s
`switch`) rather than routing through `dpProfiles.js`'s alert resolvers —
those intentionally suppress routine readings (e.g. healthy battery returns
`null`, since it's not alert-worthy), but a status query needs to always
show the current battery level, healthy or not. Display and alerting are
different jobs even when they read the same DPs.

The "all devices" view (renamed รายงาน, `buildAllStatusTable()`) renders as a
single Flex Bubble with one row per device, not a Carousel — an earlier
Carousel version required swiping through one card per device, harder to
scan at a glance for the whole house at once. Each row stacks the device
name above its state/battery (`buildStatusRow()`), rather than a horizontal
3-column layout — a long wrapped device name in a horizontal layout visually
detached from the state/battery columns, which stayed pinned to the row's
top; stacking avoids that regardless of name length. `toggleQuickReplyItem()`
adds an on/off Quick Reply item to a single-device status card only for
devices whose `dpProfile` has a `CONTROL_DP` entry (`dpProfiles.js`) —
tapping it only opens `buildConfirmPrompt()`'s Yes/No step, never sends the
real command directly.

**Increment 3 additions.** `historyQuickReplyItem()` adds a 🕘 ประวัติ button
to *every* queryable device's status card (not just controllable ones —
history is a query action, same category as the status card itself),
opening `historyCard.js`'s view (Section 8.18). `buildAllStatusTable()` now
also takes an optional `modeInfo` (`{ armMode, quietMinutes }`), rendered by
`buildModeSection()` as one or two lines above the device rows — armMode
from `houseMode.js` (Section 8.17, best-effort, labeled "ล่าสุดที่ทราบ" since
it's not a verified live query) and quietMinutes from `quietMode.js`
(Section 8.16; `null` renders as an indefinite "จนกว่าจะเฝ้าบ้านหรือ
กลับบ้าน" line rather than a countdown, distinct from a plain number).

```javascript
// Flex Bubble builder for a single device's live status. JS function, not
// static JSON — content (name, state, battery) is per-device and per-query.
//
// Reads DP codes generically across the profiles a category can span (e.g.
// door covers both `mcs`'s doorcontact_state and `qt`'s switch) rather than
// routing through dpProfiles.js's alert resolvers — those intentionally
// suppress routine readings (e.g. healthy battery returns null, since it's
// not alert-worthy), but a status query needs to always show the current
// battery level, healthy or not. Display and alerting are different jobs
// even when they read the same DPs.

const { DEVICE_CATEGORIES } = require('../config/deviceCategories');
const { CONTROL_DP } = require('../config/dpProfiles');

function dpMapFrom(rawStatus) {
  return Object.fromEntries((rawStatus || []).map((dp) => [dp.code, dp.value]));
}

function describeState(category, dpMap) {
  switch (category) {
    case 'door': {
      const isOpen = dpMap.doorcontact_state === true || dpMap.switch === true;
      return { stateText: isOpen ? 'เปิดอยู่' : 'ปิดอยู่', stateEmoji: isOpen ? '🔓' : '🔒' };
    }
    case 'relay': {
      const isOn = dpMap.switch_1 === true;
      return { stateText: isOn ? 'เปิดอยู่' : 'ปิดอยู่', stateEmoji: isOn ? '💡' : '⚫' };
    }
    case 'alarm': {
      const isOn = dpMap.alarm_switch === true;
      return { stateText: isOn ? 'กำลังดังอยู่' : 'ปกติ', stateEmoji: isOn ? '🚨' : '✅' };
    }
    case 'water': {
      const isLeak = dpMap.watersensor_state === 'alarm' || dpMap.watersensor_state === true;
      return { stateText: isLeak ? 'ตรวจพบน้ำรั่ว!' : 'ปกติ', stateEmoji: isLeak ? '💧' : '✅' };
    }
    case 'motion':
    default:
      return { stateText: 'พร้อมใช้งาน', stateEmoji: '🏃' };
  }
}

// Bubble content only (no altText/message wrapper) — used by the
// single-device status card (buildStatusCard). The "all devices" table
// (buildAllStatusTable/buildStatusRow below) renders its own compact row
// layout instead of reusing this bubble; both draw on the same
// dpMapFrom/describeState helpers so they can never disagree on a device's
// state, just on how much of it they show.
function buildStatusBubble(device, rawStatus, error) {
  const cat = DEVICE_CATEGORIES[device.category] || {};

  const bodyContents = [];

  if (error) {
    bodyContents.push({
      type: 'text',
      text: '⚠️ เช็คสถานะไม่ได้',
      size: 'lg',
      weight: 'bold',
      color: '#CC3333'
    });
  } else {
    const dpMap = dpMapFrom(rawStatus);
    const { stateText, stateEmoji } = describeState(device.category, dpMap);
    const battery = dpMap.battery_percentage ?? dpMap.battery;

    bodyContents.push({
      type: 'text',
      text: `${stateEmoji} ${stateText}`,
      size: 'xl',
      weight: 'bold'
    });

    if (typeof battery === 'number') {
      bodyContents.push({
        type: 'text',
        text: `🔋 แบตเหลือ ${battery}%`,
        size: 'sm',
        color: '#888888',
        margin: 'md'
      });
    }
  }

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: `${cat.emoji || ''} ${device.name}`.trim(), weight: 'bold', wrap: true }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents
    }
  };
}

// Increment 2 (device control): a toggle Quick Reply item for any device
// whose dpProfile has a CONTROL_DP entry — currently relay (tdq) and alarm
// (sgbj). The button reflects the opposite of the device's current on/off
// state (currently off -> "turn on" button, and vice versa) so tapping it
// always makes sense as the next action, not a fixed "toggle" whose effect
// depends on state the user can't see at a glance. Tapping only opens a
// confirm prompt (buildConfirmPrompt) — it never sends the real command
// directly, per the "confirm before acting on physical hardware" rule.
function toggleQuickReplyItem(device, dpMap) {
  const controlDp = CONTROL_DP[device.dpProfile];
  if (!controlDp) return null;

  const isOn = dpMap[controlDp] === true;
  const nextCmd = isOn ? 'off' : 'on';
  const label = isOn ? '⚪ ปิด' : '🔴 เปิด';

  return {
    type: 'action',
    action: {
      type: 'postback',
      label,
      data: `a=confirm&id=${device.id}&cmd=${nextCmd}`,
      displayText: label
    }
  };
}

// Increment 3: every queryable device (control or not) gets a "recent
// activity" shortcut on its status card, not just controllable ones — device
// history is a query action, same category as the status card itself.
function historyQuickReplyItem(device) {
  return {
    type: 'action',
    action: {
      type: 'postback',
      label: '🕘 ประวัติ',
      data: `a=history&id=${device.id}`,
      displayText: '🕘 ประวัติ'
    }
  };
}

function buildStatusCard(device, rawStatus) {
  const dpMap = dpMapFrom(rawStatus);
  const { stateText } = describeState(device.category, dpMap);

  const items = [toggleQuickReplyItem(device, dpMap), historyQuickReplyItem(device)].filter(Boolean);

  return {
    type: 'flex',
    altText: `${device.name}: ${stateText}`,
    contents: buildStatusBubble(device, rawStatus),
    quickReply: { items }
  };
}

// Yes/No confirm step before a state-changing command actually fires —
// required for every toggle regardless of category, so a mis-tap on the
// status card's button can't flip a real relay/alarm without a second,
// deliberate tap.
function buildConfirmPrompt(device, cmd) {
  const actionLabel = cmd === 'on' ? 'เปิด' : 'ปิด';
  return {
    type: 'text',
    text: `ยืนยันจะ${actionLabel} ${device.name} ใช่ไหมครับ?`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: `✅ ใช่ ${actionLabel}เลย`,
            data: `a=cmd&id=${device.id}&cmd=${cmd}`,
            displayText: `✅ ยืนยัน${actionLabel} ${device.name}`
          }
        },
        {
          type: 'action',
          action: {
            type: 'postback',
            label: '❌ ยกเลิก',
            data: 'a=cancel',
            displayText: '❌ ยกเลิก'
          }
        }
      ]
    }
  };
}

// Mode summary lines shown above the device table — armMode reflects only
// the last เฝ้าบ้าน/ไปพัก this app observed, either via LINE or the physical
// remote (houseMode.js), not a verified live query against Tuya, so it's
// labeled as such rather than presented as fact. Omitted entirely if
// neither is currently known/active, rather than showing a misleading
// "unknown" placeholder.
function buildModeSection({ armMode, quietMinutes } = {}) {
  const lines = [];

  if (armMode === 'arm') {
    lines.push('🛡️ เฝ้าบ้าน (ล่าสุดที่ทราบ)');
  } else if (armMode === 'disarm') {
    lines.push('🛌 ไปพัก (ล่าสุดที่ทราบ)');
  }

  // quietMinutes: null = indefinite (quietMode.remainingMinutes() returns
  // null while quietMode.isQuiet() is still true — see quietMode.js), a
  // number > 0 = a timed countdown, 0/undefined = not quiet.
  if (quietMinutes === null) {
    lines.push('🤫 อยู่เงียบๆ (จนกว่าจะเฝ้าบ้านหรือกลับบ้าน)');
  } else if (quietMinutes > 0) {
    lines.push(`🤫 อยู่เงียบๆ อีก ${quietMinutes} นาที`);
  }

  if (lines.length === 0) return [];

  return [
    {
      type: 'box',
      layout: 'vertical',
      contents: lines.map((text) => ({ type: 'text', text, size: 'sm', weight: 'bold' }))
    },
    { type: 'separator', margin: 'md' }
  ];
}

// LINE's monthly push-message quota (lineMessaging.js's getQuota, Section
// 8.7) — best effort, same tier as armMode/quietMinutes above: omitted
// entirely rather than shown as "unknown" if the query failed or wasn't
// attempted. `quota` is LINE's raw MessageQuotaResponse ({ type:
// 'limited'|'none', value? }); `type: 'none'` means an unlimited plan, so
// there's no denominator to show.
function buildQuotaSection({ quota, quotaConsumed } = {}) {
  if (quota == null || quotaConsumed == null) return [];

  const text =
    quota.type === 'limited' && typeof quota.value === 'number'
      ? `📨 ส่งข้อความไปแล้ว ${quotaConsumed}/${quota.value} ครั้งเดือนนี้`
      : `📨 ส่งข้อความไปแล้ว ${quotaConsumed} ครั้งเดือนนี้ (ไม่จำกัดโควต้า)`;

  return [
    {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'text', text, size: 'sm', color: '#888888' }]
    },
    { type: 'separator', margin: 'md' }
  ];
}

// One row of the "all devices" table: name on its own full-width line
// (wraps freely for long names without disturbing anything else), then
// state + battery on a second line below it. An earlier version put all
// three on one horizontal line — a long wrapped name then visually detached
// from the state/battery columns, which stayed pinned to the row's top.
// Stacking avoids that regardless of name length. A per-device error still
// renders its own row rather than failing the whole table; devices that
// succeeded still show their real status.
function buildStatusRow(device, rawStatus, error) {
  const cat = DEVICE_CATEGORIES[device.category] || {};
  let stateCell = '⚠️ เช็คไม่ได้';
  let stateColor = '#CC3333';
  let batteryCell = '-';

  if (!error) {
    const dpMap = dpMapFrom(rawStatus);
    const { stateText, stateEmoji } = describeState(device.category, dpMap);
    const battery = dpMap.battery_percentage ?? dpMap.battery;
    stateCell = `${stateEmoji} ${stateText}`;
    stateColor = '#111111';
    batteryCell = typeof battery === 'number' ? `${battery}%` : '-';
  }

  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: `${cat.emoji || ''} ${device.name}`.trim(),
        size: 'sm',
        weight: 'bold',
        wrap: true
      },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          {
            type: 'text',
            text: stateCell,
            flex: 3,
            size: 'sm',
            color: stateColor
          },
          {
            type: 'text',
            text: batteryCell,
            flex: 1,
            size: 'xs',
            color: '#888888',
            align: 'end'
          }
        ]
      }
    ]
  };
}

// `results` is an array of { device, rawStatus, error } — one entry per
// queryable device, in registry order. `modeInfo` ({ armMode, quietMinutes,
// quota, quotaConsumed }) is optional context beyond device status
// (Increment 3, plus Increment 4's LINE quota). Single Flex Bubble, one row
// per device — reads as a table, no swiping needed (the earlier Flex
// Carousel version required tapping through one card per device, which was
// harder to scan at a glance for the whole house at once).
function buildAllStatusTable(results, modeInfo) {
  const deviceRows = results.flatMap(({ device, rawStatus, error }, i) => {
    const row = buildStatusRow(device, rawStatus, error);
    return i === 0 ? [row] : [{ type: 'separator', margin: 'md' }, row];
  });
  const rows = [...buildModeSection(modeInfo), ...buildQuotaSection(modeInfo), ...deviceRows];

  return {
    type: 'flex',
    altText: 'รายงาน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: '📊 รายงาน', weight: 'bold' }]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: rows
      }
    }
  };
}

module.exports = { buildStatusCard, buildAllStatusTable, buildConfirmPrompt };
```

### 8.13 Tuya REST Client (`src/services/tuyaRestClient.js`)

Increment 1: token minting + read-only status queries. Increment 2 adds
signed POST command support (`sendCommand`, relay/alarm on-off) and
`triggerScene` (เฝ้าบ้าน/ไปพัก). Increment 3 adds `getDeviceLogs` (ประวัติ).

`getAccessToken()` deduplicates concurrent in-flight mint requests via
`pendingMint` — caught during testing when the "all devices" status query
(`_replyAllStatus`, Section 8.14) fired N parallel `getDeviceStatus()` calls
and each one independently minted its own token, since `cachedToken` was
still `null` for all of them at the same instant. Without this, N parallel
queries cost N token mints instead of 1.

Deliberately hand-rolled rather than using the official
`@tuya/tuya-connector-nodejs` package — evaluated and rejected (2026-08-15)
because it hard-pins a vulnerable `axios` version (`^0.21.1`, multiple known
CVEs: SSRF, ReDoS, prototype pollution) that npm cannot resolve past, due to
the caret-on-0.x pin. Node 18+ (already required by this project) has
built-in `fetch` and `crypto`, so this client needs zero new runtime
dependencies.

The Tuya Cloud API signature (`sign_method HMAC-SHA256`) was reconstructed
from Tuya's documented signing scheme — no in-repo reference existed to copy
from (Section 2's note on the absent `poc/` scripts). **Verified against the
real API** during development: both token minting and a live device status
query succeeded on the first attempt against production credentials.

```javascript
const crypto = require('crypto');
const logger = require('../utils/logger');

// Increment 1 scope: token minting + read-only status queries only. POST
// command support (device control) is added in Increment 2.
//
// Deliberately hand-rolled rather than using the official
// @tuya/tuya-connector-nodejs package — that package hard-pins a vulnerable
// axios version (^0.21.1, multiple known CVEs: SSRF, ReDoS, prototype
// pollution) that npm can't resolve past due to the caret-on-0.x pin. Node
// 18+ (already required by this project) has built-in `fetch` and `crypto`,
// so this needs zero new dependencies.
//
// Tuya Cloud API signature (sign_method HMAC-SHA256) — reconstructed from
// Tuya's documented signing scheme, not copied from any existing code in
// this repo (none existed). Verify against a real request/response before
// relying on this in production; see RUCKYOM_SPECIFICATION.md Section 9 DoD
// for the verification step.
//   stringToSign = method + "\n" + sha256Hex(body) + "\n" + "" + "\n" + path
//   signBase     = client_id + [access_token] + t + stringToSign
//   sign         = HMAC-SHA256(signBase, client_secret), uppercase hex
// access_token is included in signBase for every call except the initial
// token-mint request, which has none yet.

const BASE_URL = process.env.TUYA_BASE_URL;
const ACCESS_ID = process.env.TUYA_ACCESS_ID;
const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET;

// In-memory only — a restart re-mints a token, which is cheap and avoids
// needing Phase 3's persistence layer for something this short-lived (~2h).
let cachedToken = null;
// Tracks an in-flight mint request so concurrent callers (e.g. the "all
// devices" status query firing N parallel getDeviceStatus calls) await the
// same request instead of each independently minting their own token —
// without this, every one of them sees cachedToken as null/expired at the
// same instant, before any single mint has had a chance to complete.
let pendingMint = null;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function hmacSha256Hex(input, secret) {
  return crypto.createHmac('sha256', secret).update(input, 'utf8').digest('hex').toUpperCase();
}

function sign({ method, path, body, accessToken }) {
  const t = Date.now().toString();
  const stringToSign = [method, sha256Hex(body), '', path].join('\n');
  const signBase = ACCESS_ID + (accessToken || '') + t + stringToSign;
  return { t, sign: hmacSha256Hex(signBase, ACCESS_SECRET) };
}

async function request(method, path, { body, accessToken } = {}) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const { t, sign: signature } = sign({ method, path, body: bodyStr, accessToken });

  const headers = {
    client_id: ACCESS_ID,
    sign: signature,
    t,
    sign_method: 'HMAC-SHA256',
    'Content-Type': 'application/json'
  };
  if (accessToken) headers.access_token = accessToken;

  logger.debug('[TUYA_REST_OUT]', method, path);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: bodyStr || undefined
  });

  if (!res.ok) {
    throw new Error(`Tuya API HTTP ${res.status} [${path}]`);
  }

  const json = await res.json();
  logger.debug('[TUYA_REST_IN]', method, path, json);

  if (!json.success) {
    throw new Error(`Tuya API error [${path}]: ${json.code} ${json.msg}`);
  }
  return json.result;
}

// Access tokens last ~2h server-side; cache and refresh a minute early to
// avoid a request racing right past expiry.
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return cachedToken.accessToken;
  }

  if (!pendingMint) {
    pendingMint = request('GET', '/v1.0/token?grant_type=1')
      .then((result) => {
        cachedToken = {
          accessToken: result.access_token,
          expiresAt: Date.now() + result.expire_time * 1000
        };
        logger.info('[TUYA_REST] Minted new access token');
        return cachedToken.accessToken;
      })
      .finally(() => {
        pendingMint = null;
      });
  }

  return pendingMint;
}

async function getDeviceStatus(deviceId) {
  const accessToken = await getAccessToken();
  return request('GET', `/v1.0/devices/${deviceId}/status`, { accessToken });
}

// commands: [{ code, value }, ...] — e.g. [{ code: 'alarm_switch', value: true }].
async function sendCommand(deviceId, commands) {
  const accessToken = await getAccessToken();
  return request('POST', `/v1.0/devices/${deviceId}/commands`, {
    accessToken,
    body: { commands }
  });
}

// Fires a Tap-to-Run Scene by its rule_id (Scene Linkage Rules API, v2.0).
// Used for เฝ้าบ้าน/ไปพัก (arm/disarm) — an earlier attempt tried commanding
// the Security Remote Control device directly to simulate its physical
// button press, which Tuya rejected (error 2008, "command or value not
// support"): that device is a battery-powered Zigbee end device that can
// transmit button-press events but can't receive downlink commands.
// Triggering the Tap-to-Run Scene that already replicates the same "Then"
// actions sidesteps that entirely — Scenes are specifically meant to be
// triggered externally, unlike a sleepy end device.
async function triggerScene(ruleId) {
  const accessToken = await getAccessToken();
  return request('POST', `/v2.0/cloud/scene/rule/${ruleId}/actions/trigger`, { accessToken });
}

// Reads a Scene/Automation Linkage Rule's current detail, including its
// `status` ("enable"/"disable"). Used at boot (app.js, Section 8.9) to
// recover houseMode.js's armed/disarmed state from Tuya's own automation
// state instead of starting every restart with an unknown mode — see
// TUYA_ALARM_AUTOMATION_ID in Section 4's .env.example. Same rule_id
// concept as triggerScene() above, just GET instead of a trigger POST.
async function getSceneRule(ruleId) {
  const accessToken = await getAccessToken();
  return request('GET', `/v2.0/cloud/scene/rule/${ruleId}`, { accessToken });
}

// Device operation history — 7-day free retention per Tuya's Device Log
// Service. Defaults to the full 7-day window with size=10 — a wider time
// window with the same row cap can never return fewer rows than a narrower
// one (e.g. 24h), only ever the same or more, so this single query already
// gives "whichever of {last 24h, last 10 rows} has more history" without
// needing two separate calls: a busy device still gets capped at its most
// recent 10 rows, while a quiet device reaches back as far as 7 days to
// fill that same quota instead of coming back empty.
//
// The first endpoint this client calls with a query string — Tuya's
// signature requires query params to appear in the signed URL sorted
// alphabetically by key (ASCII order), not request/insertion order. Every
// other call so far (status, commands, scene trigger) has no query string,
// so this requirement was latent until now; sorting keys here keeps the
// exact same string used for both the real request and its signature
// (sign() just signs whatever `path` it's given), so they can never drift
// apart.
async function getDeviceLogs(deviceId, { startTime, endTime, size = 10 } = {}) {
  const accessToken = await getAccessToken();
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const query = {
    end_time: String(endTime ?? now),
    size: String(size),
    start_time: String(startTime ?? now - SEVEN_DAYS_MS),
    // Required by Tuya (missing it causes "40000303 Parameter error!", not a
    // default-to-all). type=7 is "data point report" — the only log
    // category that maps to dpProfiles.js's resolvers (historyCard.js);
    // online/offline/firmware/etc. (the other type codes) aren't state
    // changes this app's DP_PROFILES vocabulary can interpret anyway.
    type: '7'
  };
  const sortedQuery = Object.keys(query)
    .sort()
    .map((key) => `${key}=${query[key]}`)
    .join('&');
  return request('GET', `/v1.0/devices/${deviceId}/logs?${sortedQuery}`, { accessToken });
}

module.exports = { getAccessToken, getDeviceStatus, sendCommand, triggerScene, getSceneRule, getDeviceLogs };
```

**Increment 3 note on the Device Log endpoint's quirks**, both discovered
live (a real device history query first returned `1004 sign invalid`, then
`40000303 Parameter error!`, before working): query-string parameters must
be alphabetically sorted for the HMAC signature to validate (undocumented in
practice, though implied by Tuya's general signing scheme), and `type` is a
required parameter despite Tuya's own docs not making that obvious — omitting
it doesn't default to "all types," it's a hard error.

#### Finding your `space_id` (home ID) and Scene `rule_id`s

`triggerScene()` above only needs a Scene's `rule_id` at runtime — no
`space_id` is stored or read by the app itself. The `space_id` is only
needed once, manually, to look up the `rule_id`s of the Tap-to-Run Scenes
you've already built in the Smart Life / Tuya Smart app (e.g. "Arm",
"Disarm"). Both lookups use the Tuya IoT Platform's **Cloud > API Explorer**,
signed with your own project's `TUYA_ACCESS_ID`/`TUYA_ACCESS_SECRET` (the
Explorer signs requests for you — no credentials appear in the URL or
response shown below).

1. **Find your `space_id`** — API Explorer > *Smart Home Basic Service* >
   *Query Home List* (`GET /v1.0/users/{uid}/homes`, needs
   `TUYA_SMART_LIFE_UID`). Response includes each home's `home_id` — that's
   the `space_id` used below. Match it by `name` (e.g. your house's name in
   the app).

2. **Find your Scene `rule_id`s** — API Explorer > search doesn't reliably
   surface this; open the **"[Deprecate]Smart Home Scene Linkage"** service
   directly instead, then its *Query Linkage Rules* endpoint:

   ```
   GET /v2.0/cloud/scene/rule?space_id={your_space_id}
   ```

   The response lists every automation *and* Tap-to-Run scene under that
   home. Filter for `"type": "scene"` (Tap-to-Run — externally triggerable)
   as opposed to `"type": "automation"` (condition-based, not externally
   triggerable). Each entry's `rule_id` is what goes into
   `TUYA_ARM_SCENE_ID`/`TUYA_DISARM_SCENE_ID`.

3. **Trigger it** (what `triggerScene()` does under the hood):

   ```
   POST /v2.0/cloud/scene/rule/{rule_id}/actions/trigger
   ```

   No request body needed — the Scene's own pre-configured "Then" actions
   (e.g. enabling the arm automation, sending a notification) run exactly as
   they would from a manual tap in the Smart Life app.

4. **Find the arm/disarm automation's `rule_id`** (for
   `TUYA_ALARM_AUTOMATION_ID`, Increment 4) — same *Query Linkage Rules*
   response as step 2, but this time filter for `"type": "automation"`.
   Confirmed live for this deployment: the "Arm" Tap-to-Run scene's actions
   enable a `"type": "automation"` entry named "Alarm"; "Disarm" disables
   that same entry (and switches the siren off). That automation's
   `rule_id` is what goes into `TUYA_ALARM_AUTOMATION_ID` — verify against
   your own account, since the exact automation name/wiring depends on how
   your Scenes were built in the Smart Life app, not on anything this app
   controls.

5. **Read it** (what `getSceneRule()` does under the hood):

   ```
   GET /v2.0/cloud/scene/rule/{rule_id}
   ```

   Returns the rule's full detail, including `status` ("enable"/"disable")
   — this is what app.js's boot-time houseMode recovery reads (Section 8.9).

### 8.14 Interaction Router (`src/services/interactionRouter.js`)

Dispatches parsed webhook events: an argument-less text trigger opens the
root/category menu; a postback tap advances to the next step (device list,
status card, control confirm, arm/disarm confirm, history, or quiet-mode
prompt). All entry points converge on the same handler methods — a typed
command or bot-name greeting is just a shortcut into a step a tap would also
reach (Section 2).

Two state-changing actions both require an explicit two-tap Yes/No confirm
before anything real happens: `_executeCommand` (relay/alarm on-off, only
reachable via `a=cmd` after `a=confirm` built the prompt) and
`_executeArmDisarm` (เฝ้าบ้าน/ไปพัก, only reachable via `a=armexec` after
`a=armconfirm` built the prompt). `_executeArmDisarm` calls
`tuyaRestClient.triggerScene()` (Section 8.13) with
`TUYA_ARM_SCENE_ID`/`TUYA_DISARM_SCENE_ID`, not a direct device command —
see Section 8.13's note on why. `_replyAllStatus` delegates to
`statusReport.buildReport()` (Section 8.19), which queries every queryable
device in parallel via `Promise.allSettled` (so one device's failed query
doesn't block the others from showing real status in the same table reply)
alongside houseMode/quietMode/LINE-quota context — the same builder the
automatic daily summary (Section 8.20) uses, so the two can never drift out
of sync with each other.

**Increment 3 additions.** `_executeArmDisarm` now also drives quiet mode:
ไปพัก enters `quietMode.setIndefiniteQuiet()` (routine household activity
isn't alert-worthy while you're home), เฝ้าบ้าน always calls
`quietMode.clearQuiet()` (full vigilance while away, even if a previous
ไปพัก/เงียบๆหน่อย left quiet mode on) — and records `houseMode.setMode()`
either way for รายงาน's best-effort mode display. Quiet mode itself has
three converging activation paths (`_replyQuietPrompt`/`_activateQuiet`) —
tapping a preset, typing `/quiet N`, or typing a bare number while
`quietMode.isDurationPromptPending()` — and two ways to end early
(`_wakeQuiet`, triggered by either ตื่นแล้ว or กลับบ้าน). `_replyDeviceHistory`
(`a=history`) is a straightforward query action, same not-found/try-catch
pattern as `_replyDeviceStatus`.

```javascript
const deviceRegistry = require('../config/deviceRegistry');
const { CONTROL_DP } = require('../config/dpProfiles');
const tuyaRestClient = require('./tuyaRestClient');
const quietMode = require('./quietMode');
const houseMode = require('./houseMode');
const statusReport = require('./statusReport');
const {
  buildRootMenu,
  buildCategoryMenu,
  buildDeviceMenu,
  buildManageMenu,
  buildHouseMenu,
  buildArmDisarmConfirm,
  buildGreeting,
  buildQuietPrompt,
  queryableDevices,
  armDisarmAvailable
} = require('../templates/menuBuilders');
const { buildStatusCard, buildConfirmPrompt } = require('../templates/statusCard');
const { buildHistoryMessage } = require('../templates/historyCard');
const logger = require('../utils/logger');

const BOT_NAME = process.env.LINE_BOT_NAME || 'รักยม';

// เมนู opens the root [สถานะ/จัดการ/ดูแลบ้าน] picker. /status and สถานะ are
// more specific shortcuts straight into the สถานะ branch's category picker
// (buildCategoryMenu), skipping the root step — matches how ALL_STATUS/ARM/
// DISARM triggers below skip straight past their own parent menus too.
const MENU_TRIGGERS = new Set(['เมนู']);
const STATUS_MENU_TRIGGERS = new Set(['/status', 'สถานะ']);

// Same shortcut idea as MENU_TRIGGERS, but jumps straight to the "all
// devices + mode" report table (also reachable by tapping "📊 รายงาน" in the
// category menu/greeting) instead of the top-level menu. รายงาน is the
// current label everywhere it's shown; the older สถานะทั้งหมด/-all phrasing
// still works too since there's no reason to break it.
const ALL_STATUS_TRIGGERS = new Set(['/status all', 'สถานะทั้งหมด', 'รายงาน']);

// Shortcut straight into the arm/disarm confirm step (buildArmDisarmConfirm)
// — also reachable via "🏠 ดูแลบ้าน" in the root menu -> buildHouseMenu.
// Both converge on the same confirm prompt; neither skips it.
const ARM_TRIGGERS = new Set(['/arm', 'เฝ้าบ้าน']);
const DISARM_TRIGGERS = new Set(['/disarm', 'ไปพัก']);

// เงียบๆหน่อย opens the duration picker (same convergence pattern as
// ARM/DISARM above); a plain /quiet N is a direct, stateless shortcut that
// skips the picker entirely. ตื่นแล้ว cancels an active quiet period early.
const QUIET_TRIGGERS = new Set(['เงียบๆหน่อย']);
const WAKE_TRIGGERS = new Set(['ตื่นแล้ว', 'กลับบ้าน']);
const QUIET_COMMAND_RE = /^\/quiet\s+(\d+)$/;
const MIN_QUIET_MINUTES = 1;
const MAX_QUIET_MINUTES = 1440;

class InteractionRouter {
  constructor(lineService) {
    this.lineService = lineService;
  }

  // One LINE webhook request can carry several events; dispatch each
  // independently so one failure doesn't block the others.
  async handleEvents(events) {
    await Promise.all(
      events.map((event) =>
        this._handleEvent(event).catch((err) =>
          logger.error('[INTERACTION_ROUTER] Error handling event:', err)
        )
      )
    );
  }

  async _handleEvent(event) {
    if (event.type === 'message' && event.message.type === 'text') {
      return this._handleText(event);
    }
    if (event.type === 'postback') {
      return this._handlePostback(event);
    }
    // Follow/join/other event types: nothing to do yet.
  }

  async _handleText(event) {
    const text = event.message.text.trim();

    if (ALL_STATUS_TRIGGERS.has(text)) {
      await this._replyAllStatus(event.replyToken);
      return;
    }

    if (ARM_TRIGGERS.has(text)) {
      await this._replyArmDisarmConfirm(event.replyToken, 'arm');
      return;
    }

    if (DISARM_TRIGGERS.has(text)) {
      await this._replyArmDisarmConfirm(event.replyToken, 'disarm');
      return;
    }

    if (QUIET_TRIGGERS.has(text)) {
      await this._replyQuietPrompt(event.replyToken);
      return;
    }

    if (WAKE_TRIGGERS.has(text)) {
      await this._wakeQuiet(event.replyToken);
      return;
    }

    const quietMatch = text.match(QUIET_COMMAND_RE);
    if (quietMatch) {
      await this._activateQuiet(event.replyToken, Number(quietMatch[1]));
      return;
    }

    if (STATUS_MENU_TRIGGERS.has(text)) {
      await this.lineService.replyMessage(event.replyToken, buildCategoryMenu());
      return;
    }

    if (MENU_TRIGGERS.has(text)) {
      await this.lineService.replyMessage(event.replyToken, buildRootMenu());
      return;
    }

    // Fallback only — checked after every explicit command/keyword above, so
    // an unambiguous command always wins. A bare positive integer is only
    // treated as a quiet-mode duration if we're within the short window
    // after _replyQuietPrompt armed it; otherwise it's just ignored text.
    if (quietMode.isDurationPromptPending() && /^\d+$/.test(text)) {
      await this._activateQuiet(event.replyToken, Number(text));
      return;
    }

    // Calling the bot by its own name is a friendlier, more discoverable
    // entry point than remembering เมนู — same pattern researched for
    // Phase 2 (ขุนทอง-style keyword trigger).
    if (text === BOT_NAME) {
      await this.lineService.replyMessage(event.replyToken, buildGreeting(BOT_NAME));
    }
  }

  async _handlePostback(event) {
    const params = new URLSearchParams(event.postback.data);
    const action = params.get('a');

    if (action === 'devices') {
      const category = params.get('c');
      await this.lineService.replyMessage(event.replyToken, buildDeviceMenu(category));
      return;
    }

    if (action === 'status') {
      const deviceId = params.get('id');
      await this._replyDeviceStatus(event.replyToken, deviceId);
      return;
    }

    if (action === 'history') {
      const deviceId = params.get('id');
      await this._replyDeviceHistory(event.replyToken, deviceId);
      return;
    }

    if (action === 'all') {
      await this._replyAllStatus(event.replyToken);
      return;
    }

    if (action === 'confirm') {
      const deviceId = params.get('id');
      const cmd = params.get('cmd');
      await this._replyConfirmPrompt(event.replyToken, deviceId, cmd);
      return;
    }

    if (action === 'cmd') {
      const deviceId = params.get('id');
      const cmd = params.get('cmd');
      await this._executeCommand(event.replyToken, deviceId, cmd);
      return;
    }

    if (action === 'cancel') {
      await this.lineService.replyMessage(event.replyToken, { type: 'text', text: 'ยกเลิกแล้วครับ' });
      return;
    }

    if (action === 'house') {
      await this.lineService.replyMessage(event.replyToken, buildHouseMenu());
      return;
    }

    if (action === 'root') {
      await this.lineService.replyMessage(event.replyToken, buildRootMenu());
      return;
    }

    if (action === 'statusmenu') {
      await this.lineService.replyMessage(event.replyToken, buildCategoryMenu());
      return;
    }

    if (action === 'managemenu') {
      await this.lineService.replyMessage(event.replyToken, buildManageMenu());
      return;
    }

    if (action === 'armconfirm') {
      const mode = params.get('mode');
      await this._replyArmDisarmConfirm(event.replyToken, mode);
      return;
    }

    if (action === 'armexec') {
      const mode = params.get('mode');
      await this._executeArmDisarm(event.replyToken, mode);
      return;
    }

    if (action === 'quietprompt') {
      await this._replyQuietPrompt(event.replyToken);
      return;
    }

    if (action === 'quiet') {
      const minutes = Number(params.get('min'));
      await this._activateQuiet(event.replyToken, minutes);
      return;
    }

    if (action === 'wake') {
      await this._wakeQuiet(event.replyToken);
      return;
    }

    logger.debug('[INTERACTION_ROUTER] Unrecognized postback action:', action);
  }

  async _replyArmDisarmConfirm(replyToken, mode) {
    if (!armDisarmAvailable()) {
      await this.lineService.replyMessage(replyToken, { type: 'text', text: 'ยังตั้งค่าเฝ้าบ้าน/ไปพักไม่เสร็จครับ' });
      return;
    }
    await this.lineService.replyMessage(replyToken, buildArmDisarmConfirm(mode));
  }

  // The only place a real arm/disarm command is ever sent — only reachable
  // after the confirm prompt's "✅ ใช่" tap, same pattern as
  // _executeCommand. Triggers the pre-built "Arm"/"Disarm" Tap-to-Run Scene
  // (TUYA_ARM_SCENE_ID / TUYA_DISARM_SCENE_ID) rather than commanding the
  // Security Remote Control directly — that was tried first and rejected by
  // Tuya (error 2008), since that device can transmit button-press events
  // but can't receive downlink commands. Tuya's own automation engine
  // (enabled/disabled by the scene's own actions) remains the authoritative
  // armed/disarmed state; houseMode.js only remembers the bot's own last
  // action for display purposes (รายงาน), and is not treated as fact here.
  //
  // Also drives quiet mode automatically: ไปพัก ("I'm home, resting") means
  // routine door/motion activity is just the household, not alert-worthy —
  // enters indefinite quiet until เฝ้าบ้าน or กลับบ้าน. เฝ้าบ้าน ("watching
  // the house," away) is the opposite: you want full vigilance, so it always
  // resumes alerts even if a previous ไปพัก/เงียบๆหน่อย left quiet mode on.
  async _executeArmDisarm(replyToken, mode) {
    const sceneId = mode === 'arm' ? process.env.TUYA_ARM_SCENE_ID : process.env.TUYA_DISARM_SCENE_ID;
    const label = mode === 'arm' ? 'เฝ้าบ้าน' : 'ไปพัก';
    if (!sceneId) {
      await this.lineService.replyMessage(replyToken, { type: 'text', text: `${label}ผ่านนี้ยังไม่ได้ครับ` });
      return;
    }

    try {
      await tuyaRestClient.triggerScene(sceneId);
      logger.info(`[INTERACTION_ROUTER] Triggered scene (${mode})`);
      houseMode.setMode(mode);

      let text = `${label}เรียบร้อยครับ`;
      if (mode === 'disarm') {
        quietMode.setIndefiniteQuiet();
        text += ' 🤫 จะไม่แจ้งเตือนจนกว่าจะเฝ้าบ้านหรือกลับบ้านนะครับ';
      } else {
        quietMode.clearQuiet();
        text += ' แจ้งเตือนตามปกติครับ';
      }
      await this.lineService.replyMessage(replyToken, { type: 'text', text });
    } catch (err) {
      logger.error(`[INTERACTION_ROUTER] Arm/disarm scene trigger failed (${mode}):`, err);
      await this.lineService.replyMessage(replyToken, { type: 'text', text: `ขอโทษครับ ${label}ไม่สำเร็จ ลองใหม่อีกครั้งนะครับ` });
    }
  }

  async _replyQuietPrompt(replyToken) {
    quietMode.armDurationPrompt();
    await this.lineService.replyMessage(replyToken, buildQuietPrompt());
  }

  // Reachable from a preset tap (a=quiet), a direct /quiet N command, or a
  // bare number typed while the duration prompt is pending — all three
  // converge here. No Yes/No confirm gate, unlike device control/arm-disarm:
  // this is non-destructive and self-expiring, so the two-tap pattern
  // reserved for physical hardware changes doesn't apply.
  async _activateQuiet(replyToken, minutes) {
    quietMode.clearDurationPrompt();

    if (!Number.isInteger(minutes) || minutes < MIN_QUIET_MINUTES || minutes > MAX_QUIET_MINUTES) {
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: `บอกเป็นนาทีระหว่าง ${MIN_QUIET_MINUTES}-${MAX_QUIET_MINUTES} นะครับ`
      });
      return;
    }

    quietMode.setQuiet(minutes, () => this.lineService.pushMessage('กลับมาแล้วครับ ✅'));
    await this.lineService.replyMessage(replyToken, { type: 'text', text: `เงียบไป ${minutes} นาทีนะครับ 🤫` });
  }

  async _wakeQuiet(replyToken) {
    if (!quietMode.isQuiet()) {
      await this.lineService.replyMessage(replyToken, { type: 'text', text: 'ตอนนี้ไม่ได้เงียบอยู่ครับ' });
      return;
    }
    quietMode.clearQuiet();
    // Wording kept neutral (not "I'm awake") since this same reply fires for
    // both ตื่นแล้ว and กลับบ้าน — "I'm home" wouldn't fit an "awake" framing.
    await this.lineService.replyMessage(replyToken, { type: 'text', text: 'กลับมาแจ้งเตือนตามปกติแล้วครับ ✅' });
  }

  async _replyConfirmPrompt(replyToken, deviceId, cmd) {
    const device = deviceRegistry[deviceId];
    if (!device) {
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: 'ไม่พบอุปกรณ์นี้แล้วครับ ลองเปิดเมนูใหม่อีกครั้งนะครับ'
      });
      return;
    }
    await this.lineService.replyMessage(replyToken, buildConfirmPrompt({ id: deviceId, ...device }, cmd));
  }

  // The only place a real Tuya command is ever sent — only reachable after
  // the user has tapped the toggle button (opens the confirm prompt) *and*
  // then tapped "ใช่" on that prompt. Never triggered by a single tap.
  async _executeCommand(replyToken, deviceId, cmd) {
    const device = deviceRegistry[deviceId];
    if (!device) {
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: 'ไม่พบอุปกรณ์นี้แล้วครับ ลองเปิดเมนูใหม่อีกครั้งนะครับ'
      });
      return;
    }

    const controlDp = CONTROL_DP[device.dpProfile];
    if (!controlDp) {
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: `${device.name} ยังสั่งเปิด/ปิดผ่านนี้ไม่ได้ครับ`
      });
      return;
    }

    const actionLabel = cmd === 'on' ? 'เปิด' : 'ปิด';
    try {
      await tuyaRestClient.sendCommand(deviceId, [{ code: controlDp, value: cmd === 'on' }]);
      logger.info(`[INTERACTION_ROUTER] Sent command (${controlDp}=${cmd === 'on'}) to ${deviceId}`);
      await this.lineService.replyMessage(replyToken, { type: 'text', text: `${actionLabel} ${device.name} เรียบร้อยครับ` });
    } catch (err) {
      logger.error(`[INTERACTION_ROUTER] Command failed for ${deviceId}:`, err);
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: `ขอโทษครับ ${actionLabel} ${device.name} ไม่สำเร็จ ลองใหม่อีกครั้งนะครับ`
      });
    }
  }

  // Queries every queryable device's status in parallel (plus houseMode/
  // quietMode/LINE-quota context) via statusReport.js, shared with the
  // automatic daily summary (dailyReport.js, Section 8.20) — a partial
  // device-query failure still shows every device that did succeed, rather
  // than failing the whole table over one bad query.
  async _replyAllStatus(replyToken) {
    if (queryableDevices().length === 0) {
      await this.lineService.replyMessage(replyToken, { type: 'text', text: 'ยังไม่มีอุปกรณ์ที่เช็คสถานะได้ครับ' });
      return;
    }

    const message = await statusReport.buildReport(this.lineService);
    await this.lineService.replyMessage(replyToken, message);
  }

  async _replyDeviceStatus(replyToken, deviceId) {
    const device = deviceRegistry[deviceId];
    if (!device) {
      // Registry can change between when a menu was sent and when it's
      // tapped (device removed, .env pointed at a different registry) —
      // don't trust the postback payload blindly.
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: 'ไม่พบอุปกรณ์นี้แล้วครับ ลองเปิดเมนูใหม่อีกครั้งนะครับ'
      });
      return;
    }

    try {
      const rawStatus = await tuyaRestClient.getDeviceStatus(deviceId);
      await this.lineService.replyMessage(
        replyToken,
        buildStatusCard({ id: deviceId, ...device }, rawStatus)
      );
    } catch (err) {
      logger.error(`[INTERACTION_ROUTER] Status query failed for ${deviceId}:`, err);
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: `ขอโทษครับ เช็คสถานะ ${device.name} ไม่ได้ในตอนนี้ ลองใหม่อีกครั้งนะครับ`
      });
    }
  }

  async _replyDeviceHistory(replyToken, deviceId) {
    const device = deviceRegistry[deviceId];
    if (!device) {
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: 'ไม่พบอุปกรณ์นี้แล้วครับ ลองเปิดเมนูใหม่อีกครั้งนะครับ'
      });
      return;
    }

    try {
      const rawLogs = await tuyaRestClient.getDeviceLogs(deviceId);
      await this.lineService.replyMessage(
        replyToken,
        buildHistoryMessage({ id: deviceId, ...device }, rawLogs.logs)
      );
    } catch (err) {
      logger.error(`[INTERACTION_ROUTER] History query failed for ${deviceId}:`, err);
      await this.lineService.replyMessage(replyToken, {
        type: 'text',
        text: `ขอโทษครับ ดูประวัติ ${device.name} ไม่ได้ในตอนนี้ ลองใหม่อีกครั้งนะครับ`
      });
    }
  }
}

module.exports = InteractionRouter;
```

### 8.15 Webhook Server (`src/webhook/server.js`)

```javascript
const express = require('express');
const { middleware, SignatureValidationFailed } = require('@line/bot-sdk');
const LineMessagingService = require('../services/lineMessaging');
const InteractionRouter = require('../services/interactionRouter');
const logger = require('../utils/logger');

// Phase 2: interactive status query & device control, driven entirely by
// incoming LINE webhook events (trigger keyword / argument-less command, or
// a tap on a previously-sent Quick Reply/postback). See
// RUCKYOM_SPECIFICATION.md Section 2 and src/services/interactionRouter.js.
function createWebhookServer() {
  const app = express();
  const lineService = new LineMessagingService();
  const router = new InteractionRouter(lineService);

  // Verifies the x-line-signature header against LINE_CHANNEL_SECRET and
  // parses the JSON body — a request that fails signature verification
  // never reaches the route handler at all.
  const lineMiddleware = middleware({ channelSecret: process.env.LINE_CHANNEL_SECRET });

  app.post('/webhook', lineMiddleware, (req, res) => {
    // Ack immediately — LINE expects a fast response, and a slow/failed ack
    // just causes it to retry redelivering the same events. Event
    // processing (Tuya REST calls, LINE replies) happens after; failures
    // are logged internally rather than surfaced as an HTTP error.
    res.status(200).end();
    router
      .handleEvents(req.body.events || [])
      .catch((err) => logger.error('[WEBHOOK] Unhandled error processing events:', err));
  });

  // Without this, `middleware()` rejecting a bad/missing x-line-signature
  // (via SignatureValidationFailed, thrown through next(err)) falls through
  // to Express's default error handler, which returns 500 — misleading for
  // what's actually a signature-verification rejection, and inconsistent
  // with the DoD expectation of a 401 there.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof SignatureValidationFailed) {
      logger.error('[WEBHOOK] Signature validation failed:', err.message);
      res.status(401).end();
      return;
    }
    logger.error('[WEBHOOK] Unhandled middleware error:', err);
    res.status(500).end();
  });

  return app;
}

module.exports = { createWebhookServer };

```

### 8.16 Quiet Mode (`src/services/quietMode.js`)

In-memory only, same tier as `tuyaRestClient.js`'s token cache (Section
8.13) — a boolean plus two timestamps with a max 24h lifetime doesn't
warrant Phase 3's Redis state store, and the real security boundary for this
whole feature is `server.js`'s `x-line-signature` check (Section 8.15), not
where this state lives; quiet mode carries the same trust model `/arm`/
`/disarm` already do. Two quiet states exist: **timed** (`setQuiet`, from
เงียบๆหน่อย/`/quiet N`, auto-expires via `setTimeout`) and **indefinite**
(`setIndefiniteQuiet`, from a successful ไปพัก, no timer — only an explicit
เฝ้าบ้าน or กลับบ้าน ends it). `remainingMinutes()` returns `null` for the
indefinite case specifically so callers (`statusCard.js`'s รายงาน) can
distinguish "no countdown" from "not quiet at all" (`0`).

The one on-disk piece is a minimal **crash-recovery marker**, not a
persistence layer — it carries no authority of its own, it just tells the
next boot whether the previous process died mid-quiet-period. It's deleted
only through a clean in-process path (`clearQuiet()` or the timed wake
firing), so its mere *presence* at boot (`readCrashMarker()`, consumed by
`app.js`, Section 8.9) means the previous process died before either could
run — no timestamp/staleness comparison needed. All file I/O is try/catch +
log-only; a disk hiccup degrades to "no crash-recovery message," never to a
thrown error inside `setQuiet`/`setIndefiniteQuiet`/`clearQuiet` or a boot
failure.

`armDurationPrompt()`/`isDurationPromptPending()`/`clearDurationPrompt()` are
the one piece of short-lived conversational state in this otherwise fully
stateless app (Section 2's decision #1) — a 2-minute TTL flag marking "we
just asked for a duration, the next bare number typed in the group is
probably the answer" (`interactionRouter.js`'s `_handleText` fallback,
Section 8.14). Scoped to a single boolean with a short TTL rather than a
general session store to keep the blast radius small: worst case, an
unrelated number typed within that 2-minute window gets misread as a
duration — self-correcting and observable (a confirmation reply fires
immediately, and a wake message when it ends), never silent or permanent.

```javascript
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// In-memory only, same tier as tuyaRestClient.js's token cache — a boolean +
// two timestamps with a max 24h lifetime doesn't warrant Phase 3's Redis
// state store, and the real security boundary here is server.js's
// x-line-signature check, not where this state lives. The one on-disk piece
// (below) is a minimal crash-recovery marker, not a persistence layer: it
// carries no authority of its own, it just tells the next boot whether the
// previous process died mid-quiet-period.
const STATE_FILE = process.env.QUIET_STATE_FILE || path.join(__dirname, '../../quiet-state.json');

let quietUntil = null;
// Set by ไปพัก (disarm) — quiet with no timer/expiry, since "I'm home
// resting" can reasonably last hours, not a fixed N-minute countdown. Only
// cleared by an explicit เฝ้าบ้าน or กลับบ้าน (interactionRouter.js), never
// auto-expires. Distinct from the timed quietUntil path so the two can't be
// confused with each other (an indefinite quiet has no "minutes remaining").
let quietIndefinite = false;
let wakeTimer = null;
let durationPromptExpiresAt = null;

// How long after prompting for a duration a bare typed number is still
// understood as the answer — kept short so a coincidental, unrelated number
// typed later in the group chat can't be misread as a quiet-mode request.
const DURATION_PROMPT_TTL_MS = 2 * 60 * 1000;

function isQuiet() {
  return quietIndefinite || (quietUntil !== null && Date.now() < quietUntil);
}

// null means "quiet with no countdown" (indefinite) — distinct from 0
// ("not quiet at all"). Callers must check isQuiet() first if they need to
// tell those apart from a plain falsy check.
function remainingMinutes() {
  if (quietIndefinite) return null;
  if (!isQuiet()) return 0;
  return Math.ceil((quietUntil - Date.now()) / 60000);
}

// Best-effort only — a disk hiccup here must never break quiet mode itself
// or crash the app; it just means the crash-recovery message won't fire.
function _writeMarker(payload) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(payload));
  } catch (err) {
    logger.error('[QUIET_MODE] Failed to write crash-recovery marker:', err);
  }
}

function _deleteMarker() {
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  } catch (err) {
    logger.error('[QUIET_MODE] Failed to remove crash-recovery marker:', err);
  }
}

// minutes: caller validates range (1-1440). onWake fires exactly once, only
// when the period elapses naturally — not on a manual clearQuiet(), since
// that's the user waking it themselves, not a timeout worth announcing.
// Replaces whatever quiet state (timed or indefinite) was active before —
// re-triggering quiet mode always means "start over," never stacks.
function setQuiet(minutes, onWake) {
  if (wakeTimer) clearTimeout(wakeTimer);
  quietIndefinite = false;

  quietUntil = Date.now() + minutes * 60000;
  _writeMarker({ quietUntil, minutes });
  logger.info(`[QUIET_MODE] Activated for ${minutes} minute(s)`);

  wakeTimer = setTimeout(() => {
    quietUntil = null;
    wakeTimer = null;
    _deleteMarker();
    logger.info('[QUIET_MODE] Expired naturally');
    onWake();
  }, minutes * 60000);
}

// Indefinite quiet — automatically activated on a successful ไปพัก (disarm).
// No timer is armed; only clearQuiet() (เฝ้าบ้าน or กลับบ้าน) ends it.
function setIndefiniteQuiet() {
  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
  quietUntil = null;
  quietIndefinite = true;
  _writeMarker({ indefinite: true });
  logger.info('[QUIET_MODE] Activated indefinitely (ไปพัก)');
}

function clearQuiet() {
  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
  quietUntil = null;
  quietIndefinite = false;
  _deleteMarker();
  logger.info('[QUIET_MODE] Cleared manually');
}

function armDurationPrompt() {
  durationPromptExpiresAt = Date.now() + DURATION_PROMPT_TTL_MS;
}

function isDurationPromptPending() {
  return durationPromptExpiresAt !== null && Date.now() < durationPromptExpiresAt;
}

function clearDurationPrompt() {
  durationPromptExpiresAt = null;
}

// Read once at boot (app.js). The marker file is only ever deleted through a
// clean in-process path (manual clearQuiet or the wake timer firing), so its
// mere presence at boot means the previous process died before either could
// run — no timestamp comparison or staleness check needed, existence alone
// is the signal. Consumes (deletes) the marker so a second boot in a row
// doesn't re-announce the same crash.
function readCrashMarker() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    fs.unlinkSync(STATE_FILE);
    return JSON.parse(raw);
  } catch (err) {
    logger.error('[QUIET_MODE] Failed to read crash-recovery marker:', err);
    return null;
  }
}

module.exports = {
  isQuiet,
  remainingMinutes,
  setQuiet,
  setIndefiniteQuiet,
  clearQuiet,
  armDurationPrompt,
  isDurationPromptPending,
  clearDurationPrompt,
  readCrashMarker
};
```

### 8.17 House Mode (`src/services/houseMode.js`)

Best-effort, in-memory record of the last เฝ้าบ้าน/ไปพัก this app observed —
triggered via LINE (`interactionRouter.js`'s `_executeArmDisarm`, Section
8.14), pressed on the physical Security Remote Control (`app.js`, on
`REMOTE_ARMED`/`REMOTE_DISARMED` — see the `sos` profile in Section 8.5 and
TUYA_DEVICE_DP_REGISTRY.md), or read back from Tuya's own "Alarm" automation
at boot (`app.js`, `TUYA_ALARM_AUTOMATION_ID` — Section 8.9, 8.13's
`getSceneRule`) — explicitly **not** a continuously verified live query
against Tuya, just seeded from one at startup. Tuya's own automation engine
remains the sole authoritative armed/disarmed state; this module exists only
so รายงาน (`statusReport.js`'s `buildReport`, Section 8.19, feeding
`statusCard.js`'s `buildAllStatusTable`, Section 8.12) has something to
display. It still goes stale/wrong if someone arms or disarms directly from
the Smart Life app instead of through this bot or the remote, or if
`TUYA_ALARM_AUTOMATION_ID` is unset (then a restart still resets to unknown,
same as before) — that's why every รายงาน line sourced from it is labeled
"(ล่าสุดที่ทราบ)" rather than presented as fact. Same tier as `quietMode.js`'s
in-memory state.

```javascript
// Best-effort, in-memory record of the last เฝ้าบ้าน/ไปพัก this app observed
// — triggered via LINE (interactionRouter.js's _executeArmDisarm), pressed
// on the physical Security Remote Control (app.js, on REMOTE_ARMED/
// REMOTE_DISARMED), or read back from Tuya's own "Alarm" automation at boot
// (app.js, TUYA_ALARM_AUTOMATION_ID) — NOT a continuously verified live
// query against Tuya, just seeded from one at startup. This app otherwise
// tracks no authoritative armed/disarmed state of its own ("Tuya's
// automation engine already is that state"); this is only for the รายงาน
// summary line, and still goes stale/wrong if someone arms or disarms
// directly from the Smart Life app instead of through this bot or the
// remote, or if TUYA_ALARM_AUTOMATION_ID is unset (then a restart still
// resets to unknown, same as before). Same tier as quietMode.js's state — a
// display nicety, not a security-relevant fact.
let lastMode = null; // 'arm' | 'disarm' | null

function setMode(mode) {
  lastMode = mode;
}

function getMode() {
  return lastMode;
}

module.exports = { setMode, getMode };
```

### 8.18 History Card (`src/templates/historyCard.js`)

Reuses `dpProfiles.js`'s alert resolvers (Section 8.11) to interpret each
Tuya device-log entry's `{code, value}` into the exact same `eventType`
vocabulary real-time alerts already use — history and live alerts can never
describe the same state change differently, and there's no separate
interpretation logic to maintain in parallel. A log entry the resolver
treats as routine (returns `null` — e.g. healthy battery) is dropped from
history too, same as it would be from a live alert; this keeps ประวัติ
focused on actual state changes rather than every raw reading. Timestamps
use `getBangkokHistoryTimestamp()` (Section 8.3, `DD MMM YY HH:mm:ss`) since
history can span up to the full 7-day retention window, unlike the
same-burst `CHAIN_ESCALATION` lines that only need `getBangkokTime()`'s bare
time-of-day.

```javascript
// Recent-activity view for a single device — reuses dpProfiles.js's alert
// resolvers to interpret each Tuya device-log entry's {code, value} into the
// same eventType vocabulary real-time alerts already use, so history and
// live alerts never describe the same state change differently. A log entry
// the resolver treats as routine (returns null — e.g. healthy battery) is
// dropped from history too, same as it would be from a live alert.

const { DP_PROFILES } = require('../config/dpProfiles');
const { getBangkokHistoryTimestamp } = require('../utils/dateTime');

const EVENT_DISPLAY = {
  DOOR_OPENED: { emoji: '🔓', label: 'เปิด' },
  DOOR_CLOSED: { emoji: '🔒', label: 'ปิด' },
  RELAY_ON: { emoji: '💡', label: 'เปิด' },
  RELAY_OFF: { emoji: '⚫', label: 'ปิด' },
  ALARM_ON: { emoji: '🚨', label: 'ดังขึ้น' },
  ALARM_OFF: { emoji: '✅', label: 'หยุดดัง' },
  MOTION_DETECTED: { emoji: '🏃', label: 'ตรวจพบความเคลื่อนไหว' },
  WATER_LEAK: { emoji: '💧', label: 'ตรวจพบน้ำรั่ว' },
  BATTERY_LOW: { emoji: '🔋', label: 'แบตต่ำ' }
};

// logEntries: Tuya's raw /v1.0/devices/{id}/logs `logs` array — each entry
// is { code, value, event_time, ... }. Filters to entries this device's
// dpProfile actually interprets as a real state change, newest first.
function buildHistoryMessage(device, logEntries) {
  const resolvers = DP_PROFILES[device.dpProfile] || {};

  const lines = (logEntries || [])
    .map((entry) => {
      const resolver = resolvers[entry.code];
      if (!resolver) return null;
      const resolved = resolver(entry.value);
      if (!resolved) return null;
      const display = EVENT_DISPLAY[resolved.eventType];
      if (!display) return null;
      return { time: Number(entry.event_time), text: `${display.emoji} ${display.label}` };
    })
    .filter(Boolean)
    .sort((a, b) => b.time - a.time);

  const bodyText = lines.length === 0
    ? 'ไม่มีความเคลื่อนไหวล่าสุดครับ'
    : lines.map((line) => `${getBangkokHistoryTimestamp(new Date(line.time))}  ${line.text}`).join('\n');

  return {
    type: 'text',
    text: `🕘 ประวัติ ${device.name}\n\n${bodyText}`
  };
}

module.exports = { buildHistoryMessage };
```

### 8.19 Status Report Aggregator (`src/services/statusReport.js`)

**Increment 4 addition.** Extracted so the manual รายงาน command
(`interactionRouter.js`'s `_replyAllStatus`, Section 8.14) and the automatic
daily summary (`dailyReport.js`, Section 8.20) build the exact same Flex
message from a single implementation — before this, only the manual command
existed, and duplicating its device-query + houseMode/quietMode assembly
logic for the daily push risked the two silently drifting apart over time.
LINE quota lookup (`lineService.getQuota()`, Section 8.7) runs in parallel
with the device queries and is treated as best-effort, same tier as
houseMode/quietMode: a failed quota lookup just omits that section
(`buildQuotaSection`, Section 8.12) rather than failing the whole report.

```javascript
const tuyaRestClient = require('./tuyaRestClient');
const houseMode = require('./houseMode');
const quietMode = require('./quietMode');
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

  const modeInfo = {
    armMode: houseMode.getMode(),
    quietMinutes: quietMode.isQuiet() ? quietMode.remainingMinutes() : 0,
    quota: quotaResult?.quota ?? null,
    quotaConsumed: quotaResult?.consumption?.totalUsage ?? null
  };

  return buildAllStatusTable(results, modeInfo);
}

module.exports = { buildReport };
```

### 8.20 Daily Summary Scheduler (`src/services/dailyReport.js`)

**Increment 4 addition.** Entirely opt-in via `DAILY_REPORT_TIME`
(`HH:mm`, in `TIMEZONE`) — same "quietly disables itself if unconfigured"
pattern as เฝ้าบ้าน/ไปพัก's `TUYA_ARM_SCENE_ID`/`TUYA_DISARM_SCENE_ID`.
Computes the ms until the next occurrence of that time in the app's
timezone (default Asia/Bangkok, which has no DST — so unlike a
general-purpose cron implementation, no transition handling is needed) and
fires a `setTimeout`, rescheduling itself 24h-equivalent later (by
recomputing the next occurrence, not by a flat `+86400000`) every time it
fires — successfully or not, so one bad day (a transient Tuya/LINE outage)
doesn't kill the recurring schedule.

Purely in-memory, deliberately: a restart around the scheduled time just
skips that day's report rather than replaying it, same best-effort tier as
houseMode.js/quietMode.js's in-memory state — not worth a persistence layer
for a daily nicety. Pushes directly via `lineService.pushMessage()` rather
than routing through `eventCorrelator.js`, so it always bypasses quiet
mode/ไปพัก entirely — a deliberate daily heartbeat shouldn't go missing
during a quiet period the same way routine door/motion alerts are meant to.

```javascript
const logger = require('../utils/logger');
const statusReport = require('./statusReport');

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ms until the next occurrence of `hhmm` (HH:mm) in the app's configured
// timezone (TIMEZONE, default Asia/Bangkok — no DST, so no transition
// handling is needed here unlike a general-purpose cron implementation).
// Wraps to tomorrow if that time has already passed today.
function msUntilNext(hhmm) {
  const [hour, minute] = hhmm.split(':').map(Number);
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.TIMEZONE || 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
    .formatToParts(now)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const nowSeconds = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  const targetSeconds = hour * 3600 + minute * 60;

  let diffSeconds = targetSeconds - nowSeconds;
  if (diffSeconds <= 0) diffSeconds += 24 * 3600;
  return diffSeconds * 1000;
}

// Starts the daily รายงาน push, if DAILY_REPORT_TIME is set — feature is
// entirely opt-in, same "quietly disables itself if unconfigured" pattern
// as เฝ้าบ้าน/ไปพัก's TUYA_ARM_SCENE_ID/TUYA_DISARM_SCENE_ID. Purely
// in-memory: a restart around the scheduled time just skips that day's
// report rather than replaying it — same best-effort tier as houseMode.js/
// quietMode.js's in-memory state, not worth a persistence layer for a daily
// nicety. Deliberately pushes directly via lineService rather than routing
// through eventCorrelator, so it always bypasses quiet mode/ไปพัก — a
// deliberate daily heartbeat shouldn't go missing during a quiet period the
// same way routine door/motion alerts are meant to.
function start(lineService) {
  const time = process.env.DAILY_REPORT_TIME;
  if (!time) return;

  if (!TIME_RE.test(time)) {
    logger.error(`[DAILY_REPORT] Invalid DAILY_REPORT_TIME "${time}" — expected HH:mm. Daily summary disabled.`);
    return;
  }

  const scheduleNext = () => {
    const delay = msUntilNext(time);
    logger.info(`[DAILY_REPORT] Next summary in ${Math.round(delay / 60000)} minute(s)`);

    setTimeout(async () => {
      try {
        const message = await statusReport.buildReport(lineService);
        await lineService.pushMessage(message);
        logger.info('[DAILY_REPORT] Sent daily summary');
      } catch (err) {
        logger.error('[DAILY_REPORT] Failed to send daily summary:', err);
      } finally {
        // Reschedule regardless of success/failure — one bad day (e.g. a
        // transient Tuya/LINE outage) shouldn't kill the recurring schedule.
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();
}

module.exports = { start };
```

---

## 9. Definition of Done

### Phase 1

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
* Log file lines show the server's local Bangkok time (matching `date` on the VM), not raw UTC — verified via `getBangkokLogTimestamp()` (Section 8.3).
* At `LOG_LEVEL=debug`, `[TUYA_IN]` shows the decrypted device payload for every incoming message and `[LINE_OUT]` shows the exact rendered text before each LINE push — both absent at the default `LOG_LEVEL=info`.
* `ALARM_ON` followed by the alarm being silenced (`alarm_switch: false`) produces a second, distinct `ALARM_OFF` LINE message — not silence.
* A device sending a DP code that means something different in another Tuya category (e.g. `switch_1`, a relay-only code, sent by a device registered as `dpProfile: "mcs"`) produces `UNKNOWN_EVENT`, never a misinterpreted alert — verified per Section 8.5/8.11's per-device profile dispatch.
* An unregistered device (no `deviceRegistry.json` entry, or one with no `dpProfile`) produces `UNKNOWN_EVENT` for all its DPs rather than crashing or being silently dropped.

### Phase 2 Increment 1 (Interactive Status Query)

* `node src/app.js` boots cleanly with the full `REQUIRED_ENV` list set (Section 8.2), including the newly-required `TUYA_BASE_URL`, `LINE_CHANNEL_SECRET`, `PORT`.
* A `POST /webhook` request with a missing or invalid `x-line-signature` header returns `401`, not `500` or a silent crash — verified per Section 8.15.
* Typing the trigger keyword (`เมนู`) or an argument-less command (`/status`, `สถานะ`) in the LINE group opens the category menu via Quick Reply — and both entry points reach the identical menu.
* The category menu only lists categories that have ≥1 device actually registered in `deviceRegistry.json` — adding or removing a device changes the menu without any code change.
* Tapping through category → device → status returns a live Flex status card reflecting the device's real current state (cross-checked against the Smart Life app), not a cached or stale value.
* No Quick Reply button label is truncated mid-word — every category/device label fits within LINE's 20-character `label` limit.
* The Tuya REST client successfully mints an access token and completes a signed status-query request against the real Tuya OpenAPI (verified live during Increment 1's build, not just unit-level).
* Tapping a device that's since been removed from the registry (stale postback) shows a graceful "device not found" message, not an unhandled error.
* Tapping `📋 ทั้งหมด` (or typing `/status all`/`สถานะทั้งหมด`) returns one Flex Carousel with a bubble per queryable device, each reflecting real current state — verified live against all real registered devices.
* A single device's status query failing inside the "all devices" carousel renders only that one bubble as an error state; every other device's bubble still shows its real, successfully-queried status.
* N parallel status queries (e.g. from the "all devices" carousel) mint exactly one Tuya access token, not N — verified via `[TUYA_REST] Minted new access token` appearing once in the log, not once per device.

### Phase 2 Increment 2 (Device Control & Arm/Disarm)

* Tapping a controllable device's (relay/alarm) on/off Quick Reply button opens a Yes/No confirm prompt — the real Tuya command is never sent on the first tap; only after tapping "✅ ใช่" does `sendCommand()` fire, verified against real device state changing in the Smart Life app.
* จัดการ (`buildManageMenu()`) lists only controllable devices and hides itself entirely if none are registered.
* เฝ้าบ้าน/ไปพัก (arm/disarm) — reachable via `/arm`/`เฝ้าบ้าน`, `/disarm`/`ไปพัก`, or 🏠 ดูแลบ้าน in the root menu — hide themselves from every menu (`armDisarmAvailable()`) unless both `TUYA_ARM_SCENE_ID` and `TUYA_DISARM_SCENE_ID` are set.
* Confirming เฝ้าบ้าน or ไปพัก triggers the correct pre-built Tap-to-Run Scene (`triggerScene()`, Section 8.13) — verified live: the corresponding automation actually enables/disables in the Smart Life app, not just a "success" LINE reply.
* Commanding the Security Remote Control device directly (rather than via a Scene) is confirmed **not** to work — Tuya returns `2008 command or value not support` — and is not attempted anywhere in the codebase; see `TUYA_DEVICE_DP_REGISTRY.md`'s `sos` section for the resolution.
* Typing the bot's own name (`LINE_BOT_NAME`) opens the greeting shortcut menu (`buildGreeting()`), including เฝ้าบ้าน/ไปพัก buttons only when `armDisarmAvailable()`.
* A stale postback referencing a device since removed from `deviceRegistry.json` shows a graceful "device not found" message for both status and control actions, not an unhandled error.

### Phase 2 Increment 3 (Device History, Quiet Mode, รายงาน)

* Tapping 🕘 ประวัติ on any queryable device's status card (not just controllable ones) shows real recent state changes with correct `DD MMM YY HH:mm:ss` Bangkok timestamps, newest first — verified live against a real device; a device with no recent activity shows "ไม่มีความเคลื่อนไหวล่าสุดครับ", not an error or blank reply.
* `getDeviceLogs()`'s query-string parameters are alphabetically sorted before both the real request and its HMAC signature — verified live: an unsorted query produced `1004 sign invalid` before the fix, `40000303 Parameter error!` after sorting but before adding the required `type=7` param, and a real device history after both fixes.
* `เงียบๆหน่อย` → a preset tap or a typed `/quiet N` → an alert-worthy event during that window produces **no** LINE group push (`[QUIET_MODE] Suppressed` in the log, no `[ALERT_SENT]`), and an automatic "กลับมาแล้วครับ ✅" push fires once the timer elapses naturally.
* `เงียบๆหน่อย` followed by a bare typed number (not a preset tap) produces the identical suppression behavior — confirms the `isDurationPromptPending()` fallback path in `_handleText`.
* A bare number typed with **no** preceding เงียบๆหน่อย/duration prompt is ignored as plain text, never misread as a quiet-mode duration.
* `/quiet N` outside 1–1440 gets a range-rejection reply, never a silently-accepted multi-day quiet period.
* Confirming ไปพัก automatically enters **indefinite** quiet mode (no auto-expiry) and says so in the reply; confirming เฝ้าบ้าน always clears quiet mode (even if a previous ไปพัก/เงียบๆหน่อย left it active) and says so in the reply — verified live via a routine door/motion event staying silent during ไปพัก and resuming after เฝ้าบ้าน or กลับบ้าน.
* `ALARM_ON`, `ALARM_OFF`, and `WATER_LEAK` always push through regardless of quiet mode (manual or automatic-from-ไปพัก) — verified for both a standalone critical event and one folded into a `CHAIN_ESCALATION` alongside routine events (`containsCritical` flag).
* Killing and restarting the process while quiet mode is active (timed or indefinite) produces one explicit "ระบบรีสตาร์ท...กลับมาแจ้งเตือนตามปกติแล้ว" push on the next boot, correctly describing whether the prior quiet was timed or indefinite — not silence, and not a duplicate message on a second consecutive restart (the marker file is consumed on read).
* `รายงาน` (aliases: `/status all`, `สถานะทั้งหมด`) shows a mode summary line above the device table whenever `houseMode.js` has a last-known arm/disarm (via LINE or the physical remote) or quiet mode is active, each clearly labeled as best-effort ("ล่าสุดที่ทราบ") rather than a verified live state; the section is omitted entirely (not shown as "unknown") when neither applies.
* Status queries, device control, and arm/disarm all continue to work normally while quiet mode (timed or indefinite) is active — only the automatic Tuya-triggered alert push is ever suppressed, never a direct reply to a user-initiated tap.

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