// Coverage for the cross-app promo banner's pure logic: the aiz_exporter pin
// over the apphub catalog (with per-shop hash fallback), the escalating dismiss
// backoff (1→3→7→30 days), and the UTM-tagged App Store URL.

import { describe, test, expect, beforeEach } from "@jest/globals";
import type { AppCatalogEntry } from "../lib/apphubApi";
import {
  pickCrossAppArm,
  shouldShowCrossAppBanner,
  dismissCrossAppBanner,
  getCrossAppDismissCount,
  recordCrossAppImpression,
  recordCrossAppClick,
  stampCrossAppInstall,
  crossAppStoreUrl,
  crossAppPitch,
  crossAppPitchVariantCount,
} from "../lib/crossAppBanner";

const SHOP = "demo.myshopify.com";
const DAY = 24 * 60 * 60 * 1000;

// Unit (node) project — install a minimal in-memory localStorage stub.
const installStorage = (): void => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
};

beforeEach(() => {
  installStorage();
});

const app = (
  appCode: string,
  status: "live" | "coming_soon" = "live",
): AppCatalogEntry => ({
  appCode,
  appSlug: `upatra-${appCode.replace(/_/g, "-")}`,
  appName: appCode,
  description: `${appCode} description`,
  status,
  icon: null,
});

// Banner promotes only aiz_exporter + bulk_image_upload, 50/50 per shop
// (bulk_tagging deliberately dropped from the banner for now, 2026-06-30).
const BANNER_LIVE = [app("aiz_exporter"), app("bulk_image_upload")];

describe("pickCrossAppArm", () => {
  test("returns null when neither banner app is promotable", () => {
    expect(pickCrossAppArm(SHOP, [])).toBeNull();
    expect(pickCrossAppArm(SHOP, [app("restock_queue", "coming_soon")])).toBeNull();
    // bulk_tagging is live but no longer in the banner set → not shown.
    expect(pickCrossAppArm(SHOP, [app("bulk_tagging")])).toBeNull();
    // aiz present but only as coming_soon → not installable, not shown.
    expect(pickCrossAppArm(SHOP, [app("aiz_exporter", "coming_soon")])).toBeNull();
  });

  test("returns the only promotable banner app when the other is filtered out", () => {
    // A shop that already has aiz installed has it dropped upstream → sees BIU.
    expect(pickCrossAppArm(SHOP, [app("bulk_image_upload")])?.appCode).toBe(
      "bulk_image_upload",
    );
    // …and vice versa.
    expect(pickCrossAppArm(SHOP, [app("aiz_exporter")])?.appCode).toBe("aiz_exporter");
    // Other live apps in the catalog are ignored.
    const withNoise = [
      app("bulk_image_upload"),
      app("bulk_tagging"),
      app("restock_queue", "coming_soon"),
    ];
    expect(pickCrossAppArm(SHOP, withNoise)?.appCode).toBe("bulk_image_upload");
  });

  test("is deterministic for a shop across calls and catalog ordering", () => {
    const a = pickCrossAppArm(SHOP, BANNER_LIVE);
    const b = pickCrossAppArm(SHOP, [...BANNER_LIVE].reverse());
    expect(a?.appCode).toBe(b?.appCode);
  });

  test("splits aiz vs BIU across shops, and only ever picks those two", () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const picked = pickCrossAppArm(`shop-${i}.myshopify.com`, BANNER_LIVE);
      expect(["aiz_exporter", "bulk_image_upload"]).toContain(picked?.appCode);
      counts[picked!.appCode] = (counts[picked!.appCode] ?? 0) + 1;
    }
    // Both arms get a meaningful share (rough 50/50; assert neither is starved).
    expect(counts.aiz_exporter).toBeGreaterThan(40);
    expect(counts.bulk_image_upload).toBeGreaterThan(40);
  });
});

