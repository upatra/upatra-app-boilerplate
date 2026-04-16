// Raw plan object returned by GET /{app_code}/custom_shop_plans (Apphub).
export type ApphubShopPlan = {
  id: number;
  name: string;
  price: string;
  billingOn: string;
  status: string;
  activatedOn: string;
  returnUrl: string;
  cancelledOn: string | null;
  trialDays: number;
  trialEndsOn: string;
  currency: string;
  test: boolean;
};

// The active subscription for a shop, after the Apphub response is mapped
// into the app's domain.
export type ShopPlan = {
  shopifyDomain: string;
  name: string;
  price: string;
  activatedOn: string;
  upatraPlanId: string;
};

export type PlanInterval = "EVERY_30_DAYS" | "ANNUAL";

// Tier ordering — used by isInPlan() to gate features by minimum tier.
// Free is 0; add intermediate tiers as enum values when the app's pricing grows.
export enum PlanType {
  Free = 0,
  Paid = 1,
}

// A single purchasable plan variant. The `id` is round-tripped through the
// Shopify subscription returnUrl, so it must match the value Apphub returns
// in `returnUrl?activated=...`.
export type Plan = {
  id: string;
  displayName: string;
  interval: PlanInterval;
  amount: number;
  benefits: string[];
  maxRowsPerUpload: number;
  popular?: boolean;
  hidden?: boolean;
};

// Map a plan id to its tier. App author fills this in alongside PLANS.
export const PlanIdMapper: Record<string, PlanType> = {};

// All plans the app knows about (visible + hidden, e.g. legacy or annual variants).
export const ALL_PLANS: Plan[] = [];

// Plans rendered in the Billing page card grid.
export const PLANS: Plan[] = ALL_PLANS.filter((p) => !p.hidden);

// Free-tier limit + benefits shown on the Free plan card.
export const FREE_MAX_ROWS_PER_UPLOAD = Number.POSITIVE_INFINITY;
export const FREE_BENEFITS: string[] = ["Get started for free"];

// Resolve the per-upload row cap for a shop's current subscription. Falls back
// to the Free cap for unsubscribed shops.
export function getMaxRowsPerUpload(upatraPlanId?: string): number {
  if (!upatraPlanId) return FREE_MAX_ROWS_PER_UPLOAD;
  const plan = ALL_PLANS.find((p) => p.id === upatraPlanId);
  return plan?.maxRowsPerUpload ?? FREE_MAX_ROWS_PER_UPLOAD;
}
