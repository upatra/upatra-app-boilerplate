import { describe, it, expect, beforeEach } from "@jest/globals";
import { createOnboardingStore } from "../lib/onboardingState";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.get(k) ?? null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
  get length() { return this.store.size; }
  key(i: number) { return Array.from(this.store.keys())[i] ?? null; }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

describe("createOnboardingStore namespaces flags by prefix and shop", () => {
  it("set and has roundtrip a flag for a shop", () => {
    const store = createOnboardingStore("onboarding");
    expect(store.has("a.myshopify.com", "dismissed")).toBe(false);
    store.set("a.myshopify.com", "dismissed");
    expect(store.has("a.myshopify.com", "dismissed")).toBe(true);
  });

  it("flags set for one shop do not leak to another", () => {
    const store = createOnboardingStore("onboarding");
    store.set("a.myshopify.com", "guide_read");
    expect(store.has("b.myshopify.com", "guide_read")).toBe(false);
  });

  it("two stores with different prefixes do not collide", () => {
    const a = createOnboardingStore("foo");
    const b = createOnboardingStore("bar");
    a.set("shop.myshopify.com", "dismissed");
    expect(b.has("shop.myshopify.com", "dismissed")).toBe(false);
  });

  it("clear removes a flag; resetAll removes a list of flags", () => {
    const store = createOnboardingStore("onboarding");
    store.set("shop", "a");
    store.set("shop", "b");
    store.clear("shop", "a");
    expect(store.has("shop", "a")).toBe(false);
    expect(store.has("shop", "b")).toBe(true);
    store.resetAll("shop", ["a", "b"]);
    expect(store.has("shop", "b")).toBe(false);
  });

  it("safe wrappers swallow localStorage errors", () => {
    (globalThis as unknown as { localStorage: { getItem(): never; setItem(): never; removeItem(): never } }).localStorage = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
      removeItem() { throw new Error("denied"); },
    };
    const store = createOnboardingStore("onboarding");
    expect(() => store.set("shop", "x")).not.toThrow();
    expect(store.has("shop", "x")).toBe(false);
    expect(() => store.clear("shop", "x")).not.toThrow();
  });
});
