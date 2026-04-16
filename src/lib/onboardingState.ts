// Per-shop onboarding flags stored in localStorage. Use createOnboardingStore
// to get a typed accessor for a flag namespace (e.g. "onboarding").
//
// Example:
//   const store = createOnboardingStore("onboarding");
//   store.set(shop, "dismissed");
//   if (store.has(shop, "dismissed")) { ... }

const safeGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // ignore (private mode, quota, etc.)
  }
};

const safeRemove = (k: string) => {
  try {
    localStorage.removeItem(k);
  } catch {
    // ignore
  }
};

export interface OnboardingStore {
  has: (shop: string, flag: string) => boolean;
  set: (shop: string, flag: string) => void;
  clear: (shop: string, flag: string) => void;
  resetAll: (shop: string, flags: string[]) => void;
}

export function createOnboardingStore(prefix: string): OnboardingStore {
  const key = (shop: string, flag: string) =>
    `${prefix}:${flag}:${shop || "_"}`;

  return {
    has: (shop, flag) => safeGet(key(shop, flag)) === "1",
    set: (shop, flag) => safeSet(key(shop, flag), "1"),
    clear: (shop, flag) => safeRemove(key(shop, flag)),
    resetAll: (shop, flags) => flags.forEach((f) => safeRemove(key(shop, f))),
  };
}
