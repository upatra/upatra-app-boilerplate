import posthog from "posthog-js";

const POSTHOG_KEY = (import.meta.env?.VITE_POSTHOG_KEY ?? "") as string;
const POSTHOG_HOST = (import.meta.env?.VITE_POSTHOG_HOST ?? "") as string;

let initialized = false;

export function initPostHog() {
  if (initialized || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Shopify embeds the app in an iframe — disable autocapture and session
    // recording to avoid noise from the Shopify admin chrome.
    autocapture: false,
    capture_pageview: false,
    persistence: "memory", // no cookies inside Shopify iframe
  });
  initialized = true;
}

export function identifyShop(
  shopDomain: string,
  properties?: Record<string, unknown>,
) {
  if (!initialized) return;
  posthog.identify(shopDomain, properties);
}

export function setShopProperties(properties: Record<string, unknown>) {
  if (!initialized) return;
  posthog.people.set(properties);
}

export function capture(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}
