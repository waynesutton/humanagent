/**
 * Supermemory Integration - Queries and Mutations
 *
 * Provides automatic user profiles built from ingested content.
 * Static facts persist long-term, dynamic context reflects recent activity.
 *
 * Docs: https://supermemory.ai/docs/user-profiles
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { authedMutation, authedQuery } from "../lib/functions";

const PROFILE_CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================
// Public Queries
// ============================================================

/**
 * Get cached Supermemory profile for a user or agent
 */
export const getCachedProfile = authedQuery({
  args: {
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // First try agent-specific profile
    if (args.agentId) {
      const agentProfile = await ctx.db
        .query("supermemoryProfiles")
        .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
        .first();

      if (agentProfile && agentProfile.expiresAt > now) {
        return agentProfile;
      }
    }

    // Fall back to user-level profile
    const userProfile = await ctx.db
      .query("supermemoryProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .filter((q) => q.eq(q.field("agentId"), undefined))
      .first();

    if (userProfile && userProfile.expiresAt > now) {
      return userProfile;
    }

    return null;
  },
});

/**
 * List all cached profiles
 */
export const listCachedProfiles = authedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("supermemoryProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();
  },
});

/**
 * Check if Supermemory is configured for an agent
 */
export const getAgentConfig = authedQuery({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.userId !== ctx.userId) {
      return null;
    }
    return agent.supermemoryConfig || null;
  },
});

// ============================================================
// Public Mutations
// ============================================================

/**
 * Update agent's Supermemory configuration
 */
export const updateAgentConfig = authedMutation({
  args: {
    agentId: v.id("agents"),
    enabled: v.boolean(),
    containerTag: v.optional(v.string()),
    syncConversations: v.optional(v.boolean()),
    syncTaskResults: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.userId !== ctx.userId) {
      throw new Error("Agent not found");
    }

    const containerTag = args.containerTag || `agent_${args.agentId}`;

    await ctx.db.patch(args.agentId, {
      supermemoryConfig: {
        enabled: args.enabled,
        containerTag,
        syncConversations: args.syncConversations ?? true,
        syncTaskResults: args.syncTaskResults ?? true,
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Clear cached profile (forces refresh on next fetch)
 */
export const clearCachedProfile = authedMutation({
  args: {
    profileId: v.id("supermemoryProfiles"),
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", identity.subject))
      .first();

    if (!user) return null;

    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", user._id).eq("service", "supermemory")
      )
      .first();

    if (!cred?.encryptedApiKey || !cred.isActive) return null;

    return {
      apiKey: atob(cred.encryptedApiKey),
    };
  },
});

export const getCredentialByUserId = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", userId).eq("service", "supermemory")
      )
      .first();

    if (!cred?.encryptedApiKey || !cred.isActive) return null;

    return {
      apiKey: atob(cred.encryptedApiKey),
    };
  },
});

export const getAgentForProfile = internalQuery({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, { agentId }) => {
    return await ctx.db.get(agentId);
  },
});

export const cacheProfile = internalMutation({
  args: {
    agentId: v.optional(v.id("agents")),
    containerTag: v.string(),
    staticFacts: v.array(v.string()),
    dynamicContext: v.array(v.string()),
    searchQuery: v.optional(v.string()),
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
    const expiresAt = now + PROFILE_CACHE_DURATION_MS;

    // Check for existing cached profile
    const existing = args.agentId
      ? await ctx.db
          .query("supermemoryProfiles")
          .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
          .first()
      : await ctx.db
          .query("supermemoryProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .filter((q) => q.eq(q.field("agentId"), undefined))
          .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        staticFacts: args.staticFacts,
        dynamicContext: args.dynamicContext,
        searchQuery: args.searchQuery,
        fetchedAt: now,
        expiresAt,
      });
    } else {
      // Create new
      await ctx.db.insert("supermemoryProfiles", {
        userId: user._id,
        agentId: args.agentId,
        containerTag: args.containerTag,
        staticFacts: args.staticFacts,
        dynamicContext: args.dynamicContext,
        searchQuery: args.searchQuery,
        fetchedAt: now,
        expiresAt,
      });
    }
  },
});

/**
 * Cache profile internally (for agent runtime use)
 */
export const cacheProfileInternal = internalMutation({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    containerTag: v.string(),
    staticFacts: v.array(v.string()),
    dynamicContext: v.array(v.string()),
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + PROFILE_CACHE_DURATION_MS;

    // Check for existing cached profile
    const existing = args.agentId
      ? await ctx.db
          .query("supermemoryProfiles")
          .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
          .first()
      : await ctx.db
          .query("supermemoryProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId))
          .filter((q) => q.eq(q.field("agentId"), undefined))
          .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        staticFacts: args.staticFacts,
        dynamicContext: args.dynamicContext,
        searchQuery: args.searchQuery,
        fetchedAt: now,
        expiresAt,
      });
    } else {
      await ctx.db.insert("supermemoryProfiles", {
        userId: args.userId,
        agentId: args.agentId,
        containerTag: args.containerTag,
        staticFacts: args.staticFacts,
        dynamicContext: args.dynamicContext,
        searchQuery: args.searchQuery,
        fetchedAt: now,
        expiresAt,
      });
    }
  },
});

/**
 * Get cached profile for agent runtime (by userId)
 */
export const getCachedProfileInternal = internalQuery({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.agentId) {
      const agentProfile = await ctx.db
        .query("supermemoryProfiles")
        .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
        .first();

      if (agentProfile && agentProfile.expiresAt > now) {
        return agentProfile;
      }
    }

    const userProfile = await ctx.db
      .query("supermemoryProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("agentId"), undefined))
      .first();

    if (userProfile && userProfile.expiresAt > now) {
      return userProfile;
    }

    return null;
  },
});
