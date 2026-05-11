import axios from "axios";
import { camelizeKeys, decamelizeKeys } from "humps";
import { env } from "../config/env";
import { log } from "./logger";

const API_URL = env.apiUrl;
const APP_CODE = env.appCode;

const maxRetries = 3;
const retryInterval = 1000;

// Auth-retry tuning: covers the window where the offline token exchange is
// racing the first API calls (fresh install or reinstall). 5 retries with
// exponential backoff (1s, 2s, 4s, 8s, 16s) gives ~31s total — enough to
// absorb slow installs. The grace window keeps retries enabled for 15s after
// the exchange resolves to absorb DB-propagation lag on the backend.
const maxAuthRetries = 5;
const authGraceMs = 15000;

const authLog = log.feature("auth");

// Injected by AuthContext on app bootstrap — avoids importing React context here
let sessionTokenGetter: (() => Promise<string>) | null = null;

export function setSessionTokenGetter(getter: () => Promise<string>) {
  sessionTokenGetter = getter;
}

export function getSessionToken(): Promise<string> | null {
  return sessionTokenGetter ? sessionTokenGetter() : null;
}

// Coordinated with apphubApi.ts via these markers — both clients share the
// same grace window so any in-flight request can retry while the exchange
// is still racing.
let exchangeInFlight = false;
let exchangeResolvedAt: number | null = null;

export function markExchangeStart() {
  exchangeInFlight = true;
  exchangeResolvedAt = null;
}

export function markExchangeEnd() {
  exchangeInFlight = false;
  exchangeResolvedAt = Date.now();
}

export function isInAuthGracePeriod(): boolean {
  return (
    exchangeInFlight ||
    (exchangeResolvedAt !== null && Date.now() - exchangeResolvedAt < authGraceMs)
  );
}

/** Test-only: clear the grace period so 401/403/404 don't retry. */
export function resetAuthGracePeriodForTesting() {
  exchangeInFlight = false;
  exchangeResolvedAt = null;
}

export const apiInstance = axios.create({
  baseURL: API_URL,
});

apiInstance.interceptors.request.use(
  async (config) => {
    if (sessionTokenGetter) {
      const token = await sessionTokenGetter();
      config.headers = config.headers || {};
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    if (APP_CODE) {
      config.headers["x-app-code"] = APP_CODE;
    }
    if (config.data) {
      config.data = decamelizeKeys(config.data);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

apiInstance.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = camelizeKeys(response.data);
    }
    return response;
  },
  (error) => {
    const { config, response } = error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = config as any;

    if (response && (response.status >= 500 || !response.status)) {
      cfg.__retryCount = (cfg.__retryCount ?? 0) + 1;
      if (cfg.__retryCount <= maxRetries) {
        return new Promise((resolve) =>
          setTimeout(() => resolve(apiInstance(config)), retryInterval),
        );
      }
    }

    // Offline-token exchange race: while the apphub exchange is in flight (or
    // just resolved), the backend may not yet recognize the shop. Retry
    // 401/403/404 with backoff until either the call succeeds or the grace
    // window closes. (Stats endpoints can 404 instead of 401/403 when the
    // shop row hasn't been written yet, so include 404.)
    if (
      response &&
      (response.status === 401 ||
        response.status === 403 ||
        response.status === 404) &&
      isInAuthGracePeriod()
    ) {
      cfg.__authRetryCount = (cfg.__authRetryCount ?? 0) + 1;
      if (cfg.__authRetryCount <= maxAuthRetries) {
        const delay = 1000 * Math.pow(2, cfg.__authRetryCount - 1);
        authLog.info("retrying request during auth grace period", {
          status: response.status,
          attempt: cfg.__authRetryCount,
          delay,
          url: cfg?.url,
        });
        return new Promise((resolve) =>
          setTimeout(() => resolve(apiInstance(config)), delay),
        );
      }
    }

    return Promise.reject(error);
  },
);
