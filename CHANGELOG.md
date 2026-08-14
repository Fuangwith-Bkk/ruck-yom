# Changelog

All notable changes to this project are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

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
