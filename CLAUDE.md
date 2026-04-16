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

Copy `.env.example` to `.env` and fill in:
- `VITE_SHOPIFY_API_KEY` — Shopify app client ID (from Partner Dashboard > Apps > Client credentials)
- `VITE_DEV_STORE_URL` — Dev store domain for local development outside Shopify admin
- `VITE_API_URL` — Your backend API base URL
- `VITE_APP_CODE` — App code identifier used by Apphub token exchange + billing
- `VITE_APPHUB_URL` — Apphub service base URL (handles Shopify token exchange)
- `VITE_USE_MOCK` — Set `true` to run the app against MSW handlers (no backend required). Run `npx msw init public/` once before first use.
- `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` — Optional. PostHog stays inert when the key is empty.

## Architecture

This is a **Shopify embedded app** boilerplate (React + Vite) using Shopify Polaris 13 and App Bridge. The backend is a separate service (not in this repo).

### Auth Flow

```
Shopify Admin (iframe)
  └── App Bridge (window.shopify)
        └── shopify.idToken()
              └── AuthContext (setSessionTokenGetter)
                    └── api.ts interceptor (Bearer token on every request)
                          └── apphubApi.ts (token exchange on bootstrap)
```

1. `AppShell` calls `shopify.idToken()` on mount and passes it to `exchangeShopifyToken()`
2. `AuthContext` calls `setSessionTokenGetter(() => shopify.idToken())` — injects the getter into `api.ts` without importing React context there
3. Every `apiInstance` request automatically gets a fresh `Authorization: Bearer <token>` header
4. The token exchange resolves with `isNewInstall`, which AppShell propagates into `AuthContext` for onboarding gating (`useAuth().isNewInstall`)

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

### Analytics (`posthog.ts`)

`initPostHog()` runs once in `AppShell`; it's a no-op unless `VITE_POSTHOG_KEY` is set. Use:
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

### Mock mode (MSW)

When `VITE_USE_MOCK=true`, `src/main.tsx` starts the MSW worker before mounting React. Handlers live in `src/mocks/handlers.ts` (Apphub mocks for token exchange + billing out of the box — extend with backend mocks alongside). Run `npx msw init public/` once after install to generate the service worker.

### State Management

No global state library. Add React Context + `useReducer` per feature as needed (see `src/context/` for the auth example).

### API Layer

`src/lib/api.ts` — Axios instance for the app's own backend (`VITE_API_URL`):
- Auto snake_case ↔ camelCase conversion via `humps`
- Retry on 5xx (3 retries, 1s delay, per-request budget — concurrent requests retry independently)
- Session token injected per-request via `setSessionTokenGetter` abstraction

`src/lib/apphubApi.ts` — Apphub instance for Shopify token exchange and billing endpoints (`exchangeShopifyToken`, `getActivePlan`, `activePlan`, `cancelPlan`). Same conventions as `api.ts`.

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
- `src/test/setup.ts` — jest-dom matchers + Polaris `matchMedia` polyfill
- `src/test/shims/` — CJS shims for packages that lack ESM named exports
