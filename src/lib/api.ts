import axios from "axios";
import { camelizeKeys, decamelizeKeys } from "humps";

const API_URL = import.meta.env?.VITE_API_URL ?? "";

const maxRetries = 3;
const retryInterval = 1000;

// Injected by AuthContext on app bootstrap — avoids importing React context here
let sessionTokenGetter: (() => Promise<string>) | null = null;

export function setSessionTokenGetter(getter: () => Promise<string>) {
  sessionTokenGetter = getter;
}

export function getSessionToken(): Promise<string> | null {
  return sessionTokenGetter ? sessionTokenGetter() : null;
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
    if (response && (response.status >= 500 || !response.status)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = config as any;
      cfg.__retryCount = (cfg.__retryCount ?? 0) + 1;
      if (cfg.__retryCount <= maxRetries) {
        return new Promise((resolve) =>
          setTimeout(() => resolve(apiInstance(config)), retryInterval),
        );
      }
    }
    return Promise.reject(error);
  },
);
