export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export interface LoggerConfig {
  name?: string;
  level?: LogLevel;
  format?: "json" | "pretty";
  redactKeys?: string[]; // field names to mask in logged objects, e.g. ["password", "token"]
  bindings?: Record<string, any>; // context fields attached to every log line
  destination?: (line: string) => void; // defaults to console
}

export interface LogFields {
  [key: string]: any;
}

const ANSI: Record<LogLevel, string> = {
  trace: "\x1b[90m", // gray
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  fatal: "\x1b[41m\x1b[97m", // white on red
};
const RESET = "\x1b[0m";

function redact(obj: any, keys: Set<string>): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, keys));

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (keys.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object") {
      out[k] = redact(v, keys);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Lightweight structured logger. Supports leveled logging, JSON or
 * human-readable "pretty" output, child loggers that inherit and extend
 * bound context, automatic redaction of sensitive fields, and a simple
 * `time()` helper for measuring durations.
 */
export class Logger {
  private level: LogLevel;
  private format: "json" | "pretty";
  private redactKeys: Set<string>;
  private bindings: Record<string, any>;
  private destination: (line: string) => void;
  public readonly name?: string;

  constructor(config: LoggerConfig = {}) {
    this.name = config.name;
    this.level = config.level ?? "info";
    this.format = config.format ?? "json";
    this.redactKeys = new Set((config.redactKeys ?? ["password", "token", "secret", "authorization"]).map((k) => k.toLowerCase()));
    this.bindings = config.bindings ?? {};
    this.destination = config.destination ?? ((line) => console.log(line));
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[this.level];
  }

  private write(level: LogLevel, message: string, fields?: LogFields): void {
    if (!this.shouldLog(level)) return;

    const safeFields = fields ? redact(fields, this.redactKeys) : undefined;
    const record = {
      level,
      time: new Date().toISOString(),
      name: this.name,
      msg: message,
      ...this.bindings,
      ...safeFields,
    };

    if (this.format === "json") {
      this.destination(JSON.stringify(record));
    } else {
      const color = ANSI[level];
      const prefix = `${color}[${level.toUpperCase()}]${RESET}`;
      const nameStr = this.name ? ` (${this.name})` : "";
      const extra = safeFields && Object.keys(safeFields).length ? ` ${JSON.stringify(safeFields)}` : "";
      this.destination(`${prefix}${nameStr} ${record.time} - ${message}${extra}`);
    }
  }

  trace(message: string, fields?: LogFields): void {
    this.write("trace", message, fields);
  }
  debug(message: string, fields?: LogFields): void {
    this.write("debug", message, fields);
  }
  info(message: string, fields?: LogFields): void {
    this.write("info", message, fields);
  }
  warn(message: string, fields?: LogFields): void {
    this.write("warn", message, fields);
  }
  error(message: string, fields?: LogFields): void {
    this.write("error", message, fields);
  }
  fatal(message: string, fields?: LogFields): void {
    this.write("fatal", message, fields);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /** Create a derived logger that inherits config but merges in extra bound fields */
  child(bindings: Record<string, any>, name?: string): Logger {
    return new Logger({
      name: name ?? this.name,
      level: this.level,
      format: this.format,
      redactKeys: [...this.redactKeys],
      bindings: { ...this.bindings, ...bindings },
      destination: this.destination,
    });
  }

  /** Time a sync or async function and log its duration */
  async time<T>(label: string, fn: () => Promise<T> | T, level: LogLevel = "info"): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.write(level, `${label} completed`, { durationMs: Date.now() - start });
      return result;
    } catch (err: any) {
      this.write("error", `${label} failed`, { durationMs: Date.now() - start, error: err.message });
      throw err;
    }
  }
}

/** Convenience default logger instance, ready to use without configuration */
export const logger = new Logger();
