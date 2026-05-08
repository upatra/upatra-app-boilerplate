import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  configureLogger,
  log,
  resetLoggerConfig,
  setExceptionCapturer,
  resetExceptionCapturerForTesting,
  type LogContext,
} from "../lib/logger";

describe("logger respects level threshold", () => {
  beforeEach(() => {
    resetLoggerConfig();
    resetExceptionCapturerForTesting();
  });

  it("drops debug messages when level is info", () => {
    configureLogger({ level: "info" });
    const spy = jest.spyOn(console, "debug").mockImplementation(() => {});
    log.debug("hidden");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("emits warn messages at info level", () => {
    configureLogger({ level: "info" });
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    log.warn("visible");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("silent level drops everything", () => {
    configureLogger({ level: "silent" });
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    log.error("nope");
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("logger applies feature-level overrides over default level", () => {
  beforeEach(() => {
    resetLoggerConfig();
    resetExceptionCapturerForTesting();
  });

  it("feature override raises threshold above default", () => {
    configureLogger({ level: "debug", featureLevels: { auth: "warn" } });
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    log.feature("auth").info("dropped");
    log.info("emitted");
    expect(infoSpy).toHaveBeenCalledTimes(1);
    infoSpy.mockRestore();
  });

  it("feature override lowers threshold below default", () => {
    configureLogger({ level: "warn", featureLevels: { auth: "debug" } });
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    log.feature("auth").debug("emitted");
    expect(debugSpy).toHaveBeenCalledTimes(1);
    debugSpy.mockRestore();
  });
});

describe("logger forwards exceptions to PostHog when sink is enabled", () => {
  beforeEach(() => {
    resetLoggerConfig();
    resetExceptionCapturerForTesting();
  });

  it("calls captureException with the error and merged feature context", () => {
    const captureException = jest.fn();
    setExceptionCapturer(() => ({ captureException }));
    configureLogger({ level: "error", sinks: ["console", "posthog"] });
    jest.spyOn(console, "error").mockImplementation(() => {});

    const err = new Error("boom");
    log.feature("auth").exception(err, { where: "test" });

    expect(captureException).toHaveBeenCalledTimes(1);
    const [arg, ctx] = captureException.mock.calls[0] as [
      Error,
      LogContext | undefined,
    ];
    expect(arg).toBe(err);
    expect(ctx).toEqual({ feature: "auth", where: "test" });
  });

  it("does not call PostHog when sink is not active", () => {
    const captureException = jest.fn();
    setExceptionCapturer(() => ({ captureException }));
    configureLogger({ level: "error", sinks: ["console"] });
    jest.spyOn(console, "error").mockImplementation(() => {});

    log.exception(new Error("ignored"));

    expect(captureException).not.toHaveBeenCalled();
  });
});
