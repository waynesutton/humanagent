/**
 * Conversations Functions
 *
 * Manage email/phone/API conversations
 */
import { v } from "convex/values";
import { authedMutation, authedQuery } from "../lib/functions";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

type EmailChannelMetadata = {
  from: string;
  inboxAddress: string;
  inboxId?: string;
  subject?: string;
  threadId?: string;
  lastMessageId?: string;
  deliveryStatus?: "received" | "sent" | "delivered" | "bounced";
  lastEventType?: string;
  lastEventAt?: number;
  lastRecipients?: Array<string>;
  lastBounceType?: string;
  lastBounceSubType?: string;
};

type ChannelMetadata = {
  email?: EmailChannelMetadata;
};

function mergeChannelMetadata(
  existing?: ChannelMetadata,
  incoming?: ChannelMetadata
): ChannelMetadata | undefined {
  if (!existing && !incoming) return undefined;
  const mergedEmail = incoming?.email
    ? {
        ...existing?.email,
        ...incoming.email,
      }
    : existing?.email;

  return {
    ...(existing ?? {}),
    ...(incoming ?? {}),
    ...(mergedEmail ? { email: mergedEmail } : {}),
  };
}

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
    const convWithMetadata = conv as typeof conv & {
      channelMetadata?: ChannelMetadata;
    };

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

    // Send outbound replies for email conversations using AgentMail.
    if (conv.channel === "email") {
      const emailMeta = convWithMetadata.channelMetadata?.email;
      if (!emailMeta?.inboxAddress || !emailMeta?.lastMessageId) {
        throw new Error(
          "Email reply failed: missing thread metadata. New inbound messages will include this automatically."
        );
      }

      const agentmailReply = (internal as Record<string, any>)["functions/agentmail"]
        .replyToMessage;
      await ctx.scheduler.runAfter(0, agentmailReply, {
        userId: ctx.userId,
        inboxAddress: emailMeta.inboxAddress,
        messageId: emailMeta.lastMessageId,
        text: content,
      });
    }

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
    channelMetadata: v.optional(
      v.object({
        email: v.optional(
          v.object({
            from: v.string(),
            inboxAddress: v.string(),
            inboxId: v.optional(v.string()),
            subject: v.optional(v.string()),
            threadId: v.optional(v.string()),
            lastMessageId: v.optional(v.string()),
            deliveryStatus: v.optional(
              v.union(
                v.literal("received"),
                v.literal("sent"),
                v.literal("delivered"),
                v.literal("bounced")
              )
            ),
            lastEventType: v.optional(v.string()),
            lastEventAt: v.optional(v.number()),
            lastRecipients: v.optional(v.array(v.string())),
            lastBounceType: v.optional(v.string()),
            lastBounceSubType: v.optional(v.string()),
          })
        ),
      })
    ),
  },
  returns: v.id("conversations"),
  handler: async (ctx, { userId, channel, externalId, initialMessage, channelMetadata }) => {
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
        channelMetadata: mergeChannelMetadata(
          (existingConv as typeof existingConv & { channelMetadata?: ChannelMetadata })
            .channelMetadata,
          channelMetadata as ChannelMetadata | undefined
        ),
      });

      return existingConv._id;
    }

    // Create new conversation
    return await ctx.db.insert("conversations", {
      userId,
      channel,
      externalId,
      channelMetadata,
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

// Update email thread metadata after outbound or inbound webhook events.
export const updateEmailChannelMetadata = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    inboxAddress: v.optional(v.string()),
    inboxId: v.optional(v.string()),
    from: v.optional(v.string()),
    subject: v.optional(v.string()),
    threadId: v.optional(v.string()),
    lastMessageId: v.optional(v.string()),
    deliveryStatus: v.optional(
      v.union(
        v.literal("received"),
        v.literal("sent"),
        v.literal("delivered"),
        v.literal("bounced")
      )
    ),
    lastEventType: v.optional(v.string()),
    lastEventAt: v.optional(v.number()),
    lastRecipients: v.optional(v.array(v.string())),
    lastBounceType: v.optional(v.string()),
    lastBounceSubType: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("resolved"),
        v.literal("escalated")
      )
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) return null;
    const convWithMetadata = conv as typeof conv & {
      channelMetadata?: ChannelMetadata;
    };

    const current = convWithMetadata.channelMetadata?.email;
    const nextEmail: EmailChannelMetadata = {
      from: args.from ?? current?.from ?? "",
      inboxAddress: args.inboxAddress ?? current?.inboxAddress ?? "",
      inboxId: args.inboxId ?? current?.inboxId,
      subject: args.subject ?? current?.subject,
      threadId: args.threadId ?? current?.threadId,
      lastMessageId: args.lastMessageId ?? current?.lastMessageId,
      deliveryStatus: args.deliveryStatus ?? current?.deliveryStatus,
      lastEventType: args.lastEventType ?? current?.lastEventType,
      lastEventAt: args.lastEventAt ?? current?.lastEventAt,
      lastRecipients: args.lastRecipients ?? current?.lastRecipients,
      lastBounceType: args.lastBounceType ?? current?.lastBounceType,
      lastBounceSubType: args.lastBounceSubType ?? current?.lastBounceSubType,
    };

    const patch: Record<string, unknown> = {
      channelMetadata: {
        ...convWithMetadata.channelMetadata,
        email: nextEmail,
      },
    };
    if (args.status) {
      patch.status = args.status;
    }
    await ctx.db.patch(args.conversationId, patch);
    return null;
  },
});

export const getByChannelAndExternalId = internalQuery({
  args: {
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
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_channel_externalId", (q) =>
        q.eq("channel", args.channel).eq("externalId", args.externalId)
      )
      .first();
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
