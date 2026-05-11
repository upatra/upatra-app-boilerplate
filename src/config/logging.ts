import type { LoggerConfig } from "../lib/logger";

/**
 * Declarative logging configuration — the app's equivalent of Python's
 * `logging.yaml`.
 *
 * - `level`   : default threshold; messages below are dropped from every sink.
 * - `sinks`   : active destinations. `posthog` stays dormant until
 *               `initPostHog()` activates (production + `VITE_POSTHOG_KEY`).
 * - `featureLevels` : per-feature overrides, keyed by the string passed to
 *               `log.feature("name")`. A feature left out inherits `level`.
 *
 * Overrides: `VITE_LOG_LEVEL` and `VITE_LOG_SINKS` env vars can override
 * `level` and `sinks` at build time (see `main.tsx`). `featureLevels` is
 * code-only — edit it here when you want to turn the volume up or down on a
 * specific area without a redeploy of other concerns.
 */
export const loggingConfig: LoggerConfig = {
  level: "info",
  sinks: ["console"],
  featureLevels: {
    // Auth flow: noisy on retries, keep info so retries are visible.
    auth: "info",
    // Plan / billing funnel: rare events, keep info so they show in consoles.
    plan: "info",
  },
};
