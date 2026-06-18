// Cross-app promo banner: per-shop app selection, dismiss backoff, and the
// outbound App Store URL with UTM attribution. Pure functions + localStorage —
// no React, so it's unit-testable in isolation.
//
// Design notes:
//   * Which app to show follows an explicit priority list (operator decision):
//     aiz_exporter to every shop, then bulk_tagging once aiz is installed (and
//     so filtered out of the catalog upstream). Apps outside the preference
//     list fall back to a stable per-shop hash bucket so the banner still shows
//     something rather than going empty.
//   * Dismiss uses an escalating backoff (1→3→7→30 days) rather than a
//     permanent hide, shared across placements per shop, so a busy daily user
//     isn't nagged but the banner isn't gone forever either.

import type { AppCatalogEntry } from "./apphubApi";

const COUNT_KEY = "upatra_cross_app_dismiss_count";
const TS_KEY = "upatra_cross_app_dismissed_at";

const key = (base: string, shop: string) => `${base}:${shop || "_"}`;

const safeGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // ignore (private mode, quota, etc.)
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

// After the Nth dismissal, wait this long before showing again. The last delay
// (30 days) sticks once the schedule is exhausted.
const BACKOFF_MS = [1 * DAY_MS, 3 * DAY_MS, 7 * DAY_MS, 30 * DAY_MS];

export function getCrossAppDismissCount(shop: string): number {
  const raw = safeGet(key(COUNT_KEY, shop));
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Eligible to show now? Honors the escalating dismiss backoff. */
export function shouldShowCrossAppBanner(
  shop: string,
  now: number = Date.now(),
): boolean {
  const count = getCrossAppDismissCount(shop);
  if (count === 0) return true;
  const lastRaw = safeGet(key(TS_KEY, shop));
  const last = lastRaw ? parseInt(lastRaw, 10) : 0;
  if (!Number.isFinite(last) || last <= 0) return true;
  const delay = BACKOFF_MS[Math.min(count - 1, BACKOFF_MS.length - 1)];
  return now - last >= delay;
}

/** Record a dismissal and return the new dismiss count (for analytics). */
export function dismissCrossAppBanner(
  shop: string,
  now: number = Date.now(),
): number {
  const count = getCrossAppDismissCount(shop) + 1;
  safeSet(key(COUNT_KEY, shop), String(count));
  safeSet(key(TS_KEY, shop), String(now));
  return count;
}

// FNV-1a (32-bit) — small, dependency-free, well-distributed for short strings.
// Deterministic across reloads/devices so a shop's banner arm is stable.
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Ordered preference for which app the cross-app banner promotes in every
// placement (operator decision):
//   1. aiz_exporter — shown to every shop that doesn't already have it.
//   2. bulk_tagging — the fallback once aiz is installed (filtered out upstream).
// First promotable (live + not-installed) entry wins. Kept as a one-line array
// so the order is trivial to change for a given app's cross-sell strategy.
const PREFERRED_APP_CODES = ["aiz_exporter", "bulk_tagging"];

/**
 * Choose which catalog app to promote for this shop. Considers only `live`
 * apps (coming_soon are not installable). Walks {@link PREFERRED_APP_CODES} in
 * order and returns the first one still promotable — so every shop sees
 * aiz_exporter, and a shop that already has aiz installed (it's filtered out
 * upstream) sees bulk_tagging instead. Falls back to a stable per-shop hash
 * bucket over any remaining live apps not in the preference list, so the banner
 * still shows a useful cross-promo instead of going empty. Returns null when
 * there's nothing promotable.
 */
export function pickCrossAppArm(
  shop: string,
  catalog: AppCatalogEntry[],
): AppCatalogEntry | null {
  const live = catalog
    .filter((a) => a.status === "live")
    .sort((a, b) => a.appCode.localeCompare(b.appCode));
  if (live.length === 0) return null;
  for (const code of PREFERRED_APP_CODES) {
    const match = live.find((a) => a.appCode === code);
    if (match) return match;
  }
  const idx = hashString(shop) % live.length;
  return live[idx];
}

/**
 * Benefit-led, context-aware one-liner shown in the banner body instead of the
 * generic apphub catalog `description`. The catalog blurb describes the app in
 * the abstract; a merchant already inside another app needs a reason to click
 * *now*, so these lead with the outcome. Falls back to the catalog description
 * for any app not enumerated here (e.g. a new app added to the catalog before
 * this map is updated).
 *
 * Keyed by apphub appCode. Kept here (pure, no React/i18n) so it's unit-testable
 * and so the component stays a thin renderer.
 */
export function crossAppPitch(appCode: string, fallback: string): string {
  switch (appCode) {
    case "bulk_tagging":
      return "Auto-tag orders, products & customers by rule — and tag in bulk by hand or CSV. Keep your store organized without the busywork.";
    case "aiz_exporter":
      return "Schedule CSV, Excel or JSON exports of orders, products & customers — filtered your way and auto-delivered to email, FTP or Google Sheets.";
    default:
      return fallback;
  }
}

/** App Store listing URL with UTM attribution matching the More Apps page
 *  convention (utm_source = host app, utm_campaign = surface). `utmSource` is
 *  passed in (the caller derives it from env) so this module stays pure and
 *  unit-testable without pulling import.meta.env. */
export function crossAppStoreUrl(
  slug: string,
  placement: string,
  utmSource: string,
): string {
  const params = new URLSearchParams({
    utm_source: utmSource || "upatra-app",
    utm_medium: "in_app",
    utm_campaign: "cross_app_banner",
    utm_content: placement,
  });
  return `https://apps.shopify.com/${slug}?${params.toString()}`;
}
