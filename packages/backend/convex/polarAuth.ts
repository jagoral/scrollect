import { v } from "convex/values";

import { query } from "./_generated/server";
import { hasEarlyAdopterEntitlement } from "./entitlementGrants";
import { optionalAuth } from "./lib/functions";

export const getAuthenticatedUserInfo = query({
  args: {},
  returns: v.union(v.object({ userId: v.string(), email: v.string() }), v.null()),
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
    if (!user) return null;
    if (!user.email) {
      throw new Error("Polar: auth user has no email");
    }
    return { userId: user._id, email: user.email };
  },
});

export const hasAuthenticatedUserEarlyAdopterEntitlement = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
    if (!user) return false;
    return await hasEarlyAdopterEntitlement(ctx, {
      userId: user._id,
      userCreatedAt: user.createdAt,
    });
  },
});
