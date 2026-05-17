# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server on port 3000
npm run build     # TypeScript check + Vite production build
npm run lint      # ESLint
npm test          # Run Jest tests (ts-jest, no Babel)
```

To run a single test file:
```bash
npx jest path/to/__tests__/file.test.ts
```

## Environment

All env reads go through `src/config/env.ts` — never read `import.meta.env.VITE_*` directly from feature code. Add new keys there with a sensible default and import the typed `env` object.

Copy `.env.example` to `.env` and fill in:
- `VITE_SHOPIFY_API_KEY` — Shopify app client ID (from Partner Dashboard > Apps > Client credentials)
- `VITE_DEV_STORE_URL` — Dev store domain for local development outside Shopify admin
- `VITE_API_URL` — Your backend API base URL
- `VITE_APP_CODE` — App code identifier used by Apphub token exchange + billing
- `VITE_APP_HANDLE` — App handle used to build billing returnUrl
- `VITE_APPHUB_URL` — Apphub service base URL (handles Shopify token exchange)
- `VITE_USE_MOCK` — Set `true` to run the app against MSW handlers (no backend required). Run `npx msw init public/` once before first use.
- `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` — Optional. PostHog stays inert when the key is empty (and outside production builds).
- `VITE_LOG_LEVEL` / `VITE_LOG_SINKS` — Optional logger overrides. See `src/config/logging.ts` for the declarative baseline.
- `VITE_SUPPORT_EMAIL` / `VITE_SUPPORT_HINT` — Optional. Defaults are set in `src/config/env.ts`.
- `VITE_ENABLE_I18N` — Optional. Set to `"false"` to pin the app to English regardless of the Shopify admin locale. Defaults to `true`.

## Architecture

This is a **Shopify embedded app** boilerplate (React + Vite) using Shopify Polaris 13 and App Bridge. The backend is a separate service (not in this repo).

### Auth Flow

```
Shopify Admin (iframe)
  └── App Bridge (window.shopify)
        └── shopify.idToken()
              └── useAuthExchange hook (setSessionTokenGetter)
                    └── api.ts interceptor (Bearer token on every request)
                          └── apphubApi.ts (token exchange on bootstrap)
```

1. `AppShell` invokes `useAuthExchange({ shopify, shop })` which calls `shopify.idToken()` and exchanges it via `exchangeShopifyToken()`
2. The hook calls `setSessionTokenGetter(() => shopify.idToken())` — injects the getter into `api.ts` without importing React context there
3. Every `apiInstance` request automatically gets a fresh `Authorization: Bearer <token>` header
4. The token exchange resolves with `isNewInstall`, which AppShell propagates into `AuthContext` for onboarding gating (`useAuth().isNewInstall`)

#### Auth grace-period retry

`apphubApi.exchangeShopifyToken` calls `markExchangeStart()`/`markExchangeEnd()` from `api.ts`. While the exchange is in flight (or for 15s after it resolves), both axios clients retry 401/403/404 responses with exponential backoff (1s, 2s, 4s, 8s, 16s — ~31s total). This absorbs the window where the backend hasn't yet provisioned the shop row on a fresh install. The grace period is shared across both API clients via the shared markers in `api.ts`.

### Routes & navigation

`AppShell` renders three routes out of the box:
- `/` — placeholder home (replace with your app's main page)
- `/billing` — `BillingPage` (Polaris card grid driven by `PLANS` in `src/types/plan.ts`)
- `/help` — `HelpPage` (table of contents + article cards; replace `ARTICLES` with your content)

The Shopify `<s-app-nav>` is wired in `AppShell` with `<s-link>` entries for `/billing` and `/help`. Add more links there as routes grow. The capture-phase click handler triggers `shopify.loading(true)` before navigation so the merchant sees the loading bar immediately.

### Billing (`PlanContext`)

`PlanProvider` wraps the routes (in `AppContent`). It fetches the active plan from Apphub, exposes `usePlan()`:

```ts
const { currentShopPlan, activeSelectedPlan, cancelCurrentPlan, isInPlan, maxRowsPerUpload, isPlanFetched } = usePlan()
if (isInPlan(PlanType.Paid)) { /* paid feature */ }
```

Define your plans in `src/types/plan.ts` — `ALL_PLANS` (visible + hidden), `PlanIdMapper` (id → tier), `PlanType` enum. The `BillingPlanGrid` reads `PLANS` (visible only) and renders one card per plan, plus a Free card.

### Logging (`logger.ts` + `config/logging.ts`)

Use the structured logger instead of `console.*` in app code:

```ts
import { log } from "./lib/logger";
const authLog = log.feature("auth"); // scoped logger

