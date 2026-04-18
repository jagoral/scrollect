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
import { ConvexError, v } from "convex/values";

import type { DataModel } from "./_generated/dataModel";

import { api, components } from "./_generated/api";
import { action, query } from "./_generated/server";
import { optionalAuth, requireAuth } from "./lib/functions";

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

export const startProCheckout = action({
  args: {
    origin: v.string(),
    successUrl: v.string(),
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    const user = await requireAuth(ctx);
    if (!proProductId) {
      throw new Error("Pro checkout is not configured. Missing POLAR_PRODUCT_PRO_ID.");
    }
    if (!user.email) {
      throw new Error("Pro checkout requires a verified email on the account.");
    }
    const existing = await polar.getCurrentSubscription(ctx, { userId: user._id });
    if (
      existing &&
      existing.productKey === "pro" &&
      (existing.status === "active" || existing.status === "trialing")
    ) {
      throw new ConvexError({ kind: "AlreadySubscribed" as const, tier: "pro" });
    }
    const checkout = await polar.createCheckoutSession(ctx, {
      productIds: [proProductId],
      userId: user._id,
      email: user.email,
      origin: args.origin,
      successUrl: args.successUrl,
    });
    return { url: checkout.url };
  },
});

export const getCustomerPortalUrl = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx): Promise<{ url: string }> => {
    const user = await requireAuth(ctx);
    const result = await polar.createCustomerPortalSession(ctx, { userId: user._id });
    return { url: result.url };
  },
});

// One-shot bootstrap to populate the Polar component's products table. The
// component normally keeps it in sync via `product.created`/`product.updated`
// webhooks; call this once after wiring up a new Polar org (or after
// registering the webhook endpoint late) so `getCurrentSubscription` can
// resolve the product for subscriptions created before the first product
// webhook arrives.
export const syncProducts = action({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    await polar.syncProducts(ctx);
    return null;
  },
});
