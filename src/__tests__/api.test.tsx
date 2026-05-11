import { describe, it, expect, beforeAll, afterAll, afterEach } from "@jest/globals";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { apiInstance } from "../lib/api";
import { env } from "../config/env";

const BASE = env.apiUrl;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("api retry budget is per-request", () => {
  it(
    "concurrent requests that each fail once both eventually resolve independently",
    async () => {
      let healthCount = 0;
      let statusCount = 0;

      server.use(
        http.get(`${BASE}/v1/health`, () => {
          healthCount++;
          return healthCount === 1
            ? HttpResponse.json({ error: "fail" }, { status: 503 })
            : HttpResponse.json({ status: "ok" });
        }),
        http.get(`${BASE}/v1/status`, () => {
          statusCount++;
          return statusCount === 1
            ? HttpResponse.json({ error: "fail" }, { status: 503 })
            : HttpResponse.json({ ready: true });
        }),
      );

      const [health, status] = await Promise.all([
        apiInstance.get("/v1/health"),
        apiInstance.get("/v1/status"),
      ]);

      // Each request retried once independently — shared counter would have blocked one
      expect(healthCount).toBe(2);
      expect(statusCount).toBe(2);
      expect(health.data).toEqual({ status: "ok" });
      expect(status.data).toEqual({ ready: true });
    },
    10_000,
  );
});
