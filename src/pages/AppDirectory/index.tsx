import { useEffect, useRef, useState } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Icon,
  InlineGrid,
  InlineStack,
  Page,
  SkeletonBodyText,
  SkeletonDisplayText,
  Text,
} from "@shopify/polaris";
import { AppsIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { getAppCatalog, type AppCatalogEntry } from "../../lib/apphubApi";
import {
  trackAppDirectoryCardClicked,
  trackAppDirectoryViewed,
} from "../../lib/analytics/events";
import { log } from "../../lib/logger";

const ICON_SIZE = 56;

function AppStoreUrl(slug: string): string {
  return `https://apps.shopify.com/${slug}`;
}

function AppIcon({ src }: { src: string | null }) {
  if (!src) {
    // Apps without an icon yet (e.g. pre-launch / coming soon) fall back to a
    // generic apps glyph rather than an empty tile.
    return (
      <div
        aria-hidden="true"
        style={{
          width: ICON_SIZE,
          height: ICON_SIZE,
          borderRadius: 12,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--p-color-bg-surface-secondary)",
        }}
      >
        <Icon source={AppsIcon} tone="subdued" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={ICON_SIZE}
      height={ICON_SIZE}
      style={{
        width: ICON_SIZE,
        height: ICON_SIZE,
        borderRadius: 12,
        objectFit: "cover",
        flexShrink: 0,
      }}
    />
  );
}

function AppCard({ app }: { app: AppCatalogEntry }) {
  const { t } = useTranslation("common");
  const isLive = app.status === "live";

  const onInstall = () => {
    trackAppDirectoryCardClicked({
      app: app.appCode,
      appSlug: app.appSlug,
      status: app.status,
    });
    window.open(AppStoreUrl(app.appSlug), "_blank", "noopener,noreferrer");
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack gap="300" blockAlign="start" wrap={false}>
          <AppIcon src={app.icon} />
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <Text as="h2" variant="headingMd">
                {app.appName}
              </Text>
              {!isLive && (
                <Badge tone="info">
                  {t("appDirectory.comingSoon", { defaultValue: "Coming soon" })}
                </Badge>
              )}
            </InlineStack>
            <Text as="p" tone="subdued">
              {app.description}
            </Text>
          </BlockStack>
        </InlineStack>
        <InlineStack align="end">
          {isLive ? (
            <Button variant="primary" onClick={onInstall}>
              {t("appDirectory.view", { defaultValue: "View on App Store" })}
            </Button>
          ) : (
            <Button disabled>
              {t("appDirectory.comingSoon", { defaultValue: "Coming soon" })}
            </Button>
          )}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function LoadingGrid() {
  return (
    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <BlockStack gap="400">
            <SkeletonDisplayText size="small" />
            <SkeletonBodyText lines={2} />
          </BlockStack>
        </Card>
      ))}
    </InlineGrid>
  );
}

export default function AppDirectoryPage() {
  const { t, i18n } = useTranslation("common");
  const [apps, setApps] = useState<AppCatalogEntry[] | null>(null);
  // Guard so the impression event fires once per page view, not on every render.
  const viewedTracked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getAppCatalog(i18n.language)
      .then((list) => {
        if (cancelled) return;
        setApps(list);
        if (!viewedTracked.current) {
          viewedTracked.current = true;
          trackAppDirectoryViewed({ appCount: list.length });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        log.exception(e, { where: "AppDirectoryPage" });
        setApps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  const title = t("appDirectory.title", { defaultValue: "More Upatra apps" });

  return (
    <Page>
      <TitleBar title={title} />
      <BlockStack gap="400">
        <Text as="p" tone="subdued">
          {t("appDirectory.subtitle", {
            defaultValue:
              "More tools from the makers of this app. Each installs from the Shopify App Store.",
          })}
        </Text>
        {apps === null ? (
          <LoadingGrid />
        ) : apps.length === 0 ? (
          <Card>
            <Box padding="400">
              <Text as="p" tone="subdued" alignment="center">
                {t("appDirectory.empty", {
                  defaultValue: "No other apps to show right now.",
                })}
              </Text>
            </Box>
          </Card>
        ) : (
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
            {apps.map((app) => (
              <AppCard key={app.appCode} app={app} />
            ))}
          </InlineGrid>
        )}
      </BlockStack>
    </Page>
  );
}