describe("dismiss backoff", () => {
  test("shows by default (never dismissed)", () => {
    expect(shouldShowCrossAppBanner(SHOP, 0)).toBe(true);
  });

  test("hides right after dismiss, returns after the 1-day window", () => {
    const t0 = 1_000_000;
    expect(dismissCrossAppBanner(SHOP, t0)).toBe(1);
    expect(shouldShowCrossAppBanner(SHOP, t0)).toBe(false);
    expect(shouldShowCrossAppBanner(SHOP, t0 + DAY - 1)).toBe(false);
    expect(shouldShowCrossAppBanner(SHOP, t0 + DAY)).toBe(true);
  });

  test("escalates: 2nd dismiss needs 3 days, 3rd needs 7", () => {
    let now = 1_000_000;
    dismissCrossAppBanner(SHOP, now); // count 1 → 1d
    now += DAY;
    expect(dismissCrossAppBanner(SHOP, now)).toBe(2); // count 2 → 3d
    expect(shouldShowCrossAppBanner(SHOP, now + 2 * DAY)).toBe(false);
    expect(shouldShowCrossAppBanner(SHOP, now + 3 * DAY)).toBe(true);
    now += 3 * DAY;
    expect(dismissCrossAppBanner(SHOP, now)).toBe(3); // count 3 → 7d
    expect(shouldShowCrossAppBanner(SHOP, now + 6 * DAY)).toBe(false);
    expect(shouldShowCrossAppBanner(SHOP, now + 7 * DAY)).toBe(true);
  });

  test("backoff is per-shop", () => {
    dismissCrossAppBanner(SHOP, 1_000_000);
    expect(shouldShowCrossAppBanner("other.myshopify.com", 1_000_000)).toBe(true);
    expect(getCrossAppDismissCount("other.myshopify.com")).toBe(0);
  });
});

describe("auto-backoff on ignore", () => {
  test("rests after the 3rd no-click impression, then honors backoff", () => {
    const t0 = 1_000_000;
    expect(recordCrossAppImpression(SHOP, t0).rested).toBe(false); // 1
    expect(recordCrossAppImpression(SHOP, t0).rested).toBe(false); // 2
    expect(recordCrossAppImpression(SHOP, t0).rested).toBe(true); //  3 → soft dismiss
    // Soft dismiss advanced the same escalating backoff as an active dismiss.
    expect(getCrossAppDismissCount(SHOP)).toBe(1);
    expect(shouldShowCrossAppBanner(SHOP, t0)).toBe(false);
    expect(shouldShowCrossAppBanner(SHOP, t0 + DAY)).toBe(true);
  });

  test("the counter resets after a rest, so it rests again next cycle", () => {
    const t0 = 1_000_000;
    recordCrossAppImpression(SHOP, t0);
    recordCrossAppImpression(SHOP, t0);
    recordCrossAppImpression(SHOP, t0); // rest 1 (count 1 → 1d)
    const t1 = t0 + DAY;
    expect(recordCrossAppImpression(SHOP, t1).rested).toBe(false); // counter reset
    expect(recordCrossAppImpression(SHOP, t1).rested).toBe(false);
    expect(recordCrossAppImpression(SHOP, t1).rested).toBe(true); // rest 2 (count 2 → 3d)
    expect(getCrossAppDismissCount(SHOP)).toBe(2);
  });

  test("a click clears the ignore counter — clickers are never rested for ignoring", () => {
    const t0 = 1_000_000;
    recordCrossAppImpression(SHOP, t0);
    recordCrossAppImpression(SHOP, t0); // 2 impressions banked
    recordCrossAppClick(SHOP); // engaged → reset
    expect(recordCrossAppImpression(SHOP, t0).rested).toBe(false); // back to 1, not 3
    expect(recordCrossAppImpression(SHOP, t0).rested).toBe(false);
    expect(getCrossAppDismissCount(SHOP)).toBe(0);
  });

  test("new installs tolerate more impressions before resting (8 vs 3)", () => {
    const t0 = 1_000_000;
    stampCrossAppInstall(SHOP, t0); // fresh install → wide threshold
    let rested = false;
    for (let i = 0; i < 7; i++) {
      rested = recordCrossAppImpression(SHOP, t0).rested;
      expect(rested).toBe(false); // first 7 don't rest (threshold 8)
    }
    expect(recordCrossAppImpression(SHOP, t0).rested).toBe(true); // 8th rests
  });

  test("after the 7-day window a new install reverts to the quiet cadence", () => {
    const t0 = 1_000_000;
    stampCrossAppInstall(SHOP, t0);
    const past = t0 + 8 * DAY; // window elapsed
    expect(recordCrossAppImpression(SHOP, past).rested).toBe(false); // 1
    expect(recordCrossAppImpression(SHOP, past).rested).toBe(false); // 2
    expect(recordCrossAppImpression(SHOP, past).rested).toBe(true); //  3 → rests (established)
  });

  test("stamp is idempotent — only the first install time sticks", () => {
    const t0 = 1_000_000;
    stampCrossAppInstall(SHOP, t0);
    stampCrossAppInstall(SHOP, t0 + 100 * DAY); // ignored
    // Still inside the window relative to the ORIGINAL stamp.
    for (let i = 0; i < 7; i++) {
      expect(recordCrossAppImpression(SHOP, t0 + DAY).rested).toBe(false);
    }
  });

  test("unstamped (pre-existing) shops are treated as established", () => {
    const t0 = 1_000_000;
    // No stampCrossAppInstall → established threshold of 3.
    expect(recordCrossAppImpression(SHOP, t0).rested).toBe(false);
    expect(recordCrossAppImpression(SHOP, t0).rested).toBe(false);
    expect(recordCrossAppImpression(SHOP, t0).rested).toBe(true);
  });

  test("ignore tracking is per-shop", () => {
    const t0 = 1_000_000;
    recordCrossAppImpression(SHOP, t0);
    recordCrossAppImpression(SHOP, t0);
    recordCrossAppImpression(SHOP, t0); // SHOP rests
    expect(shouldShowCrossAppBanner("other.myshopify.com", t0)).toBe(true);
    expect(getCrossAppDismissCount("other.myshopify.com")).toBe(0);
  });
});

