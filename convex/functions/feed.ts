import { query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { authedQuery, authedMutation } from "../lib/functions";
import { filter } from "convex-helpers/server/filter";

// ============================================================
// Public queries
// ============================================================

export const getPublicFeed = query({
  args: { username: v.string(), limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, { username, limit }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!user) return [];

    // Filter out hidden and archived items from public feed
    const items = await ctx.db
      .query("feedItems")
      .withIndex("by_userId_public", (q) =>
        q.eq("userId", user._id).eq("isPublic", true)
      )
      .order("desc")
      .take((limit ?? 20) * 2); // Fetch more to account for filtered items

    return items
      .filter((item) => !item.isHidden && !item.isArchived)
      .slice(0, limit ?? 20);
  },
});

export const getGlobalPublicFeed = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("feedItems"),
      type: v.union(
        v.literal("message_handled"),
        v.literal("task_completed"),
        v.literal("integration_action"),
        v.literal("status_update"),
        v.literal("manual_post")
      ),
      title: v.string(),
      content: v.optional(v.string()),
      createdAt: v.number(),
      username: v.optional(v.string()),
      displayName: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { limit }) => {
    const takeCount = Math.max(1, Math.min(limit ?? 20, 100));

    // Query public items first, then remove hidden/archived rows.
    const items = await ctx.db
      .query("feedItems")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .order("desc")
      .take(takeCount * 2);

    const visibleItems = items
      .filter((item) => !item.isHidden && !item.isArchived)
      .slice(0, takeCount);

    const usersById: Record<string, { username?: string; name?: string }> = {};

    await Promise.all(
      visibleItems.map(async (item) => {
        const key = item.userId;
        if (usersById[key]) {
          return;
        }
        const user = await ctx.db.get(item.userId);
        usersById[key] = {
          username: user?.username,
          name: user?.name,
        };
      })
    );

    return visibleItems.map((item) => ({
      _id: item._id,
      type: item.type,
      title: item.title,
      content: item.content,
      createdAt: item.createdAt,
      username: usersById[item.userId]?.username,
      displayName: usersById[item.userId]?.name,
    }));
  },
});

export const getMyFeed = authedQuery({
  args: { 
    limit: v.optional(v.number()),
    includeArchived: v.optional(v.boolean()),
    includeHidden: v.optional(v.boolean()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, { limit, includeArchived, includeHidden }) => {
    const items = await ctx.db
      .query("feedItems")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take((limit ?? 50) * 2); // Fetch more to account for filtered items

    // Filter based on flags
    return items
      .filter((item) => {
        if (!includeHidden && item.isHidden) return false;
        if (!includeArchived && item.isArchived) return false;
        return true;
      })
      .slice(0, limit ?? 50);
  },
});

// Get archived items only
export const getArchivedFeed = authedQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, { limit }) => {
    const items = await ctx.db
      .query("feedItems")
      .withIndex("by_userId_archived", (q) =>
        q.eq("userId", ctx.userId).eq("isArchived", true)
      )
      .order("desc")
      .take(limit ?? 50);

    return items;
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
  returns: v.id("feedItems"),
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

// Update an existing post (only for manual_post type)
export const updatePost = authedMutation({
  args: {
    feedItemId: v.id("feedItems"),
    title: v.string(),
    content: v.optional(v.string()),
    isPublic: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Verify ownership via indexed query
    const item = await ctx.db
      .query("feedItems")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .filter((q) => q.eq(q.field("_id"), args.feedItemId))
      .unique();

    if (!item) {
      throw new Error("Feed item not found");
    }

    // Only allow editing manual posts
    if (item.type !== "manual_post") {
      throw new Error("Only manual posts can be edited");
    }

    await ctx.db.patch(args.feedItemId, {
      title: args.title,
      content: args.content,
      isPublic: args.isPublic,
      updatedAt: Date.now(),
    });

    return null;
  },
});

// Hide a feed item (removes from feed but keeps in DB)
export const hidePost = authedMutation({
  args: { feedItemId: v.id("feedItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Verify ownership
    const item = await ctx.db
      .query("feedItems")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .filter((q) => q.eq(q.field("_id"), args.feedItemId))
      .unique();

    if (!item) {
      throw new Error("Feed item not found");
    }

    // Idempotent: early return if already hidden
    if (item.isHidden) {
      return null;
    }

    await ctx.db.patch(args.feedItemId, {
      isHidden: true,
      updatedAt: Date.now(),
    });

    return null;
  },
});

// Unhide a feed item
export const unhidePost = authedMutation({
  args: { feedItemId: v.id("feedItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("feedItems")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .filter((q) => q.eq(q.field("_id"), args.feedItemId))
      .unique();

    if (!item) {
      throw new Error("Feed item not found");
    }

    if (!item.isHidden) {
      return null;
    }

    await ctx.db.patch(args.feedItemId, {
      isHidden: false,
      updatedAt: Date.now(),
    });

    return null;
  },
});

// Archive a feed item
export const archivePost = authedMutation({
  args: { feedItemId: v.id("feedItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("feedItems")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .filter((q) => q.eq(q.field("_id"), args.feedItemId))
      .unique();

    if (!item) {
      throw new Error("Feed item not found");
    }

    if (item.isArchived) {
      return null;
    }

    await ctx.db.patch(args.feedItemId, {
      isArchived: true,
      updatedAt: Date.now(),
    });

    return null;
  },
});

// Unarchive a feed item
export const unarchivePost = authedMutation({
  args: { feedItemId: v.id("feedItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("feedItems")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .filter((q) => q.eq(q.field("_id"), args.feedItemId))
      .unique();

    if (!item) {
      throw new Error("Feed item not found");
    }

    if (!item.isArchived) {
      return null;
    }

    await ctx.db.patch(args.feedItemId, {
      isArchived: false,
      updatedAt: Date.now(),
    });

    return null;
  },
});

// Delete a feed item permanently
export const deletePost = authedMutation({
  args: { feedItemId: v.id("feedItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("feedItems")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .filter((q) => q.eq(q.field("_id"), args.feedItemId))
      .unique();

    if (!item) {
      throw new Error("Feed item not found");
    }

    await ctx.db.delete(args.feedItemId);

    return null;
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
  returns: v.null(),
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
    return null;
  },
});

export const cleanExpiredItems = internalMutation({
  args: {},
  returns: v.null(),
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
    return null;
  },
});
