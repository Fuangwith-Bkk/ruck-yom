# Test Execution Suite — Expected Results (Mapped to Current Implementation)

**Revised 2026-08-14 for the v1.1.0 correlator rewrite.** The original
version of this document was traced against an earlier `EventCorrelator`
that only let `DOOR_OPENED` open a correlation window, with a fixed
`followUps` set (`DOOR_CLOSED`/`MOTION_DETECTED`/`ALARM_ON`). That design has
since been replaced with a general burst-debouncer — see `CHANGELOG.md`
[1.1.0]. This revision re-traces every scenario against the current code.

Source scenarios: the situational test suite provided by the user (device
trip patterns, redelivery, cascades, concurrency, disarm flow, stress test).
That suite intentionally used illustrative DP codes to describe *situations*,
not the real Tuya DP schema. This document re-maps each situation onto the DP
codes `sensorNormalizer.js` actually reads, then traces it through the real
`EventCorrelator` state machine to compute exactly what LINE messages would
go out.

## Assumptions

1. **Device registry.** The suite's fictional IDs (`dev_dc_01`, etc.) aren't
   in `src/config/deviceRegistry.json`. If run unregistered, the fallback
   naming (`Sensor (${devId.substring(0,6)}...)`) would collide — every
   `dev_dc_0X` shares the same first 6 characters (`dev_dc`). To keep
   expected output legible, this document assumes each ID is registered with
   the descriptive name from the original table:

   | Device ID | Assumed registry name |
   |---|---|
   | `dev_dc_01` | Front Door |
   | `dev_dc_02` | Back Door |
   | `dev_dc_03` | Garage Door |
   | `dev_dc_04` | Master Bed Window |
   | `dev_dc_05` | Balcony Door |
   | `dev_dc_06` | Living Room Window |
   | `dev_alm_01` | Indoor Siren |
   | `dev_rc_01` | 4-Button Keyfob |
   | `dev_brk_01` | Main Smart Breaker |
   | `dev_pir_01` | Living Room PIR |

2. **DP code mapping** (situation → real DP the app reads):

   | Suite's idea | Real DP code | Handled as |
   |---|---|---|
   | `doorcontact_state: true/false` | `doorcontact_state` | ✅ `DOOR_OPENED`/`DOOR_CLOSED` |
   | `pir: "pir"/"none"` | `pir` | ✅ `MOTION_DETECTED` (only on `"pir"`; `"none"` is silent, no event) |
   | `alarm_state: "ALARMING"/"CANCEL"` | `alarm_switch: true/false` | ✅ `ALARM_ON` on `true`; `false` is silent, no event |
   | `switch_1: false` (breaker) | `switch_1` | ✅ `RELAY_ON`/`RELAY_OFF` |
   | `key_disarm: true` / `key_arm: true` | *(no matching code)* | ⚠️ **Not implemented.** Falls through to `UNKNOWN_EVENT`. There is no ARM/DISARM concept anywhere in the app — no security-mode state exists. |

3. **Correlator logic actually in code today** (`src/services/eventCorrelator.js`,
   v1.1.0): **any** eventType can open a window or join one already open —
   there is no longer a fixed trigger/follow-up type list. The first event of
   a burst always sends immediately and opens the window; every event that
   arrives while the window is open (any type, any device) gets buffered.
   On flush: 0 follow-ups → nothing sent; exactly 1 follow-up → that event
   sends as its own normal standalone template (not wrapped); 2+ follow-ups
   → one `CHAIN_ESCALATION` listing all of them. `ALARM_ON` always
   force-flushes immediately (`TERMINAL_EVENT`). `windowMs = 15000`
   (`EVENT_CORRELATION_WINDOW_MS`, explicit in `.env`). Still **one global
   window** — no per-device/per-zone separation.

4. **No Redis, no quota tracking.** Unchanged from the prior revision — no
   security-mode store, no push-quota tracking exists. Every `DOOR_OPENED`
   alerts identically regardless of any prior disarm/arm event.

---

## Scenario 2.1 — Single Device Isolation Event

| T | Event |
|---|---|
| 00:05.00 | `dev_dc_01` `doorcontact_state: true` |

**Trace:** No window open → opens a window, sent standalone. Nothing else arrives → window expires at 00:20.00 with 0 follow-ups → silent.

