import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@shopify/polaris")) return "polaris";
          if (id.includes("node_modules/posthog-js")) return "vendor-posthog";
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router-dom/") ||
            id.includes("node_modules/axios/")
          )
            return "vendor";
        },
      },
    },
  },
  server: {
    port: 3000,
    allowedHosts: [".ngrok.app", ".ngrok-free.dev"],
    headers: {
      "Content-Security-Policy":
        "frame-ancestors https://*.myshopify.com https://admin.shopify.com",
    },
  },
});
