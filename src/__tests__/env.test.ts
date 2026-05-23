import { describe, it, expect } from "@jest/globals";
import { env } from "../config/env";

describe("env exposes typed read-only env values", () => {
  it("exposes string keys without throwing when env is empty", () => {
    expect(typeof env.apiUrl).toBe("string");
    expect(typeof env.appCode).toBe("string");
    expect(typeof env.apphubUrl).toBe("string");
    expect(typeof env.shopifyApiKey).toBe("string");
  });

  it("falls back to default support email when not provided", () => {
    expect(env.supportEmail).toBe("steve@upatra.com");
  });

  it("falls back to US PostHog host when not provided", () => {
    expect(env.posthogHost).toBe("https://us.i.posthog.com");
  });

  it("isProd is a boolean", () => {
    expect(typeof env.isProd).toBe("boolean");
  });

  it("useMock is a boolean (false unless explicitly 'true')", () => {
    expect(typeof env.useMock).toBe("boolean");
    expect(env.useMock).toBe(false);
  });

  it("enableReviewPrompt defaults to true when env is empty", () => {
    expect(typeof env.enableReviewPrompt).toBe("boolean");
    expect(env.enableReviewPrompt).toBe(true);
  });
});
