import type { GenericCtx } from "@convex-dev/better-auth";

import type { DataModel } from "../_generated/dataModel";
import { authComponent } from "../auth";

type AuthUser = NonNullable<Awaited<ReturnType<typeof authComponent.safeGetAuthUser>>>;

/**
 * Require authentication — throws if not logged in.
 * Returns the authenticated user (non-null).
 */
export async function requireAuth(ctx: { auth: unknown }): Promise<AuthUser> {
  const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
  if (!user) throw new Error("Not authenticated");
  return user;
}

/**
 * Optional authentication — returns null if not logged in.
 */
export async function optionalAuth(ctx: { auth: unknown }): Promise<AuthUser | null> {
  const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
  return user ?? null;
}

// Re-export all server functions for convenience
export {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
