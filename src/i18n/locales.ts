// Supported app locales. Everything else falls back to English.
// We follow the Shopify admin locale strictly (no in-app override),
// so the set here mirrors what Shopify admin exposes for these languages.

export const SUPPORTED_LOCALES = [
  "en",
  "ja",
  "zh-CN",
  "zh-TW",
  "fr",
  "de",
  "ko",
  "it",
  "es",
  "sv",
  "pt-BR",
  "pt-PT",
  "nl",
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

// Normalize a BCP-47-ish locale tag (e.g. "fr-CA", "zh-Hans-CN") to our
// supported set. Returns DEFAULT_LOCALE when nothing matches.
export function normalizeLocale(
  raw: string | null | undefined,
): SupportedLocale {
  if (!raw) return DEFAULT_LOCALE;
  const lower = raw.toLowerCase();
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("zh")) {
    // Traditional script tags: zh-TW, zh-HK, zh-MO, zh-Hant. Everything else
    // (zh, zh-CN, zh-SG, zh-Hans, zh-Hans-CN) maps to Simplified.
    if (
      lower.startsWith("zh-tw") ||
      lower.startsWith("zh-hk") ||
      lower.startsWith("zh-mo") ||
      lower.startsWith("zh-hant")
    ) {
      return "zh-TW";
    }
    return "zh-CN";
  }
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("it")) return "it";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("sv")) return "sv";
  if (lower.startsWith("pt")) {
    // European Portuguese: pt-PT. Bare "pt" and everything else (pt-BR,
    // pt-AO, pt-MZ) defaults to Brazilian since it has the larger speaker
    // base on Shopify.
    if (lower.startsWith("pt-pt")) return "pt-PT";
    return "pt-BR";
  }
  if (lower.startsWith("nl")) return "nl";
  if (lower.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}
