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

class CustomJsdomEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    const g = this.global;
    for (const name of NODE_GLOBALS_TO_COPY) {
      if (typeof globalThis[name] !== "undefined" && typeof g[name] === "undefined") {
        g[name] = globalThis[name];
      }
    }
  }
}

module.exports = CustomJsdomEnvironment;
