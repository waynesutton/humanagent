/**
 * Browser Use Cloud Integration - Queries and Mutations
 *
 * Manages browser profiles and sessions for stateful browser automation.
 * Profiles persist login state across sessions for sites like Slack, GitHub, etc.
 *
 * Docs: https://docs.cloud.browser-use.com/guides/sessions
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { authedMutation, authedQuery } from "../lib/functions";

// Profile status validator
const profileStatusValidator = v.union(
  v.literal("running"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("failed")
);

// ============================================================
// Public Queries
// ============================================================

/**
 * List all browser profiles for the current user
 */
export const list = authedQuery({
  args: {
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    if (args.agentId) {
      return await ctx.db
        .query("browserProfiles")
        .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
        .collect();
    }
    return await ctx.db
      .query("browserProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();
  },
});

/**
 * Get a specific browser profile
 */
export const get = authedQuery({
  args: {
    profileId: v.id("browserProfiles"),
  },
  handler: async (ctx, { profileId }) => {
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== ctx.userId) {
      return null;
    }
    return profile;
  },
});

/**
 * List active browser sessions
 */
export const listSessions = authedQuery({
  args: {
    agentId: v.optional(v.id("agents")),
    status: v.optional(profileStatusValidator),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("browserSessions")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId));

    const sessions = await query.collect();

    return sessions.filter((s) => {
      if (args.agentId && s.agentId !== args.agentId) return false;
      if (args.status && s.status !== args.status) return false;
      return true;
    });
  },
});

/**
 * Get a specific browser session
 */
export const getSession = authedQuery({
  args: {
    sessionId: v.id("browserSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== ctx.userId) {
      return null;
    }
    return session;
  },
});

// ============================================================
// Public Mutations
// ============================================================

/**
 * Create a browser profile record (after creating in Browser Use Cloud)
 */
export const create = authedMutation({
  args: {
    browserUseProfileId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    services: v.array(v.string()),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Verify agent belongs to user if specified
    if (args.agentId) {
      const agent = await ctx.db.get(args.agentId);
      if (!agent || agent.userId !== ctx.userId) {
        throw new Error("Agent not found");
      }
    }

    return await ctx.db.insert("browserProfiles", {
      userId: ctx.userId,
      agentId: args.agentId,
      browserUseProfileId: args.browserUseProfileId,
      name: args.name,
      description: args.description,
      services: args.services,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a browser profile
 */
export const update = authedMutation({
  args: {
    profileId: v.id("browserProfiles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    services: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
    lastSyncedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.userId !== ctx.userId) {
      throw new Error("Profile not found");
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.services !== undefined) updates.services = args.services;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    if (args.lastSyncedAt !== undefined) updates.lastSyncedAt = args.lastSyncedAt;

    await ctx.db.patch(args.profileId, updates);
  },
});

/**
 * Delete a browser profile
 */
export const remove = authedMutation({
  args: {
    profileId: v.id("browserProfiles"),
  },
  handler: async (ctx, { profileId }) => {
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== ctx.userId) {
      throw new Error("Profile not found");
    }

    await ctx.db.delete(profileId);
  },
});

// ============================================================
// Internal Functions
// ============================================================

export const getCredential = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Get the current user from auth context
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Look up the app user
    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", identity.subject))
      .first();

    if (!user) return null;

    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", user._id).eq("service", "browser_use")
      )
      .first();

    if (!cred?.encryptedApiKey || !cred.isActive) return null;

    // Decrypt (placeholder, uses base64 in dev)
    return {
      apiKey: atob(cred.encryptedApiKey),
    };
  },
});

export const createInternal = internalMutation({
  args: {
    browserUseProfileId: v.string(),
    name: v.string(),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    const now = Date.now();
    return await ctx.db.insert("browserProfiles", {
      userId: user._id,
      agentId: args.agentId,
      browserUseProfileId: args.browserUseProfileId,
      name: args.name,
      services: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createSessionInternal = internalMutation({
  args: {
    agentId: v.id("agents"),
    taskId: v.optional(v.id("tasks")),
    browserUseSessionId: v.string(),
    browserUseProfileId: v.optional(v.string()),
    liveUrl: v.optional(v.string()),
    shareUrl: v.optional(v.string()),
    proxyCountry: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    return await ctx.db.insert("browserSessions", {
      userId: agent.userId,
      agentId: args.agentId,
      taskId: args.taskId,
      browserUseSessionId: args.browserUseSessionId,
      browserUseProfileId: args.browserUseProfileId,
      liveUrl: args.liveUrl,
      shareUrl: args.shareUrl,
      status: "running",
      proxyCountry: args.proxyCountry,
      startedAt: Date.now(),
    });
  },
});

export const updateSessionStatus = internalMutation({
  args: {
    browserUseSessionId: v.string(),
    status: profileStatusValidator,
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("browserSessions")
      .withIndex("by_browserUseSessionId", (q) =>
        q.eq("browserUseSessionId", args.browserUseSessionId)
      )
      .first();

    if (!session) return;

    const updates: Record<string, unknown> = { status: args.status };
    if (args.status === "completed" || args.status === "failed") {
      updates.endedAt = Date.now();
    }

    await ctx.db.patch(session._id, updates);
  },
});

/**
 * Get credential for internal use (by userId)
 */
export const getCredentialByUserId = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", userId).eq("service", "browser_use")
      )
      .first();

    if (!cred?.encryptedApiKey || !cred.isActive) return null;

    return {
      apiKey: atob(cred.encryptedApiKey),
    };
  },
});

/**
 * Increment session action count
 */
export const incrementSessionAction = internalMutation({
  args: {
    browserUseSessionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { browserUseSessionId }) => {
    const session = await ctx.db
      .query("browserSessions")
      .withIndex("by_browserUseSessionId", (q) =>
        q.eq("browserUseSessionId", browserUseSessionId)
      )
      .first();

    if (!session) return null;

    await ctx.db.patch(session._id, {
      lastActionAt: Date.now(),
      actionCount: (session.actionCount || 0) + 1,
    });

    return null;
  },
});
