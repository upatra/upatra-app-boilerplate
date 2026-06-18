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
const asBoolDefaultTrue = (v: unknown): boolean => v !== "false";

const DEFAULT_SUPPORT_EMAIL = "steve@upatra.com";
const DEFAULT_SUPPORT_HINT =
  "Please include your Shopify store URL (e.g. admin.shopify.com/store/your-store) and a screenshot or steps to reproduce so we can help faster.";
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
  // Human-readable app name, used in UI copy (e.g. the review prompt's
  // "Enjoying {{appName}}?"). Falls back to a generic placeholder.
  appName: asStringOr(raw.VITE_APP_NAME, "our app"),

  useMock: asBool(raw.VITE_USE_MOCK),

  posthogKey: asString(raw.VITE_POSTHOG_KEY),
  posthogHost: asStringOr(raw.VITE_POSTHOG_HOST, DEFAULT_POSTHOG_HOST),

  // Optional logger overrides — see src/config/logging.ts for the declarative
  // baseline. These let a single build be retuned at deploy time.
  logLevel: asString(raw.VITE_LOG_LEVEL),
  logSinks: asString(raw.VITE_LOG_SINKS),

  supportEmail: asStringOr(raw.VITE_SUPPORT_EMAIL, DEFAULT_SUPPORT_EMAIL),
  supportHint: asStringOr(raw.VITE_SUPPORT_HINT, DEFAULT_SUPPORT_HINT),

  // When false, the app stays in English regardless of the Shopify admin
  // locale. Default is true; set VITE_ENABLE_I18N="false" to disable.
  enableI18n: asBoolDefaultTrue(raw.VITE_ENABLE_I18N),

  // Master switch for the "Enjoying {{appName}}?" review prompt wrapper
  // around shopify.reviews.request(). Default is true; set
  // VITE_ENABLE_REVIEW_PROMPT="false" to make useReviewPrompt.trigger() a
  // no-op (modal never opens, no analytics fire).
  enableReviewPrompt: asBoolDefaultTrue(raw.VITE_ENABLE_REVIEW_PROMPT),

  // Master kill switch for the cross-app promo banner (portfolio cross-sell at
  // the global_footer placement, with the app shown chosen per-shop from the
  // apphub catalog). Default OFF — flip to "true" per environment once QA
  // passes and the apphub catalog returns this app's siblings.
  crossAppBannerEnabled: asBool(raw.VITE_CROSS_APP_BANNER_ENABLED),
} as const;
