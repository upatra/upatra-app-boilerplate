import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
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
import {
  applyActivatedShopProperties,
  applyDowngradedToFreeShopProperties,
  resolvePlanPageSource,
  trackChargeCompleted,
  trackPlanActivated,
  trackPlanDowngraded,
  trackPlanPageViewed,
} from "../lib/analytics/events";
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
  const {
    currentShopPlan,
    cancelCurrentPlan,
    activeSelectedPlan,
    activatingPlanId,
    isPlanFetched,
  } = usePlan();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const { t: tCommon } = useTranslation("common");
  const homeLabel = tCommon("nav.home", { defaultValue: "Home" });
  const [searchParams, setSearchParams] = useSearchParams();
  const [downgradeModalOpen, setDowngradeModalOpen] = useState(false);

  // Funnel source — resolved once from ?source= (or ?ref= for legacy entries)
  // so plan_clicked and the returnUrl-threaded charge_completed share the same
  // attribution. Skip resolution on the post-charge callback hop (?activated=);
  // that source comes from the URL roundtrip, not the original page visit.
  const pageSource = resolvePlanPageSource(
    searchParams.get("source") ?? searchParams.get("ref"),
  );

  useEffect(() => {
    if (!isPlanFetched) return;
    if (searchParams.get("activated")) return;
    trackPlanPageViewed({
      ref: searchParams.get("source") ?? searchParams.get("ref"),
      currentShopPlan,
    });
  }, [isPlanFetched]); // eslint-disable-line react-hooks/exhaustive-deps

  // Funnel step: Shopify redirects back here with ?activated= after charge confirmation.
  // ?source rode along on the returnUrl so charge_completed keeps the original attribution.
  useEffect(() => {
    const activatedPlanId = searchParams.get("activated");
    if (!activatedPlanId) return;
    const resolvedSource = resolvePlanPageSource(searchParams.get("source"));
    trackPlanActivated({
      activatedPlanId,
      chargeId: searchParams.get("charge_id"),
    });
    trackChargeCompleted({ activatedPlanId, source: resolvedSource });
    applyActivatedShopProperties(activatedPlanId);
    const activatedPlanName =
      PLANS.find((p) => p.id === activatedPlanId)?.displayName ?? activatedPlanId;
    shopify.toast.show(`${activatedPlanName} plan activated`, { duration: 4000 });
    searchParams.delete("activated");
    searchParams.delete("charge_id");
    searchParams.delete("source");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCurrentPlan = (plan: Plan) =>
    currentShopPlan?.upatraPlanId === plan.id;
  const hasActivePlan = !!currentShopPlan;

  const handleDowngrade = async () => {
    setDowngradeModalOpen(false);
    trackPlanDowngraded({ fromShopPlan: currentShopPlan });
    await cancelCurrentPlan();
    applyDowngradedToFreeShopProperties();
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
  const anyPlanHasTrialFooter = PLANS.some((p) => p.trialDays !== undefined);

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
                      activeSelectedPlan(plan.id, { source: pageSource });
                    }}
                    fullWidth
                  >
                    {current ? "Current Plan" : `Get ${plan.displayName}`}
                  </Button>
                </div>
              </div>
              {plan.trialDays !== undefined ? (
                <div style={planCardFooter}>
                  <Text as="p" variant="bodyMd">
                    {plan.trialDays > 0
                      ? `${plan.trialDays}-day free trial`
                      : "No free trial"}
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
      backAction={{ content: homeLabel, onAction: () => navigate("/") }}
    >
      <TitleBar title="Billing">
        <button onClick={() => navigate("/")}>{homeLabel}</button>
      </TitleBar>
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
