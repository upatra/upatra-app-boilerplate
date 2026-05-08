import { useEffect, useState } from "react";
import { exchangeShopifyToken } from "../lib/apphubApi";
import { setSessionTokenGetter } from "../lib/api";
import { identifyShop } from "../lib/posthog";
import { log } from "../lib/logger";

const authLog = log.feature("auth");

interface AppBridgeLike {
  idToken: () => Promise<string>;
}

/**
 * Boots Shopify session auth: wires the token getter into the API client,
 * fetches the initial id token, and (fire-and-forget) exchanges it with
 * Apphub to learn whether the shop is a fresh install.
 *
 * Returns early-available `authReady` (true once we have a token or know we
 * errored) and a later `isNewInstall` flag (null while unknown).
 */
export function useAuthExchange(args: {
  shopify: AppBridgeLike | undefined | null;
  shop: string;
}) {
  const { shopify, shop } = args;
  const [authReady, setAuthReady] = useState(false);
  const [isNewInstall, setIsNewInstall] = useState<boolean | null>(null);

  useEffect(() => {
    if (!shopify?.idToken) return;
    setSessionTokenGetter(() => shopify.idToken());
    shopify
      .idToken()
      .then((code) => {
        setAuthReady(true);
        if (shop) identifyShop(shop);
        // Fire-and-forget; when the exchange resolves we learn whether this
        // is a fresh install so onboarding can gate on the authoritative signal.
        exchangeShopifyToken(shop, code).then((res) => {
          if (
            res &&
            "isNewInstall" in res &&
            typeof res.isNewInstall === "boolean"
          ) {
            setIsNewInstall(res.isNewInstall);
          }
        });
      })
      .catch((e) => {
        authLog.exception(e, { where: "useAuthExchange.idToken" });
        setAuthReady(true); // unblock so errors surface in the UI
      });
  }, [shopify]); // eslint-disable-line react-hooks/exhaustive-deps

  return { authReady, isNewInstall };
}
