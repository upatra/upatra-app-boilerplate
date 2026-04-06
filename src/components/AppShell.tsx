import { Page, Spinner, Text } from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "../context";
import { exchangeShopifyToken } from "../lib/apphubApi";
import { setSessionTokenGetter } from "../lib/api";

// ─── Inner shell (rendered inside AuthProvider) ───────────────────────────────

function AppContent() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <Spinner />
      </div>
    );
  }

  return (
    <Page title="My Shopify App">
      <Text as="p" variant="bodyMd">
        Your app content goes here. Add routes and components to build your app.
      </Text>
    </Page>
  );
}

// ─── App shell with App Bridge + Auth wiring ─────────────────────────────────

export default function AppShell() {
  const shopify = useAppBridge();
  const [authReady, setAuthReady] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navRef = useRef<HTMLDivElement>(null);

  const shop = searchParams.get("shop") || "";
  const host = searchParams.get("host") || "";

  useEffect(() => {
    if (!shopify?.idToken) return;
    setSessionTokenGetter(() => shopify.idToken());
    shopify
      .idToken()
      .then((code) => {
        setAuthReady(true);
        // Fire-and-forget: exchange token in background, does not block rendering
        exchangeShopifyToken(shop, code);
      })
      .catch((e) => {
        console.error("Error getting session token:", e);
        setAuthReady(true); // unblock so errors show in UI
      });
  }, [shopify]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear loading indicator once the new route has rendered
  useEffect(() => {
    setIsNavigating(false);
    shopify.loading(false);
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture phase: loading bar appears before navigation begins
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const handleClick = () => {
      setIsNavigating(true);
      shopify.loading(true);
    };
    nav.addEventListener("click", handleClick, { capture: true });
    return () => nav.removeEventListener("click", handleClick, { capture: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthProvider host={host} shop={shop}>
      <TitleBar title="My Shopify App" />
      {!authReady || isNavigating ? (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
          <Spinner />
        </div>
      ) : (
        <AppContent />
      )}

      {/*
        Navigation sidebar — uncomment and add routes as needed:

        <div ref={navRef}>
          <s-app-nav>
            <s-link href="/dashboard">Dashboard</s-link>
            <s-link href="/settings">Settings</s-link>
          </s-app-nav>
        </div>
      */}
    </AuthProvider>
  );
}
