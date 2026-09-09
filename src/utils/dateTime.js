// `month: 'short'` (Sep, not 09) is deliberate for every user-facing string:
// a named month can't be misread as MM/DD by a reader used to a different
// date convention, which a numeric DD/MM/YY always could.
function getBangkokDateParts(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.TIMEZONE || 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    // en-GB renders September as the 4-letter "Sept" and every other month
    // as 3 letters. Trimming to 3 keeps the column width of a history list
    // even and the format predictable: 04-Sep-26, never 04-Sept-26.
    acc[part.type] = part.type === 'month' ? part.value.slice(0, 3) : part.value;
    return acc;
  }, {});
}

// DD-MMM-YY HH.mm.ss (e.g. "04-Sep-26 10.08.08") — the single display format
// for every LINE message: standalone alerts, the trailing stamp on a chain
// escalation, and device history rows. Seconds are kept because the whole
// point of a security log is telling apart events a second or two apart (a
// door re-open that re-triggers the siren, say); the dot separator matches
// how time is normally written in Thai.
function getBangkokTimestamp(date = new Date()) {
  const p = getBangkokDateParts(date);
  return `${p.day}-${p.month}-${p.year} ${p.hour}.${p.minute}.${p.second}`;
}

// HH.mm.ss only — used for the per-line timestamps inside a consolidated
// (multi-event) chain escalation message, where each line needs its own
// time but repeating the full date on every line would be noise.
function getBangkokTime(date = new Date()) {
  const p = getBangkokDateParts(date);
  return `${p.hour}.${p.minute}.${p.second}`;
}

// YYYY-MM-DD HH:mm:ss.SSS (Bangkok) — used for log file lines, so they
// align with `date` on the server instead of the raw UTC that
// `new Date().toISOString()` would give, and sort correctly as plain text.
// getBangkokDateParts() uses a 2-digit year and a named month for the
// DD-MMM-YY display timestamp above; logs need an unambiguous 4-digit year
// and a numeric month to sort, so this computes its own parts rather than
// reusing that shared helper.
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

module.exports = { getBangkokTimestamp, getBangkokTime, getBangkokLogTimestamp };
