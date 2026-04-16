import axios, { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { camelizeKeys, decamelizeKeys } from "humps";
import { getSessionToken } from "./api";
import type { ApphubShopPlan, PlanInterval, ShopPlan } from "../types/plan";

const APPHUB_URL = import.meta.env?.VITE_APPHUB_URL ?? "";
const SHOPIFY_APP_CODE = import.meta.env?.VITE_APP_CODE ?? "";

const maxRetries = 3;
const retryInterval = 1000;

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
      const cfg = config as InternalAxiosRequestConfig & { __retryCount?: number };
      cfg.__retryCount = (cfg.__retryCount ?? 0) + 1;
      if (cfg.__retryCount <= maxRetries) {
        return new Promise((resolve) =>
          setTimeout(() => resolve(apphubInstance(config)), retryInterval),
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

export async function exchangeShopifyToken(shop: string, code: string) {
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
    console.error(error);
    return { error };
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
    console.error(error);
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
    console.error(error);
    throw e;
  }
}
