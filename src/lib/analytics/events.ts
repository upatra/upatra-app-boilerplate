/**
 * Central registry of PostHog product events.
 *
 * Every PostHog event the app fires is declared here as a typed `track*`
 * wrapper, so event names + property shapes live in one place. Call sites
 * stay readable (`trackPlanClicked({...})`) and TypeScript catches missing /
 * typo'd properties before they ship as silent analytics drift.
 *
 * Convention: TS props are camelCase; each wrapper translates them to the
 * snake_case keys we send to PostHog. Wire keys (the strings PostHog
 * dashboards filter on) are intentionally explicit in the wrappers — do NOT
 * rename them without coordinating with analytics dashboards / cohorts.
 *
 * The `build*Payload` helpers are exposed for unit tests.
 */
import { capture, setShopProperties } from "../posthog";
import type { Plan, ShopPlan } from "../../types/plan";
import { PLANS } from "../../types/plan";

// ---------------------------------------------------------------------------
// Plan funnel — shared resolvers + payload builders
// ---------------------------------------------------------------------------

export type PlanPageSource = string;

export function resolvePlanPageSource(source: string | null): PlanPageSource {
  return source && source.length > 0 ? source : "direct";
}

export function resolveCurrentPlanId(
  currentShopPlan: ShopPlan | undefined | null,
): string {
  return currentShopPlan?.upatraPlanId ?? "free";
}

export interface PlanPageViewedPayload {
  source: PlanPageSource;
  current_plan_id: string;
  [key: string]: unknown;
}

export function buildPlanPageViewedPayload(args: {
  ref: string | null;
  currentShopPlan: ShopPlan | undefined | null;
}): PlanPageViewedPayload {
  return {
    source: resolvePlanPageSource(args.ref),
    current_plan_id: resolveCurrentPlanId(args.currentShopPlan),
  };
}

export interface PlanClickedPayload {
  plan_id: string;
  plan_name: string;
  plan_amount: number;
  plan_interval: Plan["interval"];
  current_plan_id: string;
  source: PlanPageSource;
  [key: string]: unknown;
}

export function buildPlanClickedPayload(args: {
  plan: Plan;
  currentShopPlan: ShopPlan | undefined | null;
  source: PlanPageSource;
}): PlanClickedPayload {
  return {
    plan_id: args.plan.id,
    plan_name: args.plan.displayName,
    plan_amount: args.plan.amount,
    plan_interval: args.plan.interval,
    current_plan_id: resolveCurrentPlanId(args.currentShopPlan),
    source: args.source,
  };
}

export interface PlanActivatedPayload {
  plan_id: string;
  plan_name: string;
  plan_amount: number | undefined;
  plan_interval: Plan["interval"] | undefined;
  charge_id: string | null;
  [key: string]: unknown;
}

export function buildPlanActivatedPayload(args: {
  activatedPlanId: string;
  chargeId: string | null;
}): PlanActivatedPayload {
  const plan = PLANS.find((p) => p.id === args.activatedPlanId);
  return {
    plan_id: args.activatedPlanId,
    plan_name: plan?.displayName ?? args.activatedPlanId,
    plan_amount: plan?.amount,
    plan_interval: plan?.interval,
    charge_id: args.chargeId,
  };
}

export interface ChargeCompletedPayload {
  source: PlanPageSource;
  plan_name: string;
  plan_amount: number | undefined;
  [key: string]: unknown;
}

export function buildChargeCompletedPayload(args: {
  activatedPlanId: string;
  source: PlanPageSource;
}): ChargeCompletedPayload {
  const plan = PLANS.find((p) => p.id === args.activatedPlanId);
  return {
    source: args.source,
    plan_name: plan?.displayName ?? args.activatedPlanId,
    plan_amount: plan?.amount,
  };
}

export interface PlanDowngradedPayload {
  from_plan_id: string | undefined;
  from_plan_name: string | undefined;
  [key: string]: unknown;
}

