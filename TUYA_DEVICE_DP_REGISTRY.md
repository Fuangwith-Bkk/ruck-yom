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
- **Each `##` category code here is also a key in `src/config/dpProfiles.js`**
  (Phase 2, 2026-08-15) — that file is the actual runtime dispatch table;
  this doc is the reference/rationale behind it. A device is registered in
  `deviceRegistry.json` with a `dpProfile` naming one of these category
  codes, so its DPs are only ever interpreted against that specific
  category's table, never matched globally across devices.

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Handled in `sensorNormalizer.js` |
| ⚠️ | Not yet handled — currently falls through to `UNKNOWN_EVENT` |
| ❓ | Unverified — Remark/description conflicts with the DP schema; confirm against the real device before relying on it |

---

## `tdq` — Breaker

Confirmed via Tuya IoT Platform Product Category (2026-08-15) for the real
registered device หลอดไฟยาวหน้าบ้าน (Product Name: BSD17-1). Actually a
relay-controlled light in this deployment, not a literal circuit breaker —
`tdq` is Tuya's generic relay/switch category name, used here for the front
yard light.

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
(home, arm, disarm, and sos)"*. Confirmed via Tuya IoT Platform Product
Category (2026-08-15) for the real registered device รีโมท (Product Name:
R7054-V2 Security remote control).

### Status Set

| Code | Type | Values | Handled |
|---|---|---|---|
| `battery_percentage` | Integer | unit `%`, range 0–100, step 1 | ⚠️ |
| `sos` | Enum | `sos` | ⚠️ |
| `arm` | Enum | `arm` (single-value range) | ✅ `REMOTE_ARMED` — syncs houseMode/quietMode same as เฝ้าบ้าน; not commandable |
| `disarmed` | Enum | `disarmed` (single-value range) | ✅ `REMOTE_DISARMED` — syncs houseMode/quietMode same as ไปพัก; not commandable |
| `home` | Enum | `home` (single-value range) | ⚠️ not commandable |

> ✅ **Resolved (2026-08-15):** switching this product from Standard
> Instruction to DP Instruction mode on the Tuya IoT Platform confirmed all
> 4 buttons really do exist as Enum DPs (`arm`, `disarmed`, `home`, `sos`,
> each a single-value-range enum). **However, they cannot be commanded from
> the cloud** — `POST /v1.0/devices/{id}/commands` with any of these codes
> returns `2008 command or value not support`. Root cause: this is a
> battery-powered/sleepy Zigbee end device — it can transmit its own button
> presses upstream, but Zigbee end devices of this kind generally can't
> receive cloud-initiated downlink commands. Confirmed live against the real
> device.
>
> **Resolution:** เฝ้าบ้าน/ไปพัก (arm/disarm) are implemented by triggering
> the user's pre-built Tap-to-Run **Scenes** instead
> (`POST /v2.0/cloud/scene/rule/{rule_id}/actions/trigger`,
> `src/services/tuyaRestClient.js`'s `triggerScene()`), not by commanding
> this device directly. The Scenes replicate the same "Then" actions the
> physical remote buttons would trigger. Confirmed live end-to-end via LINE
> on 2026-08-15.
>
> **Reverse direction (2026-08-16):** pressing `arm`/`disarmed` directly on
> the remote (not via LINE) now also syncs the bot's own state — `app.js`
> reacts to `REMOTE_ARMED`/`REMOTE_DISARMED` by calling the same
> `houseMode.setMode()`/`quietMode` calls `interactionRouter.js`'s
> `_executeArmDisarm` uses, and pushes a confirmation message. Before this,
> a remote-only arm/disarm left `houseMode`/`quietMode` unchanged and the
> button press itself only ever surfaced as an `UNKNOWN_EVENT`.

---

## `pir` — Motion Detector

Confirmed via Tuya IoT Platform Product Category (2026-08-15) for the real
registered device คนเดินในห้องนั่งเล่น (Product Name: ZP06ZTU 人体感应 —
human body/motion sensor).

### Status Set

| Code | Type | Values | Handled |
|---|---|---|---|
| `pir` | Enum | `pir`, `none` | ✅ `pir` → `MOTION_DETECTED`; `none` is routine, intentionally not emitted |
| `battery_percentage` | Integer | unit `%`, range 0–100, step 1 | ✅ `BATTERY_LOW` when < 20% |

---

## `sgbj` — Siren

Confirmed via Tuya IoT Platform Product Category (2026-08-15) for the real
registered device Alarm (Product Name: ZA03ZTU 报警器 — alarm/siren).

### Instruction Set / Status Set
*(Tuya lists these identically for this category)*

| Code | Type | Values | Handled |
|---|---|---|---|
| `alarm_volume` | Enum | `low`, `middle`, `high`, `mute` | ⚠️ |
| `alarm_time` | Integer | unit `S`, range 1–380, step 1 | ⚠️ |
| `alarm_switch` | Boolean | `{true, false}` | ✅ `ALARM_ON` (`true`) / `ALARM_OFF` (`false`) |

---

## `mcs` — Contact Sensor

**Remark:** door sensor. Confirmed via Tuya IoT Platform Product Category
(2026-08-15) for 3 real registered devices: ประตูระเบียงห้องพ่อ, ประตูครัว,
ประตูหน้าบ้าน (Product Name: Zigbee门磁（磁阻开关) — Zigbee door magnetic
contact switch).

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

