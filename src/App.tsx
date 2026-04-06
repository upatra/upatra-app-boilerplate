import "@shopify/polaris/build/esm/styles.css";
import "./App.css";
import { AppProvider } from "@shopify/polaris";
import { BrowserRouter } from "react-router-dom";
import AppShell from "./components/AppShell";

const isShopifyEmbedded = window.self !== window.top;

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider i18n={{}}>
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
