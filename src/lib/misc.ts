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