**Expected output: 1 message.** (Unchanged from the prior design.)
```
มีคนเปิด Front Door ครับ
<timestamp @00:05.00>
```

---

## Scenario 2.2 — Stream Redelivery & Deduplication

| T | Event |
|---|---|
| 00:02.10 | `dev_dc_04` `doorcontact_state: true` (messageId `evt_001`) |
| 00:02.30 | Redelivery of `evt_001` (same messageId) |

**Trace:** First message opens a window, sent standalone. The redelivery is caught by `LRUDeduplicator` on `messageId` before it reaches the normalizer/correlator at all — zero downstream effect, unaffected by the correlator rewrite.

**Expected output: 1 message.** (Unchanged.)
```
มีคนเปิด Master Bed Window ครับ
<timestamp @00:02.10>
```

---

## Scenario 2.3 — Sequential Multi-Sensor Cascade

| T | Event |
|---|---|
| 00:01.00 | `dev_dc_01` DOOR_OPENED |
| 00:03.50 | `dev_pir_01` MOTION_DETECTED |
| 00:06.00 | `dev_alm_01` ALARM_ON |
| 00:10.20 | `dev_dc_04` DOOR_OPENED |

**Trace:** Identical outcome to the prior design — this scenario happens to have exactly 2 follow-ups (`MOTION_DETECTED`, `ALARM_ON`), which still take the multi-line `CHAIN_ESCALATION` path either way.
- `00:01.00` — opens window W1, standalone.
- `00:03.50` — buffered (any type qualifies now, same practical result as before since motion was already a recognized follow-up).
- `00:06.00` — buffered, and `ALARM_ON` is the terminal event → **flushes W1 immediately**.
- `00:10.20` — W1 closed → opens W2, standalone. Nothing follows → expires silently.

**Expected output: 3 messages — unchanged.**
```
1) มีคนเปิด Front Door ครับ
   <timestamp @00:01.00>

2) รักยมวิ่งมาบอกครับ! มีเหตุการณ์ต่อเนื่องเกิดขึ้นครับ:
   - มี Living Room PIR (00:xx:03)
   - สัญญาณเตือนดังแล้ว (00:xx:06)
   <timestamp — copied from ALARM_ON's own timestamp>

3) มีคนเปิด Master Bed Window ครับ
   <timestamp @00:10.20>
```

---

## Scenario 2.4 — Simultaneous (Same-Millisecond) Dual Triggers

| T | Event |
|---|---|
| 00:04.00 | `dev_dc_02` DOOR_OPENED |
| 00:04.00 | `dev_pir_01` MOTION_DETECTED |

