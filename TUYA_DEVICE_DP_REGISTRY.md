# Tuya Device DP Registry

Raw Tuya "Standard Instruction Set" / "Standard Status Set" schemas per
product category, collected from the Tuya IoT Platform. This is upstream
source material — it feeds `RUCKYOM_SPECIFICATION.md` Section 6 (Sensor DP
Code Mapping Schema) and `src/services/sensorNormalizer.js`. Not every DP
listed here is wired into the app; see the **Handled** column per category.

## How to use this file

- One section per Tuya Product Category (`Category code` — `Product Type`).
- **Instruction Set** = commands the app can send *to* the device. Mostly
  irrelevant today — this app is a read-only Pulsar consumer, not a
  controller.
- **Status Set** = DPs the device reports *to* the app. This is what
  `sensorNormalizer.js` actually consumes.
- **Verify against the real device, not just the category template.** Tuya's
  category-level docs are generic; a specific device model can expose more or
  fewer DPs than shown here. Before wiring up a new device, confirm its real
  schema via Tuya IoT Platform → Device → Functions tab, or the Cloud API
  `/v1.0/devices/{device_id}/functions` endpoint.
- Adding a category: paste the raw Tuya table under a new `##` section below,
  in the same Code / Type / Values / Handled shape as the existing ones, and
  add a Change log entry.

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Handled in `sensorNormalizer.js` |
| ⚠️ | Not yet handled — currently falls through to `UNKNOWN_EVENT` |
| ❓ | Unverified — Remark/description conflicts with the DP schema; confirm against the real device before relying on it |

---

## `tdq` — Breaker

### Instruction Set / Status Set
*(Tuya lists these identically for this category)*

| Code | Type | Values | Handled |
|---|---|---|---|
| `switch_1` | Boolean | `{true, false}` | ✅ `RELAY_ON` / `RELAY_OFF` |
| `countdown_1` | Integer | unit `s`, range 0–43200, step 1 | ⚠️ |
| `relay_status` | Enum | `0`, `1`, `2` | ⚠️ |
| `switch_inching` | String | maxlen 255 | ⚠️ |
| `switch_type` | Enum | `flip`, `sync`, `button` | ⚠️ |

---

## `sos` — Emergency Button

**Remark:** vendor describes this unit as a *"Security Remote with 4 buttons
(home, arm, disarm, and sos)"*.

### Status Set

| Code | Type | Values | Handled |
|---|---|---|---|
| `battery_percentage` | Integer | unit `%`, range 0–100, step 1 | ⚠️ |
| `sos` | Enum | `sos` | ⚠️ |

> ❓ **Unresolved:** only a single `sos` enum is documented, but the Remark
> claims 4 physical buttons (home/arm/disarm/sos). Either this category page
> is the wrong one for the actual hardware, or the real device's schema
> differs from the generic template shown here. **Do not build alert logic
> around `home`/`arm`/`disarm` DPs until this is confirmed** against the real
> device ID via the Tuya Cloud API — they may not exist.

---

## `pir` — Motion Detector

### Status Set

| Code | Type | Values | Handled |
|---|---|---|---|
| `pir` | Enum | `pir`, `none` | ✅ `pir` → `MOTION_DETECTED`; `none` is routine, intentionally not emitted |
| `battery_percentage` | Integer | unit `%`, range 0–100, step 1 | ✅ `BATTERY_LOW` when < 20% |

---

## `sgbj` — Siren

### Instruction Set / Status Set
*(Tuya lists these identically for this category)*

| Code | Type | Values | Handled |
|---|---|---|---|
| `alarm_volume` | Enum | `low`, `middle`, `high`, `mute` | ⚠️ |
| `alarm_time` | Integer | unit `S`, range 1–380, step 1 | ⚠️ |
| `alarm_switch` | Boolean | `{true, false}` | ⚠️ |

---

## `mcs` — Contact Sensor

**Remark:** door sensor.

### Status Set

| Code | Type | Values | Handled |
|---|---|---|---|
| `doorcontact_state` | Boolean | `{true, false}` | ✅ `true` → `DOOR_OPENED`; `false` → `DOOR_CLOSED` |
| `battery_percentage` | Integer | unit `%`, range 0–100, step 1 | ✅ `BATTERY_LOW` when < 20% |

---

## `qt` — Others

**Remark:** door sensor — confirmed by real production events (2026-08-14):
`ประตูห้องพ่อ` (a registered door sensor) sent `{"code":"battery","value":100}`
and repeated `{"code":"switch","value":true/false}` transitions. So for this
device, both `qt`/`battery` and `qt`/`switch` genuinely are a door sensor's
readings, not a copy/paste leftover from a switch/plug category as
previously suspected. `switch`'s `true=open` polarity was confirmed by
cross-referencing a burst of production events against the Smart Life app's
own History log (every open/close pair matched exactly).

### Status Set

| Code | Type | Values | Handled |
|---|---|---|---|
| `switch` | Boolean | `{true, false}` | ✅ `DOOR_OPENED` (`true`) / `DOOR_CLOSED` (`false`) — `sensorNormalizer.js` treats it as door-contact state, same polarity as `doorcontact_state`. Distinct from `switch_1` used by `tdq`, which is relay/light control, not a door. |
| `battery` | Integer | range 0–500, step 1, no unit | ✅ `BATTERY_LOW` when < 20% — `sensorNormalizer.js` treats it as an alias for `battery_percentage`. Range shown as 0–500 by Tuya's generic category docs, but the one real sample seen (`value: 100`) is consistent with a plain 0–100% reading, which is how it's currently interpreted. |

---

## Handled elsewhere, no category entry yet

- `watersensor_state` (Water Leak Sensor) — mapped in `sensorNormalizer.js` →
  `WATER_LEAK`, but its Tuya category page hasn't been pasted into this
  registry yet. Add it here next time it's pulled from the platform.

---

## Change log

| Date | Change |
|---|---|
| 2026-08-14 | Renamed from `devices-format.md`; reformatted into per-category tables with a Handled/verification legend and cross-references to `sensorNormalizer.js`. |
| 2026-08-14 | `qt`/`battery` confirmed via production event and marked ✅ handled (aliased to `battery_percentage` in `sensorNormalizer.js`); `qt` Remark updated to reflect the confirmed door-sensor mapping. |
| 2026-08-14 | `qt`/`switch` polarity confirmed against Smart Life app History log and marked ✅ handled (mapped to `DOOR_OPENED`/`DOOR_CLOSED` in `sensorNormalizer.js`, same polarity as `doorcontact_state`). |
