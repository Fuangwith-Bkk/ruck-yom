# Changelog

All notable changes to this project are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

## [2.3.0] - 2026-08-17

### Fixed
- **รีโมท (Security Remote Control) battery alerts** — its `sos` dpProfile never mapped `battery_percentage`, so every periodic battery reading (confirmed hitting production every few hours, 87% constant) fell through to `UNKNOWN_EVENT` and spammed the raw DP JSON to the group instead of a normal battery message — one occurrence even triggered a LINE API `400 Bad Request`. Now resolves through the same `batteryLow()` resolver as every other profile, so it's silent while healthy and renders the normal `BATTERY_LOW` template once actually low.

### Added
- **`BATTERY_LOW_THRESHOLD`** env var — the battery % cutoff (`dpProfiles.js`'s `batteryLow()`) was previously hardcoded at `20`; now tunable per deployment without a code change.
- **Daily รายงาน on/off toggle** — `/report off`/`ปิดรายงาน` and `/report on`/`เปิดรายงาน` (new `src/services/reportMode.js`), persisted the same crash-recovery-marker way as `quietMode.js`'s state. `dailyReport.js` checks it right before each scheduled send, so toggling takes effect on the very next run with no restart needed.
- **`/switch dr` / `/switch prod`** — hot-swaps which LINE Official Account credential set the running process uses (new `src/services/botIdentity.js`), with no restart. LINE gives a bot no API to join a group (only `leaveGroup` to remove itself) and doesn't allow two bots to be members of the same group chat at once, so this only automates the backend credential swap — the human still does the actual leave/invite in the LINE app afterward. Each role's `groupId` is learned automatically from its first event in the group rather than needing to be copied into `.env` by hand.

### Changed
- **Breaking: LINE credentials are now role-prefixed.** `LINE_CHANNEL_ACCESS_TOKEN`/`LINE_CHANNEL_SECRET`/`LINE_GROUP_ID` are replaced by `LINE_DEV_*`/`LINE_PROD_*`/`LINE_DR_*` plus `LINE_ACTIVE_ROLE` (the role used at boot) and `LINE_ROLE_STATE_FILE` (persists the active role + learned groupIds across restarts — overrides `LINE_ACTIVE_ROLE` after the first `/switch`). Existing deployments must migrate `.env` before upgrading; `environment.js`'s `validateEnv()` now only requires whichever role is currently active to have a token/secret configured, not a single flat pair.

## [2.2.1] - 2026-08-17

### Fixed
- **Error log messages now include custom subclass fields** — `logger.js`'s `stringify()` previously only logged `Error.stack`/`message`, silently dropping own-enumerable extra fields that custom Error subclasses attach (e.g. `@line/bot-sdk`'s `HTTPFetchError` carries `status`/`statusText`/`body`). A generic `"400 - Bad Request"` in the logs now includes the actual response body that explains why.

### Changed
- **`.env.example` comments moved above their variable** instead of trailing inline — long annotations no longer force wrapping/horizontal scrolling mid-line.

## [2.2.0] - 2026-08-16

