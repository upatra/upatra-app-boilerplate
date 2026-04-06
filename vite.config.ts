import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
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