Confirmed via Tuya IoT Platform Product Category (2026-08-15) for 2 real
registered devices: ประตูห้องป้าแสง and ประตูห้องพ่อ. Tuya's Product Type
for this category really is generic "Others," but the actual Product Name
is 门窗磁传感器 (door/window magnetic sensor) — so despite the unhelpful
category label, this is genuinely a purpose-built door/window sensor, not a
miscategorized generic device.

### Status Set

| Code | Type | Values | Handled |
|---|---|---|---|
| `switch` | Boolean | `{true, false}` | ✅ `DOOR_OPENED` (`true`) / `DOOR_CLOSED` (`false`) — `sensorNormalizer.js` treats it as door-contact state, same polarity as `doorcontact_state`. Distinct from `switch_1` used by `tdq`, which is relay/light control, not a door. |
| `battery` | Integer | range 0–500, step 1, no unit | ✅ `BATTERY_LOW` when < 20% — `sensorNormalizer.js` treats it as an alias for `battery_percentage`. Range shown as 0–500 by Tuya's generic category docs, but the one real sample seen (`value: 100`) is consistent with a plain 0–100% reading, which is how it's currently interpreted. |

---

## Handled elsewhere, no category entry yet

- `watersensor_state` (Water Leak Sensor) — mapped in `sensorNormalizer.js`'s
  `dpProfiles.js` table (Phase 2) → `WATER_LEAK`, under the placeholder
  profile key `watersensor`, but its real Tuya Product Category code hasn't
  been confirmed (no water leak sensor is owned/registered yet) and its
  category page hasn't been pasted into this registry. Once one is added:
  confirm the real category code via the platform, rename the `watersensor`
  key in `dpProfiles.js` to match, and paste its raw schema here.

---

## Change log

| Date | Change |
|---|---|
| 2026-08-14 | Renamed from `devices-format.md`; reformatted into per-category tables with a Handled/verification legend and cross-references to `sensorNormalizer.js`. |
| 2026-08-14 | `qt`/`battery` confirmed via production event and marked ✅ handled (aliased to `battery_percentage` in `sensorNormalizer.js`); `qt` Remark updated to reflect the confirmed door-sensor mapping. |
| 2026-08-14 | `qt`/`switch` polarity confirmed against Smart Life app History log and marked ✅ handled (mapped to `DOOR_OPENED`/`DOOR_CLOSED` in `sensorNormalizer.js`, same polarity as `doorcontact_state`). |
| 2026-08-14 | `sgbj`/`alarm_switch` marked ✅ handled for both `true` and `false` (`ALARM_ON`/`ALARM_OFF` in `sensorNormalizer.js`) — Boolean `{true, false}` type was already documented from the original `devices-format.md`/Tuya IoT Platform Device Debugging screen, confirming `false` is a real "off" state, not inferred. |
| 2026-08-15 | Every category code confirmed directly against its real registered device's Product Category on the Tuya IoT Platform (`mcs`, `qt`, `tdq`, `sgbj`, `pir`, `sos`) — Remarks updated with the exact Product Names. `sensorNormalizer.js` rewritten to dispatch per-device via `src/config/dpProfiles.js`, keyed by these exact category codes, instead of matching DP codes globally — closes a real ambiguity risk (e.g. `tdq`'s `switch_1` and a hypothetical future category reusing the same code name for something else could previously have been cross-interpreted). |
| 2026-08-15 | `sos`'s `arm`/`disarmed`/`home` DPs confirmed real (Enum, single-value range) after switching the product to DP Instruction mode — but confirmed **not commandable** from the cloud (`2008 command or value not support`), since this is a battery-powered Zigbee end device that can't receive downlink commands. เฝ้าบ้าน/ไปพัก resolved instead by triggering pre-built Tap-to-Run Scenes (`triggerScene()` in `tuyaRestClient.js`) — confirmed working live via LINE. |