### Added — Phase 2, Increment 4: Remote Sync, Daily Summary, LINE Quota, House Mode Recovery
- **Physical remote arm/disarm now syncs the bot** — `dpProfiles.js`'s `sos` profile (the Security Remote Control, รีโมท) previously had no entry at all, so every button press surfaced as an `UNKNOWN_EVENT`. Its `arm`/`disarmed` DPs now resolve to `REMOTE_ARMED`/`REMOTE_DISARMED`; `app.js` reacts to those the same way `interactionRouter.js`'s `_executeArmDisarm` does for the LINE-side commands — `houseMode.setMode()` plus `quietMode.setIndefiniteQuiet()`/`clearQuiet()` — so pressing ไปพัก on the physical remote actually suppresses routine alerts too, not just the รายงาน label. Both events are marked critical (`eventCorrelator.js`) so the confirmation push can't suppress itself via the quiet mode it just set. รายงาน's mode label changed from "(ล่าสุดจากบอท)" to "(ล่าสุดที่ทราบ)" since the source is no longer LINE-only.
- **Daily รายงาน summary** (`DAILY_REPORT_TIME`, `src/services/dailyReport.js`) — optional once-a-day automatic push of the same รายงาน table the manual command sends, in Bangkok time (no DST, so a plain next-occurrence `setTimeout` needs no cron dependency). Deliberately pushed directly rather than through `eventCorrelator.js`, so it always bypasses quiet mode/ไปพัก. Purely in-memory: a restart near the scheduled time just skips that day rather than replaying it. Extracted the shared query/build logic into `src/services/statusReport.js` so the manual command (`interactionRouter.js`'s `_replyAllStatus`) and the daily push can never drift out of sync.
- **LINE monthly push-quota usage in รายงาน** — `lineMessaging.js` gained `getQuota()` (wrapping the SDK's `getMessageQuota()`/`getMessageQuotaConsumption()`) and `pushMessage()` was generalized to accept a Flex message, not just text. `statusCard.js`'s new `buildQuotaSection` shows usage on both the manual รายงาน and the daily push; best-effort, silently omitted if the quota query fails.
- **houseMode boot recovery** — a restart previously always started รายงาน's mode line unknown until the next LINE command or remote press. New `TUYA_ALARM_AUTOMATION_ID` env var + `tuyaRestClient.getSceneRule()` (`GET /v2.0/cloud/scene/rule/{rule_id}`) let `app.js` query, at startup, the enable/disable status of the Tuya automation that this deployment's "Arm"/"Disarm" Tap-to-Run scenes toggle, and seed `houseMode` from it. Optional — depends on a specific automation setup existing and being identified via the Tuya API Explorer's Query Linkage Rules endpoint (documented in Section 8.13's `space_id`/`rule_id` guide).

## [2.1.0] - 2026-08-16

### Added — Phase 2, Increment 3: Device History, Quiet Mode, รายงาน
- **ประวัติ (device history)** — 🕘 ประวัติ button on every queryable device's status card (not just controllable ones), backed by a new `tuyaRestClient.getDeviceLogs()` against Tuya's Device Log Service (7-day free retention). Reuses `dpProfiles.js`'s alert resolvers so history and live alerts always agree on how a state change is described. Two live bugs found and fixed along the way: Tuya's HMAC signature requires query-string params sorted alphabetically by key (this was the first endpoint with any query string, so the requirement was latent until now — unsorted params produced `1004 sign invalid`), and `type` is a required parameter despite not reading that way from Tuya's docs (omitting it produced `40000303 Parameter error!`, not a default-to-all-types). Also switched to a display format naming the month (`getBangkokHistoryTimestamp()`, `DD MMM YY HH:mm:ss`) since history can span up to a week, where a numeric `DD/MM/YY` is more easily misread.
- **เงียบๆหน่อย (quiet mode)** — new `src/services/quietMode.js`. Suppresses `eventCorrelator.js`'s LINE push (the single choke point every alert goes through) without touching Tuya's Message Service itself — confirmed via direct research of Tuya's docs that no API exists to pause/resume it, only a console toggle that itself takes ~30 minutes to take effect, unworkable for a 30min–2h "I'm stepping out" use case. Two ways to activate: a guided tap flow (preset buttons, or type a bare number of minutes — the app's first piece of short-lived conversational state, a 2-minute "awaiting duration" TTL flag) or a direct `/quiet N` command. Two ways to end early: ตื่นแล้ว or กลับบ้าน. A minimal on-disk crash-recovery marker (existence-only signal, `QUIET_STATE_FILE`, default `./quiet-state.json`, gitignored) ensures a crash/restart mid-quiet-period announces itself on the next boot ("ระบบรีสตาร์ท...กลับมาแจ้งเตือนตามปกติแล้ว") instead of silently resuming with no one told.
- **ไปพัก/เฝ้าบ้าน now drive quiet mode automatically** — confirming ไปพัก (disarm, "I'm home resting") enters *indefinite* quiet mode (no timer; routine household door/motion activity isn't alert-worthy while you're right there), ending only on เฝ้าบ้าน or กลับบ้าน. Confirming เฝ้าบ้าน (arm, "watching the house," away) always resumes full alerting, even overriding a still-active ไปพัก/เงียบๆหน่อย quiet — arming should mean maximum vigilance, unconditionally.
- **Critical events always bypass quiet mode** — `ALARM_ON`, `ALARM_OFF`, and `WATER_LEAK` (plus a pre-emptive `SMOKE_DETECTED` for a future smoke sensor) push through regardless of whether quiet mode is manual or the new automatic ไปพัก-quiet, including when folded into a multi-event `CHAIN_ESCALATION` alongside routine events. Neither a quiet request nor "I'm home" should ever be able to hide a real emergency.
- **รายงาน** — `สถานะทั้งหมด`/`/status all` renamed everywhere it's shown in the UI (old phrasing still recognized as an alias); now also shows a best-effort mode summary line (`houseMode.js`, new — last-known เฝ้าบ้าน/ไปพัก *this bot* itself triggered, explicitly labeled "ล่าสุดจากบอท" since it's not a verified live query, plus current quiet-mode status) above the device table.
- **กลับบ้าน** ("I'm home") added as a second way to end quiet mode alongside ตื่นแล้ว, plus a 🏡 กลับบ้าน button in the ดูแลบ้าน submenu.

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
