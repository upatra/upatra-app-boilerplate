const { TestEnvironment } = require("jest-environment-jsdom");

// List of Node 18+ globals to copy into the jsdom window for MSW v2 support
const NODE_GLOBALS_TO_COPY = [
  "fetch",
  "Response",
  "Request",
  "Headers",
  "FormData",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "BroadcastChannel",
  "Blob",
  "File",
  "TextEncoder",
  "TextDecoder",
  "crypto",
];

// Vite-style env injected for tests. Production code reads from
// `src/config/env.ts`, which falls back to `process.env` when Vite's
// `import.meta.env` is unavailable (i.e. under jest). We populate
// process.env here so the same module wiring works in both worlds, and
// MSW handler URLs in tests can reference `import.meta.env.VITE_*` knowing
// what value lives there.
const TEST_ENV_DEFAULTS = {
  VITE_API_URL: "http://test.api.local",
  VITE_APPHUB_URL: "http://test.apphub.local",
  VITE_APP_CODE: "test-app",
  VITE_APP_HANDLE: "test-handle",
  VITE_SHOPIFY_API_KEY: "test-key",
  VITE_USE_MOCK: "false",
  VITE_POSTHOG_KEY: "",
  VITE_LOG_LEVEL: "error",
  VITE_LOG_SINKS: "console",
};

for (const [k, v] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (process.env[k] === undefined) process.env[k] = v;
}

class CustomJsdomEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    const g = this.global;
    for (const name of NODE_GLOBALS_TO_COPY) {
      if (typeof globalThis[name] !== "undefined" && typeof g[name] === "undefined") {
        g[name] = globalThis[name];
      }
    }
    // Mirror process.env into the realm so tests reading
    // `process.env.VITE_APPHUB_URL` from inside jsdom see the same values.
    g.process = g.process || {};
    g.process.env = { ...process.env };
  }
}

module.exports = CustomJsdomEnvironment;
