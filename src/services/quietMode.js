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
// Date.now() of the most recent ไปพัก. eventCorrelator.js compares it
// against the moment a correlation window opened, so a window that was
// already collecting events when ไปพัก started can never flush afterwards —
// including when ไปพัก arrives by LINE command rather than by the remote,
// which the correlator has no other way to observe.
let lastIndefiniteQuietAt = 0;

// How long after prompting for a duration a bare typed number is still
// understood as the answer — kept short so a coincidental, unrelated number
// typed later in the group chat can't be misread as a quiet-mode request.
const DURATION_PROMPT_TTL_MS = 2 * 60 * 1000;

function isQuiet() {
  return quietIndefinite || (quietUntil !== null && Date.now() < quietUntil);
}

// True only for the ไปพัก (disarm) flavour of quiet, not a timed
// เงียบๆหน่อย. The two mean different things and eventCorrelator.js treats
// them differently: ไปพัก is "I'm home, the house is disarmed, tell me
// nothing at all", so even a siren stays silent; a timed เงียบๆหน่อย is
// "stop the routine chatter for N minutes" while the house is still armed,
// so a genuine emergency must still get through.
function isIndefiniteQuiet() {
  return quietIndefinite;
}

// Timestamp of the last ไปพัก, or 0 if there has never been one this
// process. See lastIndefiniteQuietAt above.
function indefiniteQuietStartedAt() {
  return lastIndefiniteQuietAt;
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
  lastIndefiniteQuietAt = Date.now();
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
  isIndefiniteQuiet,
  indefiniteQuietStartedAt,
  remainingMinutes,
  setQuiet,
  setIndefiniteQuiet,
  clearQuiet,
  armDurationPrompt,
  isDurationPromptPending,
  clearDurationPrompt,
  readCrashMarker
};
