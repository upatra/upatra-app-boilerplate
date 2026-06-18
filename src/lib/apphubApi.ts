import axios, { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { camelizeKeys, decamelizeKeys } from "humps";
import {
  getSessionToken,
  isInAuthGracePeriod,
  markExchangeEnd,
  markExchangeStart,
} from "./api";
import { env } from "../config/env";
import { log } from "./logger";
import type { ApphubShopPlan, PlanInterval, ShopPlan } from "../types/plan";

const APPHUB_URL = env.apphubUrl;
const SHOPIFY_APP_CODE = env.appCode;

const maxRetries = 3;
const retryInterval = 1000;
const maxAuthRetries = 5;

const authLog = log.feature("auth");
const planLog = log.feature("plan");

const apphubInstance = axios.create({
  baseURL: APPHUB_URL,
});

apphubInstance.interceptors.request.use(
  async (config) => {
    const token = await getSessionToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    if (config.data) {
      config.data = decamelizeKeys(config.data);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

apphubInstance.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = camelizeKeys(response.data);
    }
    return response;
  },
  (error) => {
    const { config, response } = error;
    if (config && response && (response.status >= 500 || !response.status)) {
      const cfg = config as InternalAxiosRequestConfig & {
        __retryCount?: number;
      };
      cfg.__retryCount = (cfg.__retryCount ?? 0) + 1;
      if (cfg.__retryCount <= maxRetries) {
        return new Promise((resolve) =>
          setTimeout(() => resolve(apphubInstance(config)), retryInterval),
        );
      }
    }

    // Apphub plan endpoints can 401/403/404 while the shop row is being
    // provisioned. Retry within the auth grace window so the billing page
    // doesn't flash an error during fresh installs. Skip the exchange_token
    // endpoint itself — that call IS the grace-period source, retrying it
    // would deadlock with itself.
    const url = (config?.url as string | undefined) ?? "";
    const isExchange = url.includes("/exchange_token");
    if (
      config &&
      !isExchange &&
      response &&
      (response.status === 401 ||
        response.status === 403 ||
        response.status === 404) &&
      isInAuthGracePeriod()
    ) {
      const cfg = config as InternalAxiosRequestConfig & {
        __authRetryCount?: number;
      };
      cfg.__authRetryCount = (cfg.__authRetryCount ?? 0) + 1;
      if (cfg.__authRetryCount <= maxAuthRetries) {
        const delay = 1000 * Math.pow(2, cfg.__authRetryCount - 1);
        authLog.info("retrying apphub request during auth grace period", {
          status: response.status,
          attempt: cfg.__authRetryCount,
          delay,
          url: cfg?.url,
        });
        return new Promise((resolve) =>
          setTimeout(() => resolve(apphubInstance(config)), delay),
        );
      }
    }

    return Promise.reject(error);
  },
);

export class UnprocessableEntity extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnprocessableEntity";
  }
}

/** One entry in apphub's public Upatra-app catalog (`GET /apps`). Keys are
 *  camelized from the snake_case wire shape by the response interceptor. */
export interface AppCatalogEntry {
  appCode: string;
  appSlug: string;
  appName: string;
  description: string;
  status: "live" | "coming_soon";
  /** base64 PNG `data:` URI, or null for apps without an icon yet. */
  icon: string | null;
}

/** Fetch the portfolio app catalog (excluding the current app) for the "More
 *  Upatra apps" directory and the cross-app promo banner.
 *
 *  Passes the current app's code as both `app_code` (so apphub verifies the
 *  session token against this app's secret and can resolve the shop's
 *  `installed_apps`) and `exclude` (so the merchant's current app is left out),
 *  plus the active `locale` so descriptions come back localized (English
 *  fallback).
 *
 *  By default returns the full catalog — the directory page lists every other
 *  Upatra app regardless of install state. Pass `excludeInstalled: true` (the
 *  promo banner) to additionally drop apps the shop already has, using the
 *  authenticated `installed_apps` field. Anonymous/expired tokens omit
 *  `installed_apps`, so the full catalog passes through unchanged.
 *
 *  Returns [] on error so the directory page / banner degrade to empty rather
 *  than crashing. */
