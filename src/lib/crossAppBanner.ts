// Cross-app promo banner: per-shop app selection, dismiss backoff, and the
// outbound App Store URL with UTM attribution. Pure functions + localStorage —
// no React, so it's unit-testable in isolation.
//
// Design notes:
//   * Which app to show is a flat rotation across the apps in BANNER_APP_CODES
//     (operator decision: aiz_exporter + bulk_image_upload). A shop that
//     already has one installed has it filtered out of the catalog upstream and
//     sees the other; with both promotable a stable per-shop hash splits them
//     ~50/50 so a shop's arm never flips and click→install attribution by `app`
//     stays clean.
//   * Dismiss uses an escalating backoff (1→3→7→30 days) rather than a
//     permanent hide, shared across placements per shop, so a busy daily user
//     isn't nagged but the banner isn't gone forever either.
//   * Attention management: a shop that ignores the banner N times (no click)
//     soft-dismisses itself and rests; new installs get a more generous
//     threshold while they explore; the pitch rotates per rest cycle so a
//     re-shown banner leads with a fresh angle.

import type { AppCatalogEntry } from "./apphubApi";

const COUNT_KEY = "upatra_cross_app_dismiss_count";
const TS_KEY = "upatra_cross_app_dismissed_at";
// Impressions since the last rest/click. Drives the "auto-backoff on ignore"
// path (below): a shop that sees the banner this many times without ever
// clicking is treated as a soft dismiss and rested, so we stop burning
// impressions on the ~98% who never click and never actively dismiss.
const SHOWN_KEY = "upatra_cross_app_shown_count";
// Set to "1" once a shop has ever clicked the banner. Reserved for the
// new-install window logic (an engaged shop is never force-quieted).
const ENGAGED_KEY = "upatra_cross_app_engaged";
// Timestamp (ms) stamped the first time we observe this shop as a fresh
// install (apphub's isNewInstall). Absent for shops that installed before this
// shipped — correctly treated as "established", not "new".
const INSTALL_KEY = "upatra_cross_app_install_at";

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

// "Auto-backoff on ignore" threshold: after this many impressions with no
// click, the banner soft-dismisses itself (rests via the same escalating
// backoff as an active dismiss), then comes back later. A shop in its
// new-install window gets a more generous threshold (it's still exploring);
// an established, never-engaged shop gets a tighter one (cut the wasted spend).
// See ignoreThreshold().
const ESTABLISHED_IGNORE_THRESHOLD = 3;
// New installs are exploring the store — show the cross-sell more freely for
// the first week before falling back to the quieter established cadence.
const NEW_INSTALL_IGNORE_THRESHOLD = 8;
const NEW_INSTALL_WINDOW_MS = 7 * DAY_MS;

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

