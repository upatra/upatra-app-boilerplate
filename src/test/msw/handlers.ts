import { http } from "msw";

// Add your API mock handlers here.
// Example:
//   import { http, HttpResponse } from "msw";
//   export const handlers = [
//     http.get("/api/health", () => HttpResponse.json({ status: "ok" })),
//   ];

export const handlers: ReturnType<typeof http.get>[] = [];