authLog.info("retrying request", { url, attempt });
authLog.exception(e, { where: "exchangeToken" }); // also forwarded to PostHog
```

- Levels: `debug` < `info` < `warn` < `error`. Drop with `silent`.
- Sinks: `console` and/or `posthog`. PostHog sink only fires after `initPostHog()` succeeds (production + key set).
- Per-feature thresholds in `src/config/logging.ts` (e.g. `auth: "info"`, `plan: "warn"`).
- Env overrides at deploy time: `VITE_LOG_LEVEL=debug`, `VITE_LOG_SINKS=console,posthog`.

### Analytics (`posthog.ts`)

`initPostHog()` runs once in `AppShell`; it's a no-op unless `VITE_POSTHOG_KEY` is set AND the build is production. When it activates it also:
- Wires the logger's exception capturer so `log.exception(...)` reaches PostHog
- Installs `window.error` and `unhandledrejection` handlers so uncaught crashes are captured

Use:
- `identifyShop(shop)` — once per session, after auth
- `setShopProperties({...})` — when subscription state changes
- `capture("event_name", {...})` — for funnel events

PostHog is configured for embedded use: no autocapture, no cookies (memory persistence), no automatic pageviews.

### Onboarding state (`onboardingState.ts`)

`createOnboardingStore("prefix")` returns a typed accessor for per-shop boolean flags backed by localStorage with safe wrappers (private mode, quota errors are swallowed).

```ts
const onboarding = createOnboardingStore("onboarding")
onboarding.set(shop, "dismissed")
if (onboarding.has(shop, "dismissed")) { ... }
```

### Internationalization (`src/i18n/`)

`initI18n()` runs once in `main.tsx` before React mounts. It:

1. Detects the locale from `window.shopify.config.locale` (App Bridge) with a `navigator.language` fallback
2. Normalizes the BCP-47 tag to one of `SUPPORTED_LOCALES` in `i18n/locales.ts` (e.g. `fr-CA` → `fr`, `zh-Hant-TW` → `zh-TW`); unknown tags fall back to English
3. Loads the app's JSON namespaces (statically for `en`, dynamic `import.meta.glob` for others) and the matching Polaris translation bundle in parallel
4. Configures `i18next` + `react-i18next` and returns Polaris translations to `App` so they reach `<AppProvider i18n={...}>`

Usage in components:

```tsx
import { useTranslation } from "react-i18next";

