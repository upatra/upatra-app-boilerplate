import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Badge,
  BlockStack,
  Box,
  Card,
  Icon,
  InlineGrid,
  InlineStack,
  Link,
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
import { env } from "../../config/env";

const ICON_SIZE = 56;

// Which element of the card was clicked — mirrored into both the PostHog
// event (`element`) and the listing URL (`utm_content`).
type CardElement = "icon" | "title";

// Attribution for the Partner Dashboard: Shopify's app-store analytics break
// listing traffic down by UTM params. utm_source identifies the host app
// sending the click (e.g. "bulk-fulfill"), utm_campaign the surface.
const UTM_SOURCE = (env.appCode || "upatra-app").replace(/_/g, "-");

function AppStoreUrl(slug: string, element: CardElement): string {
  const params = new URLSearchParams({
    utm_source: UTM_SOURCE,
    utm_medium: "in_app",
    utm_campaign: "more_apps",
    utm_content: element,
  });
  return `https://apps.shopify.com/${slug}?${params.toString()}`;
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

  // Track-only: navigation happens via the anchor's `url` (Polaris Link),
  // because `window.open` is popup-blocked inside Shopify's embedded App Bridge
  // iframe — the click logged but the App Store never opened (clicks, no
  // installs). A real anchor click is a trusted gesture the browser allows.
  const trackClick = (element: CardElement) => {
    trackAppDirectoryCardClicked({
      app: app.appCode,
      appSlug: app.appSlug,
      status: app.status,
      element,
    });
  };

  return (
    <Card>
      <InlineStack gap="300" blockAlign="start" wrap={false}>
        {/* Icon click is redundant with the title link (keyboard-accessible),
            so it stays out of the tab order. */}
        {isLive ? (
          <Link
            url={AppStoreUrl(app.appSlug, "icon")}
            external
            onClick={() => trackClick("icon")}
          >
            <AppIcon src={app.icon} />
          </Link>
        ) : (
          <AppIcon src={app.icon} />
        )}
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            {isLive ? (
              <Link
                url={AppStoreUrl(app.appSlug, "title")}
                external
                monochrome
                removeUnderline
                onClick={() => trackClick("title")}
              >
                <Text as="h2" variant="headingMd">
                  {app.appName}
                </Text>
              </Link>
            ) : (
              <Text as="h2" variant="headingMd">
                {app.appName}
              </Text>
            )}
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
  const [searchParams] = useSearchParams();
  // Attribution: the cross-app banner links here with ?from=cross_app_banner so
  // the banner→directory funnel is sliceable from the page's own traffic.
  const source = searchParams.get("from") ?? undefined;
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
          trackAppDirectoryViewed({ appCount: list.length, source });
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
  }, [i18n.language, source]);

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
