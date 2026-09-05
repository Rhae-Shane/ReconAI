/**
 * Zero-dependency structured JSON logger.
 *
 * Each call emits a single JSON line: `{ ts, level, name?, msg, ...fields }`. Info and debug go to
 * stdout, warn and error to stderr. Severity is filtered against a configured threshold, so quiet
 * levels are dropped entirely. `child()` returns a logger with extra fields bound onto every line
 * (e.g. a `runId`), so per-run traces stay correlated without threading context through calls.
 *
 * Deliberately has no static runtime imports — it reaches for `process` only through `globalThis`
 * (guarded), so it is safe in the Node runtime (worker, route handlers) AND in the Edge runtime
 * (middleware), where `process` is unavailable and writes are silently dropped.
 */

/**
 * Guarded reference to the runtime's process object. In Edge there is no Node `process`, so writes
 * become no-ops there; under Node this resolves to the real stdout/stderr streams.
 */
const runtime = globalThis as typeof globalThis & {
  process?: { stdout?: { write?(s: string): unknown }; stderr?: { write?(s: string): unknown } };
};

export type Level = "debug" | "info" | "warn" | "error";

export interface CreateLoggerOptions {
  name?: string;
  level?: Level;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  /** Return a logger that merges `fields` into every emitted line. */
  child(fields: Record<string, unknown>): Logger;
}

const SEVERITY: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Writes one `{ ts, level, name?, msg, ...fields }` line, subject to the threshold. Writes are
 * guarded so this stays a no-op in runtimes without a writable stdout/stderr (e.g. edge middleware).
 */
function writeLine(
  threshold: number,
  name: string | undefined,
  bound: Record<string, unknown>,
  level: Level,
  msg: string,
  fields?: Record<string, unknown>,
): void {
  if (SEVERITY[level] < threshold) return;
  const line: Record<string, unknown> = { ts: new Date().toISOString(), level };
  if (name) line.name = name;
  line.msg = msg;
  Object.assign(line, bound, fields);
  const text = `${JSON.stringify(line)}\n`;
  const stream = level === "warn" || level === "error" ? runtime.process?.stderr : runtime.process?.stdout;
  stream?.write?.(text);
}

function makeLogger(opts: { name?: string; level: Level; bound: Record<string, unknown> }): Logger {
  const { name, level, bound } = opts;
  const threshold = SEVERITY[level];
  const log = (lvl: Level) => (msg: string, fields?: Record<string, unknown>) =>
    writeLine(threshold, name, bound, lvl, msg, fields);
  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    child(fields: Record<string, unknown>): Logger {
      return makeLogger({ name, level, bound: { ...bound, ...fields } });
    },
  };
}

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const { name, level = "info" } = opts;
  return makeLogger({ name, level, bound: {} });
}
