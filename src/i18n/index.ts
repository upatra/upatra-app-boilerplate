import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { env } from "../config/env";
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
  normalizeLocale,
} from "./locales";
import enCommon from "./locales/en/common.json";

export type { SupportedLocale } from "./locales";
export { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./locales";

// Add a namespace by:
//   1. Creating src/i18n/locales/<locale>/<namespace>.json (en is required)
//   2. Statically importing the en copy below (en is always bundled)
//   3. Listing the namespace name here
// Non-en locales are loaded on demand via the glob in NON_EN_LOCALE_MODULES.
export const NAMESPACES = ["common"] as const;
type Namespace = (typeof NAMESPACES)[number];

// Static resource shape for one locale.
type LocaleResources = Record<Namespace, Record<string, unknown>>;

// English is statically bundled (it's the fallback and always required).
const EN_RESOURCES: LocaleResources = {
  common: enCommon,
};

interface ShopifyGlobal {
  shopify?: {
    config?: {
      locale?: string;
    };
  };
}

// Read the Shopify admin locale exposed by App Bridge. App Bridge is loaded
// via <script> in index.html before main.tsx runs, so `window.shopify` is
// typically defined synchronously here. Falls back to navigator.language.
// When VITE_ENABLE_I18N is "false", always pin to English regardless of the
// Shopify admin locale.
export function getInitialLocale(): SupportedLocale {
  if (!env.enableI18n) return DEFAULT_LOCALE;

  const fromShopify =
    (typeof window !== "undefined" &&
      (window as unknown as ShopifyGlobal).shopify?.config?.locale) ||
    null;
  if (fromShopify) return normalizeLocale(fromShopify);

  const fromNavigator =
    typeof navigator !== "undefined" ? navigator.language : null;
  return normalizeLocale(fromNavigator);
}

// Polaris translations as a recursive dictionary — shape matches Polaris's
// internal `TranslationDictionary` so it can be passed straight to
// <AppProvider i18n={...}>.
export interface PolarisTranslations {
  [key: string]: string | PolarisTranslations;
}

// Non-English locale JSONs are loaded on demand. English is excluded from the
// glob because it's already statically imported above; including it here would
// trigger Rollup's "dynamically and statically imported" warning without any
// chunking benefit (the static import always wins).
const NON_EN_LOCALE_MODULES = import.meta.glob<{
  default: Record<string, unknown>;
}>(["./locales/*/*.json", "!./locales/en/**"]);

async function loadLocaleResources(
  locale: SupportedLocale,
): Promise<LocaleResources> {
  if (locale === "en") return EN_RESOURCES;
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const key = `./locales/${locale}/${ns}.json`;
      const loader = NON_EN_LOCALE_MODULES[key];
      if (!loader) throw new Error(`Missing locale resource: ${key}`);
      const mod = await loader();
      return [ns, mod.default] as const;
    }),
  );
  return Object.fromEntries(entries) as LocaleResources;
}

// Static dynamic imports — Vite can only pre-bundle node_modules JSON imports
// when each path is a literal string. A template-literal `import()` leaks the
// bare specifier to the browser at runtime ("Failed to resolve module
// specifier '@shopify/polaris/locales/de.json'").
async function loadPolarisTranslations(
  locale: SupportedLocale,
): Promise<PolarisTranslations> {
  switch (locale) {
    case "ja":
      return (await import("@shopify/polaris/locales/ja.json")).default;
    case "zh-CN":
      return (await import("@shopify/polaris/locales/zh-CN.json")).default;
    case "zh-TW":
      return (await import("@shopify/polaris/locales/zh-TW.json")).default;
    case "fr":
      return (await import("@shopify/polaris/locales/fr.json")).default;
    case "de":
      return (await import("@shopify/polaris/locales/de.json")).default;
    case "ko":
      return (await import("@shopify/polaris/locales/ko.json")).default;
    case "it":
      return (await import("@shopify/polaris/locales/it.json")).default;
    case "es":
      return (await import("@shopify/polaris/locales/es.json")).default;
    case "sv":
      return (await import("@shopify/polaris/locales/sv.json")).default;
    case "pt-BR":
      return (await import("@shopify/polaris/locales/pt-BR.json")).default;
    case "pt-PT":
      return (await import("@shopify/polaris/locales/pt-PT.json")).default;
    case "nl":
      return (await import("@shopify/polaris/locales/nl.json")).default;
    case "en":
    default:
      return (await import("@shopify/polaris/locales/en.json")).default;
  }
}

interface InitResult {
  locale: SupportedLocale;
  polarisTranslations: PolarisTranslations;
}

let initPromise: Promise<InitResult> | null = null;

export function initI18n(): Promise<InitResult> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const detected = getInitialLocale();

    // If a non-English locale fails to load (missing JSON, network hiccup,
    // unexpected Shopify locale that slipped past normalizeLocale), fall
    // back to English rather than crashing the app bootstrap.
    let locale: SupportedLocale = detected;
    let active: LocaleResources = EN_RESOURCES;
    let polarisTranslations: PolarisTranslations;
    try {
      [active, polarisTranslations] = await Promise.all([
        loadLocaleResources(detected),
        loadPolarisTranslations(detected),
      ]);
    } catch (err) {
      console.warn(
        `[i18n] Failed to load locale "${detected}", falling back to "${DEFAULT_LOCALE}".`,
        err,
      );
      locale = DEFAULT_LOCALE;
      active = EN_RESOURCES;
      polarisTranslations = (await import("@shopify/polaris/locales/en.json"))
        .default;
    }

    const resources: Record<string, LocaleResources> = {
      en: EN_RESOURCES,
    };
    if (locale !== "en") resources[locale] = active;

    await i18n.use(initReactI18next).init({
      lng: locale,
      fallbackLng: DEFAULT_LOCALE,
      defaultNS: "common",
      ns: NAMESPACES as unknown as string[],
      resources,
      interpolation: { escapeValue: false },
      returnNull: false,
    });

    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }

    return { locale, polarisTranslations };
  })();
  return initPromise;
}