export function buildPlanDowngradedPayload(args: {
  fromShopPlan: ShopPlan | undefined | null;
}): PlanDowngradedPayload {
  return {
    from_plan_id: args.fromShopPlan?.upatraPlanId,
    from_plan_name: args.fromShopPlan?.name,
  };
}

// ---------------------------------------------------------------------------
// Person properties — shop-level properties attached via posthog.people.set
// ---------------------------------------------------------------------------

export interface ShopPlanProperties {
  plan_id: string;
  plan_name: string;
  [key: string]: unknown;
}

export function buildActivatedShopProperties(
  activatedPlanId: string,
): ShopPlanProperties {
  const plan = PLANS.find((p) => p.id === activatedPlanId);
  return {
    plan_id: activatedPlanId,
    plan_name: plan?.displayName ?? activatedPlanId,
  };
}

export function buildShopPlanProperties(
  shopPlan: ShopPlan | undefined | null,
): ShopPlanProperties {
  return {
    plan_id: shopPlan?.upatraPlanId ?? "free",
    plan_name: shopPlan?.name ?? "Free",
  };
}

// ---------------------------------------------------------------------------
// Plan funnel — track* wrappers
// ---------------------------------------------------------------------------

export function trackPlanPageViewed(args: {
  ref: string | null;
  currentShopPlan: ShopPlan | undefined | null;
}): void {
  capture("plan_page_viewed", buildPlanPageViewedPayload(args));
}

export function trackPlanClicked(args: {
  plan: Plan;
  currentShopPlan: ShopPlan | undefined | null;
  source: PlanPageSource;
}): void {
  capture("plan_clicked", buildPlanClickedPayload(args));
}

export function trackPlanActivated(args: {
  activatedPlanId: string;
  chargeId: string | null;
}): void {
  capture("plan_activated", buildPlanActivatedPayload(args));
}

export function trackChargeCompleted(args: {
  activatedPlanId: string;
  source: PlanPageSource;
}): void {
  capture("charge_completed", buildChargeCompletedPayload(args));
}

export function trackPlanDowngraded(args: {
  fromShopPlan: ShopPlan | undefined | null;
}): void {
  capture("plan_downgraded", buildPlanDowngradedPayload(args));
}

/** Update PostHog person properties to reflect the newly activated plan. */
export function applyActivatedShopProperties(activatedPlanId: string): void {
  setShopProperties(buildActivatedShopProperties(activatedPlanId));
}

/** Reset PostHog person properties to the Free plan after a downgrade. */
export function applyDowngradedToFreeShopProperties(): void {
  setShopProperties({ plan_id: "free", plan_name: "Free" });
}

/** Sync PostHog person properties from the currently fetched shop plan. */
export function applyShopPlanProperties(
  shopPlan: ShopPlan | undefined | null,
): void {
  setShopProperties(buildShopPlanProperties(shopPlan));
}

// ---------------------------------------------------------------------------
// Review prompt — segment by placement to see which success surface drives
// the most prompts.
// ---------------------------------------------------------------------------

export interface ReviewPromptShownPayload {
  placement: string;
  dismiss_count: number;
  [key: string]: unknown;
}

export function trackReviewPromptShown(args: {
  placement: string;
  dismissCount: number;
}): void {
  capture("review_prompt_shown", {
    placement: args.placement,
    dismiss_count: args.dismissCount,
  });
}

// ---------------------------------------------------------------------------
// App directory ("More Upatra apps") — re-exported from its own module.
// ---------------------------------------------------------------------------

export {
  trackAppDirectoryViewed,
  trackAppDirectoryCardClicked,
} from "./appDirectory";

// ---------------------------------------------------------------------------
// Cross-app promo banner — re-exported from its own module.
// ---------------------------------------------------------------------------

export type {
  CrossAppBannerPlacement,
  CrossAppBannerProps,
} from "./crossAppBanner";
export {
  trackCrossAppBannerShown,
  trackCrossAppBannerClicked,
  trackCrossAppMoreAppsClicked,
  trackCrossAppBannerDismissed,
} from "./crossAppBanner";
