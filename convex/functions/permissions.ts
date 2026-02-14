/**
 * Permissions Functions
 *
 * Scoped access control for callers (public, authenticated, trusted)
 */
import { v } from "convex/values";
import { authedMutation, authedQuery } from "../lib/functions";
import { internalQuery } from "../_generated/server";

// ============================================================
// Public queries
// ============================================================

// List all permissions for the current user
export const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("permissions")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();
  },
});

// Get permission for a specific caller
export const getForCaller = authedQuery({
  args: { callerId: v.string() },
  handler: async (ctx, { callerId }) => {
    return await ctx.db
      .query("permissions")
      .withIndex("by_userId_callerId", (q) =>
        q.eq("userId", ctx.userId).eq("callerId", callerId)
      )
      .first();
  },
});

// ============================================================
// Public mutations
// ============================================================

// Create or update a permission
export const upsert = authedMutation({
  args: {
    callerId: v.string(), // API key prefix, agent ID, or "*" for public
    scope: v.union(
      v.literal("public"),
      v.literal("authenticated"),
      v.literal("trusted")
    ),
    allowedTools: v.array(v.string()),
    allowedResources: v.array(v.string()),
    rateLimit: v.number(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("permissions")
      .withIndex("by_userId_callerId", (q) =>
        q.eq("userId", ctx.userId).eq("callerId", args.callerId)
      )
      .first();

    const data = {
      userId: ctx.userId,
      callerId: args.callerId,
      scope: args.scope,
      allowedTools: args.allowedTools,
      allowedResources: args.allowedResources,
      rateLimit: args.rateLimit,
      expiresAt: args.expiresAt,
      createdAt: existing?.createdAt ?? Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }

    return await ctx.db.insert("permissions", data);
  },
});

// Remove a permission
export const remove = authedMutation({
  args: { callerId: v.string() },
  handler: async (ctx, { callerId }) => {
    const permission = await ctx.db
      .query("permissions")
      .withIndex("by_userId_callerId", (q) =>
        q.eq("userId", ctx.userId).eq("callerId", callerId)
      )
      .first();

    if (permission) {
      await ctx.db.delete(permission._id);
    }
  },
});

// Set public access permissions (shortcut)
export const setPublicAccess = authedMutation({
  args: {
    enabled: v.boolean(),
    allowedTools: v.optional(v.array(v.string())),
    rateLimit: v.optional(v.number()),
  },
  handler: async (ctx, { enabled, allowedTools, rateLimit }) => {
    const existing = await ctx.db
      .query("permissions")
      .withIndex("by_userId_callerId", (q) =>
        q.eq("userId", ctx.userId).eq("callerId", "*")
      )
      .first();

    if (!enabled) {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
      return;
    }

    const data = {
      userId: ctx.userId,
      callerId: "*",
      scope: "public" as const,
      allowedTools: allowedTools ?? ["chat"],
      allowedResources: [],
      rateLimit: rateLimit ?? 10, // 10 requests per minute default
      createdAt: existing?.createdAt ?? Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("permissions", data);
    }
  },
});

// ============================================================
// Internal functions
// ============================================================

// Check if a caller has permission for an action
export const checkPermission = internalQuery({
  args: {
    userId: v.id("users"),
    callerId: v.string(),
    tool: v.string(),
    resource: v.optional(v.string()),
  },
  returns: v.object({
    allowed: v.boolean(),
    reason: v.optional(v.string()),
    rateLimit: v.optional(v.number()),
  }),
  handler: async (ctx, { userId, callerId, tool, resource }) => {
    // First, check for specific caller permission
    let permission = await ctx.db
      .query("permissions")
      .withIndex("by_userId_callerId", (q) =>
        q.eq("userId", userId).eq("callerId", callerId)
      )
      .first();

    // Fall back to public permission if no specific one
    if (!permission) {
      permission = await ctx.db
        .query("permissions")
        .withIndex("by_userId_callerId", (q) =>
          q.eq("userId", userId).eq("callerId", "*")
        )
        .first();
    }

    if (!permission) {
      return { allowed: false, reason: "No permission configured" };
    }

    // Check expiry
    if (permission.expiresAt && permission.expiresAt < Date.now()) {
      return { allowed: false, reason: "Permission expired" };
    }

    // Check tool allowlist
    if (
      permission.allowedTools.length > 0 &&
      !permission.allowedTools.includes("*") &&
      !permission.allowedTools.includes(tool)
    ) {
      return { allowed: false, reason: `Tool "${tool}" not allowed` };
    }

    // Check resource allowlist (if specified)
    if (
      resource &&
      permission.allowedResources.length > 0 &&
      !permission.allowedResources.includes("*") &&
      !permission.allowedResources.includes(resource)
    ) {
      return { allowed: false, reason: `Resource "${resource}" not allowed` };
    }

    return { allowed: true, rateLimit: permission.rateLimit };
  },
});
