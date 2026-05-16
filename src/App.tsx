import "@shopify/polaris/build/esm/styles.css";
import "./App.css";
import { AppProvider } from "@shopify/polaris";
import { BrowserRouter } from "react-router-dom";
import AppShell from "./components/AppShell";
import type { PolarisTranslations } from "./i18n";

const isShopifyEmbedded = window.self !== window.top;

interface AppProps {
  polarisTranslations: PolarisTranslations;
}

export default function App({ polarisTranslations }: AppProps) {
  return (
    <BrowserRouter>
      <AppProvider i18n={polarisTranslations}>
        {isShopifyEmbedded ? (
          <AppShell />
        ) : (
          // Dev mode: render without Shopify embedding (uses VITE_DEV_STORE_URL)
          <AppShell />
        )}
      </AppProvider>
    </BrowserRouter>
  );
}
