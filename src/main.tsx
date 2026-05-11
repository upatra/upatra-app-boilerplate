import { createRoot } from "react-dom/client";
import App from "./App";
import { configureLogger, type LogLevel, type LogSink } from "./lib/logger";
import { loggingConfig } from "./config/logging";
import { env } from "./config/env";

const VALID_LEVELS: LogLevel[] = ["debug", "info", "warn", "error", "silent"];
const VALID_SINKS: LogSink[] = ["console", "posthog"];

function bootstrapLogger() {
  // Start from the declarative config file (src/config/logging.ts).
  configureLogger(loggingConfig);

  // Optional per-env overrides: VITE_LOG_LEVEL / VITE_LOG_SINKS take precedence
  // so a single build can be retuned at deploy time without a code change.
  if (VALID_LEVELS.includes(env.logLevel as LogLevel)) {
    configureLogger({ level: env.logLevel as LogLevel });
  }

  if (env.logSinks) {
    const parsed = env.logSinks
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is LogSink => VALID_SINKS.includes(s as LogSink));
    if (parsed.length > 0) configureLogger({ sinks: parsed });
  }
}

async function bootstrap() {
  bootstrapLogger();
  if (env.useMock) {
    try {
      const { worker } = await import("./mocks/browser");
      await worker.start({ onUnhandledRequest: "bypass" });
    } catch (e) {
      console.warn(
        "[MSW] Failed to start — run `npx msw init public/` then restart.",
        e,
      );
    }
  }
  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();
