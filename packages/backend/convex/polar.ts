/**
 * Polar.sh payment foundation.
 *
 * Deployment contract:
 * - `POLAR_ORGANIZATION_TOKEN`   required for API calls (checkout, portal, product list)
 * - `POLAR_WEBHOOK_SECRET`       required for webhook ingestion; when unset, the webhook
 *                                route in `http.ts` is not registered (returns 404)
 * - `POLAR_PRODUCT_PRO_ID`       required for Pro-tier checkout; without it,
 *                                `getConfiguredProducts` returns an empty map and any
 *                                call to `generateCheckoutLink` using the Pro product id
 *                                is the caller's responsibility to guard against
 * - `POLAR_SERVER`               "sandbox" (default) or "production"; read inside the
 *                                component via its own env fallback
 */

import { Polar, subscriptionValidator } from "@convex-dev/polar";
import { v } from "convex/values";

import type { DataModel } from "./_generated/dataModel";

import { api, components } from "./_generated/api";
import { query } from "./_generated/server";
import { optionalAuth } from "./lib/functions";

const proProductId = process.env.POLAR_PRODUCT_PRO_ID;

export const polar = new Polar<DataModel>(components.polar, {
  getUserInfo: async (ctx): Promise<{ userId: string; email: string }> => {
    const user = await ctx.runQuery(api.polarAuth.getAuthenticatedUserInfo, {});
    if (!user) {
      throw new Error("Polar: no authenticated user");
    }
    return user;
  },
  ...(proProductId ? { products: { pro: proProductId } } : {}),
});

export const {
  changeCurrentSubscription,
  cancelCurrentSubscription,
  getConfiguredProducts,
  listAllProducts,
  listAllSubscriptions,
  generateCheckoutLink,
  generateCustomerPortalUrl,
} = polar.api();

export const getCurrentSubscription = query({
  args: {},
  returns: v.union(subscriptionValidator, v.null()),
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
    if (!user) return null;
    return await polar.getCurrentSubscription(ctx, { userId: user._id });
  },
});
