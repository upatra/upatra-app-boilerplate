import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Icon,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  SkeletonPage,
  Text,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { usePlan } from "../context";
import { capture, setShopProperties } from "../lib/posthog";
import { FREE_BENEFITS, PLANS } from "../types/plan";
import type { Plan } from "../types/plan";

// Polaris Card has wrapper elements that break height:100% propagation in a
// grid. Replicate the visual here so every card stretches to the same height
// and the trial footer band can sit flush against the rounded corners.
const planCard = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "var(--p-color-bg-surface)",
  borderRadius: "var(--p-border-radius-300)",
  boxShadow: "var(--p-shadow-200)",
  outline: "var(--p-border-width-025) solid var(--p-color-border)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  ...extra,
});

const planCardBody: React.CSSProperties = {
  padding: "var(--p-space-500)",
  display: "flex",
  flexDirection: "column",
  flex: 1,
};

const planCardFooter: React.CSSProperties = {
  padding: "var(--p-space-300) var(--p-space-500)",
  background: "var(--p-color-bg-surface-secondary)",
  borderTop: "var(--p-border-width-025) solid var(--p-color-border)",
};

// margin-top:auto pushes the action button to the bottom of the flex column,
// so buttons stay horizontally aligned across cards regardless of how many
// benefits each plan lists.
const planCardAction: React.CSSProperties = {
  marginTop: "auto",
  paddingTop: "var(--p-space-500)",
};

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
    annualNote?: string,
  ) => (
    <BlockStack gap="100">
      <InlineStack gap="200" align="space-between" blockAlign="center">
        <Text variant="bodyLg" as="h3">
          {name}
        </Text>
        {badge}
      </InlineStack>
      <InlineStack gap="100" blockAlign="baseline">
        <Text variant="heading2xl" as="p" fontWeight="bold">
          {price}
        </Text>
        <Text variant="bodyMd" as="span" tone="subdued">
          {suffix}
        </Text>
      </InlineStack>
      {annualNote ? (
        <Text as="p" tone="success">
          {annualNote}
        </Text>
      ) : null}
    </BlockStack>
  );

  const renderFeatures = (benefits: string[]) => (
    <BlockStack gap="200">
      <Text variant="headingSm" as="h4">
        Features
      </Text>
      <BlockStack gap="100">
        {benefits.map((b) => (
          <InlineStack key={b} gap="200" blockAlign="start" wrap={false}>
            <Box paddingBlockStart="050">
              <Icon source={CheckIcon} tone="base" />
            </Box>
            <Text as="p" variant="bodyMd">
              {b}
            </Text>
          </InlineStack>
        ))}
      </BlockStack>
    </BlockStack>
  );

  const annualNoteFor = (plan: Plan): string | undefined => {
    if (plan.interval !== "EVERY_30_DAYS" || !plan.annualAmount) return undefined;
    const monthlyYearly = plan.amount * 12;
    if (monthlyYearly <= 0) return undefined;
    const savings = Math.round((1 - plan.annualAmount / monthlyYearly) * 100);
    return `or $${plan.annualAmount}/year and save ${savings}%`;
  };

  // Grid columns: 1 on phones, 2 on tablets, up to 4 on wider viewports.
  const columns: { xs: number; sm: number; md: number } = {
    xs: 1,
    sm: 2,
    md: Math.min(4, PLANS.length + 1),
  };

  // When any paid plan renders a trial footer band, give the Free card a
  // matching footer ("Free forever") so card heights align across the grid.
  const anyPlanHasTrialFooter = PLANS.some((p) => (p.trialDays ?? 0) > 0);

  const content = (
    <BlockStack gap="400">
      <InlineGrid columns={columns} gap="400">
        {/* Free card — always present */}
        <div style={planCard()}>
          <div style={planCardBody}>
            <BlockStack gap="500">
              {renderCardHeader(
                "Free",
                "$0",
                "/ month",
                isPlanFetched && !hasActivePlan ? (
                  <Badge tone="success">Activated</Badge>
                ) : undefined,
              )}
              {renderFeatures(FREE_BENEFITS)}
            </BlockStack>
            <div style={planCardAction}>
              <Button
                variant="secondary"
                disabled={!isPlanFetched || !hasActivePlan}
                onClick={() => setDowngradeModalOpen(true)}
                fullWidth
              >
                {!hasActivePlan ? "Current Plan" : "Downgrade to Free"}
              </Button>
            </div>
          </div>
          {anyPlanHasTrialFooter ? (
            <div style={planCardFooter}>
              <Text as="p" variant="bodyMd">
                Free forever
              </Text>
            </div>
          ) : null}
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
              <div style={planCardBody}>
                <BlockStack gap="500">
                  {renderCardHeader(
                    plan.displayName,
                    `$${plan.amount}`,
                    plan.interval === "EVERY_30_DAYS" ? "/ month" : "/ year",
                    badge,
                    annualNoteFor(plan),
                  )}
                  {renderFeatures(plan.benefits)}
                </BlockStack>
                <div style={planCardAction}>
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
              </div>
              {plan.trialDays && plan.trialDays > 0 ? (
                <div style={planCardFooter}>
                  <Text as="p" variant="bodyMd">
                    {plan.trialDays}-day free trial
                  </Text>
                </div>
              ) : null}
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
