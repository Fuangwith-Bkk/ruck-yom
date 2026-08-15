# Changelog

All notable changes to this project are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

## [2.0.0] - 2026-08-15

Major version bump: Phase 2 (interactive LINE bot — status query, device
control, arm/disarm) is a user-facing capability shift from Phase 1's
one-way alert pipeline, not a backwards-compatible addition — the LINE
group now expects two-way interaction, and `LINE_CHANNEL_SECRET`/
`TUYA_BASE_URL`/`PORT` become required env vars where they were previously
unused placeholders.

### Added — Phase 2, Increment 2: Device Control & Arm/Disarm
- **จัดการ (Manage) menu + on/off control** — controllable devices (relay/alarm) get a toggle Quick Reply on their status card, gated behind a mandatory Yes/No confirm step (`buildConfirmPrompt` → `a=confirm` → `a=cmd`) before `tuyaRestClient.sendCommand()` ever fires. Root menu (`buildRootMenu`, เมนู) now offers `📋 สถานะ` / `🔧 จัดการ` / `🏠 ดูแลบ้าน`, each hiding itself when it'd have nothing to show.
- **All-devices status view switched from a Flex Carousel to a single-bubble table** (`buildAllStatusTable`/`buildStatusRow`) — reads at a glance without swiping. Each row stacks the device name above its state/battery line so long names wrap without visually detaching from their state.
- **เฝ้าบ้าน/ไปพัก (arm/disarm)**, reachable via `/arm`, `/disarm`, the Thai keywords, or 🏠 ดูแลบ้าน — same Yes/No confirm pattern as device control. First attempt commanded the Security Remote Control device directly (simulating its physical button, `{code: 'arm', value: 'arm'}` etc. — its DPs turned out to be Enum, not Boolean, confirmed by switching the product to DP Instruction mode on the Tuya IoT Platform); live-tested and rejected by Tuya (`2008 command or value not support`) — root cause: it's a battery-powered/sleepy Zigbee end device that can transmit its own button presses but can't receive cloud-initiated downlink commands. **Resolved** by triggering the user's pre-built Tap-to-Run Scenes instead (`tuyaRestClient.triggerScene()`, `POST /v2.0/cloud/scene/rule/{rule_id}/actions/trigger`), configured via new `TUYA_ARM_SCENE_ID`/`TUYA_DISARM_SCENE_ID` env vars — both menu paths hide themselves until both are set. Confirmed working live via LINE.
- **Bot-name greeting** (`buildGreeting`, triggered by typing `LINE_BOT_NAME`) — a friendlier entry point than remembering เมนู, with direct shortcuts to เมนู/สถานะทั้งหมด/เฝ้าบ้าน/ไปพัก.
- `TUYA_DEVICE_DP_REGISTRY.md`'s `sos` (Security Remote Control) entry updated: `arm`/`disarmed`/`home` DPs confirmed real (Enum, single-value range) but explicitly marked not commandable from the cloud, with the Scene-trigger resolution documented.

## [1.5.0] - 2026-08-15

### Added — Phase 2, Increment 1: Interactive Status Query
- **LINE webhook** (`src/webhook/server.js`) — Express `POST /webhook`, signature-verified via `@line/bot-sdk`'s `middleware()`. Runs alongside the existing Pulsar client; independent failure domains.
- **Tap-only device menu**, never requires typing a device name/ID: a trigger keyword (`เมนู`) or argument-less command (`/status`, `สถานะ`) opens a Quick Reply category menu → device menu → a live Flex status card. Menu content is built dynamically from `deviceRegistry.json` — adding/removing a device changes the menu with zero code changes.
- **Hand-rolled Tuya REST client** (`src/services/tuyaRestClient.js`) — token minting + signed status queries. Verified live against the real Tuya API during development (both token mint and a real device status query succeeded on the first attempt). Evaluated and rejected the official `@tuya/tuya-connector-nodejs` package: it hard-pins a vulnerable `axios` (`^0.21.1`, multiple CVEs) that npm can't resolve past.
- `LINE_CHANNEL_SECRET`, `TUYA_BASE_URL`, `PORT` moved from optional/unused to required (`environment.js` `REQUIRED_ENV`).

