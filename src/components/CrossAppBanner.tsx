import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Banner, Box, Button, Icon, InlineStack, Text } from "@shopify/polaris";
import { AppsIcon } from "@shopify/polaris-icons";
import { useAuth } from "../context/AuthContext";
import { env } from "../config/env";
import { log } from "../lib/logger";
import { getAppCatalog, type AppCatalogEntry } from "../lib/apphubApi";
import {
  crossAppPitch,
  crossAppPitchVariantCount,
  crossAppStoreUrl,
  dismissCrossAppBanner,
  getCrossAppDismissCount,
  pickCrossAppArm,
  recordCrossAppClick,
  recordCrossAppImpression,
  shouldShowCrossAppBanner,
  stampCrossAppInstall,
} from "../lib/crossAppBanner";
import {
  trackCrossAppBannerClicked,
  trackCrossAppBannerDismissed,
  trackCrossAppBannerShown,
  trackCrossAppMoreAppsClicked,
  type CrossAppBannerPlacement,
} from "../lib/analytics/crossAppBanner";

const bannerLog = log.feature("crossAppBanner");

// Dedup: the persistent footer strip suppresses itself when a higher-salience
// in-page banner (any non-footer placement) is already pitching an app, so a
// merchant doesn't see the same cross-sell twice on one screen. An app author
// who mounts an in-page <CrossAppBanner> gets this for free via the provider.
const PageBannerHandlers = createContext<{
  add: () => void;
  remove: () => void;
} | null>(null);
const PageBannerCount = createContext<number>(0);

export function CrossAppBannerProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const handlers = useMemo(
    () => ({
      add: () => setCount((c) => c + 1),
      remove: () => setCount((c) => c - 1),
    }),
    [],
  );
  return (
    <PageBannerHandlers.Provider value={handlers}>
      <PageBannerCount.Provider value={count}>
        {children}
      </PageBannerCount.Provider>
    </PageBannerHandlers.Provider>
  );
}

function AppIcon({ src, size = 32 }: { src: string | null; size?: number }) {
  if (!src) {
    return (
      <Box
        aria-hidden
        background="bg-surface-secondary"
        borderRadius="200"
        minWidth={`${size}px`}
      >
        <div
          style={{
            width: size,
            height: size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon source={AppsIcon} tone="subdued" />
        </div>
      </Box>
    );
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        objectFit: "cover",
        flexShrink: 0,
      }}
    />
  );
}

