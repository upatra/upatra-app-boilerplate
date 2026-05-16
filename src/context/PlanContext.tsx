import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { activePlan, cancelPlan, getActivePlan } from "../lib/apphubApi";
import { getShopifyAdminAppUrl, redirectToUrl } from "../lib/misc";
import {
  applyShopPlanProperties,
  resolvePlanPageSource,
  trackPlanClicked,
} from "../lib/analytics/events";
import { ALL_PLANS, PlanIdMapper, PlanType, getMaxRowsPerUpload } from "../types/plan";
import type { ShopPlan } from "../types/plan";
import { useAuth } from "./AuthContext";

type PlanProviderProps = {
  children: ReactNode;
};

export type ActiveSelectedPlanOptions = {
  /**
   * Funnel source supplied by the caller — e.g. "billing_page",
   * "upgrade_modal", "limit_banner". Drives the plan_clicked event and is
   * threaded onto the Shopify returnUrl so it survives the charge redirect
   * and lands back on /billing as ?source=, where the page fires
   * charge_completed with the original attribution intact.
   */
  source?: string;
};

export type PlanContextValue = {
  currentShopPlan?: ShopPlan;
  activeSelectedPlan: (
    planId: string,
    options?: ActiveSelectedPlanOptions,
  ) => Promise<void>;
  /**
   * Id of the plan whose activation is currently in flight (until Shopify's
   * billing redirect). Consumers can drive button `loading` / `disabled` state
   * off this so every "Activate" CTA across the app stays consistent.
   */
  activatingPlanId: string | null;
  cancelCurrentPlan: () => Promise<void>;
  isInPlan: (planType: PlanType) => boolean;
  maxRowsPerUpload: number;
  isPlanFetched: boolean;
};

const PlanContext = createContext({} as PlanContextValue);

export function usePlan() {
  return useContext(PlanContext);
}

export function PlanProvider({ children }: PlanProviderProps) {
  const { shopifyDomain, isLoading } = useAuth();
  const shopify = useAppBridge();
  const testPayment = import.meta.env.MODE !== "production";

  const [currentShopPlan, setCurrentShopPlan] = useState<ShopPlan | undefined>();
  const [isPlanFetched, setIsPlanFetched] = useState(false);
  const [activatingPlanId, setActivatingPlanId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (isLoading) return;
      const shopPlan = await getActivePlan(shopifyDomain);
      setCurrentShopPlan(shopPlan);
      setIsPlanFetched(true);
      applyShopPlanProperties(shopPlan);
    })();
  }, [shopifyDomain, isLoading]);

  const activeSelectedPlan = async (
    planId: string,
    options?: ActiveSelectedPlanOptions,
  ) => {
    const plan = ALL_PLANS.find((p) => p.id === planId);
    if (!plan) throw new Error(`Unknown plan id: ${planId}`);
    const source = resolvePlanPageSource(options?.source ?? null);
    trackPlanClicked({ plan, currentShopPlan, source });
    setActivatingPlanId(planId);
    shopify.loading(true);
    // Shopify echoes returnUrl back after the merchant approves the charge.
    // The ?activated param is how the Billing page knows which plan confirmed.
    // ?source threads the funnel attribution through the redirect so
    // charge_completed can fire with the original source intact.
    const returnUrl = `${getShopifyAdminAppUrl(shopifyDomain)}/billing?activated=${plan.id}&source=${encodeURIComponent(source)}`;
    try {
      const confirmationUrl = await activePlan(
        plan.displayName,
        plan.interval,
        plan.amount.toFixed(2),
        returnUrl,
        testPayment,
      );
      // We deliberately don't clear activatingPlanId on success: the redirect
      // navigates away, and clearing it would flicker the buttons back to an
      // enabled state for a frame before the navigation kicks in.
      redirectToUrl(confirmationUrl);
    } catch (err) {
      setActivatingPlanId(null);
      shopify.loading(false);
      throw err;
    }
  };

  const cancelCurrentPlan = async () => {
    if (!currentShopPlan) return;
    await cancelPlan();
    setCurrentShopPlan(undefined);
  };

  const isInPlan = (planType: PlanType) => {
    if (!currentShopPlan) return planType === PlanType.Free;
    const tier = PlanIdMapper[currentShopPlan.upatraPlanId] ?? PlanType.Free;
    return tier >= planType;
  };

  const maxRowsPerUpload = getMaxRowsPerUpload(currentShopPlan?.upatraPlanId);

  return (
    <PlanContext.Provider
      value={{
        currentShopPlan,
        activeSelectedPlan,
        activatingPlanId,
        cancelCurrentPlan,
        isInPlan,
        maxRowsPerUpload,
        isPlanFetched,
      }}
    >
      {children}
    </PlanContext.Provider>
  );
}
