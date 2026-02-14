import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { authedMutation, authedQuery } from "../lib/functions";
import type { Id } from "../_generated/dataModel";

type A2aDirection = "inbound" | "outbound";
type SendResult = { threadId: string; accepted: boolean };
type SummarizeResult = {
  summaryMemoryId: Id<"agentMemory">;
  summary: string;
  messageCount: number;
};
type ProcessInboxResult = { response: string; blocked: boolean; tokensUsed: number };

function getDirection(
  metadata: unknown
): A2aDirection | null {
  if (!metadata || typeof metadata !== "object") return null;
  const direction = (metadata as { direction?: unknown }).direction;
  return direction === "inbound" || direction === "outbound" ? direction : null;
}

function getThreadId(
  metadata: unknown
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const threadId = (metadata as { threadId?: unknown }).threadId;
  return typeof threadId === "string" && threadId.length > 0 ? threadId : null;
}

function buildThreadId(fromAgentId: string, toAgentId: string): string {
  const [a, b] = [fromAgentId, toAgentId].sort();
  return `${a}:${b}`;
}

export const getInboxThreads = authedQuery({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      threadId: v.string(),
      lastMessageAt: v.number(),
      messageCount: v.number(),
      fromAgentId: v.optional(v.id("agents")),
      fromAgentName: v.optional(v.string()),
      preview: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("agentMemory")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(600);

    const inbound = memories.filter(
      (memory) => memory.source === "a2a" && getDirection(memory.metadata) === "inbound"
    );

    const threadMap = new Map<string, (typeof inbound)[number][]>();
    for (const memory of inbound) {
      const threadId = getThreadId(memory.metadata);
      if (!threadId) continue;
      const current = threadMap.get(threadId) ?? [];
      current.push(memory);
      threadMap.set(threadId, current);
    }

    const summaries = await Promise.all(
      Array.from(threadMap.entries()).map(async ([threadId, rows]) => {
        const sorted = rows.sort((a, b) => a.createdAt - b.createdAt);
        const latest = sorted[sorted.length - 1]!;
        const fromAgentId = latest.metadata?.peerAgentId as
          | (typeof latest.agentId)
          | undefined;
        const fromAgent = fromAgentId ? await ctx.db.get(fromAgentId) : null;

        return {
          threadId,
          lastMessageAt: latest.createdAt,
          messageCount: rows.length,
          fromAgentId,
          fromAgentName: fromAgent?.name,
          preview: latest.content.slice(0, 180),
        };
      })
    );

    return summaries
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, args.limit ?? 50);
  },
});

export const getOutboxThreads = authedQuery({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      threadId: v.string(),
      lastMessageAt: v.number(),
      messageCount: v.number(),
      toAgentId: v.optional(v.id("agents")),
      toAgentName: v.optional(v.string()),
      preview: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("agentMemory")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(600);

    const outbound = memories.filter(
      (memory) => memory.source === "a2a" && getDirection(memory.metadata) === "outbound"
    );

    const threadMap = new Map<string, (typeof outbound)[number][]>();
    for (const memory of outbound) {
      const threadId = getThreadId(memory.metadata);
      if (!threadId) continue;
      const current = threadMap.get(threadId) ?? [];
      current.push(memory);
      threadMap.set(threadId, current);
    }

    const summaries = await Promise.all(
      Array.from(threadMap.entries()).map(async ([threadId, rows]) => {
        const sorted = rows.sort((a, b) => a.createdAt - b.createdAt);
        const latest = sorted[sorted.length - 1]!;
        const toAgentId = latest.metadata?.peerAgentId as
          | (typeof latest.agentId)
          | undefined;
        const toAgent = toAgentId ? await ctx.db.get(toAgentId) : null;

        return {
          threadId,
          lastMessageAt: latest.createdAt,
          messageCount: rows.length,
          toAgentId,
          toAgentName: toAgent?.name,
          preview: latest.content.slice(0, 180),
        };
      })
    );

    return summaries
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, args.limit ?? 50);
  },
});

export const getThreadMessages = authedQuery({
  args: {
    threadId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("agentMemory"),
      createdAt: v.number(),
      content: v.string(),
      direction: v.union(v.literal("inbound"), v.literal("outbound")),
      agentId: v.optional(v.id("agents")),
      peerAgentId: v.optional(v.id("agents")),
    })
  ),
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("agentMemory")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(1000);

    const messages = memories
      .filter(
        (memory) =>
          memory.source === "a2a" &&
          getThreadId(memory.metadata) === args.threadId &&
          getDirection(memory.metadata) !== null
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-(args.limit ?? 100))
      .map((memory) => ({
        _id: memory._id,
        createdAt: memory.createdAt,
        content: memory.content,
        direction: getDirection(memory.metadata)!,
        agentId: memory.agentId,
        peerAgentId: memory.metadata?.peerAgentId as
          | (typeof memory.agentId)
          | undefined,
      }));

    return messages;
  },
});

