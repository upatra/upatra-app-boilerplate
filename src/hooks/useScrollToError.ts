import { useEffect, useRef } from "react";

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el.parentElement;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const style = window.getComputedStyle(cur);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      cur.scrollHeight > cur.clientHeight
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Returns a ref to attach to the wrapper around an error banner. When `error`
 * transitions to a truthy value, both the window and the nearest scrollable
 * ancestor (e.g. a Polaris Modal body) are scrolled to the very top, so the
 * banner — which always sits at the top of its form/modal — is the first
 * thing the user sees.
 */
export function useScrollToError<T>(error: T | null | undefined) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!error) return;
    const el = ref.current;
    if (!el) return;

    // Wait a frame so the conditional banner is mounted before scrolling.
    const id = window.requestAnimationFrame(() => {
      // Always scroll the window to the top first.
      window.scrollTo({ top: 0, behavior: "smooth" });

      // If the banner lives inside an inner scroll container (e.g. a Polaris
      // Modal body), scroll that to the top too.
      const parent = findScrollableAncestor(el);
      if (parent && parent !== document.scrollingElement) {
        parent.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [error]);

  return ref;
}
