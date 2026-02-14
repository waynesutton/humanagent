/**
 * Auth helper functions for resolving the current user.
 * Bridges the @robelest/convex-auth component user to the app's users table.
 */
import { auth } from "../auth";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

type AuthCtx = QueryCtx | MutationCtx;

/**
 * Returns the current user's app-level ID, or null if not logged in.
 * Looks up the users table by the auth component's user ID.
 */
export async function getCurrentUserId(
  ctx: AuthCtx
): Promise<Id<"users"> | null> {
  const authUserId = await auth.user.current(ctx);
  if (!authUserId) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId as string))
    .unique();

  return user?._id ?? null;
}

/**
 * Returns the current user's app-level ID, or throws if not logged in.
 */
export async function requireUserId(ctx: AuthCtx): Promise<Id<"users">> {
  const userId = await getCurrentUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}