export const summarizeThread = authedMutation({
  args: {
    threadId: v.string(),
    agentId: v.optional(v.id("agents")),
  },
  returns: v.object({
    summaryMemoryId: v.id("agentMemory"),
    summary: v.string(),
    messageCount: v.number(),
  }),
  handler: async (ctx, args): Promise<SummarizeResult> => {
    const memories = await ctx.db
      .query("agentMemory")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(1000);

    const threadMemories = memories
      .filter(
        (memory) =>
          memory.source === "a2a" &&
          getThreadId(memory.metadata) === args.threadId &&
          (!args.agentId || memory.agentId === args.agentId)
      )
      .sort((a, b) => a.createdAt - b.createdAt);

    if (threadMemories.length === 0) {
      throw new Error("No messages found for this thread");
    }

    const bulletLines = threadMemories
      .slice(-12)
      .map((memory) => {
        const direction = getDirection(memory.metadata) ?? "inbound";
        const prefix = direction === "outbound" ? "Sent" : "Received";
        return `${prefix}: ${memory.content.slice(0, 180)}`;
      });

    const summary = `A2A thread summary (${threadMemories.length} messages)\n${bulletLines.join("\n")}`;
    const base = threadMemories[threadMemories.length - 1]!;

    const summaryMemoryId: Id<"agentMemory"> = await ctx.runMutation(
      internal.agent.queries.saveMemory,
      {
      userId: ctx.userId,
      agentId: args.agentId ?? base.agentId,
      type: "conversation_summary",
      content: summary,
      source: "a2a",
      metadata: {
        threadId: args.threadId,
        messageCount: threadMemories.length,
      },
      }
    );

    return {
      summaryMemoryId,
      summary,
      messageCount: threadMemories.length,
    };
  },
});

export const sendFromDashboard = authedMutation({
  args: {
    fromAgentId: v.id("agents"),
    toAgentId: v.id("agents"),
    message: v.string(),
  },
  returns: v.object({
    threadId: v.string(),
    accepted: v.boolean(),
  }),
  handler: async (ctx, args): Promise<SendResult> => {
    const fromAgent = await ctx.db.get(args.fromAgentId);
    if (!fromAgent || fromAgent.userId !== ctx.userId) {
      throw new Error("Sender agent not found");
    }

    return await ctx.runMutation(internal.functions.a2a.sendAgentMessage, {
      fromAgentId: args.fromAgentId,
      toAgentId: args.toAgentId,
      message: args.message,
    });
  },
});

export const sendAgentMessage = internalMutation({
  args: {
    fromAgentId: v.id("agents"),
    toAgentId: v.id("agents"),
    message: v.string(),
    threadId: v.optional(v.string()),
    hopCount: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  returns: v.object({
    threadId: v.string(),
    accepted: v.boolean(),
  }),
  handler: async (ctx, args): Promise<SendResult> => {
    const fromAgent = await ctx.db.get(args.fromAgentId);
    const toAgent = await ctx.db.get(args.toAgentId);
    if (!fromAgent || !toAgent) {
      throw new Error("Agent not found");
    }

    if (!fromAgent.a2aConfig?.enabled) {
      throw new Error("Sender agent does not allow A2A messaging");
    }
    if (!toAgent.a2aConfig?.enabled) {
      throw new Error("Recipient agent does not allow A2A messaging");
    }

    const isCrossUser = fromAgent.userId !== toAgent.userId;
    if (isCrossUser) {
      const toUser = await ctx.db.get(toAgent.userId);
      const targetSkills = await ctx.db
        .query("skills")
        .withIndex("by_agentId", (q) => q.eq("agentId", toAgent._id))
        .take(20);
      const hasPublicSkill = targetSkills.some(
        (skill) => skill.isPublished && skill.isActive !== false
      );
      const endpointVisible =
        toUser?.privacySettings?.profileVisible !== false &&
        toUser?.privacySettings?.showEndpoints !== false &&
        toUser?.privacySettings?.allowAgentToAgent === true;
      const connectEnabled =
        toAgent.publicConnect?.showApi === true ||
        toAgent.publicConnect?.showMcp === true ||
        toAgent.publicConnect?.showSkillFile === true;

      if (
        !toAgent.isPublic ||
        !toAgent.a2aConfig?.allowPublicAgents ||
        !hasPublicSkill ||
        !endpointVisible ||
        !connectEnabled
      ) {
        throw new Error("Recipient agent is not open for cross-user A2A messaging");
      }
    }

    const threadId =
      args.threadId ?? buildThreadId(String(args.fromAgentId), String(args.toAgentId));
    const hopCount = Math.max(0, args.hopCount ?? 0);
    const maxAllowedHops = toAgent.a2aConfig?.maxAutoReplyHops ?? 2;
    if (hopCount > maxAllowedHops) {
      throw new Error("A2A loop protection triggered: hop limit reached");
    }

    // Sender keeps outbound memory.
    await ctx.runMutation(internal.agent.queries.saveMemory, {
      userId: fromAgent.userId,
      agentId: fromAgent._id,
      type: "conversation",
      content: args.message,
      source: "a2a",
      metadata: {
        role: "assistant",
        threadId,
        hopCount,
        peerAgentId: toAgent._id,
        direction: "outbound",
        ...args.metadata,
      },
    });

    // Recipient keeps inbound memory.
    await ctx.runMutation(internal.agent.queries.saveMemory, {
      userId: toAgent.userId,
      agentId: toAgent._id,
      type: "conversation",
      content: args.message,
      source: "a2a",
      metadata: {
        role: "user",
        threadId,
        hopCount,
        peerAgentId: fromAgent._id,
        direction: "inbound",
        ...args.metadata,
      },
    });

    const recipientConversationId = await ctx.runMutation(
      internal.functions.conversations.create,
      {
        userId: toAgent.userId,
        channel: "a2a",
        externalId: String(fromAgent._id),
        initialMessage: args.message,
      }
    );

    await ctx.runMutation(internal.functions.auditLog.create, {
      userId: fromAgent.userId,
      action: "a2a_message_sent",
      resource: "a2a",
      callerType: "a2a",
      callerIdentity: String(fromAgent._id),
      status: "in_progress",
      details: {
        threadId,
        toAgentId: toAgent._id,
      },
    });

    if (fromAgent.isPublic) {
      await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
        userId: fromAgent.userId,
        type: "message_handled",
        title: `${fromAgent.name} sent an agent-to-agent message`,
        content: `To ${toAgent.name}`,
        metadata: { threadId, toAgentId: toAgent._id },
        isPublic: true,
      });
    }

    if (toAgent.a2aConfig?.autoRespond !== false) {
      await ctx.scheduler.runAfter(0, internal.functions.a2a.processAgentInbox, {
        fromAgentId: fromAgent._id,
        toAgentId: toAgent._id,
        message: args.message,
        threadId,
        recipientConversationId,
        hopCount,
      });
    }

    return {
      threadId,
      accepted: true,
    };
  },
});

