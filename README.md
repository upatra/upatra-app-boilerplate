# Shopify App Boilerplate

A production-ready starter for **Shopify embedded apps** — React 18 + Vite 6 + Polaris 13 + App Bridge 4. Built for the Shopify admin (iframe), mobile-friendly, and ready for billing, analytics, and offline development out of the box.

## What's included

- **Auth flow** — `shopify.idToken()` → `useAuthExchange` hook → axios `Bearer` interceptor, with `isNewInstall` propagated for onboarding gating.
- **Auth grace-period retry** — fresh-install 401/403/404s retry with exponential backoff (1s → 16s) while the token exchange is racing the first API calls. Both `api.ts` and `apphubApi.ts` share the same grace window.
- **Two API instances** — `api.ts` for your backend (`VITE_API_URL`) and `apphubApi.ts` for Apphub (token exchange + billing). Both auto-convert snake_case ↔ camelCase via `humps` and retry 5xx with a per-request budget.
- **Centralized env config** — `src/config/env.ts` is the single source of truth for `import.meta.env` reads. Typed, defaulted, ready to import everywhere.
- **Structured logger** — `src/lib/logger.ts` with feature-scoped levels (`log.feature("auth")`), pluggable sinks (`console`, `posthog`), and an exception-capturer hook. Declarative baseline in `src/config/logging.ts`; `VITE_LOG_LEVEL` / `VITE_LOG_SINKS` override at deploy time.
- **PostHog with global error capture** — production-only init, plus `window.error` and `unhandledrejection` handlers wired through the logger so uncaught crashes surface in PostHog automatically.
- **Billing** — `PlanContext` + `BillingPage` (responsive Polaris card grid). Define plans in `src/types/plan.ts`.
- **Help page** — TOC + article scaffold to host your in-app docs.
- **Onboarding state** — per-shop localStorage helpers with safe wrappers.
- **Reusable hooks** — `useAuthExchange` (boots App Bridge + token exchange), `useScrollToError` (auto-scrolls error banners into view).
- **MSW dev mode** — set `VITE_USE_MOCK=true` to run the UI without a backend.
- **Bundle splitting** — Polaris, PostHog, and React/Router/axios in their own chunks for faster iframe loads.
- **Testing** — Jest with two-suite split (unit / integration), MSW v2, Polaris-friendly jsdom env, `window.shopify` stub, Blob.arrayBuffer polyfill, humps CJS shim.

## Getting started

```bash
git clone <this-repo> my-app
cd my-app
npm install

# Generate the MSW service worker (only needed once, even if you don't use mocks today)
npx msw init public/

cp .env.example .env
# Edit .env — at minimum set VITE_SHOPIFY_API_KEY, VITE_APP_CODE, VITE_APPHUB_URL

npm run dev
```

Then either:

- Install the app on your dev store and open it from the Shopify admin (recommended), or
- Set `VITE_USE_MOCK=true` in `.env` and visit `http://localhost:3000/?shop=test.myshopify.com&host=...` to develop against MSW handlers without a backend.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SHOPIFY_API_KEY` | Yes | App client ID from Shopify Partner Dashboard. Injected into `<meta name="shopify-api-key">` for App Bridge. |
| `VITE_APP_CODE` | Yes | App identifier used by Apphub for `/exchange_token` and `/custom_shop_plans` endpoints. |
| `VITE_APPHUB_URL` | Yes | Base URL for the Apphub service. |
| `VITE_API_URL` | Yes | Base URL for your app's backend. |
| `VITE_DEV_STORE_URL` | No | Dev store domain used outside Shopify admin. |
| `VITE_USE_MOCK` | No | `true` to start MSW in the browser. Default `false`. |
| `VITE_POSTHOG_KEY` | No | When set, PostHog initializes; when empty, all PostHog calls are no-ops. |
| `VITE_POSTHOG_HOST` | No | PostHog ingestion host. Defaults to `https://us.i.posthog.com`. |
| `VITE_APP_HANDLE` | No | App handle used in the Shopify subscription return URL (Billing flow). |
| `VITE_LOG_LEVEL` | No | Override default log threshold (`debug` / `info` / `warn` / `error` / `silent`). |
| `VITE_LOG_SINKS` | No | Comma-separated list of active sinks (`console`, `posthog`). |
| `VITE_SUPPORT_EMAIL` | No | Support email shown in the footer. Default `steve@upatra.com`. |
| `VITE_SUPPORT_HINT` | No | Hint text under the support email. |

