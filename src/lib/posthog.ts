import posthog from "posthog-js";
import { configureLogger, getLoggerConfig, setExceptionCapturer } from "./logger";
import { env } from "../config/env";

const POSTHOG_KEY = env.posthogKey;
const POSTHOG_HOST = env.posthogHost;
const IS_PROD = env.isProd;

let initialized = false;

export function isPostHogInitialized(): boolean {
  return initialized;
}

export function getPostHog() {
  return initialized ? posthog : null;
}

export function initPostHog() {
  // Only activate in production AND when a PostHog key is configured. In dev
  // or when env vars are missing we stay a no-op so local logs don't pollute
  // analytics and engineers don't need a key to run the app.
  if (initialized) return;
  if (!IS_PROD || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Shopify embeds the app in an iframe — disable autocapture and session
    // recording to avoid noise from the Shopify admin chrome.
    autocapture: false,
    capture_pageview: false,
    persistence: "memory", // no cookies inside Shopify iframe
  });
  initialized = true;
  // Wire the logger so `log.exception` / `log.error` reach PostHog, and add
  // the posthog sink alongside whatever was configured previously (usually
  // just "console").
  setExceptionCapturer(() => posthog);
  const existingSinks = getLoggerConfig().sinks;
  if (!existingSinks.includes("posthog")) {
    configureLogger({ sinks: [...existingSinks, "posthog"] });
  }
  installGlobalErrorHandlers();
}

function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    const err =
      event.error instanceof Error
        ? event.error
        : new Error(event.message || "window.error");
    try {
      posthog.captureException(err, { source: "window.error" });
    } catch {
      // never let telemetry break the app
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const err =
      reason instanceof Error
        ? reason
        : new Error(String(reason ?? "Unhandled rejection"));
    try {
      posthog.captureException(err, { source: "unhandledrejection" });
    } catch {
      // never let telemetry break the app
    }
  });
}

/** Identify the shop and attach person properties (plan, domain, etc.) */
export function identifyShop(
  shopDomain: string,
  properties?: Record<string, unknown>,
) {
  if (!initialized) return;
  posthog.identify(shopDomain, properties);
}

/** Update person properties without re-identifying (e.g. plan change) */
export function setShopProperties(properties: Record<string, unknown>) {
  if (!initialized) return;
  posthog.people.set(properties);
}

/** Capture a custom event */
export function capture(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}