export const processAgentInbox = internalAction({
  args: {
    fromAgentId: v.id("agents"),
    toAgentId: v.id("agents"),
    message: v.string(),
    threadId: v.string(),
    recipientConversationId: v.id("conversations"),
    hopCount: v.optional(v.number()),
  },
  returns: v.object({
    response: v.string(),
    blocked: v.boolean(),
    tokensUsed: v.number(),
  }),
  handler: async (ctx, args): Promise<ProcessInboxResult> => {
    const fromAgent = await ctx.runQuery(internal.functions.agents.getById, {
      agentId: args.fromAgentId,
    });
    const toAgent = await ctx.runQuery(internal.functions.agents.getById, {
      agentId: args.toAgentId,
    });
    if (!fromAgent || !toAgent) {
      throw new Error("Agent not found during inbox processing");
    }

    const result: ProcessInboxResult = await ctx.runAction(
      internal.agent.runtime.processMessage,
      {
      userId: toAgent.userId,
      agentId: toAgent._id,
      message: args.message,
      channel: "a2a",
      callerId: `agent:${String(args.fromAgentId)}`,
      }
    );

    await ctx.runMutation(internal.functions.conversations.addAgentResponse, {
      conversationId: args.recipientConversationId,
      content: result.response,
    });

    // Sender keeps recipient response as inbound memory.
    await ctx.runMutation(internal.agent.queries.saveMemory, {
      userId: fromAgent.userId,
      agentId: fromAgent._id,
      type: "conversation",
      content: result.response,
      source: "a2a",
      metadata: {
        role: "user",
        threadId: args.threadId,
        hopCount: (args.hopCount ?? 0) + 1,
        peerAgentId: toAgent._id,
        direction: "inbound",
      },
    });

    // Sender transcript stores peer response as external message history.
    await ctx.runMutation(internal.functions.conversations.create, {
      userId: fromAgent.userId,
      channel: "a2a",
      externalId: String(toAgent._id),
      initialMessage: result.response,
    });

    await ctx.runMutation(internal.functions.auditLog.create, {
      userId: fromAgent.userId,
      action: "a2a_message_completed",
      resource: "a2a",
      callerType: "a2a",
      callerIdentity: String(args.fromAgentId),
      status: result.blocked ? "blocked" : "success",
      tokenCount: result.tokensUsed,
      details: {
        threadId: args.threadId,
        toAgentId: args.toAgentId,
      },
    });

    await ctx.runMutation(internal.functions.auditLog.create, {
      userId: toAgent.userId,
      action: "a2a_message_received",
      resource: "a2a",
      callerType: "a2a",
      callerIdentity: String(args.fromAgentId),
      status: result.blocked ? "blocked" : "success",
      tokenCount: result.tokensUsed,
      details: {
        threadId: args.threadId,
        fromAgentId: args.fromAgentId,
      },
    });

    if (toAgent.isPublic) {
      await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
        userId: toAgent.userId,
        type: "message_handled",
        title: `${toAgent.name} handled an agent-to-agent message`,
        content: `From ${fromAgent.name}`,
        metadata: { threadId: args.threadId, fromAgentId: fromAgent._id },
        isPublic: true,
      });
    }

    return {
      response: result.response,
      blocked: result.blocked,
      tokensUsed: result.tokensUsed,
    };
  },
});
