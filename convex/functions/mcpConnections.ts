/**
 * MCP Connections Functions
 *
 * Track and manage external MCP server connections
 */
import { v } from "convex/values";
import { authedMutation, authedQuery } from "../lib/functions";
import { internalQuery } from "../_generated/server";

// ============================================================
// Public queries
// ============================================================

// List all MCP connections for the current user
export const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("mcpConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();
  },
});

// Get active MCP connections only
export const listActive = authedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("mcpConnections")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", ctx.userId).eq("status", "active")
      )
      .collect();
  },
});

// Get a specific MCP connection
export const get = authedQuery({
  args: { connectionId: v.id("mcpConnections") },
  handler: async (ctx, { connectionId }) => {
    const connection = await ctx.db.get(connectionId);
    if (!connection || connection.userId !== ctx.userId) {
      return null;
    }
    return connection;
  },
});

// ============================================================
// Public mutations
// ============================================================

// Add a new MCP connection
export const add = authedMutation({
  args: {
    serverUrl: v.string(),
    serverName: v.string(),
    version: v.string(), // Pinned version, no "latest"
    allowedTools: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate URL format
    try {
      new URL(args.serverUrl);
    } catch {
      throw new Error("Invalid server URL");
    }

    // Check for duplicate
    const existing = await ctx.db
      .query("mcpConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    if (existing.some((c) => c.serverUrl === args.serverUrl)) {
      throw new Error("MCP server already connected");
    }

    return await ctx.db.insert("mcpConnections", {
      userId: ctx.userId,
      serverUrl: args.serverUrl,
      serverName: args.serverName,
      version: args.version,
      allowedTools: args.allowedTools,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

// Update MCP connection settings
export const update = authedMutation({
  args: {
    connectionId: v.id("mcpConnections"),
    allowedTools: v.optional(v.array(v.string())),
    version: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("revoked")
      )
    ),
  },
  handler: async (ctx, { connectionId, ...updates }) => {
    const connection = await ctx.db.get(connectionId);
    if (!connection || connection.userId !== ctx.userId) {
      throw new Error("Connection not found");
    }

    const patch: Record<string, unknown> = {};
    if (updates.allowedTools !== undefined) {
      patch.allowedTools = updates.allowedTools;
    }
    if (updates.version !== undefined) {
      patch.version = updates.version;
    }
    if (updates.status !== undefined) {
      patch.status = updates.status;
    }

    await ctx.db.patch(connectionId, patch);
  },
});

// Mark connection as audited (after security review)
export const markAudited = authedMutation({
  args: { connectionId: v.id("mcpConnections") },
  handler: async (ctx, { connectionId }) => {
    const connection = await ctx.db.get(connectionId);
    if (!connection || connection.userId !== ctx.userId) {
      throw new Error("Connection not found");
    }

    await ctx.db.patch(connectionId, { lastAuditedAt: Date.now() });
  },
});

// Remove an MCP connection
export const remove = authedMutation({
  args: { connectionId: v.id("mcpConnections") },
  handler: async (ctx, { connectionId }) => {
    const connection = await ctx.db.get(connectionId);
    if (!connection || connection.userId !== ctx.userId) {
      throw new Error("Connection not found");
    }

    await ctx.db.delete(connectionId);
  },
});

// ============================================================
// Internal functions
// ============================================================

// Get active connections for agent runtime
export const getActiveForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("mcpConnections"),
      serverUrl: v.string(),
      serverName: v.string(),
      version: v.string(),
      allowedTools: v.array(v.string()),
    })
  ),
  handler: async (ctx, { userId }) => {
    const connections = await ctx.db
      .query("mcpConnections")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
      .collect();

    return connections.map((c) => ({
      _id: c._id,
      serverUrl: c.serverUrl,
      serverName: c.serverName,
      version: c.version,
      allowedTools: c.allowedTools,
    }));
  },
});

// Check if a tool is allowed for a connection
export const isToolAllowed = internalQuery({
  args: {
    connectionId: v.id("mcpConnections"),
    toolName: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { connectionId, toolName }) => {
    const connection = await ctx.db.get(connectionId);
    if (!connection || connection.status !== "active") {
      return false;
    }

    // Empty array means all tools allowed
    if (connection.allowedTools.length === 0) {
      return true;
    }

    return connection.allowedTools.includes(toolName);
  },
});
