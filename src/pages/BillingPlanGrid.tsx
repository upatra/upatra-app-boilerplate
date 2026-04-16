import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Divider,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  SkeletonPage,
  Text,
} from "@shopify/polaris";
import { usePlan } from "../context";
import { capture, setShopProperties } from "../lib/posthog";
import { FREE_BENEFITS, PLANS } from "../types/plan";
import type { Plan } from "../types/plan";

// Polaris Card has wrapper elements that break height:100% propagation in a
// grid. Replicate the visual here so every card stretches to the same height
// and the CTA buttons line up across columns.
const planCard = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "var(--p-color-bg-surface)",
  borderRadius: "var(--p-border-radius-300)",
  boxShadow: "var(--p-shadow-100)",
  outline: "var(--p-border-width-025) solid var(--p-color-border)",
  padding: "var(--p-space-400)",
  display: "flex",
  flexDirection: "column",
  ...extra,
});

export default function BillingPlanGrid() {
  const { currentShopPlan, cancelCurrentPlan, activeSelectedPlan, isPlanFetched } =
    usePlan();
  const shopify = useAppBridge();
  const [searchParams, setSearchParams] = useSearchParams();
  const [downgradeModalOpen, setDowngradeModalOpen] = useState(false);
  const [activatingPlanId, setActivatingPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlanFetched) return;
    const ref = searchParams.get("ref");
    capture("plan_page_viewed", {
      source: ref === "upgrade_modal" ? "upgrade_modal" : "direct",
      current_plan_id: currentShopPlan?.upatraPlanId ?? "free",
    });
  }, [isPlanFetched]); // eslint-disable-line react-hooks/exhaustive-deps

  // Funnel step: Shopify redirects back here with ?activated= after charge confirmation.
  useEffect(() => {
    const activatedPlanId = searchParams.get("activated");
    if (!activatedPlanId) return;
    const chargeId = searchParams.get("charge_id");
    const plan = PLANS.find((p) => p.id === activatedPlanId);
    capture("plan_activated", {
      plan_id: activatedPlanId,
      plan_name: plan?.displayName ?? activatedPlanId,
      plan_amount: plan?.amount,
      plan_interval: plan?.interval,
      charge_id: chargeId,
    });
    setShopProperties({
      plan_id: activatedPlanId,
      plan_name: plan?.displayName ?? activatedPlanId,
    });
    searchParams.delete("activated");
    searchParams.delete("charge_id");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCurrentPlan = (plan: Plan) =>
    currentShopPlan?.upatraPlanId === plan.id;
  const hasActivePlan = !!currentShopPlan;

  const handleDowngrade = async () => {
    setDowngradeModalOpen(false);
    capture("plan_downgraded", {
      from_plan_id: currentShopPlan?.upatraPlanId,
      from_plan_name: currentShopPlan?.name,
    });
    await cancelCurrentPlan();
    setShopProperties({ plan_id: "free", plan_name: "Free" });
    shopify.toast.show("Plan downgraded", { duration: 4000 });
  };

  const renderCardHeader = (
    name: string,
    price: string,
    suffix: string,
    badge?: React.ReactNode,
  ) => (
    <div>
      <Box minHeight="var(--p-space-600)" paddingBlockEnd="100">
        {badge}
      </Box>
      <BlockStack gap="050">
        <Text variant="headingMd" as="h3">
          {name}
        </Text>
        <InlineStack gap="100" blockAlign="baseline">
          <Text variant="heading2xl" as="p">
            {price}
          </Text>
          <Text variant="bodySm" as="span" tone="subdued">
            {suffix}
          </Text>
        </InlineStack>
      </BlockStack>
    </div>
  );

  // Grid columns: 1 on phones, 2 on tablets, up to 4 on wider viewports.
  const columns: { xs: number; sm: number; md: number } = {
    xs: 1,
    sm: 2,
    md: Math.min(4, PLANS.length + 1),
  };

  const content = (
    <BlockStack gap="400">
      <InlineGrid columns={columns} gap="400">
        {/* Free card — always present */}
        <div style={planCard()}>
          {renderCardHeader(
            "Free",
            "$0",
            "/mo",
            isPlanFetched && !hasActivePlan ? (
              <Badge tone="success">Activated</Badge>
            ) : undefined,
          )}
          <Box paddingBlockStart="400" paddingBlockEnd="300">
            <Divider />
          </Box>
          <div style={{ flex: 1, paddingBottom: "var(--p-space-400)" }}>
            <BlockStack gap="100">
              {FREE_BENEFITS.map((b) => (
                <Text key={b} variant="bodySm" as="p" tone="subdued">
                  · {b}
                </Text>
              ))}
            </BlockStack>
          </div>
          <Button
            variant="secondary"
            disabled={!isPlanFetched || !hasActivePlan}
            onClick={() => setDowngradeModalOpen(true)}
            fullWidth
          >
            {!hasActivePlan ? "Current Plan" : "Downgrade to Free"}
          </Button>
        </div>

        {PLANS.map((plan) => {
          const current = isCurrentPlan(plan);
          let badge: React.ReactNode;
          if (isPlanFetched && current) badge = <Badge tone="success">Activated</Badge>;
          else if (plan.popular) badge = <Badge tone="info">Popular</Badge>;

          return (
            <div
              key={plan.id}
              style={planCard(
                plan.popular
                  ? { outline: "2px solid var(--p-color-border-focus)" }
                  : undefined,
              )}
            >
              {renderCardHeader(
                plan.displayName,
                `$${plan.amount}`,
                plan.interval === "EVERY_30_DAYS" ? "/mo" : "/yr",
                badge,
              )}
              <Box paddingBlockStart="400" paddingBlockEnd="300">
                <Divider />
              </Box>
              <div style={{ flex: 1, paddingBottom: "var(--p-space-400)" }}>
                <BlockStack gap="100">
                  {plan.benefits.map((b) => (
                    <Text key={b} variant="bodySm" as="p" tone="subdued">
                      · {b}
                    </Text>
                  ))}
                </BlockStack>
              </div>
              <Button
                variant={plan.popular ? "primary" : "secondary"}
                disabled={!isPlanFetched || current || activatingPlanId !== null}
                loading={activatingPlanId === plan.id}
                onClick={() => {
                  capture("plan_clicked", {
                    plan_id: plan.id,
                    plan_name: plan.displayName,
                    plan_amount: plan.amount,
                    plan_interval: plan.interval,
                    current_plan_id: currentShopPlan?.upatraPlanId ?? "free",
                  });
                  setActivatingPlanId(plan.id);
                  activeSelectedPlan(plan.id);
                }}
                fullWidth
              >
                {current ? "Current Plan" : `Get ${plan.displayName}`}
              </Button>
            </div>
          );
        })}
      </InlineGrid>
    </BlockStack>
  );

  if (!isPlanFetched) {
    return <SkeletonPage title="Billing">{content}</SkeletonPage>;
  }

  return (
    <Page
      title="Billing"
      subtitle="Free to start — upgrade for higher limits and advanced features."
    >
      <Modal
        open={downgradeModalOpen}
        onClose={() => setDowngradeModalOpen(false)}
        title="Downgrade to Free Plan"
        primaryAction={{ content: "Downgrade", onAction: handleDowngrade }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setDowngradeModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <Text as="p" variant="bodyMd">
            You will lose access to all paid features immediately. This action
            cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>

      {content}
    </Page>
  );
}
