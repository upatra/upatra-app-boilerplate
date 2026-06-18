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
  crossAppStoreUrl,
  crossAppPitch,
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

const TWO_LIVE = [app("bulk_tagging"), app("aiz_exporter")];

describe("pickCrossAppArm", () => {
  test("returns null when no live apps", () => {
    expect(pickCrossAppArm(SHOP, [])).toBeNull();
    expect(
      pickCrossAppArm(SHOP, [app("restock_queue", "coming_soon")]),
    ).toBeNull();
  });

  test("returns the only live app, ignoring coming_soon", () => {
    const catalog = [app("bulk_tagging"), app("restock_queue", "coming_soon")];
    expect(pickCrossAppArm(SHOP, catalog)?.appCode).toBe("bulk_tagging");
  });

  test("is deterministic for a shop across calls and catalog ordering", () => {
    const a = pickCrossAppArm(SHOP, TWO_LIVE);
    const b = pickCrossAppArm(SHOP, [...TWO_LIVE].reverse());
    expect(a?.appCode).toBe(b?.appCode);
  });

  test("pins to aiz_exporter for every shop when it's promotable", () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickCrossAppArm(`shop-${i}.myshopify.com`, TWO_LIVE);
      expect(picked?.appCode).toBe("aiz_exporter");
    }
  });

  test("shows bulk_tagging once aiz_exporter is installed (filtered out)", () => {
    // aiz already installed → dropped from the catalog upstream, leaving
    // bulk_tagging next in the preference list, for every shop.
    for (let i = 0; i < 50; i++) {
      const picked = pickCrossAppArm(`shop-${i}.myshopify.com`, [
        app("bulk_tagging"),
      ]);
      expect(picked?.appCode).toBe("bulk_tagging");
    }
  });

  test("falls back to a hash bucket for live apps outside the preference list", () => {
    // Neither preferred app promotable → still surface something, deterministically.
    const catalog = [app("printly"), app("restock_queue")];
    const a = pickCrossAppArm(SHOP, catalog);
    const b = pickCrossAppArm(SHOP, [...catalog].reverse());
    expect(a).not.toBeNull();
    expect(a?.appCode).toBe(b?.appCode);
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
    expect(shouldShowCrossAppBanner("other.myshopify.com", 1_000_000)).toBe(
      true,
    );
    expect(getCrossAppDismissCount("other.myshopify.com")).toBe(0);
  });
});

describe("crossAppPitch", () => {
  test("returns a benefit-led pitch for known apps (not the catalog blurb)", () => {
    const bt = crossAppPitch("bulk_tagging", "bulk_tagging description");
    const aiz = crossAppPitch("aiz_exporter", "aiz_exporter description");
    expect(bt).not.toBe("bulk_tagging description");
    expect(aiz).not.toBe("aiz_exporter description");
    expect(bt.toLowerCase()).toContain("auto-tag");
    expect(aiz.toLowerCase()).toContain("export");
  });

  test("falls back to the catalog description for unknown apps", () => {
    expect(crossAppPitch("restock_queue", "restock blurb")).toBe(
      "restock blurb",
    );
  });
});

describe("crossAppStoreUrl", () => {
  test("targets the slug with cross-app UTM attribution", () => {
    const url = crossAppStoreUrl(
      "upatra-bulk-tagging",
      "wizard_step1",
      "bulk-fulfill",
    );
    expect(url).toContain("https://apps.shopify.com/upatra-bulk-tagging?");
    expect(url).toContain("utm_source=bulk-fulfill");
    expect(url).toContain("utm_medium=in_app");
    expect(url).toContain("utm_campaign=cross_app_banner");
    expect(url).toContain("utm_content=wizard_step1");
  });
});
