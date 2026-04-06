import axios, { AxiosResponse } from "axios";
import { getSessionToken } from "./api";

const APPHUB_URL = import.meta.env?.VITE_APPHUB_URL ?? "";
const SHOPIFY_APP_CODE = import.meta.env?.VITE_APP_CODE ?? "";

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
    return config;
  },
  (error) => Promise.reject(error),
);

export async function exchangeShopifyToken(shop: string, code: string) {
  try {
    const params = { shop, code };
    const response = await apphubInstance.get(`/${SHOPIFY_APP_CODE}/exchange_token`, { params });
    return { message: response.data.message };
  } catch (e) {
    const error = e as AxiosResponse;
    if (axios.isAxiosError(error)) {
      if (error.response && [404, 422, 401, 403].includes(error.response.status)) {
        return null;
      } else {
        throw new Error(error.response?.data);
      }
    } else {
      console.error(error);
    }
    return { error };
  }
}
