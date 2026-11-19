/**
 * Structured logger tanpa data sensitif.
 *
 * Output satu baris JSON agar mudah di-parse agregator log. Nilai dengan nama
 * kunci sensitif (password, token, cookie, secret, proofKey) diganti "[REDACTED]"
 * secara rekursif sebelum ditulis.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY =
  /pass(word|wd)?|token|secret|authorization|cookie|proofkey|accesskey|session/i;

const MAX_DEPTH = 5;

function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    // Jangan pernah menulis string yang sangat panjang (mis. body/base64).
    return value.length > 2000 ? `${value.slice(0, 2000)}…[truncated]` : value;
  }
  if (typeof value !== "object") return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV === "production" ? undefined : value.stack,
    };
  }

  if (depth >= MAX_DEPTH) return "[MAX_DEPTH]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key)
      ? "[REDACTED]"
      : redact(entry, depth + 1, seen);
  }
  return output;
}

function write(
  level: LogLevel,
  message: string,
  context?: unknown
): void {
  const entry: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    message,
  };

  if (context !== undefined) {
    entry.context = redact(context);
  }

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") {
    if (process.env.NODE_ENV !== "production") console.debug(line);
  } else console.log(line);
}

export const logger = {
  info: (message: string, context?: unknown) => write("info", message, context),
  warn: (message: string, context?: unknown) => write("warn", message, context),
  error: (message: string, context?: unknown) => write("error", message, context),
  debug: (message: string, context?: unknown) => write("debug", message, context),
};
