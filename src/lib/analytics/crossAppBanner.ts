/**
 * cross_app_banner_* events — the portfolio cross-promo banner.
 *
 * Rendered from apphub's `GET /apps` catalog at the global_footer placement.
 * `_shown` IS captured so true CTR (shown → clicked → install) is computable.
 *
 * `app` is the promoted arm: which catalog app this shop was bucketed into.
 * Slice conversion by `app` to see which cross-sell converts, and by
 * `placement` to compare surfaces.
 *
 * Lives in its own module (re-exported from events.ts) following the same split
 * as appDirectory.ts / reviewPrompt analytics.
 */
import { capture } from "../posthog";

export type CrossAppBannerPlacement = "global_footer" | "wizard_step1";

export interface CrossAppBannerProps {
  /** apphub appCode of the promoted app, e.g. "bulk_tagging" | "aiz_exporter". */
  app: string;
  /** App Store handle (apphub appSlug), e.g. "upatra-bulk-tagging". */
  appSlug: string;
  placement: CrossAppBannerPlacement;
}

export function trackCrossAppBannerShown(p: CrossAppBannerProps): void {
  capture("cross_app_banner_shown", {
    app: p.app,
    app_slug: p.appSlug,
    placement: p.placement,
  });
}

export function trackCrossAppBannerClicked(p: CrossAppBannerProps): void {
  capture("cross_app_banner_clicked", {
    app: p.app,
    app_slug: p.appSlug,
    placement: p.placement,
  });
}

/**
 * Fired when a merchant clicks the banner's "See all apps" link, which routes
 * to the in-app More Apps directory (`/more-apps`) rather than a single App
 * Store listing. This is the banner→directory funnel entry — pair it with
 * `app_directory_viewed` (source="cross_app_banner") to measure whether the
 * banner successfully drives traffic to the directory.
 */
export function trackCrossAppMoreAppsClicked(p: CrossAppBannerProps): void {
  capture("cross_app_more_apps_clicked", {
    app: p.app,
    app_slug: p.appSlug,
    placement: p.placement,
  });
}

export function trackCrossAppBannerDismissed(
  p: CrossAppBannerProps & { dismissCount: number },
): void {
  capture("cross_app_banner_dismissed", {
    app: p.app,
    app_slug: p.appSlug,
    placement: p.placement,
    dismiss_count: p.dismissCount,
  });
}
