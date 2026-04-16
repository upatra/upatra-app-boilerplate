import { SkeletonPage } from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef, useState } from "react";
import { Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, PlanProvider, useAuth } from "../context";
import Footer from "./Footer";
import { exchangeShopifyToken } from "../lib/apphubApi";
import { setSessionTokenGetter } from "../lib/api";
import { identifyShop, initPostHog } from "../lib/posthog";
import { BillingPage, HelpPage } from "../pages";

const APP_TITLE = "My Shopify App";
const SUPPORT_EMAIL = ""; // set a support email to render the footer

function HomePage() {
  return (
    <SkeletonPage title={APP_TITLE}>
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
      <Footer supportEmail={SUPPORT_EMAIL} />
    </PlanProvider>
  );
}

export default function AppShell() {
  const shopify = useAppBridge();
  const [authReady, setAuthReady] = useState(false);
  const [isNewInstall, setIsNewInstall] = useState<boolean | null>(null);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navRef = useRef<HTMLDivElement>(null);

  const shop = searchParams.get("shop") || "";
  const host = searchParams.get("host") || "";

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!shopify?.idToken) return;
    setSessionTokenGetter(() => shopify.idToken());
    shopify
      .idToken()
      .then((code) => {
        setAuthReady(true);
        if (shop) identifyShop(shop);
        // Fire-and-forget: exchange token in background. When it resolves,
        // propagate isNewInstall so onboarding can gate on the backend signal.
        exchangeShopifyToken(shop, code).then((res) => {
          if (res && "isNewInstall" in res && typeof res.isNewInstall === "boolean") {
            setIsNewInstall(res.isNewInstall);
          }
        });
      })
      .catch((e) => {
        console.error("Error getting session token:", e);
        setAuthReady(true); // unblock so errors surface in the UI
      });
  }, [shopify]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <TitleBar title={APP_TITLE} />
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