describe("crossAppPitch", () => {
  test("returns a benefit-led pitch for known apps (not the catalog blurb)", () => {
    const bt = crossAppPitch("bulk_tagging", "bulk_tagging description");
    const aiz = crossAppPitch("aiz_exporter", "aiz_exporter description");
    const biu = crossAppPitch("bulk_image_upload", "bulk_image_upload description");
    expect(bt).not.toBe("bulk_tagging description");
    expect(aiz).not.toBe("aiz_exporter description");
    expect(biu).not.toBe("bulk_image_upload description");
    expect(bt.toLowerCase()).toContain("auto-tag");
    expect(aiz.toLowerCase()).toContain("export");
    expect(biu.toLowerCase()).toContain("image");
  });

  test("falls back to the catalog description for unknown apps", () => {
    expect(crossAppPitch("restock_queue", "restock blurb")).toBe("restock blurb");
    expect(crossAppPitch("restock_queue", "restock blurb", 5)).toBe("restock blurb");
    expect(crossAppPitchVariantCount("restock_queue")).toBe(0);
  });

  test("rotates through distinct angles by rest cycle, wrapping around", () => {
    const n = crossAppPitchVariantCount("aiz_exporter");
    expect(n).toBeGreaterThan(1);
    const v0 = crossAppPitch("aiz_exporter", "x", 0);
    const v1 = crossAppPitch("aiz_exporter", "x", 1);
    expect(v0).not.toBe(v1); // a re-show says something new
    expect(crossAppPitch("aiz_exporter", "x", n)).toBe(v0); // wraps
    // index 0 stays the original copy (backward compatible)
    expect(crossAppPitch("aiz_exporter", "x")).toBe(v0);
  });

  test("rotation is robust to negative/out-of-range indices", () => {
    const v0 = crossAppPitch("bulk_tagging", "x", 0);
    expect(crossAppPitch("bulk_tagging", "x", -3)).toBe(v0);
  });
});

describe("crossAppStoreUrl", () => {
  test("targets the slug with cross-app UTM attribution", () => {
    const url = crossAppStoreUrl("upatra-bulk-tagging", "wizard_step1", "bulk-fulfill");
    expect(url).toContain("https://apps.shopify.com/upatra-bulk-tagging?");
    expect(url).toContain("utm_source=bulk-fulfill");
    expect(url).toContain("utm_medium=in_app");
    expect(url).toContain("utm_campaign=cross_app_banner");
    expect(url).toContain("utm_content=wizard_step1");
  });
});
