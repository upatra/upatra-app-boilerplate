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

export function trackAppDirectoryViewed(args: { appCount: number }): void {
  capture("app_directory_viewed", { app_count: args.appCount });
}

export function trackAppDirectoryCardClicked(args: {
  app: string;
  appSlug: string;
  status: string;
}): void {
  capture("app_directory_card_clicked", {
    app: args.app,
    app_slug: args.appSlug,
    status: args.status,
  });
}
