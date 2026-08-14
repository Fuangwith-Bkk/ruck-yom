const fs = require('fs');
const path = require('path');
const rfs = require('rotating-file-stream');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE || '10M';
const LOG_MAX_FILES = parseInt(process.env.LOG_MAX_FILES, 10) || 7;

const ACTIVE_FILENAME = 'ruck-yom.log';
const ROTATED_PATTERN = /^ruck-yom-\d{4}-\d{2}-\d{2}-\d+\.log$/;

fs.mkdirSync(LOG_DIR, { recursive: true });

// Rotate daily or at LOG_MAX_SIZE, whichever comes first. Rotated files get
// a date+index suffix so pruneOldLogs() can pattern-match and age-sort them
// independently of the active (unrotated) file.
function generator(time, index) {
  if (!time) return ACTIVE_FILENAME;
  const date = time.toISOString().slice(0, 10);
  return `ruck-yom-${date}-${index}.log`;
}

const stream = rfs.createStream(generator, {
  path: LOG_DIR,
  size: LOG_MAX_SIZE,
  interval: '1d'
});

stream.on('error', (err) => console.error('[LOGGER] File stream error:', err));
stream.on('rotated', () => {
  pruneOldLogs().catch((err) => console.error('[LOGGER] Prune failed:', err));
});

// Keep only the LOG_MAX_FILES most recently modified rotated files, deleting
// the rest — bounds worst-case disk usage to roughly LOG_MAX_SIZE * LOG_MAX_FILES
// regardless of how often rotation happens.
async function pruneOldLogs() {
  const entries = await fs.promises.readdir(LOG_DIR);
  const rotated = entries.filter((name) => ROTATED_PATTERN.test(name));

  const withStats = await Promise.all(
    rotated.map(async (name) => {
      const filePath = path.join(LOG_DIR, name);
      const stat = await fs.promises.stat(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    })
  );

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const toDelete = withStats.slice(LOG_MAX_FILES);
  await Promise.all(toDelete.map(({ filePath }) => fs.promises.unlink(filePath)));
}

function write(level, message) {
  const line = `[${new Date().toISOString()}] ${level} ${message}`;
  stream.write(line + '\n');
}

function info(...args) {
  const message = args.map(String).join(' ');
  console.log(...args);
  write('INFO', message);
}

function error(...args) {
  const message = args.map(String).join(' ');
  console.error(...args);
  write('ERROR', message);
}

module.exports = { info, error };
