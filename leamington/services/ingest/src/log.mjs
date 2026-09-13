/**
 * Structured logging.
 *
 * Every line is one JSON object: source, timestamp, level, and whatever the
 * event carries. Machine-greppable, because the thing we most need to detect is
 * a feed going quiet, and that is a question about logs over time.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL || "info"] ?? 20;

// Reserved keys. A caller passing `level` (e.g. an alert's red/orange) must not
// be able to overwrite the LOG level -- that silently breaks every downstream
// filter on level=error. Caller fields are spread first; reserved keys win.
const RESERVED = ["ts", "level", "feed", "msg"];

function emit(level, feed, msg, fields = {}) {
  if (LEVELS[level] < threshold) return;
  const collisions = RESERVED.filter((k) => k in fields);
  const safe = { ...fields };
  for (const k of collisions) { safe[`field_${k}`] = safe[k]; delete safe[k]; }
  const line = { ...safe, ts: new Date().toISOString(), level, feed, msg };
  // stderr for warn/error so a supervisor can split streams.
  (LEVELS[level] >= 30 ? process.stderr : process.stdout).write(JSON.stringify(line) + "\n");
}

export const logger = (feed) => ({
  debug: (msg, f) => emit("debug", feed, msg, f),
  info: (msg, f) => emit("info", feed, msg, f),
  warn: (msg, f) => emit("warn", feed, msg, f),
  error: (msg, f) => emit("error", feed, msg, f),
});