export function CrossAppBanner({
  placement,
}: {
  placement: CrossAppBannerPlacement;
}) {
  const { shopifyDomain, isNewInstall } = useAuth();
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();

  // Anchor the new-install window: stamp install time once, the first time
  // apphub tells us this is a fresh install. Runs regardless of eligibility so
  // the date is recorded even when the banner is currently rested. Idempotent.
  useEffect(() => {
    if (isNewInstall === true) stampCrossAppInstall(shopifyDomain);
  }, [isNewInstall, shopifyDomain]);

  // Eligibility (kill switch + dismiss backoff) is decided once at mount. Both
  // are stable for the lifetime of a render, so there's no need to re-check.
  const [eligible] = useState(
    () => env.crossAppBannerEnabled && shouldShowCrossAppBanner(shopifyDomain),
  );
  const [app, setApp] = useState<AppCatalogEntry | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const handlers = useContext(PageBannerHandlers);
  const pageBannerCount = useContext(PageBannerCount);

  // Fetch the catalog and pick this shop's promoted app. Only when eligible, so
  // the kill switch / backed-off shops make zero network calls.
  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    getAppCatalog(i18n.language, { excludeInstalled: true })
      .then((catalog) => {
        if (cancelled) return;
        setApp(pickCrossAppArm(shopifyDomain, catalog));
      })
      .catch((e) => {
        if (cancelled) return;
        bannerLog.exception(e, { where: "CrossAppBanner", placement });
      });
    return () => {
      cancelled = true;
    };
  }, [eligible, i18n.language, shopifyDomain, placement]);

  // The footer hides while an in-page banner is live (dedup); the in-page
  // banner itself registers its presence so the footer can see it.
  const visible = eligible && !dismissed && app !== null;
  const footerSuppressed = placement === "global_footer" && pageBannerCount > 0;
  // Any in-page placement registers so the persistent footer dedups itself
  // while a more salient banner is on screen.
  const registersAsPageBanner = visible && placement !== "global_footer";

  useEffect(() => {
    if (!registersAsPageBanner || !handlers) return;
    handlers.add();
    return () => handlers.remove();
  }, [registersAsPageBanner, handlers]);

  // Fire the impression exactly once, only when the banner is actually shown
  // (eligible, app resolved, not deduped). This is the denominator for CTR.
  const shownTracked = useRef(false);
  const shouldRender = visible && !footerSuppressed;
  useEffect(() => {
    if (!shouldRender || shownTracked.current || !app) return;
    shownTracked.current = true;
    trackCrossAppBannerShown({
      app: app.appCode,
      appSlug: app.appSlug,
      placement,
    });
    // Count this impression toward the auto-backoff-on-ignore threshold. When
    // it tips over, the banner soft-dismisses and rests (next mount won't show
    // it until the backoff elapses) — this is what stops the per-shop
    // impression blindness on the persistent footer.
    recordCrossAppImpression(shopifyDomain);
  }, [shouldRender, app, placement, shopifyDomain]);

  if (!shouldRender || !app) return null;

  // External navigation from inside Shopify's embedded App Bridge iframe must go
  // through a real anchor (Polaris `url` + `external`), NOT `window.open`: a
  // programmatic popup is blocked by the browser inside the sandboxed iframe, so
  // the click was logged but the App Store tab never opened — the cause of
  // clicks-with-zero-installs. An anchor is a trusted user gesture the browser
  // allows. We attach the URL to the Button/Banner action below and keep onClick
  // purely for analytics.
  const utmSource = (env.appCode || "upatra-app").replace(/_/g, "-");
  const installUrl = crossAppStoreUrl(app.appSlug, placement, utmSource);
  const onInstall = () => {
    trackCrossAppBannerClicked({
      app: app.appCode,
      appSlug: app.appSlug,
      placement,
    });
    // Engaged: clear the ignore counter so a clicker is never rested for
    // "ignoring" the banner, and mark the shop as having engaged at least once.
    recordCrossAppClick(shopifyDomain);
  };

  // "See all apps" routes to the in-app More Apps directory (internal SPA route,
  // so useNavigate — not an external anchor). The ?from tag lets the directory
  // attribute its impression to the banner, giving the directory a real traffic
  // source instead of only the app-nav entry.
  const onSeeAllApps = () => {
    trackCrossAppMoreAppsClicked({
      app: app.appCode,
      appSlug: app.appSlug,
      placement,
    });
    navigate("/more-apps?from=cross_app_banner");
  };
  const seeAll = t("crossAppBanner.seeAllApps", {
    defaultValue: "See all apps",
  });

  // Dismiss is offered on the in-page banner only; the global_footer strip
  // stays persistent.
  const onDismiss = () => {
    const count = dismissCrossAppBanner(shopifyDomain);
    trackCrossAppBannerDismissed({
      app: app.appCode,
      appSlug: app.appSlug,
      placement,
      dismissCount: count,
    });
    setDismissed(true);
  };

  const cta = t("crossAppBanner.cta", {
    appName: app.appName,
    defaultValue: `Try ${app.appName}`,
  });
  const trust = t("crossAppBanner.trust", {
    defaultValue: "From the makers of this app",
  });
  // Benefit-led pitch, rotated by rest cycle so a re-shown banner says something
  // new (same pitch every time trains the merchant to ignore it). The rotation
  // index is the shop's dismiss/rest count; the i18n key carries the variant so
  // a cached translation can't pin the copy to one angle. Falls back to the
  // catalog description for apps without curated variants.
  const variantCount = crossAppPitchVariantCount(app.appCode);
  const rotation = variantCount > 0
    ? getCrossAppDismissCount(shopifyDomain) % variantCount
    : 0;
  const pitch = t(`crossAppBanner.pitch.${app.appCode}.v${rotation}`, {
    defaultValue: crossAppPitch(app.appCode, app.description, rotation),
  });

  // Non-footer placements — a full Polaris Banner: more real estate, higher
  // salience, dismissible. Mount one of these on a "win" surface for a stronger
  // cross-sell than the persistent footer strip.
  if (placement !== "global_footer") {
    return (
      <Banner
        tone="info"
        onDismiss={onDismiss}
        title={app.appName}
        action={{
          content: cta,
          url: installUrl,
          external: true,
          onAction: onInstall,
        }}
        secondaryAction={{ content: seeAll, onAction: onSeeAllApps }}
      >
        <Text as="p">{pitch}</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {trust}
        </Text>
      </Banner>
    );
  }

  // global_footer — a slim, persistent strip across the bottom of the shell.
  return (
    <Box
      paddingBlock="300"
      paddingInline="400"
      background="bg-surface-secondary"
      borderBlockStartWidth="025"
      borderColor="border"
    >
      <InlineStack gap="300" blockAlign="center" align="center" wrap={false}>
        <AppIcon src={app.icon} size={28} />
        <Text as="p" variant="bodySm">
          {trust}:{" "}
          <Text as="span" variant="bodySm" fontWeight="semibold">
            {app.appName}
          </Text>{" "}
          — {pitch}
        </Text>
        <Button
          variant="primary"
          size="slim"
          url={installUrl}
          target="_blank"
          external
          onClick={onInstall}
        >
          {cta}
        </Button>
        <Button variant="tertiary" size="slim" onClick={onSeeAllApps}>
          {seeAll}
        </Button>
      </InlineStack>
    </Box>
  );
}
