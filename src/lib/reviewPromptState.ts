// Per-shop local persistence for the "leave a review" prompt.
// Pairs with `useReviewPrompt` to decide whether to surface our wrapper modal
// before calling Shopify's `shopify.reviews.request()`. Shopify enforces its
// own 60-day / 3-per-year rate limit; this state only governs OUR wrapper.
//
// Merchants who have already reviewed are filtered automatically — Shopify
// returns `already-reviewed` on the first request() call and the hook flips
// our local `reviewed` flag terminal, so no ignored-shops list is needed.

const STATE_KEY = "app_review_prompt";

export interface ReviewPromptState {
  /** Number of times the merchant clicked "Maybe later" or X. */
  dismissCount: number;
  /** Trigger attempts remaining to skip before the modal shows again. */
  skipsRemaining: number;
  /** Terminal — set true when the merchant accepts and we call shopify.reviews.request(). */
  reviewed: boolean;
}

const EMPTY_STATE: ReviewPromptState = {
  dismissCount: 0,
  skipsRemaining: 0,
  reviewed: false,
};

const key = (shop: string) => `${STATE_KEY}:${shop || "_"}`;

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

export const getReviewPromptState = (shop: string): ReviewPromptState => {
  const raw = safeGet(key(shop));
  if (!raw) return { ...EMPTY_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<ReviewPromptState>;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return { ...EMPTY_STATE };
  }
};

const save = (shop: string, state: ReviewPromptState) =>
  safeSet(key(shop), JSON.stringify(state));

// Skip schedule after a dismiss. Grows then caps so the prompt never spams
// but always eventually returns. Pure for tests.
export const cooldownForDismissCount = (dismissCount: number): number => {
  if (dismissCount <= 1) return 3;
  if (dismissCount === 2) return 6;
  return 10;
};

/** Pure eligibility check. No side effects — call this from tests. */
export const isEligibleToShow = (state: ReviewPromptState): boolean => {
  if (state.reviewed) return false;
  if (state.skipsRemaining > 0) return false;
  return true;
};

/**
 * Decide what to do for a single trigger attempt and commit the side effect.
 * Returns true when the modal should open, false when the attempt was
 * consumed by the cooldown (skipsRemaining decremented) or rejected outright.
 */
export const consumeTrigger = (shop: string): boolean => {
  const state = getReviewPromptState(shop);
  if (state.reviewed) return false;
  if (state.skipsRemaining > 0) {
    save(shop, { ...state, skipsRemaining: state.skipsRemaining - 1 });
    return false;
  }
  return true;
};

export const recordDismiss = (shop: string): void => {
  const state = getReviewPromptState(shop);
  const nextCount = state.dismissCount + 1;
  save(shop, {
    ...state,
    dismissCount: nextCount,
    skipsRemaining: cooldownForDismissCount(nextCount),
  });
};

export const markReviewed = (shop: string): void => {
  const state = getReviewPromptState(shop);
  save(shop, { ...state, reviewed: true, skipsRemaining: 0 });
};
