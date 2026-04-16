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
  const appHandle = import.meta.env.VITE_APP_HANDLE ?? "";
  return `https://admin.shopify.com/store/${shopSlug}/apps/${appHandle}`;
}

// Break out of the Shopify admin iframe before navigating. window.top.location
// throws on cross-origin frames; window.open(_top) does not.
export function redirectToUrl(url: string): void {
  window.open(url, "_top");
}
