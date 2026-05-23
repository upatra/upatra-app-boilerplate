import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { BlockStack, Modal, Text } from "@shopify/polaris";
import { useAuth } from "../context/AuthContext";
import {
  consumeTrigger,
  getReviewPromptState,
  markReviewed,
  recordDismiss,
} from "../lib/reviewPromptState";
import { log } from "../lib/logger";
import { trackReviewPromptShown } from "../lib/analytics/events";
import { env } from "../config/env";

const reviewLog = log.feature("reviewPrompt");

// Codes where Shopify will reliably suppress its own modal for a long time
// (or has already accepted the merchant's review). Calling request() again is
// wasted, so we mark the local state terminal too.
const TERMINAL_CODES = new Set([
  "success",              // modal shown — merchant had their chance
  "already-reviewed",     // merchant has previously submitted a review
  "cooldown-period",      // 60-day Shopify rate limit
  "annual-limit-reached", // 3-per-year cap hit
  "merchant-ineligible",  // merchant can never review this app
]);

export interface UseReviewPromptOptions {
  /** Interpolated into the i18n title/body strings as `{{appName}}`. */
  appName?: string;
}

export interface UseReviewPromptResult {
  /** Call at a "user just succeeded" moment. Opens the modal if eligible. */
  trigger: (placement: string) => void;
  /** Render this somewhere stable in the tree — it's a Polaris Modal. */
  modal: ReactNode;
}

/**
 * Wraps Shopify's `shopify.reviews.request()` with an opt-in confirmation
 * modal, per-shop eligibility, and a dismiss cooldown. Use from any "fresh
 * win" surface (after a successful flow, job done, etc.) — the hook itself
 * decides whether to actually open.
 */
export function useReviewPrompt(
  options: UseReviewPromptOptions = {},
): UseReviewPromptResult {
  const shopify = useAppBridge();
  const { shopifyDomain } = useAuth();
  const { t } = useTranslation("common");
  const [isOpen, setIsOpen] = useState(false);
  const appName = options.appName ?? "our app";

  const trigger = useCallback(
    (placement: string) => {
      if (!env.enableReviewPrompt) return;
      if (!shopifyDomain) return;
      const stateBefore = getReviewPromptState(shopifyDomain);
      if (!consumeTrigger(shopifyDomain)) return;
      setIsOpen(true);
      trackReviewPromptShown({
        placement,
        dismissCount: stateBefore.dismissCount,
      });
    },
    [shopifyDomain],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (shopifyDomain) recordDismiss(shopifyDomain);
  }, [shopifyDomain]);

  const handleAccept = useCallback(async () => {
    setIsOpen(false);
    if (!shopifyDomain) return;
    try {
      const result = await shopify.reviews.request();
      // Terminal codes silence our wrapper permanently. Anything else
      // (transient + unknown future codes) falls through to a soft dismiss
      // so our cooldown kicks in and we retry on a later success moment.
      if (TERMINAL_CODES.has(result.code)) {
        markReviewed(shopifyDomain);
      } else {
        recordDismiss(shopifyDomain);
      }
    } catch (err) {
      reviewLog.exception(err, { where: "shopify.reviews.request" });
      recordDismiss(shopifyDomain);
    }
  }, [shopify, shopifyDomain]);

  const modal = useMemo(
    () => (
      <Modal
        open={isOpen}
        onClose={handleClose}
        title={t("reviewPrompt.title", {
          appName,
          defaultValue: "Enjoying {{appName}}?",
        })}
        primaryAction={{
          content: t("reviewPrompt.leaveReview", {
            defaultValue: "Leave a review",
          }),
          onAction: () => {
            handleAccept().catch((err) =>
              reviewLog.exception(err, { where: "handleAccept" }),
            );
          },
        }}
        secondaryActions={[
          {
            content: t("reviewPrompt.maybeLater", {
              defaultValue: "Maybe later",
            }),
            onAction: handleClose,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              {t("reviewPrompt.body", {
                appName,
                defaultValue:
                  "If {{appName}} has saved you time, a short rating on the Shopify App Store goes a long way — it helps other store owners find it and tells me what to keep improving. Less than a minute, no pressure.",
              })}
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    ),
    [isOpen, handleClose, handleAccept, t, appName],
  );

  return { trigger, modal };
}
