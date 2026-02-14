import { query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { authedQuery, authedMutation } from "../lib/functions";
import { filter } from "convex-helpers/server/filter";

// ============================================================
// Public queries
// ============================================================

export const getPublicFeed = query({
  args: { username: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { username, limit }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!user) return [];

    return await ctx.db
      .query("feedItems")
      .withIndex("by_userId_public", (q) =>
        q.eq("userId", user._id).eq("isPublic", true)
      )
      .order("desc")
      .take(limit ?? 20);
  },
});

export const getMyFeed = authedQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("feedItems")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(limit ?? 50);
  },
});

// ============================================================
// Mutations
// ============================================================

export const createPost = authedMutation({
  args: {
    title: v.string(),
    content: v.optional(v.string()),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("feedItems", {
      userId: ctx.userId,
      type: "manual_post",
      title: args.title,
      content: args.content,
      isPublic: args.isPublic,
      createdAt: Date.now(),
    });
  },
});

// ============================================================
// Internal
// ============================================================

export const maybeCreateItem = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("message_handled"),
      v.literal("task_completed"),
      v.literal("integration_action"),
      v.literal("status_update"),
      v.literal("manual_post")
    ),
    title: v.string(),
    content: v.optional(v.string()),
    metadata: v.optional(v.any()),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("feedItems", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      content: args.content,
      metadata: args.metadata,
      isPublic: args.isPublic,
      createdAt: Date.now(),
    });
  },
});

export const cleanExpiredItems = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Use filter helper instead of Convex's .filter() for TS predicates
    const old = await filter(
      ctx.db.query("feedItems"),
      (item) => item.createdAt < thirtyDaysAgo && item.isPublic === false
    ).take(100);

    for (const item of old) {
      await ctx.db.delete(item._id);
    }
  },
});
