function getBangkokTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.TIMEZONE || 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date) + ' (Bangkok)';
}

module.exports = { getBangkokTimestamp };
