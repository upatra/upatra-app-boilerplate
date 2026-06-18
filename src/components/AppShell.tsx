import { SkeletonPage } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, PlanProvider, useAuth } from "../context";
import Footer from "./Footer";
import { CrossAppBanner, CrossAppBannerProvider } from "./CrossAppBanner";
import { useAuthExchange } from "../hooks/useAuthExchange";
import { useReviewPrompt } from "../hooks/useReviewPrompt";
import { initPostHog } from "../lib/posthog";
import { env } from "../config/env";
import { AppDirectoryPage, BillingPage, HelpPage } from "../pages";


function HomePage() {
  // ── Review-prompt wiring example ───────────────────────────────────────────
  // The review prompt is a wrapper around shopify.reviews.request() that asks
  // for a rating only at a genuine "win" moment, with per-shop cooldowns. The
  // hook decides whether to actually open — you just call trigger() once the
  // user has truly succeeded (a bulk job finished, an export delivered, etc.).
  //
  // To use it in your app:
  //   1. const reviewPrompt = useReviewPrompt({ appName: "My App" });
  //   2. At your success moment ONLY: reviewPrompt.trigger("primary_action_complete");
  //   3. Render {reviewPrompt.modal} somewhere stable in the tree.
  //
  // The template has no real success action, so trigger() is NOT called here on
  // purpose — wire it to your own win event. We still render the modal so the
  // pattern is complete and copy-paste ready.
  const reviewPrompt = useReviewPrompt({ appName: env.appName });

  return (
    <SkeletonPage>
      {/* Replace with the app's home page content. */}
      {/* Example: at a real success moment, call
          reviewPrompt.trigger("primary_action_complete"). */}
      {reviewPrompt.modal}
    </SkeletonPage>
  );
}

function AppContent() {
  const { isLoading } = useAuth();
  if (isLoading) return <SkeletonPage primaryAction />;

  return (
    <PlanProvider>
      <CrossAppBannerProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/pricing" element={<BillingPage />} />
          <Route
            path="/billing"
            element={<Navigate to={{ pathname: "/pricing", search: window.location.search }} replace />}
          />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/more-apps" element={<AppDirectoryPage />} />
        </Routes>
        <Footer />
        {/* Persistent portfolio cross-sell strip. Off by default — flip
            VITE_CROSS_APP_BANNER_ENABLED="true" once the apphub catalog
            returns this app's siblings. An app author can also mount an
            in-page <CrossAppBanner placement="wizard_step1" /> on a "win"
            surface for a higher-salience pitch; the footer dedups against it. */}
        <CrossAppBanner placement="global_footer" />
      </CrossAppBannerProvider>
    </PlanProvider>
  );
}

export default function AppShell() {
  const shopify = useAppBridge();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navRef = useRef<HTMLDivElement>(null);

  const shop = searchParams.get("shop") || "";
  const host = searchParams.get("host") || "";

  const { authReady, isNewInstall } = useAuthExchange({ shopify, shop });

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    shopify.loading(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authReady) return;
    shopify.loading(false);
  }, [authReady, location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture phase: loading bar appears before navigation begins
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const handleClick = () => shopify.loading(true);
    nav.addEventListener("click", handleClick, { capture: true });
    return () => nav.removeEventListener("click", handleClick, { capture: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthProvider host={host} shop={shop} isNewInstall={isNewInstall}>
      {!authReady ? <SkeletonPage primaryAction /> : <AppContent />}

      <div ref={navRef}>
        <s-app-nav>
          <s-link href="/pricing">Pricing</s-link>
          <s-link href="/more-apps">More apps</s-link>
          <s-link href="/help">Help</s-link>
        </s-app-nav>
      </div>
    </AuthProvider>
  );
}
