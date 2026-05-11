// Single source of truth for `import.meta.env` reads. All call sites should
// import from here so env parsing, defaults, and typing live in one place.

// In Vite (dev/build) we read `import.meta.env`. In jest (no Vite) we fall
// back to `process.env` so tests can populate VITE_* via setupFiles or
// globalSetup without needing a separate test-only env.ts.
type EnvBag = Record<string, unknown>;
const fromVite: EnvBag =
  (import.meta.env as EnvBag | undefined) ?? ({} as EnvBag);
const fromNode: EnvBag =
  typeof process !== "undefined" && process.env
    ? (process.env as EnvBag)
    : ({} as EnvBag);
const raw: EnvBag = { ...fromNode, ...fromVite };

const asString = (v: unknown): string => (typeof v === "string" ? v : "");
const asStringOr = (v: unknown, fallback: string): string => {
  const s = asString(v).trim();
  return s.length > 0 ? s : fallback;
};
const asBool = (v: unknown): boolean => v === "true";

const DEFAULT_SUPPORT_EMAIL = "steve@upatra.com";
const DEFAULT_SUPPORT_HINT =
  "Please include your Shopify store URL (e.g. your-store.myshopify.com) and a screenshot or steps to reproduce so we can help faster.";
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export const env = {
  mode: asString(raw.MODE) || asString(raw.NODE_ENV) || "development",
  isProd: raw.PROD === true || raw.NODE_ENV === "production",

  shopifyApiKey: asString(raw.VITE_SHOPIFY_API_KEY),
  devStoreUrl: asString(raw.VITE_DEV_STORE_URL),

  apiUrl: asString(raw.VITE_API_URL),
  apphubUrl: asString(raw.VITE_APPHUB_URL),
  appCode: asString(raw.VITE_APP_CODE),
  appHandle: asString(raw.VITE_APP_HANDLE),

  useMock: asBool(raw.VITE_USE_MOCK),

  posthogKey: asString(raw.VITE_POSTHOG_KEY),
  posthogHost: asStringOr(raw.VITE_POSTHOG_HOST, DEFAULT_POSTHOG_HOST),

  // Optional logger overrides — see src/config/logging.ts for the declarative
  // baseline. These let a single build be retuned at deploy time.
  logLevel: asString(raw.VITE_LOG_LEVEL),
  logSinks: asString(raw.VITE_LOG_SINKS),

  supportEmail: asStringOr(raw.VITE_SUPPORT_EMAIL, DEFAULT_SUPPORT_EMAIL),
  supportHint: asStringOr(raw.VITE_SUPPORT_HINT, DEFAULT_SUPPORT_HINT),
} as const;