### Added — Device DP Profile Refactor
- **`src/config/dpProfiles.js`** — declarative DP-code → event resolver table, keyed by Tuya Product Category (`mcs`, `qt`, `tdq`, `sgbj`, `pir`, `watersensor`). `sensorNormalizer.js` rewritten to dispatch per-device through this table instead of matching DP codes globally.
- **Why this matters**: the old global-match approach had a real correctness gap — the same DP code name can mean different things in different Tuya categories (`switch_1` is a relay in `tdq`, never a door), and nothing prevented a device from being misread according to the wrong category's meaning. Per-device profile lookup closes that gap. A DP code not defined for a device's registered profile now safely becomes `UNKNOWN_EVENT` instead of being guessed at.
- **`deviceRegistry.json`/`.example.json`** restructured from flat `{id: name}` to `{id: {name, category, dpProfile}}`. Every real registered device's `dpProfile` was confirmed directly against its Tuya IoT Platform Product Category (not inferred) — `mcs` × 3 doors, `qt` × 2 doors, `tdq` × 1 relay, `sgbj` × 1 siren, `pir` × 1 motion sensor, `sos` × 1 remote (unresolved DP schema, unchanged).
- **`src/config/deviceCategories.js`** — separate, coarser user-facing grouping (door/motion/water/relay/alarm/remote/gateway) driving the Phase 2 menu; has no effect on Phase 1 alerting.

### Fixed
- A local dev/test contact sensor (`a398d10d5b3cc551f5kzz6`, used throughout earlier correlator testing) had never been added to `deviceRegistry.json` — under the old global-match normalizer this still worked by accident; under the new per-device-profile design it would have silently gone to `UNKNOWN_EVENT` for everything. Registered it (and its local Zigbee gateway) before shipping the refactor.
- Two stale references to `poc/tuya-listener.js`/`poc/all-status.js` removed from `RUCKYOM_SPECIFICATION.md` and `app.js` comments — confirmed absent from the repo entirely (never committed) while researching Phase 2's Tuya REST client, which had no in-repo reference to build from.

## [1.4.0] - 2026-08-15

### Added
- `[TUYA_IN]`/`[LINE_OUT]` debug-level payload logs — the decrypted device payload as received (`app.js`) and the exact rendered text before each LINE push (`eventCorrelator.js`). Both silent at the default `LOG_LEVEL=info`, available on demand at `LOG_LEVEL=debug` for investigation, without the noise of the SDK's own `[SDK:INFO]` dumps.
- `getBangkokLogTimestamp()` (`src/utils/dateTime.js`) — `YYYY-MM-DD HH:mm:ss.SSS` in server-local (Bangkok) time.

### Fixed
- Log file timestamps used raw UTC (`new Date().toISOString()`), several hours off from `date` on the production VM — now use `getBangkokLogTimestamp()`, matching server time for easier log/incident correlation.

## [1.3.0] - 2026-08-14

