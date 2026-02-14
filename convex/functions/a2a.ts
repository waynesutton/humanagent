"use node";

import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { authedMutation } from "../lib/functions";

function buildThreadId(fromAgentId: string, toAgentId: string): string {
  const [a, b] = [fromAgentId, toAgentId].sort();
  return `${a}:${b}`;
}

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
  handler: async (ctx, args) => {
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
    metadata: v.optional(v.any()),
  },
  returns: v.object({
    threadId: v.string(),
    accepted: v.boolean(),
  }),
  handler: async (ctx, args) => {
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
        toUser?.privacySettings?.showEndpoints !== false;
      const connectEnabled =
        toAgent.publicConnect?.showApi === true ||
        toAgent.publicConnect?.showMcp === true ||
        toAgent.publicConnect?.showSkillFile === true;

      if (
        !toAgent.isPublic ||
        !toAgent.a2aConfig.allowPublicAgents ||
        !hasPublicSkill ||
        !endpointVisible ||
        !connectEnabled
      ) {
        throw new Error("Recipient agent is not open for cross-user A2A messaging");
      }
    }

    const threadId =
      args.threadId ?? buildThreadId(String(args.fromAgentId), String(args.toAgentId));

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

    await ctx.scheduler.runAfter(0, internal.functions.a2a.processAgentInbox, {
      fromAgentId: fromAgent._id,
      toAgentId: toAgent._id,
      message: args.message,
      threadId,
      recipientConversationId,
    });

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
  },
  returns: v.object({
    response: v.string(),
    blocked: v.boolean(),
    tokensUsed: v.number(),
  }),
  handler: async (ctx, args) => {
    const fromAgent = await ctx.runQuery(internal.functions.agents.getById, {
      agentId: args.fromAgentId,
    });
    const toAgent = await ctx.runQuery(internal.functions.agents.getById, {
      agentId: args.toAgentId,
    });
    if (!fromAgent || !toAgent) {
      throw new Error("Agent not found during inbox processing");
    }

    const result = await ctx.runAction(internal.agent.runtime.processMessage, {
      userId: toAgent.userId,
      agentId: toAgent._id,
      message: args.message,
      channel: "a2a",
      callerId: `agent:${String(args.fromAgentId)}`,
    });

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
