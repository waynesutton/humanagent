/**
 * Custom function wrappers using convex-helpers.
 * Centralizes auth logic so every function doesn't repeat it.
 */
import {
  customQuery,
  customMutation,
  customCtx,
} from "convex-helpers/server/customFunctions";
import { query, mutation } from "../_generated/server";
import { getCurrentUserId, requireUserId } from "./authHelpers";

/**
 * Authenticated query: ctx.userId and ctx.user always available.
 * Throws if not logged in or user doc is missing.
 */
export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    return { userId, user };
  })
);

/**
 * Authenticated mutation: ctx.userId and ctx.user always available.
 * Throws if not logged in or user doc is missing.
 */
export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    return { userId, user };
  })
);

/**
 * Optional auth query: ctx.userId and ctx.user may be null.
 * Does not throw if not logged in.
 */
export const optionalAuthQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    return { userId, user };
  })
);
