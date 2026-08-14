# Changelog

All notable changes to this project are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

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