## Scripts

```bash
npm run dev       # Vite dev server on port 3000 (with Shopify CSP headers)
npm run build     # tsc -b && vite build (chunked output in dist/)
npm run preview   # Preview the production build
npm run lint      # ESLint
npm test          # Jest (two suites: unit + integration)
```

Run a single test file:

```bash
npx jest src/__tests__/api.test.tsx
```

## Architecture

See [CLAUDE.md](./CLAUDE.md) for a fuller architecture overview (auth flow diagram, API conventions, testing rules).

Quick map of `src/`:

```
src/
├── App.tsx                  Root; Polaris AppProvider + BrowserRouter
├── main.tsx                 Entry; bootstraps logger, conditionally starts MSW
├── components/
│   ├── AppShell.tsx         App Bridge wiring + routes + s-app-nav + footer
│   ├── CopyEmailLink.tsx
│   └── Footer.tsx
├── config/
│   ├── env.ts               Single source of truth for import.meta.env reads
│   └── logging.ts           Declarative logger config (per-feature thresholds)
├── context/
│   ├── AuthContext.tsx      idToken getter, shopifyDomain, isNewInstall
│   └── PlanContext.tsx      Active plan, activate/cancel, isInPlan helper
├── hooks/
│   ├── useAuthExchange.ts   Boots App Bridge token + Apphub exchange
│   └── useScrollToError.ts  Auto-scrolls error banners into view
├── lib/
│   ├── api.ts               Backend axios instance + auth grace-period retry
│   ├── apphubApi.ts         Apphub axios instance + billing functions
│   ├── logger.ts            Structured logger (feature scopes, multi-sink)
│   ├── posthog.ts           Analytics + global error handlers
│   ├── onboardingState.ts   Per-shop localStorage flag factory
│   └── misc.ts              Shopify domain normalization
├── mocks/
│   ├── browser.ts           MSW worker (browser dev mode)
│   └── handlers.ts          Apphub mocks
├── pages/
│   ├── BillingPage.tsx
│   ├── BillingPlanGrid.tsx
│   └── HelpPage.tsx
├── test/                    MSW server + jsdom env + humps shim
└── types/
    ├── plan.ts              Plan shapes + PlanType enum + ALL_PLANS array
    └── shopify-app-bridge.d.ts
```

## Mobile + Shopify constraints

Every UI surface is built with Polaris 13 primitives that adapt to the Shopify admin chrome and mobile viewports:

- `<Page>`, `<Layout>` + `<Layout.Section variant="oneThird">` for two-column → single-column collapse.
- `<InlineGrid columns={{ xs: 1, sm: 2, md: 4 }}>` for plan cards.
- `<InlineStack>` reflows automatically on narrow widths.
- Navigation uses `<s-app-nav>` + `<s-link>` so Shopify renders the native sidebar.
- `<TitleBar>` (App Bridge) for the header rather than a custom one.

Test at iPhone SE width (375px) before sign-off.

## Testing

- Pure functions — unit suite (`*.test.ts` in `src/__tests__/`).
- API + components — integration suite (`*.test.tsx`), with MSW mocking HTTP and the custom jsdom environment polyfilling `fetch`/`Blob`/`crypto` for MSW v2.
- Mock only at the HTTP boundary; never `jest.spyOn` axios or context internals.

See CLAUDE.md → Testing for the TDD workflow and naming conventions.
