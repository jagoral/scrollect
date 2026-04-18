import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { insertEarlyAdopterGrantIfMissing } from "./entitlementGrants";
import { WideEvent } from "./lib/logging";

/**
 * Admin-only internal mutations. These are `internalMutation`s, so the only
 * invocation surface is the Convex dashboard — access to the dashboard is the
 * effective admin boundary. Every invocation emits a wide event so the audit
 * trail lives in the logs rather than relying on session-bound identity.
 *
 * Volume is expected to be a handful of grants per cycle, so no dedicated
 * admin UI is justified.
 */
export const grantEarlyAdopter = internalMutation({
  args: {
    userId: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.object({
    inserted: v.boolean(),
    grantId: v.id("entitlementGrants"),
  }),
  handler: async (ctx, args) => {
    const evt = new WideEvent("admin.grantEarlyAdopter");
    evt.set({ targetUserId: args.userId });
    try {
      const result = await insertEarlyAdopterGrantIfMissing(ctx, {
        userId: args.userId,
        source: "admin",
        note: args.note,
      });
      evt.set({ inserted: result.inserted, grantId: result.grantId });
      return result;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});
