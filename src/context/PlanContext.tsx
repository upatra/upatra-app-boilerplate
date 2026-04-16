import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { activePlan, cancelPlan, getActivePlan } from "../lib/apphubApi";
import { getShopifyAdminAppUrl, redirectToUrl } from "../lib/misc";
import { setShopProperties } from "../lib/posthog";
import { ALL_PLANS, PlanIdMapper, PlanType, getMaxRowsPerUpload } from "../types/plan";
import type { ShopPlan } from "../types/plan";
import { useAuth } from "./AuthContext";

type PlanProviderProps = {
  children: ReactNode;
};

export type PlanContextValue = {
  currentShopPlan?: ShopPlan;
  activeSelectedPlan: (planId: string) => Promise<void>;
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

  useEffect(() => {
    (async () => {
      if (isLoading) return;
      const shopPlan = await getActivePlan(shopifyDomain);
      setCurrentShopPlan(shopPlan);
      setIsPlanFetched(true);
      setShopProperties({
        plan_id: shopPlan?.upatraPlanId ?? "free",
        plan_name: shopPlan?.name ?? "Free",
      });
    })();
  }, [shopifyDomain, isLoading]);

  const activeSelectedPlan = async (planId: string) => {
    const plan = ALL_PLANS.find((p) => p.id === planId);
    if (!plan) throw new Error(`Unknown plan id: ${planId}`);
    shopify.loading(true);
    // Shopify echoes returnUrl back after the merchant approves the charge.
    // The ?activated param is how the Billing page knows which plan confirmed.
    const returnUrl = `${getShopifyAdminAppUrl(shopifyDomain)}/billing?activated=${plan.id}`;
    const confirmationUrl = await activePlan(
      plan.displayName,
      plan.interval,
      plan.amount.toFixed(2),
      returnUrl,
      testPayment,
    );
    redirectToUrl(confirmationUrl);
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