function getInt(base: string, shop: string): number {
  const raw = safeGet(key(base, shop));
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Stamp the moment this shop installed (idempotent — only the first call
 * sticks). Driven by apphub's `isNewInstall`, so it fires once at install and
 * is the anchor for the new-install window. Shops that installed before this
 * shipped never get stamped, and so read as "established".
 */
export function stampCrossAppInstall(
  shop: string,
  now: number = Date.now(),
): void {
  if (!safeGet(key(INSTALL_KEY, shop))) {
    safeSet(key(INSTALL_KEY, shop), String(now));
  }
}

/** Within the first {@link NEW_INSTALL_WINDOW_MS} of install? Unknown install
 *  date (no stamp) ⇒ false (established), the safe default for old shops. */
function inNewInstallWindow(shop: string, now: number): boolean {
  const raw = safeGet(key(INSTALL_KEY, shop));
  if (!raw) return false;
  const t = parseInt(raw, 10);
  return Number.isFinite(t) && t > 0 && now - t < NEW_INSTALL_WINDOW_MS;
}

/**
 * How many no-click impressions a shop tolerates before the banner rests
 * itself. New installs (first week) get a generous threshold while they're
 * exploring; established shops get the tighter one so we stop spending
 * impressions on a base that has decided not to click.
 */
function ignoreThreshold(shop: string, now: number): number {
  return inNewInstallWindow(shop, now)
    ? NEW_INSTALL_IGNORE_THRESHOLD
    : ESTABLISHED_IGNORE_THRESHOLD;
}

/**
 * Record that the banner was shown to this shop. Returns `{ rested: true }`
 * when this impression tips the shop over its {@link ignoreThreshold} and the
 * banner soft-dismisses (advancing the same escalating backoff as an active
 * dismiss, then resetting the impression counter so the cycle repeats after
 * the rest). Pure localStorage; safe to call once per render of a shown banner.
 */
export function recordCrossAppImpression(
  shop: string,
  now: number = Date.now(),
): { rested: boolean } {
  const next = getInt(SHOWN_KEY, shop) + 1;
  if (next >= ignoreThreshold(shop, now)) {
    // Soft dismiss: same machinery as a hard dismiss (escalating backoff), but
    // no analytics event — the merchant didn't act, they ignored it.
    dismissCrossAppBanner(shop, now);
    safeSet(key(SHOWN_KEY, shop), "0");
    return { rested: true };
  }
  safeSet(key(SHOWN_KEY, shop), String(next));
  return { rested: false };
}

/**
 * Record that the shop clicked the banner. Clears the ignore counter (an
 * engaged shop shouldn't be rested for "ignoring" it) and marks the shop as
 * having engaged at least once.
 */
export function recordCrossAppClick(shop: string): void {
  safeSet(key(SHOWN_KEY, shop), "0");
  safeSet(key(ENGAGED_KEY, shop), "1");
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

// Which apps the cross-app banner is allowed to promote, and how it splits
// impressions between them. As of 2026-06-30 (operator decision) a flat 50/50
// rotation between aiz_exporter and the newly launched bulk_image_upload, with
// bulk_tagging dropped from the banner for now. Only apps in this set are ever
// shown; order doesn't matter (selection is a per-shop hash, not a priority
// walk). The host app itself is filtered out of the catalog upstream
// (excludeInstalled), so listing it here is harmless. Re-add 'bulk_tagging' to
// bring it back. Each app needs a PITCH_VARIANTS entry (below) or it shows the
// catalog blurb.
const BANNER_APP_CODES = ["aiz_exporter", "bulk_image_upload"];

/**
 * Choose which catalog app to promote for this shop. Considers only `live`
 * apps in {@link BANNER_APP_CODES} (coming_soon aren't installable; apps not in
 * the set — e.g. bulk_tagging — are never shown). A shop that already has one
 * of them installed has it filtered out of the catalog upstream, so it falls to
 * the other. With both still promotable, a stable per-shop hash splits them
 * ~50/50 (deterministic across reloads/devices, so a shop's arm never flips and
 * click→install attribution by `app` stays clean). Returns null when neither is
 * promotable (both installed, or neither live) — the banner then shows nothing
 * rather than reaching for an app we chose to drop.
 */
export function pickCrossAppArm(
  shop: string,
  catalog: AppCatalogEntry[],
): AppCatalogEntry | null {
  const promotable = catalog
    .filter((a) => a.status === "live" && BANNER_APP_CODES.includes(a.appCode))
    .sort((a, b) => a.appCode.localeCompare(b.appCode));
  if (promotable.length === 0) return null;
  if (promotable.length === 1) return promotable[0];
  return promotable[hashString(shop) % promotable.length];
}

/**
 * Benefit-led pitches shown in the banner body instead of the generic apphub
 * catalog `description`. The catalog blurb describes the app in the abstract; a
 * merchant already inside another app needs a reason to click *now*, so these
 * lead with the outcome.
 *
 * Each app has 2-3 *angles* so a re-shown banner can carry a different message
 * (see {@link crossAppPitch}) — the same pitch every time is what trains a
 * merchant to ignore the strip. Index 0 stays the original copy. Keyed by
 * apphub appCode; pure (no React/i18n) so it's unit-testable.
 */
const PITCH_VARIANTS: Record<string, string[]> = {
  bulk_tagging: [
    "Auto-tag orders, products & customers by rule — and tag in bulk by hand or CSV. Keep your store organized without the busywork.",
    "Tag customers by spend, location or order count automatically — then build segments and flows on top. No manual tagging.",
    "Drowning in untagged orders? Set a rule once and Bulk Tagging keeps every product, order and customer tagged from then on.",
  ],
  aiz_exporter: [
    "Schedule CSV, Excel or JSON exports of orders, products & customers — filtered your way and auto-delivered to email, FTP or Google Sheets.",
    "Stop exporting by hand. Schedule order, product & customer exports and have them land in your inbox, FTP or Google Sheets automatically.",
    "Need order data for your accountant or warehouse? Build one filtered export and AIZ Exporter delivers it on a schedule.",
  ],
  bulk_image_upload: [
    "Bulk-upload product images from Google Drive, Dropbox or your computer — auto-matched to the right product by SKU or barcode. No more one-by-one.",
    "Got hundreds of product photos to add? Drop in a whole folder from Drive or Dropbox and they attach to the right products by SKU automatically.",
    "Stop dragging images into Shopify one product at a time. Bulk Image Upload matches an entire folder to your catalog by filename, SKU or barcode.",
  ],
};

/**
 * Pick the pitch for this app and rotation. `rotation` advances once per rest
 * cycle (the caller passes the shop's dismiss count), so each time the banner
 * comes back after a rest it leads with a fresh angle. Falls back to the
 * catalog description for any app not enumerated in {@link PITCH_VARIANTS}.
 */
export function crossAppPitch(
  appCode: string,
  fallback: string,
  rotation = 0,
): string {
  const variants = PITCH_VARIANTS[appCode];
  if (!variants || variants.length === 0) return fallback;
  const i = ((rotation % variants.length) + variants.length) % variants.length;
  return variants[i];
}

/** Number of distinct pitch angles for an app (0 if it falls back). Lets the
 *  component build a rotation-stable i18n key without hard-coding the count. */
export function crossAppPitchVariantCount(appCode: string): number {
  return PITCH_VARIANTS[appCode]?.length ?? 0;
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
