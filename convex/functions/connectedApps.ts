/**
 * Connected Apps Functions
 *
 * Manage OAuth connections to external services (Twitter, GitHub, etc.)
 */
import { v } from "convex/values";
import { authedMutation, authedQuery } from "../lib/functions";
import { internalMutation, internalQuery, query } from "../_generated/server";

// Simple encoding for API keys (should use real encryption in production)
function encodeToken(token: string): string {
  // Use btoa for V8 runtime compatibility
  return btoa(token);
}

function decodeToken(encoded: string): string {
  // Use atob for V8 runtime compatibility
  return atob(encoded);
}

// ============================================================
// Public queries
// ============================================================

// List all connected apps for the current user
export const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    const apps = await ctx.db
      .query("connectedApps")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    // Don't return tokens to the client
    return apps.map((app) => ({
      _id: app._id,
      service: app.service,
      externalUsername: app.externalUsername,
      profileUrl: app.profileUrl,
      scopes: app.scopes,
      isActive: app.isActive,
      lastUsedAt: app.lastUsedAt,
      createdAt: app.createdAt,
      hasExpiry: !!app.tokenExpiresAt,
      isExpired: app.tokenExpiresAt ? app.tokenExpiresAt < Date.now() : false,
    }));
  },
});

// Check if a specific service is connected
export const isConnected = authedQuery({
  args: { service: v.string() },
  handler: async (ctx, { service }) => {
    const app = await ctx.db
      .query("connectedApps")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", ctx.userId).eq("service", service)
      )
      .first();

    return app ? app.isActive : false;
  },
});

export const getPublicByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!user) {
      return [];
    }

    const apps = await ctx.db
      .query("connectedApps")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(50);

    const visibleServices = new Set(["github", "twitter", "linkedin"]);

    return apps
      .filter((app) => app.isActive && visibleServices.has(app.service))
      .map((app) => ({
        service: app.service,
        externalUsername: app.externalUsername,
        profileUrl: app.profileUrl,
      }));
  },
});

// ============================================================
// Public mutations
// ============================================================

// Connect a new app (called after OAuth callback)
export const connect = authedMutation({
  args: {
    service: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresIn: v.optional(v.number()), // seconds
    scopes: v.array(v.string()),
    externalUserId: v.optional(v.string()),
    externalUsername: v.optional(v.string()),
    profileUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if already connected
    const existing = await ctx.db
      .query("connectedApps")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", ctx.userId).eq("service", args.service)
      )
      .first();

    const data = {
      userId: ctx.userId,
      service: args.service,
      encryptedAccessToken: encodeToken(args.accessToken),
      encryptedRefreshToken: args.refreshToken
        ? encodeToken(args.refreshToken)
        : undefined,
      tokenExpiresAt: args.expiresIn ? now + args.expiresIn * 1000 : undefined,
      scopes: args.scopes,
      externalUserId: args.externalUserId,
      externalUsername: args.externalUsername,
      profileUrl: args.profileUrl,
      isActive: true,
      lastUsedAt: now,
      createdAt: existing?.createdAt ?? now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }

    return await ctx.db.insert("connectedApps", data);
  },
});

// Disconnect an app
export const disconnect = authedMutation({
  args: { service: v.string() },
  handler: async (ctx, { service }) => {
    const app = await ctx.db
      .query("connectedApps")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", ctx.userId).eq("service", service)
      )
      .first();

    if (app) {
      await ctx.db.delete(app._id);
    }
  },
});

// Toggle app active status
export const toggleActive = authedMutation({
  args: { appId: v.id("connectedApps") },
  handler: async (ctx, { appId }) => {
    const app = await ctx.db.get(appId);
    if (!app || app.userId !== ctx.userId) {
      throw new Error("App not found");
    }

    await ctx.db.patch(appId, { isActive: !app.isActive });
  },
});

// ============================================================
// Internal functions (for use by agent runtime)
// ============================================================

// Get decrypted token for a service
export const getToken = internalQuery({
  args: {
    userId: v.id("users"),
    service: v.string(),
  },
  returns: v.union(
    v.object({
      accessToken: v.string(),
      refreshToken: v.optional(v.string()),
      expiresAt: v.optional(v.number()),
    }),
    v.null()
  ),
  handler: async (ctx, { userId, service }) => {
    const app = await ctx.db
      .query("connectedApps")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", userId).eq("service", service)
      )
      .first();

    if (!app || !app.isActive) return null;

    return {
      accessToken: decodeToken(app.encryptedAccessToken),
      refreshToken: app.encryptedRefreshToken
        ? decodeToken(app.encryptedRefreshToken)
        : undefined,
      expiresAt: app.tokenExpiresAt,
    };
  },
});

// Update token after refresh
export const updateToken = internalMutation({
  args: {
    userId: v.id("users"),
    service: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresIn: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, service, accessToken, refreshToken, expiresIn }) => {
    const app = await ctx.db
      .query("connectedApps")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", userId).eq("service", service)
      )
      .first();

    if (!app) return null;

    await ctx.db.patch(app._id, {
      encryptedAccessToken: encodeToken(accessToken),
      encryptedRefreshToken: refreshToken
        ? encodeToken(refreshToken)
        : app.encryptedRefreshToken,
      tokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
      lastUsedAt: Date.now(),
    });

    return null;
  },
});

// Record usage of a connected app
export const recordUsage = internalMutation({
  args: {
    userId: v.id("users"),
    service: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, service }) => {
    const app = await ctx.db
      .query("connectedApps")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", userId).eq("service", service)
      )
      .first();

    if (app) {
      await ctx.db.patch(app._id, { lastUsedAt: Date.now() });
    }

    return null;
  },
});