function MyComponent() {
  const { t } = useTranslation("common");
  return <Text>{t("support.builtForShopify")}</Text>;
}
```

Adding a namespace:

1. Create `src/i18n/locales/en/<namespace>.json` (English is the fallback — always required)
2. Statically import it in `src/i18n/index.ts` and add the name to `NAMESPACES`
3. Add `src/i18n/locales/<locale>/<namespace>.json` for any non-English locales you ship; missing keys fall back to English per-key

Disable per env: set `VITE_ENABLE_I18N="false"` to pin the app to English regardless of admin locale. The boilerplate ships only `en/common.json` as a starting point — extend as your app grows.

### Mock mode (MSW)

When `VITE_USE_MOCK=true`, `src/main.tsx` starts the MSW worker before mounting React. Handlers live in `src/mocks/handlers.ts` (Apphub mocks for token exchange + billing out of the box — extend with backend mocks alongside). Run `npx msw init public/` once after install to generate the service worker.

### Hooks (`src/hooks/`)

- `useAuthExchange({ shopify, shop })` — boots App Bridge auth: wires `setSessionTokenGetter`, calls `shopify.idToken()`, exchanges with Apphub, returns `{ authReady, isNewInstall }`. Used by `AppShell`.
- `useScrollToError(error)` — returns a ref to wrap an error banner. When `error` becomes truthy, scrolls the window and the nearest scrollable ancestor (e.g. a Polaris Modal body) to the top so the banner is the first thing the user sees.
- `useReviewPrompt({ appName? })` — wraps `shopify.reviews.request()` with an opt-in confirmation modal, per-shop dismiss cooldown (3 → 6 → 10 silent skips), and terminal-state handling for Shopify response codes (`success`, `already-reviewed`, `cooldown-period`, etc.). Returns `{ trigger, modal }`. Call `trigger("placement_name")` from any "fresh win" surface (after a successful run, job done, milestone reached). State lives in `src/lib/reviewPromptState.ts` and is keyed per shop. Fires the `review_prompt_shown` PostHog event via `trackReviewPromptShown` in `src/lib/analytics/events.ts`. i18n keys in `common.json` under `reviewPrompt.*` interpolate `{{appName}}`.

### State Management

No global state library. Add React Context + `useReducer` per feature as needed (see `src/context/` for the auth example).

### API Layer

`src/lib/api.ts` — Axios instance for the app's own backend (`env.apiUrl`):
- Auto snake_case ↔ camelCase conversion via `humps`
- Retry on 5xx (3 retries, 1s delay, per-request budget — concurrent requests retry independently)
- Auth grace-period retry on 401/403/404 (5 attempts, exponential backoff) while a token exchange is in flight or just resolved
- Session token injected per-request via `setSessionTokenGetter` abstraction
- `x-app-code` header automatically attached when `env.appCode` is set

`src/lib/apphubApi.ts` — Apphub instance for Shopify token exchange and billing endpoints (`exchangeShopifyToken`, `getActivePlan`, `activePlan`, `cancelPlan`). Same conventions as `api.ts`, including the shared auth grace-period retry.

### Adding Features

1. Add your API functions to `src/lib/api.ts` (or a new `src/lib/myFeatureApi.ts`) using `apiInstance`
2. Add a Context + reducer in `src/context/` if you need shared state
3. Add components in `src/components/`
4. Add routes in `src/components/AppShell.tsx` using React Router `<Routes>` and uncomment the `<s-app-nav>` navigation

### Shopify Integration

- `src/App.tsx` detects iframe embedding and wraps with Polaris `AppProvider`
- `index.html` loads Shopify App Bridge from CDN and injects `VITE_SHOPIFY_API_KEY`
- All UI components should use **Shopify Polaris 13** for consistent merchant UX

## Testing

### TDD workflow — follow in order, no skipping

1. Write a failing test naming the behavior. Run it — passes immediately means the test is wrong or behavior exists. Investigate.
2. Write minimum implementation to pass.
3. `npm run lint` — fix all issues.
4. `npm test` — must be fully green. Never proceed on red.

### Test naming — `<subject> <does what> <under what condition>`

```ts
// WRONG
test('reducer returns new state')
test('MyComponent renders')

// CORRECT
test('api retries once when server returns 503')
test('AuthProvider exposes shopifyDomain normalized to myshopify.com format')
```

### What to test

- **Pure functions first**: utility helpers, reducers, mappers — no mocks needed
- **API layer**: `api.ts` via MSW — mock HTTP, never mock axios internals or `AuthContext`
- **Component behavior**: RTL + `userEvent` — act on what user does, assert on what user sees
- **Skip**: Polaris rendering, Shopify App Bridge internals, styling

### Mock boundary

Mock only at HTTP (MSW). Never mock internal helpers, context methods, or reducer functions.

```ts
// CORRECT
server.use(http.get("/api/health", () => HttpResponse.json({ status: "ok" })))

// WRONG
jest.spyOn(apiInstance, 'get').mockResolvedValue(...)
```

### Shared test infrastructure

- `src/test/msw/server.ts` — MSW server (import in individual tests or via `setupFilesAfterEnv`)
- `src/test/msw/handlers.ts` — shared handlers (add global mocks here)
- `src/test/setup.ts` — jest-dom matchers, Polaris `matchMedia` polyfill, `Blob.arrayBuffer` polyfill, `window.shopify` stub (toast / loading / idToken)
- `src/test/shims/` — CJS shims for packages that lack ESM named exports