### Added
- **`ALARM_OFF` event.** Previously `alarm_switch: false` was silent (routine telemetry, matching the motion-clear/water-normal/battery-healthy pattern). Now it sends a distinct "all clear" message, so anyone alerted by `ALARM_ON` gets a corresponding close-the-loop message once the siren stops, instead of having to check the Smart Life app.
- **`LOG_LEVEL` env var** (`debug`/`info`/`error`, default `info`). SDK-level `INFO` (the Tuya SDK's raw per-message payload dumps) is now routed to `debug` and silent by default — only written when `LOG_LEVEL=debug` is explicitly set for a debugging session. SDK-level `ERROR` always surfaces regardless.

### Fixed
- **SDK log content was being silently dropped.** The Tuya SDK invokes its `logger` callback as `logger(level, timestampString, ...messageParts)` — the real content is in the 3rd+ arguments, not the 2nd (a bare `Date.now() ` prefix). The 1.2.0 wiring only captured `(level, message)`, so every SDK log line in production showed just a bare timestamp number with the actual payload discarded.
- **Object arguments logged as `[object Object]`.** `logger.js` used naive `String(arg)` coercion; objects (e.g. the SDK's decrypted message object) now serialize via `JSON.stringify` instead.

## [1.2.0] - 2026-08-14

### Added
- **Rotating file logger** (`src/utils/logger.js`). All app-level `console.log`/`console.error` calls, plus the Tuya SDK's own per-message `INFO` logging (previously unbounded raw `console.log` dumps, one per Pulsar message — the dominant source of log volume), now route through it. Writes to both the console (so `pm2 logs` still works) and a rotating file under `LOG_DIR`.
- `LOG_DIR`, `LOG_MAX_SIZE` (default `10M`), `LOG_MAX_FILES` (default `7`) env vars. Rotation triggers daily or at `LOG_MAX_SIZE`, whichever comes first; on each rotation, only the `LOG_MAX_FILES` most recently modified rotated files are kept, bounding worst-case disk usage to roughly `LOG_MAX_SIZE × LOG_MAX_FILES` regardless of log volume — addresses a real disk-fill risk on the Oracle Cloud production VM.
- `switch` DP code now recognized as door contact state (`DOOR_OPENED`/`DOOR_CLOSED`), same `true = open` polarity as `doorcontact_state`. Previously fell through to `UNKNOWN_EVENT`. Confirmed against a real production device (`ประตูห้องพ่อ`) by cross-referencing Pulsar events against the Smart Life app's History log — every open/close pair matched exactly. Distinct from `switch_1`, which remains relay/light semantics.

### Note
- Not addressed by this release: pm2's own log capture (`~/.pm2/logs/`) mirrors all stdout/stderr independently of this app's logger and is **not** bounded by `LOG_MAX_FILES`. Fully closing the disk-fill risk on the VM also requires `pm2 install pm2-logrotate` once — a pm2-level operational step, not something `.env` controls.

## [1.1.0] - 2026-08-14

### Added
- **General event consolidation.** `EventCorrelator` now debounces bursts of activity from *any* sensor, not just the door→motion→alarm chain: the first event in a burst sends immediately, everything else that arrives within `EVENT_CORRELATION_WINDOW_MS` (default 15000ms) is buffered and folded into one `CHAIN_ESCALATION` message when the window closes — or immediately if an `ALARM_ON` event arrives (treated as the terminal/worst-case event).
- Exactly one follow-up event in a window sends as its own normal alert instead of being wrapped in a single-line `CHAIN_ESCALATION`.
- `ALARM_ON` event type, mapped from the `alarm_switch` DP (siren).
- `battery` DP code now recognized as an alias for `battery_percentage` (same `<20%` low-battery threshold) — previously fell through to `UNKNOWN_EVENT` on devices that report battery under this code.
- `LINE_BOT_NAME` env var (default `รักยม`), interpolated into alert templates as `{{botName}}`.
- `EVENT_CORRELATION_WINDOW_MS` env var to tune the consolidation window.
- `TUYA_DEVICE_DP_REGISTRY.md` — reference doc of raw Tuya DP schemas per device category, cross-referenced to `sensorNormalizer.js`.

### Fixed
- `TUYA_MQ_ENV` was read into `.env` but never actually applied — `src/app.js` hardcoded `TuyaWebsocket.env.PROD` regardless of the setting, so switching to `TEST` in `.env` had no effect. Now reads `process.env.TUYA_MQ_ENV`.

### Changed
- Alert wording revised across all templates (more casual, first-person "รักยม" narrator voice); dropped redundant "ประตู" from door open/close messages since device names already include it.
- `getBangkokTimestamp`/new `getBangkokTime` split in `src/utils/dateTime.js` — the latter provides short `HH:MM:ss` stamps for per-line timestamps inside a `CHAIN_ESCALATION` message.

## [1.0.0] - 2026-08-14

Initial scaffold: Tuya Pulsar consumer → LINE push notifications. Handles `doorcontact_state`, `pir`, `switch_1`, `watersensor_state`, `battery_percentage` DPs. In-memory LRU dedup on Pulsar `messageId`. One LINE message sent per event, no consolidation.
