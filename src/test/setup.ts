import "@testing-library/jest-dom";

// jsdom's Blob/File may lack arrayBuffer() — polyfill via FileReader so any
// code path that calls file.arrayBuffer() (e.g. xlsx/csv parsing) works in
// integration tests.
if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result as ArrayBuffer));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsArrayBuffer(this);
    });
  };
}

// Polaris requires window.matchMedia — plain no-ops since jest may not be available at module load
const noop = () => {};
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: noop,
    removeListener: noop,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => false,
  }),
});

// App Bridge `useAppBridge()` reads the `shopify` global injected by the App
// Bridge script tag. Stub it in jsdom so components that call
// `shopify.toast.show(...)` or `shopify.idToken()` render without throwing.
(globalThis as unknown as { shopify: unknown }).shopify = {
  toast: { show: noop },
  loading: noop,
  idToken: () => Promise.resolve(""),
};
