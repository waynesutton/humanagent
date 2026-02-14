/**
 * Conversations Functions
 *
 * Manage email/phone/API conversations
 */
import { v } from "convex/values";
import { authedMutation, authedQuery } from "../lib/functions";
import { internalMutation, internalQuery } from "../_generated/server";

// ============================================================
// Public queries
// ============================================================

// List all conversations for the current user
export const list = authedQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(100);
  },
});

// Get a specific conversation
export const get = authedQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { conversationId }) => {
    const conv = await ctx.db.get(conversationId);
    if (!conv || conv.userId !== ctx.userId) {
      return null;
    }
    return conv;
  },
});

// ============================================================
// Public mutations
// ============================================================

// Send a reply to a conversation
export const reply = authedMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { conversationId, content }) => {
    const conv = await ctx.db.get(conversationId);
    if (!conv || conv.userId !== ctx.userId) {
      throw new Error("Conversation not found");
    }

    // Add the agent's reply
    const messages = [
      ...conv.messages,
      {
        role: "agent" as const,
        content,
        timestamp: Date.now(),
      },
    ];

    await ctx.db.patch(conversationId, { messages });

    // TODO: Actually send the reply via the original channel
    // This would involve calling the appropriate service (email, SMS, etc.)
    return null;
  },
});

// Update conversation status
export const updateStatus = authedMutation({
  args: {
    conversationId: v.id("conversations"),
    status: v.union(
      v.literal("active"),
      v.literal("resolved"),
      v.literal("escalated")
    ),
  },
  returns: v.null(),
  handler: async (ctx, { conversationId, status }) => {
    const conv = await ctx.db.get(conversationId);
    if (!conv || conv.userId !== ctx.userId) {
      throw new Error("Conversation not found");
    }

    await ctx.db.patch(conversationId, { status });
    return null;
  },
});

// Add a summary to a conversation
export const setSummary = authedMutation({
  args: {
    conversationId: v.id("conversations"),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { conversationId, summary }) => {
    const conv = await ctx.db.get(conversationId);
    if (!conv || conv.userId !== ctx.userId) {
      throw new Error("Conversation not found");
    }

    await ctx.db.patch(conversationId, { summary });
    return null;
  },
});

// ============================================================
// Internal functions
// ============================================================

// Create a new conversation (from webhook or agent runtime)
export const create = internalMutation({
  args: {
    userId: v.id("users"),
    channel: v.union(
      v.literal("email"),
      v.literal("phone"),
      v.literal("api"),
      v.literal("mcp"),
      v.literal("webmcp"),
      v.literal("a2a"),
      v.literal("twitter"),
      v.literal("slack"),
      v.literal("dashboard")
    ),
    externalId: v.string(),
    initialMessage: v.string(),
  },
  returns: v.id("conversations"),
  handler: async (ctx, { userId, channel, externalId, initialMessage }) => {
    // Check if conversation already exists
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const existingConv = existing.find(
      (c) => c.channel === channel && c.externalId === externalId
    );

    if (existingConv) {
      // Add to existing conversation
      const messages = [
        ...existingConv.messages,
        {
          role: "external" as const,
          content: initialMessage,
          timestamp: Date.now(),
        },
      ];

      await ctx.db.patch(existingConv._id, {
        messages,
        status: "active",
      });

      return existingConv._id;
    }

    // Create new conversation
    return await ctx.db.insert("conversations", {
      userId,
      channel,
      externalId,
      messages: [
        {
          role: "external",
          content: initialMessage,
          timestamp: Date.now(),
        },
      ],
      status: "active",
      createdAt: Date.now(),
    });
  },
});

// Add agent response to conversation
export const addAgentResponse = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { conversationId, content }) => {
    const conv = await ctx.db.get(conversationId);
    if (!conv) return null;

    const messages = [
      ...conv.messages,
      {
        role: "agent" as const,
        content,
        timestamp: Date.now(),
      },
    ];

    await ctx.db.patch(conversationId, { messages });
    return null;
  },
});

// Get or create conversation (for use by agent runtime)
export const getOrCreate = internalQuery({
  args: {
    userId: v.id("users"),
    channel: v.string(),
    externalId: v.string(),
  },
  returns: v.union(v.id("conversations"), v.null()),
  handler: async (ctx, { userId, channel, externalId }) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const existing = conversations.find(
      (c) => c.channel === channel && c.externalId === externalId
    );

    return existing?._id ?? null;
  },
});
