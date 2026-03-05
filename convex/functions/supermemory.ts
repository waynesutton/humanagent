"use node";

/**
 * Supermemory Integration - Actions
 *
 * Handles API calls to Supermemory for automatic user profiles.
 * Static facts persist long-term, dynamic context reflects recent activity.
 *
 * Docs: https://supermemory.ai/docs/user-profiles
 *
 * NOTE: Queries and mutations are in supermemoryQueries.ts (V8 runtime).
 * This file only contains actions (Node.js runtime).
 */
import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";

const SUPERMEMORY_API_BASE = "https://api.supermemory.ai/v1";

type SupermemoryCredential = { apiKey: string } | null;

// ============================================================
// Actions (Supermemory API calls)
// ============================================================

/**
 * Fetch user profile from Supermemory and cache it
 */
export const fetchProfile = action({
  args: {
    agentId: v.optional(v.id("agents")),
    searchQuery: v.optional(v.string()), // Optional query to filter profile context
  },
  returns: v.object({
    success: v.boolean(),
    staticFacts: v.optional(v.array(v.string())),
    dynamicContext: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; staticFacts?: string[]; dynamicContext?: string[]; error?: string }> => {
    // Get container tag from agent config if agent specified
    let containerTag = "default";
    if (args.agentId) {
      const agent = await ctx.runQuery(internal.functions.supermemoryQueries.getAgentForProfile, {
        agentId: args.agentId,
      });
      if (agent?.supermemoryConfig?.containerTag) {
        containerTag = agent.supermemoryConfig.containerTag;
      }
    }

    const credential: SupermemoryCredential = await ctx.runQuery(internal.functions.supermemoryQueries.getCredential, {});
    if (!credential) {
      return { success: false, error: "Supermemory API key not configured" };
    }

    try {
      // Build profile URL with optional search query
      let url = `${SUPERMEMORY_API_BASE}/profile`;
      const params = new URLSearchParams();
      params.set("container", containerTag);
      if (args.searchQuery) {
        params.set("q", args.searchQuery);
      }
      url += `?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Supermemory API error: ${error}` };
      }

      const data = await response.json() as {
        static?: string[];
        dynamic?: string[];
      };

      const staticFacts = data.static || [];
      const dynamicContext = data.dynamic || [];

      // Cache the profile
      await ctx.runMutation(internal.functions.supermemoryQueries.cacheProfile, {
        agentId: args.agentId,
        containerTag,
        staticFacts,
        dynamicContext,
        searchQuery: args.searchQuery,
      });

      return { success: true, staticFacts, dynamicContext };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Add content to Supermemory for profile building
 */
export const addContent = action({
  args: {
    content: v.string(),
    containerTag: v.optional(v.string()),
    metadata: v.optional(v.object({
      source: v.optional(v.string()),
      timestamp: v.optional(v.number()),
    })),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const credential: SupermemoryCredential = await ctx.runQuery(internal.functions.supermemoryQueries.getCredential, {});
    if (!credential) {
      return { success: false, error: "Supermemory API key not configured" };
    }

    try {
      const response = await fetch(`${SUPERMEMORY_API_BASE}/add`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: args.content,
          container: args.containerTag || "default",
          metadata: args.metadata,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Supermemory API error: ${error}` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Ingest a conversation to build user profile
 */
export const ingestConversation = action({
  args: {
    agentId: v.id("agents"),
    messages: v.array(v.object({
      role: v.string(),
      content: v.string(),
    })),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Get agent config
    const agent = await ctx.runQuery(internal.functions.supermemoryQueries.getAgentForProfile, {
      agentId: args.agentId,
    });

    if (!agent?.supermemoryConfig?.enabled || !agent.supermemoryConfig.syncConversations) {
      return { success: false, error: "Supermemory sync not enabled for this agent" };
    }

    const containerTag = agent.supermemoryConfig.containerTag;

    // Format conversation for ingestion
    const conversationText = args.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");

    // Add to Supermemory
    const result = await ctx.runAction(internal.functions.supermemory.addContent, {
      content: conversationText,
      containerTag,
      metadata: {
        source: "conversation",
        timestamp: Date.now(),
      },
    });

    return result;
  },
});

/**
 * Ingest a task outcome to build user profile
 */
export const ingestTaskOutcome = action({
  args: {
    agentId: v.id("agents"),
    taskDescription: v.string(),
    outcome: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Get agent config
    const agent = await ctx.runQuery(internal.functions.supermemoryQueries.getAgentForProfile, {
      agentId: args.agentId,
    });

    if (!agent?.supermemoryConfig?.enabled || !agent.supermemoryConfig.syncTaskResults) {
      return { success: false, error: "Supermemory sync not enabled for this agent" };
    }

    const containerTag = agent.supermemoryConfig.containerTag;

    // Format task for ingestion
    const taskText = `Task: ${args.taskDescription}\n\nOutcome: ${args.outcome}`;

    // Add to Supermemory
    const result = await ctx.runAction(internal.functions.supermemory.addContent, {
      content: taskText,
      containerTag,
      metadata: {
        source: "task_outcome",
        timestamp: Date.now(),
      },
    });

    return result;
  },
});
