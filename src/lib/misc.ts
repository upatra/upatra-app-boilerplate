import { env } from "../config/env";

export function normalizeShopifyDomain(shopifyDomain: string): string {
  const lowerCase = shopifyDomain.toLowerCase().trim();
  const shopifyRegex = /.+\.myshopify\.com$/;
  const httpRegex = /^http(s):\/\//;

  const nonHttpUrl = lowerCase.replace(httpRegex, "");

  if (nonHttpUrl.match(shopifyRegex)) return nonHttpUrl;

  return `${nonHttpUrl}.myshopify.com`;
}

export function getShopSlug(shopifyDomain: string): string {
  const normDomain = normalizeShopifyDomain(shopifyDomain);
  const shopifyRegex = /\.myshopify\.com$/;
  const httpRegex = /^http(s):\/\//;
  const nonHttpUrl = normDomain.replace(httpRegex, "");
  const shopSlug = nonHttpUrl.replace(shopifyRegex, "");

  return shopSlug;
}

// URL of the embedded app inside the Shopify admin — used as the base when
// constructing returnUrls for the billing flow. Requires VITE_APP_HANDLE to
// match the handle Shopify assigns to the app.
export function getShopifyAdminAppUrl(shopifyDomain: string): string {
  const shopSlug = getShopSlug(shopifyDomain);
  return `https://admin.shopify.com/store/${shopSlug}/apps/${env.appHandle}`;
}

// Break out of the Shopify admin iframe before navigating. window.top.location
// throws on cross-origin frames; window.open(_top) does not.
export function redirectToUrl(url: string): void {
  window.open(url, "_top");
}

// Canonical copy for the "the browser blocked the download" error toast. Keep
// this the single source of truth so every download path shows identical
// wording — pass it as the `defaultValue` of your i18n toast key.
export const DOWNLOAD_BLOCKED_TOAST =
  "Download was blocked. Please allow download for this site.";

// Open a URL in a new tab to trigger a file download, detecting popup blocking.
//
// Returns `true` if the tab opened, `false` if the browser (or its popup
// blocker) refused. A blocked `window.open` returns `null` — that's the only
// download-block signal browsers actually expose. Do NOT pass `"noopener"`:
// with that flag `window.open` returns `null` even on success, which would make
// a blocked download indistinguishable from a successful one. We sever the
// opener link manually instead to keep the same isolation guarantee.
//
// Typical use — toast the merchant when the browser blocks the download:
//   if (!openDownloadTab(url)) {
//     shopify.toast.show(t("toast.downloadBlocked", { defaultValue: DOWNLOAD_BLOCKED_TOAST }), { isError: true });
//   }
//
// Note: this only works for URL-based downloads (new tab). Anchor+blob
// downloads (`<a download>.click()`) give no success/failure signal at all and
// cannot be detected — surface those with a manual fallback link instead.
export function openDownloadTab(url: string): boolean {
  const win = window.open(url, "_blank");
  if (!win || win.closed || typeof win.closed === "undefined") {
    return false;
  }
  win.opener = null;
  return true;
}
