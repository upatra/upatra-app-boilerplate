export type LogContext = Record<string, unknown>;

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type LogSink = "console" | "posthog";

export interface ExceptionCapturer {
  captureException(error: unknown, context?: LogContext): unknown;
}

export interface LoggerConfig {
  /** Default threshold applied when no feature-level override matches. */
  level: LogLevel;
  /** Active sinks. `posthog` is a no-op until a capturer is registered. */
  sinks: LogSink[];
  /** Per-feature threshold. Takes precedence over `level` when set. */
  featureLevels: Record<string, LogLevel>;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const DEFAULT_CONFIG: LoggerConfig = {
  level: "info",
  sinks: ["console"],
  featureLevels: {},
};

let config: LoggerConfig = {
  ...DEFAULT_CONFIG,
  featureLevels: { ...DEFAULT_CONFIG.featureLevels },
};

// Resolver injected — typically by `initPostHog()` at bootstrap. Left as a
// no-op by default so the logger works without pulling in posthog-js (keeps
// Node-env unit tests clean and keeps the logger usable in isolation).
let resolveCapturer: () => ExceptionCapturer | null = () => null;

export function setExceptionCapturer(
  resolver: () => ExceptionCapturer | null,
) {
  resolveCapturer = resolver;
}

export function resetExceptionCapturerForTesting() {
  resolveCapturer = () => null;
}

/**
 * Patch the logger configuration. Any omitted keys keep their current value;
 * `featureLevels` is merged, not replaced, so individual features can be
 * configured incrementally.
 */
export function configureLogger(patch: Partial<LoggerConfig>): void {
  config = {
    level: patch.level ?? config.level,
    sinks: patch.sinks ?? config.sinks,
    featureLevels: {
      ...config.featureLevels,
      ...(patch.featureLevels ?? {}),
    },
  };
}

export function resetLoggerConfig(): void {
  config = {
    ...DEFAULT_CONFIG,
    featureLevels: { ...DEFAULT_CONFIG.featureLevels },
  };
}

export function getLoggerConfig(): LoggerConfig {
  return {
    ...config,
    featureLevels: { ...config.featureLevels },
  };
}

function thresholdFor(feature?: string): LogLevel {
  if (feature && config.featureLevels[feature]) {
    return config.featureLevels[feature];
  }
  return config.level;
}

function shouldEmit(level: LogLevel, feature?: string): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[thresholdFor(feature)];
}

function emitToConsole(level: LogLevel, message: string, context?: LogContext) {
  if (!config.sinks.includes("console")) return;
  const args = context ? [message, context] : [message];
  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else if (level === "debug") console.debug(...args);
  else console.info(...args);
}

function emitToPostHog(error: unknown, context?: LogContext) {
  if (!config.sinks.includes("posthog")) return;
  const capturer = resolveCapturer();
  if (!capturer) return;
  try {
    capturer.captureException(error, context);
  } catch {
    // Never let telemetry break the app.
  }
}

function toErrorInstance(input: unknown): Error {
  if (input instanceof Error) return input;
  if (typeof input === "string") return new Error(input);
  try {
    return new Error(JSON.stringify(input));
  } catch {
    return new Error(String(input));
  }
}

function mergeFeature(
  context: LogContext | undefined,
  feature?: string,
): LogContext | undefined {
  if (!feature) return context;
  return { feature, ...(context ?? {}) };
}

interface LoggerLike {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  exception(error: unknown, context?: LogContext): void;
}

function buildLogger(feature?: string): LoggerLike & {
  feature(name: string): LoggerLike;
} {
  return {
    debug(message, context) {
      if (!shouldEmit("debug", feature)) return;
      emitToConsole("debug", message, mergeFeature(context, feature));
    },
    info(message, context) {
      if (!shouldEmit("info", feature)) return;
      emitToConsole("info", message, mergeFeature(context, feature));
    },
    warn(message, context) {
      if (!shouldEmit("warn", feature)) return;
      emitToConsole("warn", message, mergeFeature(context, feature));
    },
    error(message, context) {
      if (!shouldEmit("error", feature)) return;
      const ctx = mergeFeature(context, feature);
      emitToConsole("error", message, ctx);
      emitToPostHog(toErrorInstance(message), ctx);
    },
    exception(error, context) {
      if (!shouldEmit("error", feature)) return;
      const ctx = mergeFeature(context, feature);
      emitToConsole("error", "Exception caught", { error, ...(ctx ?? {}) });
      emitToPostHog(toErrorInstance(error), ctx);
    },
    feature(name) {
      return buildLogger(name);
    },
  };
}

/**
 * Global logger. Call sites can either use it directly or spawn a
 * feature-scoped logger via `log.feature("auth")`.
 *
 * Behavior is controlled by {@link configureLogger}:
 * - `sinks`: which destinations receive events (`console`, `posthog`, or both)
 * - `level`: minimum level that passes through (debug < info < warn < error)
 * - `featureLevels`: per-feature overrides, e.g. `{ auth: "debug" }`
 *
 * PostHog is only wired up when `initPostHog()` succeeds (production + key set),
 * so in dev `posthog` sink is a safe no-op even if it's listed.
 */
export const log = buildLogger();
