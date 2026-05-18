import { SkeletonPage } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef } from "react";
import { Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, PlanProvider, useAuth } from "../context";
import Footer from "./Footer";
import { useAuthExchange } from "../hooks/useAuthExchange";
import { initPostHog } from "../lib/posthog";
import { BillingPage, HelpPage } from "../pages";


function HomePage() {
  return (
    <SkeletonPage>
      {/* Replace with the app's home page content. */}
    </SkeletonPage>
  );
}

function AppContent() {
  const { isLoading } = useAuth();
  if (isLoading) return <SkeletonPage primaryAction />;

  return (
    <PlanProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/help" element={<HelpPage />} />
      </Routes>
      <Footer />
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
          <s-link href="/billing">Billing</s-link>
          <s-link href="/help">Help</s-link>
        </s-app-nav>
      </div>
    </AuthProvider>
  );
}
