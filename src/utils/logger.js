const fs = require('fs');
const path = require('path');
const rfs = require('rotating-file-stream');
const { getBangkokLogTimestamp } = require('./dateTime');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE || '10M';
const LOG_MAX_FILES = parseInt(process.env.LOG_MAX_FILES, 10) || 7;

const ACTIVE_FILENAME = 'ruck-yom.log';
const ROTATED_PATTERN = /^ruck-yom-\d{4}-\d{2}-\d{2}-\d+\.log$/;

// debug < info < error. Only levels >= the configured LOG_LEVEL are written
// (to both console and file) — debug is where high-volume diagnostics (e.g.
// the Tuya SDK's raw per-message payload dumps) live, so it's silent by
// default and only costs disk/console noise when explicitly opted into.
const LEVELS = { debug: 10, info: 20, error: 30 };
const CONFIGURED_LEVEL = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

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

// Errors keep their stack, objects get proper JSON instead of collapsing to
// "[object Object]" under naive String() coercion (e.g. the Tuya SDK's
// decrypted message object passed as a raw arg to its logger callback).
function stringify(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) {
    const base = arg.stack || arg.message;
    // Custom Error subclasses (e.g. @line/bot-sdk's HTTPFetchError) attach
    // extra own-enumerable fields — status/statusText/body — that carry the
    // actual reason behind a generic message like "400 - Bad Request".
    // Object.keys() only picks up own enumerable props, so plain Errors
    // (message/stack are non-enumerable) are unaffected.
    const extra = Object.keys(arg).reduce((acc, key) => {
      acc[key] = arg[key];
      return acc;
    }, {});
    if (Object.keys(extra).length === 0) return base;
    try {
      return `${base} ${JSON.stringify(extra)}`;
    } catch {
      return base;
    }
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function write(level, message) {
  const line = `[${getBangkokLogTimestamp()}] ${level} ${message}`;
  stream.write(line + '\n');
}

function log(levelName, consoleFn, ...args) {
  if (LEVELS[levelName] < CONFIGURED_LEVEL) return;
  const message = args.map(stringify).join(' ');
  consoleFn(...args);
  write(levelName.toUpperCase(), message);
}

const debug = (...args) => log('debug', console.log, ...args);
const info = (...args) => log('info', console.log, ...args);
const error = (...args) => log('error', console.error, ...args);

module.exports = { debug, info, error };
