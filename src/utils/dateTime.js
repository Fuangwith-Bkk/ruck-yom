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
// lines (historyCard.js), which can span up to a week. Unlike
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
