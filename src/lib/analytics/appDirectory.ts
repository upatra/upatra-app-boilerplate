/**
 * app_directory_* events — the "More Upatra apps" page.
 *
 * A portfolio cross-promo surface rendered from apphub's `GET /apps` catalog.
 * `_viewed` is the impression (so CTR is computable); `_card_clicked` fires
 * when a merchant opens an app's App Store listing.
 *
 * Lives in its own module (re-exported from events.ts) following the same
 * split as the other analytics sub-modules.
 */
import { capture } from "../posthog";

export function trackAppDirectoryViewed(args: {
  appCount: number;
  /**
   * Where the merchant arrived from: "cross_app_banner" when they followed the
   * banner's "See all apps" link, "nav" for the app-nav entry / direct visit.
   * Lets us measure the banner→directory funnel against the page's own CTR.
   */
  source?: string;
}): void {
  capture("app_directory_viewed", {
    app_count: args.appCount,
    source: args.source ?? "nav",
  });
}

export function trackAppDirectoryCardClicked(args: {
  app: string;
  appSlug: string;
  status: string;
  /** Which part of the card was clicked: "icon" | "title" | "button". */
  element: string;
}): void {
  capture("app_directory_card_clicked", {
    app: args.app,
    app_slug: args.appSlug,
    status: args.status,
    element: args.element,
  });
}
