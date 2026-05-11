import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  jest,
} from "@jest/globals";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  apiInstance,
  markExchangeEnd,
  markExchangeStart,
  resetAuthGracePeriodForTesting,
} from "../lib/api";
import { env } from "../config/env";

const BASE = env.apiUrl;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  resetAuthGracePeriodForTesting();
  jest.useRealTimers();
});
afterAll(() => server.close());

describe("api auth grace-period retry", () => {
  it(
    "retries 401 with backoff while exchange is in flight",
    async () => {
      let count = 0;
      server.use(
        http.get(`${BASE}/v1/me`, () => {
          count++;
          if (count === 1) {
            return HttpResponse.json({ error: "unauthorized" }, { status: 401 });
          }
          return HttpResponse.json({ ok: true });
        }),
      );

      markExchangeStart();
      try {
        const res = await apiInstance.get("/v1/me");
        expect(count).toBe(2);
        expect(res.data).toEqual({ ok: true });
      } finally {
        markExchangeEnd();
      }
    },
    15_000,
  );

  it(
    "does not retry 401 once grace window has fully elapsed",
    async () => {
      let count = 0;
      server.use(
        http.get(`${BASE}/v1/me`, () => {
          count++;
          return HttpResponse.json({ error: "unauthorized" }, { status: 401 });
        }),
      );

      // No markExchangeStart — exchangeInFlight=false and resolvedAt=null
      // means isInAuthGracePeriod() returns false.

      await expect(apiInstance.get("/v1/me")).rejects.toBeDefined();
      expect(count).toBe(1);
    },
    10_000,
  );
});