**⚠️ Still order-dependent (Tuya doesn't guarantee delivery order across devices), but the failure mode changed.** Previously, whichever event arrived second — if it wasn't `DOOR_OPENED` — could be silently orphaned (sent as an unrelated standalone ping, uncorrelated). That's fixed now: **both events are always sent**, since any type can join a window. But there's a new cost — the second event no longer sends immediately.

**Case A — door processed first:**
`DOOR_OPENED` opens the window, sent standalone. `MOTION_DETECTED` buffers. Window closes ~15s later with exactly 1 follow-up → sent as its own normal template (not wrapped), **delayed ~15s from when it actually happened**.
```
1) มีคนเปิด Back Door ครับ                  (immediate)
2) มี Living Room PIR ครับ                  (~15s later, not immediate)
```

**Case B — motion processed first:**
`MOTION_DETECTED` now *can* open the window (it couldn't before) — sent standalone immediately. `DOOR_OPENED` buffers, then sends ~15s later as its own normal template.
```
1) มี Living Room PIR ครับ                  (immediate)
2) มีคนเปิด Back Door ครับ                  (~15s later, not immediate)
```

Same 2-message total either way now, and nothing is silently lost — but whichever event loses the arrival-order race is delayed by up to the full window, which matters if that one happens to be the more urgent of the two (e.g. a door-open losing the race to an unrelated motion blip).

---

## Scenario 2.5 — Infrastructure Override & Hardware Disarm Flow

| T | Event |
|---|---|
| 00:02.00 | `dev_rc_01` `key_disarm: true` |
| 00:05.50 | `dev_dc_05` DOOR_OPENED |
| 00:10.00 | `dev_brk_01` `switch_1: false` |
| 00:18.00 | `dev_rc_01` `key_arm: true` |

**🔴 Notable regression here: this scenario now surfaces the exact risk flagged in 2.4's note.**

**Trace:**
- `00:02.00` — `key_disarm` is unrecognized → `UNKNOWN_EVENT`. Previously this bypassed the window mechanism entirely; now it **opens a window** like anything else, standalone, sent immediately. Window closes ~00:17.00 unless force-flushed.
- `00:05.50` — `DOOR_OPENED` (Balcony Door) arrives while that window is still open → **buffered, not sent standalone**. A door opening — the one event type in this whole suite that's actually security-critical — now waits behind an unrelated keyfob blip instead of alerting immediately.
- `00:10.00` — `RELAY_OFF` (breaker) also buffers into the same window (previously always standalone, now included).
- `~00:17.00` — window's 15s timer elapses (opened @2.00) → flush. 2 follow-ups (`DOOR_OPENED`, `RELAY_OFF`) → `CHAIN_ESCALATION`. The door-open, which happened at `00:05.50`, isn't reported until **~11.5 seconds later**, folded in with an unrelated breaker event.
- `00:18.00` — `key_arm` (`UNKNOWN_EVENT`) arrives with no window open (previous one already flushed at ~17.00) → standalone, opens a new window. Nothing follows → expires silently.

**Expected output: 3 messages (was 4 under the old design) — and the door-open alert is delayed, not immediate.**
```
1) {{botName}} ได้รับแจ้งว่า ... key_disarm ...              @00:02.00 (immediate)

2) รักยมวิ่งมาบอกครับ! มีเหตุการณ์ต่อเนื่องเกิดขึ้นครับ:          @~00:17.00 (flush time;
   - เปิด Balcony Door (00:xx:05)                             door actually opened
   - ปิด Main Smart Breaker (00:xx:10)                        at 00:05.50 — ~11.5s earlier)

3) {{botName}} ได้รับแจ้งว่า ... key_arm ...                  @00:18.00 (immediate)
```
The scenario's original premise — "door opened while disarmed should read differently" — still doesn't hold (no disarm-awareness exists either way). But now there's an additional finding: the door-open alert is no longer immediate, purely because an unrelated unrecognized-DP event happened to precede it by a few seconds.

---

## Scenario 2.6 — Maximum Concurrency & Restoration Stress Test

Full trace, current logic (single global window, `windowMs = 15000`, terminal = `ALARM_ON`):

| T | Event | Correlator action |
|---|---|---|
| 00:01.00 | `dev_dc_01` DOOR_OPENED | No window → **standalone**, opens **W1** |
| 00:01.00 | `dev_pir_01` MOTION_DETECTED | Buffered into W1 |
| 00:01.05 | Redelivery of `evt_001` | Deduped, zero effect |
| 00:03.20 | `dev_alm_01` ALARM_ON | Buffered + terminal → **flushes W1 immediately** |
| 00:05.50 | `dev_dc_04` DOOR_OPENED | W1 closed → **standalone**, opens **W2** |
| 00:08.00 | `dev_dc_02` DOOR_OPENED | Buffered into W2 |
| 00:10.00 | `dev_rc_01` `key_disarm` (`UNKNOWN_EVENT`) | **Now buffered into W2** (previously always standalone) |
| 00:12.00 | `dev_dc_05` DOOR_OPENED | Buffered into W2 |
| 00:15.00 | `dev_brk_01` `switch_1:false` (`RELAY_OFF`) | **Now buffered into W2** (previously always standalone) |
| 00:15.00 | `dev_dc_06` DOOR_OPENED | Buffered into W2 |
| 00:18.40 | `dev_rc_01` `key_arm` (`UNKNOWN_EVENT`) | **Now buffered into W2** |
| ~00:20.50 | *(W2's 15s timer, opened @05.50, elapses)* | **W2 auto-flushes** — 6 follow-ups → `CHAIN_ESCALATION` |
| 00:21.10 | `dev_dc_03` DOOR_OPENED | W2 closed → **standalone**, opens **W3** |
| 00:24.00 | `dev_dc_01` DOOR_CLOSED (restore) | Buffered into W3 |
| 00:24.00 | `dev_dc_02` DOOR_CLOSED (restore) | Buffered into W3 |
| 00:24.00 | `dev_dc_03` DOOR_CLOSED (restore) | Buffered into W3 |
| 00:27.50 | `dev_pir_01` `pir:"none"` | No event emitted (routine) |
| 00:29.80 | `dev_alm_01` `alarm_switch:false` | No event emitted (routine) |
| *(scenario ends @00:30)* | | **W3 still open**, pending flush ~00:36.10 (outside the 30s window) |

**Expected output within the stated 30-second window: 5 messages (was 8 under the old design).**
```
1) มีคนเปิด Front Door ครับ                                   @~00:01.00

2) รักยมวิ่งมาบอกครับ! มีเหตุการณ์ต่อเนื่องเกิดขึ้นครับ:            @~00:03.20
   - มี Living Room PIR (00:xx:01)
   - สัญญาณเตือนดังแล้ว (00:xx:03)

3) มีคนเปิด Master Bed Window ครับ                             @~00:05.50

4) รักยมวิ่งมาบอกครับ! มีเหตุการณ์ต่อเนื่องเกิดขึ้นครับ:            @~00:20.50 (flush time; earliest
   - เปิด Back Door (00:xx:08)                                folded event — Back Door — actually
   - 4-Button Keyfob มีเหตุการณ์ไม่ทราบสาเหตุ (00:xx:10)          happened ~12.5s earlier)
   - เปิด Balcony Door (00:xx:12)
   - ปิด Main Smart Breaker (00:xx:15)
   - เปิด Living Room Window (00:xx:15)
   - 4-Button Keyfob มีเหตุการณ์ไม่ทราบสาเหตุ (00:xx:18)

5) มีคนเปิด Garage Door ครับ                                   @~00:21.10
```
Plus the same pending 6th message past the 30s window: W3 flushes ~00:36.10 with 3 buffered `DOOR_CLOSED` restores as a `CHAIN_ESCALATION`.

### Key findings this scenario surfaces (revised)

- **Message count dropped from 8 to 5** — a much quieter result, which is the whole point of the 1.1.0 redesign (this is the exact "combine everything in the same window" behavior that was requested).
- **But the trade-off is visible here too:** message #4 buries a disarm signal (`key_disarm` @10.00), a re-arm signal (`key_arm` @18.40), 3 more door-opens, and a breaker trip into one bullet list, delayed up to ~12.5s from the earliest of them (Back Door @8.00). If any of `key_disarm`/`key_arm`/door-open/breaker-trip needs to stand out on its own, it no longer does — everything in a 15-second span looks the same in the output.
- **Cross-zone merging still applies** (unchanged from the prior revision): Master Bed Window, Back Door, Balcony, and Living Room Window — four different rooms — still land in the same single global window, since there's no per-zone separation.
- **Redelivery dedup still works correctly** — zero extra output from the one duplicate.
- **Restoration events remain quiet by design** — same as before, no change to that part.

---

## Summary

| Scenario | Expected messages (v1.1.0) | Expected messages (prior design) | Notes |
|---|---|---|---|
| 2.1 Single isolation | 1 | 1 | No change |
| 2.2 Redelivery dedup | 1 | 1 | No change |
| 2.3 Sequential cascade | 3 | 3 | No change (exactly 2 follow-ups either way) |
| 2.4 Simultaneous dual trigger | 2 | 2 | Count unchanged; the losing event is now delayed ~15s instead of risking being orphaned |
| 2.5 Disarm/arm override | 3 | 4 | Quieter, but the door-open alert is now delayed ~11.5s instead of immediate |
| 2.6 Max concurrency stress | 5 (+1 pending past T+30s) | 8 (+1 pending) | Much quieter; disarm/arm/breaker signals now buried inside a bullet list instead of standing out |

**Overall:** the 1.1.0 correlator does what was asked — it meaningfully reduces message volume during bursts of any-type activity. The cost, visible in 2.4/2.5/2.6, is that events which aren't themselves urgent (an unrecognized remote signal, a light switch) can now delay a genuinely security-relevant event (a door opening) by up to the full window if they happen to arrive first. Whether that trade-off is acceptable is a product decision, not a bug — flagging it here since it wasn't explicitly discussed when the general-debounce redesign was requested.
