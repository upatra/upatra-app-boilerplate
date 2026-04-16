import { createRoot } from "react-dom/client";
import App from "./App";

async function bootstrap() {
  if (import.meta.env.VITE_USE_MOCK === "true") {
    try {
      const { worker } = await import("./mocks/browser");
      await worker.start({ onUnhandledRequest: "bypass" });
    } catch (e) {
      console.warn("[MSW] Failed to start — run `npx msw init public/` then restart.", e);
    }
  }
  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();
