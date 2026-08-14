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

module.exports = { getBangkokTimestamp, getBangkokTime };
