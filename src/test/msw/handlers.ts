import { http, HttpResponse } from "msw";

// Add your API mock handlers here.
// Example:
// export const handlers = [
//   http.get("/api/health", () => HttpResponse.json({ status: "ok" })),
// ];

export const handlers: ReturnType<typeof http.get>[] = [];
