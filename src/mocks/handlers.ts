import { http, HttpResponse, delay } from "msw";

const APPHUB = import.meta.env.VITE_APPHUB_URL ?? "https://apphub.example.com";
const APP_CODE = import.meta.env.VITE_APP_CODE ?? "your-app-code";

function randomDelay() {
  return delay(200 + Math.random() * 300);
}

// Apphub mocks — token exchange + billing. Add backend mocks for VITE_API_URL
// alongside these as the app grows.
export const handlers = [
  // Always succeeds so the auth flow completes during local dev.
  http.get(`${APPHUB}/${APP_CODE}/exchange_token`, async () => {
    await randomDelay();
    return HttpResponse.json({ message: "ok", is_new_install: false });
  }),

  // Active plan — returns null by default (no subscription). Replace the body
  // with a sample plan object when you want the Billing page to show
  // "Activated" on a paid plan.
  http.get(`${APPHUB}/${APP_CODE}/custom_shop_plans`, async () => {
    await randomDelay();
    return HttpResponse.json({ plan: null });
  }),

  http.post(`${APPHUB}/${APP_CODE}/custom_shop_plans`, async () => {
    await randomDelay();
    return HttpResponse.json({
      confirmation_url: "https://example.com/billing/confirm",
    });
  }),

  http.delete(`${APPHUB}/${APP_CODE}/custom_shop_plans`, async () => {
    await randomDelay();
    return new HttpResponse(null, { status: 204 });
  }),
];
