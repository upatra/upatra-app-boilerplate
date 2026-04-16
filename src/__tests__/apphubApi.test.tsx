import { describe, it, expect, beforeAll, afterAll, afterEach } from "@jest/globals";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { exchangeShopifyToken, getActivePlan } from "../lib/apphubApi";

const APPHUB = (import.meta.env?.VITE_APPHUB_URL ?? "") as string;
const APP_CODE = (import.meta.env?.VITE_APP_CODE ?? "") as string;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("exchangeShopifyToken", () => {
  it("returns message and isNewInstall, camelizing snake_case response keys", async () => {
    server.use(
      http.get(`${APPHUB}/${APP_CODE}/exchange_token`, () =>
        HttpResponse.json({ message: "ok", is_new_install: true }),
      ),
    );

    const res = await exchangeShopifyToken("test.myshopify.com", "code-123");

    expect(res).toEqual({ message: "ok", isNewInstall: true });
  });

  it("returns null for client errors so AppShell can continue rendering", async () => {
    server.use(
      http.get(`${APPHUB}/${APP_CODE}/exchange_token`, () =>
        HttpResponse.json({ error: "not found" }, { status: 404 }),
      ),
    );

    const res = await exchangeShopifyToken("test.myshopify.com", "bad");

    expect(res).toBeNull();
  });
});

describe("getActivePlan", () => {
  it("maps Apphub response to ShopPlan with camelCase fields", async () => {
    server.use(
      http.get(`${APPHUB}/${APP_CODE}/custom_shop_plans`, () =>
        HttpResponse.json({
          plan: {
            id: 1,
            name: "Pro",
            price: "29.99",
            activated_on: "2026-01-01",
            return_url: "https://example.com/billing?activated=PRO_MONTHLY",
            status: "active",
            billing_on: "2026-02-01",
            cancelled_on: null,
            trial_days: 0,
            trial_ends_on: "",
            currency: "USD",
            test: false,
          },
        }),
      ),
    );

    const plan = await getActivePlan("test.myshopify.com");

    expect(plan).toEqual({
      shopifyDomain: "test.myshopify.com",
      name: "Pro",
      price: "29.99",
      activatedOn: "2026-01-01",
      upatraPlanId: "PRO_MONTHLY",
    });
  });

  it("returns undefined when Apphub reports no active plan", async () => {
    server.use(
      http.get(`${APPHUB}/${APP_CODE}/custom_shop_plans`, () =>
        HttpResponse.json({ plan: null }),
      ),
    );

    const plan = await getActivePlan("test.myshopify.com");

    expect(plan).toBeUndefined();
  });
});
