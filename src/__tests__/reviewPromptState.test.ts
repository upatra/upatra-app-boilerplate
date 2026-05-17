// Eligibility + cooldown + terminal-state coverage for the review prompt
// state store. Uses an in-memory localStorage so the module's safe wrappers
// can run in the unit (Node) test project.

import { describe, test, expect, beforeEach } from "@jest/globals";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.get(k) ?? null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
  get length() { return this.store.size; }
  key(i: number) { return Array.from(this.store.keys())[i] ?? null; }
}

(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

// Imported AFTER the localStorage stub is installed so the module's first
// read sees the in-memory store.
import {
  cooldownForDismissCount,
  consumeTrigger,
  getReviewPromptState,
  isEligibleToShow,
  markReviewed,
  recordDismiss,
} from "../lib/reviewPromptState";

const SHOP = "test-shop.myshopify.com";

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

describe("cooldownForDismissCount grows then caps", () => {
  test("first dismiss skips 3", () => {
    expect(cooldownForDismissCount(1)).toBe(3);
  });
  test("second dismiss skips 6", () => {
    expect(cooldownForDismissCount(2)).toBe(6);
  });
  test("third and beyond cap at 10", () => {
    expect(cooldownForDismissCount(3)).toBe(10);
    expect(cooldownForDismissCount(99)).toBe(10);
  });
});

describe("isEligibleToShow gates on terminal flag and cooldown", () => {
  test("fresh state is eligible", () => {
    expect(isEligibleToShow({ dismissCount: 0, skipsRemaining: 0, reviewed: false })).toBe(true);
  });
  test("reviewed flag blocks forever", () => {
    expect(isEligibleToShow({ dismissCount: 1, skipsRemaining: 0, reviewed: true })).toBe(false);
  });
  test("nonzero skipsRemaining blocks", () => {
    expect(isEligibleToShow({ dismissCount: 1, skipsRemaining: 2, reviewed: false })).toBe(false);
  });
});

describe("consumeTrigger decrements cooldown then unlocks", () => {
  test("returns true on fresh state", () => {
    expect(consumeTrigger(SHOP)).toBe(true);
  });

  test("after a dismiss, the next 3 attempts are consumed silently then it opens again", () => {
    recordDismiss(SHOP);
    expect(consumeTrigger(SHOP)).toBe(false);
    expect(consumeTrigger(SHOP)).toBe(false);
    expect(consumeTrigger(SHOP)).toBe(false);
    expect(consumeTrigger(SHOP)).toBe(true);
  });

  test("once reviewed, no further attempts open the modal", () => {
    markReviewed(SHOP);
    expect(consumeTrigger(SHOP)).toBe(false);
    expect(consumeTrigger(SHOP)).toBe(false);
  });
});

describe("recordDismiss grows the cooldown on each successive dismiss", () => {
  test("dismiss schedule follows 3 → 6 → 10 → 10", () => {
    recordDismiss(SHOP);
    expect(getReviewPromptState(SHOP).skipsRemaining).toBe(3);
    recordDismiss(SHOP);
    expect(getReviewPromptState(SHOP).skipsRemaining).toBe(6);
    recordDismiss(SHOP);
    expect(getReviewPromptState(SHOP).skipsRemaining).toBe(10);
    recordDismiss(SHOP);
    expect(getReviewPromptState(SHOP).skipsRemaining).toBe(10);
  });
});

describe("markReviewed is terminal", () => {
  test("setting reviewed clears any pending cooldown and stays sticky", () => {
    recordDismiss(SHOP);
    markReviewed(SHOP);
    const state = getReviewPromptState(SHOP);
    expect(state.reviewed).toBe(true);
    expect(state.skipsRemaining).toBe(0);
    // A subsequent dismiss can't un-stick the reviewed terminal flag's
    // suppression on consumeTrigger.
    recordDismiss(SHOP);
    expect(consumeTrigger(SHOP)).toBe(false);
  });
});

describe("state is keyed per shop", () => {
  test("dismissing one shop does not affect another", () => {
    const other = "other-shop.myshopify.com";
    recordDismiss(SHOP);
    expect(consumeTrigger(other)).toBe(true);
    expect(consumeTrigger(SHOP)).toBe(false);
  });
});