export async function getAppCatalog(
  locale?: string,
  opts?: { excludeInstalled?: boolean },
): Promise<AppCatalogEntry[]> {
  try {
    const response = await apphubInstance.get("/apps", {
      params: {
        // Query params are not decamelized by the request interceptor (it only
        // touches `config.data`), so send the wire key `app_code` directly.
        ...(SHOPIFY_APP_CODE
          ? { app_code: SHOPIFY_APP_CODE, exclude: SHOPIFY_APP_CODE }
          : {}),
        ...(locale ? { locale } : {}),
      },
    });
    const apps = (response.data?.apps ?? []) as AppCatalogEntry[];
    if (!opts?.excludeInstalled) return apps;
    const installed = (response.data?.installedApps ?? []) as string[];
    if (installed.length === 0) return apps;
    const installedSet = new Set(installed);
    return apps.filter((a) => !installedSet.has(a.appCode));
  } catch (e) {
    log.exception(e, { where: "getAppCatalog" });
    return [];
  }
}

export async function exchangeShopifyToken(shop: string, code: string) {
  markExchangeStart();
  try {
    const params = { shop, code };
    const response = await apphubInstance.get(
      `/${SHOPIFY_APP_CODE}/exchange_token`,
      { params },
    );
    return {
      message: response.data.message as string | undefined,
      isNewInstall: response.data.isNewInstall as boolean | undefined,
    };
  } catch (e) {
    const error = e as AxiosResponse;
    if (axios.isAxiosError(error)) {
      if (
        error.response &&
        [404, 422, 401, 403].includes(error.response.status)
      ) {
        return null;
      }
      throw new Error(error.response?.data);
    }
    authLog.exception(error, { where: "exchangeShopifyToken" });
    return { error };
  } finally {
    markExchangeEnd();
  }
}

function mapApphubShopPlan(
  raw: ApphubShopPlan,
  shopifyDomain: string,
): ShopPlan {
  // The activated plan id is round-tripped through the returnUrl when the
  // app initiates the subscription — Shopify echoes it back unchanged.
  let upatraPlanId = "";
  try {
    upatraPlanId = new URL(raw.returnUrl).searchParams.get("activated") ?? "";
  } catch {
    // returnUrl missing or malformed; leave id empty
  }
  return {
    shopifyDomain,
    name: raw.name,
    price: raw.price,
    activatedOn: raw.activatedOn,
    upatraPlanId,
  };
}

export async function getActivePlan(
  shopifyDomain: string,
): Promise<ShopPlan | undefined> {
  try {
    const response = await apphubInstance.get(
      `/${SHOPIFY_APP_CODE}/custom_shop_plans`,
    );
    const plan = response.data?.plan as ApphubShopPlan | undefined;
    if (!plan) return undefined;
    return mapApphubShopPlan(plan, shopifyDomain);
  } catch {
    return undefined;
  }
}

export async function activePlan(
  planName: string,
  planInterval: PlanInterval,
  amount: string,
  returnUrl: string,
  isTest: boolean,
): Promise<string> {
  try {
    const response = await apphubInstance.post(
      `/${SHOPIFY_APP_CODE}/custom_shop_plans`,
      { planName, planInterval, amount, returnUrl, isTest },
    );
    return response.data.confirmationUrl as string;
  } catch (e) {
    const error = e as AxiosResponse;
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data);
    }
    planLog.exception(error, { where: "activePlan" });
    throw e;
  }
}

export async function cancelPlan(): Promise<void> {
  try {
    await apphubInstance.delete(`/${SHOPIFY_APP_CODE}/custom_shop_plans`);
  } catch (e) {
    const error = e as AxiosResponse;
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data);
    }
    planLog.exception(error, { where: "cancelPlan" });
    throw e;
  }
}
