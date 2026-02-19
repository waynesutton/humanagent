/**
 * Agent Queries and Mutations
 *
 * Database operations for the agent runtime (runs in V8, not Node.js)
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { buildSystemPrompt } from "./securityUtils";

// Simple base64 decode (should use real decryption in production)
function decodeApiKey(encoded: string): string {
  try {
    return atob(encoded);
  } catch {
    return encoded;
  }
}

/**
 * Get credentials for a specific LLM provider
 */
export const getProviderCredentials = internalQuery({
  args: {
    userId: v.id("users"),
    provider: v.string(),
  },
  returns: v.union(
    v.object({
      apiKey: v.string(),
      baseUrl: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", args.userId).eq("service", args.provider as never)
      )
      .unique();

    if (!credential || !credential.encryptedApiKey || !credential.isActive) {
      return null;
    }

    return {
      apiKey: decodeApiKey(credential.encryptedApiKey),
      baseUrl: credential.config?.baseUrl,
    };
  },
});

/**
 * Get embedding credentials (prefers OpenAI, falls back to OpenRouter).
 */
export const getEmbeddingCredentials = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      apiKey: v.string(),
      baseUrl: v.string(),
      model: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const openai = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", args.userId).eq("service", "openai")
      )
      .unique();
    if (openai?.encryptedApiKey && openai.isActive) {
      return {
        apiKey: decodeApiKey(openai.encryptedApiKey),
        baseUrl: openai.config?.baseUrl ?? "https://api.openai.com/v1",
        model: "text-embedding-3-small",
      };
    }

    const openrouter = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", args.userId).eq("service", "openrouter")
      )
      .unique();
    if (openrouter?.encryptedApiKey && openrouter.isActive) {
      return {
        apiKey: decodeApiKey(openrouter.encryptedApiKey),
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/text-embedding-3-small",
      };
    }

    return null;
  },
});

/**
 * Get agent's LLM configuration
 */
export const getAgentConfig = internalQuery({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
  },
  returns: v.union(
    v.object({
      provider: v.string(),
      model: v.string(),
      systemPrompt: v.string(),
      capabilities: v.array(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // Get user's default config
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    let llmConfig = user.llmConfig;
    let agentName = user.name ?? "Agent";
    let customInstructions: string | undefined;

    // Override with agent-specific config if provided
    if (args.agentId) {
      const agent = await ctx.db.get(args.agentId);
      if (agent && agent.llmConfig) {
        llmConfig = agent.llmConfig;
        agentName = agent.name;
      }
      customInstructions = agent?.personality?.customInstructions;
    }

    // Get active skills for capabilities (filter by isActive in code since it's optional)
    const allSkills = await ctx.db
      .query("skills")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(50);
    
    // Filter to active skills only (default to true if isActive is undefined)
    const skills = allSkills.filter((s) => s.isActive !== false).slice(0, 10);

    const capabilities: string[] = [];
    const restrictions: string[] = [];

    for (const skill of skills) {
      // Filter by agent if specified
      if (args.agentId && skill.agentId && skill.agentId !== args.agentId) {
        continue;
      }
      for (const cap of skill.capabilities) {
        capabilities.push(`${cap.name}: ${cap.description}`);
      }
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(
      agentName,
      user.name ?? "User",
      capabilities.length > 0
        ? capabilities
        : ["General assistance", "Answer questions", "Help with tasks"],
      restrictions,
      customInstructions
    );

    return {
      provider: llmConfig.provider,
      model: llmConfig.model,
      systemPrompt,
      capabilities,
    };
  },
});

/**
 * Load conversation context from memory
 */
export const loadContext = internalQuery({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    maxMessages: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      role: v.union(
        v.literal("system"),
        v.literal("user"),
        v.literal("assistant")
      ),
      content: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const maxMessages = args.maxMessages ?? 20;

    // Recent memory lane (chronological later)
    const recentMemories = args.agentId
      ? await ctx.db
          .query("agentMemory")
          .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
          .order("desc")
          .take(maxMessages)
      : await ctx.db
          .query("agentMemory")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId))
          .order("desc")
          .take(maxMessages);

    const memoryById = new Map<string, (typeof recentMemories)[number]>();
    for (const memory of recentMemories) {
      if (memory.archived) continue;
      memoryById.set(memory._id, memory);
    }

    const mergedMemories = Array.from(memoryById.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-maxMessages);

    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];

    for (const memory of mergedMemories) {
      const metadataRole = memory.metadata?.role;
      const role: "system" | "user" | "assistant" =
        metadataRole === "assistant" || metadataRole === "user"
          ? metadataRole
          : memory.type === "conversation_summary"
            ? "system"
            : "user";

      const content =
        memory.type === "conversation_summary"
          ? `Memory summary: ${memory.content}`
          : memory.content;

      messages.push({
        role,
        content,
      });
    }

    return messages;
  },
});

export const getMemoriesByIds = internalQuery({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    memoryIds: v.array(v.id("agentMemory")),
  },
  returns: v.array(
    v.object({
      role: v.union(
        v.literal("system"),
        v.literal("user"),
        v.literal("assistant")
      ),
      content: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const docs = await Promise.all(args.memoryIds.map((id) => ctx.db.get(id)));
    const filtered = docs.filter((doc): doc is NonNullable<typeof doc> => {
      return (
        doc !== null &&
        doc.userId === args.userId &&
        !doc.archived &&
        (!args.agentId || doc.agentId === args.agentId)
      );
    });

    const sorted = filtered.sort((a, b) => a.createdAt - b.createdAt);
    return sorted.map((memory) => {
      const metadataRole = memory.metadata?.role;
      const role: "system" | "user" | "assistant" =
        metadataRole === "assistant" || metadataRole === "user"
          ? metadataRole
          : memory.type === "conversation_summary"
            ? "system"
            : "user";

      const content =
        memory.type === "conversation_summary"
          ? `Memory summary: ${memory.content}`
          : memory.content;
      return { role, content };
    });
  },
});

/**
 * Save a memory to the agent's context
 */
export const saveMemory = internalMutation({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    type: v.union(
      v.literal("conversation"),
      v.literal("learned_preference"),
      v.literal("task_result"),
      v.literal("conversation_summary")
    ),
    content: v.string(),
    source: v.union(
      v.literal("email"),
      v.literal("phone"),
      v.literal("api"),
      v.literal("mcp"),
      v.literal("webmcp"),
      v.literal("a2a"),
      v.literal("manual"),
      v.literal("dashboard")
    ),
    embedding: v.optional(v.array(v.float64())),
    metadata: v.optional(v.any()),
  },
  returns: v.id("agentMemory"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentMemory", {
      userId: args.userId,
      agentId: args.agentId,
      type: args.type,
      content: args.content,
      embedding: args.embedding,
      source: args.source,
      metadata: args.metadata,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

/**
 * Save an agent thought/reasoning entry
 */
export const saveThought = internalMutation({
  args: {
    userId: v.id("users"),
    agentId: v.id("agents"),
    type: v.union(
      v.literal("observation"),
      v.literal("reasoning"),
      v.literal("decision"),
      v.literal("reflection"),
      v.literal("goal_update")
    ),
    content: v.string(),
    context: v.optional(v.string()),
    relatedTaskId: v.optional(v.id("tasks")),
  },
  returns: v.id("agentThoughts"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentThoughts", {
      userId: args.userId,
      agentId: args.agentId,
      type: args.type,
      content: args.content,
      context: args.context,
      relatedTaskId: args.relatedTaskId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Look up an agent by slug within a user's agents
 */
export const getAgentBySlug = internalQuery({
  args: {
    userId: v.id("users"),
    slug: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("agents"),
      name: v.string(),
      slug: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_userId_slug", (q) =>
        q.eq("userId", args.userId).eq("slug", args.slug)
      )
      .unique();
    if (!agent) return null;
    return { _id: agent._id, name: agent.name, slug: agent.slug };
  },
});

/**
 * Log an agent action to the audit trail
 */
export const logAgentAction = internalMutation({
  args: {
    userId: v.id("users"),
    action: v.string(),
    resource: v.string(),
    callerType: v.union(
      v.literal("user"),
      v.literal("agent"),
      v.literal("a2a"),
      v.literal("cron"),
      v.literal("webhook")
    ),
    callerIdentity: v.optional(v.string()),
    tokenCount: v.optional(v.number()),
    status: v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("blocked"),
      v.literal("in_progress")
    ),
    details: v.optional(v.any()),
  },
  returns: v.id("auditLog"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: args.action,
      resource: args.resource,
      callerType: args.callerType,
      callerIdentity: args.callerIdentity,
      tokenCount: args.tokenCount,
      status: args.status,
      details: args.details,
      timestamp: Date.now(),
    });
  },
});

/**
 * Update token usage for the user/agent
 */
export const updateTokenUsage = internalMutation({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    tokensUsed: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Update user's token count
    const user = await ctx.db.get(args.userId);
    if (user) {
      await ctx.db.patch(args.userId, {
        llmConfig: {
          ...user.llmConfig,
          tokensUsedThisMonth:
            user.llmConfig.tokensUsedThisMonth + args.tokensUsed,
        },
      });
    }

    // Update agent's token count if applicable
    if (args.agentId) {
      const agent = await ctx.db.get(args.agentId);
      if (agent && agent.llmConfig) {
        await ctx.db.patch(args.agentId, {
          llmConfig: {
            ...agent.llmConfig,
            tokensUsedThisMonth:
              agent.llmConfig.tokensUsedThisMonth + args.tokensUsed,
          },
        });
      }
    }

    return null;
  },
});

/**
 * Get the default agent ID for a user (used when no specific agent is provided).
 */
export const getDefaultAgentId = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.id("agents"),
  handler: async (ctx, args) => {
    const defaultAgent = await ctx.db
      .query("agents")
      .withIndex("by_userId_default", (q) =>
        q.eq("userId", args.userId).eq("isDefault", true)
      )
      .first();

    if (defaultAgent) return defaultAgent._id;

    // Fallback: any agent belonging to this user
    const anyAgent = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (!anyAgent) throw new Error("No agents found for user");
    return anyAgent._id;
  },
});

/**
 * Get voice credentials and config for a specific agent.
 * Runs in V8 (not Node.js) so it can be used by Node.js actions via ctx.runQuery.
 */
export const getVoiceConfig = internalQuery({
  args: {
    userId: v.id("users"),
    agentId: v.id("agents"),
  },
  returns: v.union(
    v.object({
      provider: v.union(v.literal("elevenlabs"), v.literal("openai")),
      apiKey: v.string(),
      voiceId: v.optional(v.string()),
      modelId: v.optional(v.string()),
      stability: v.optional(v.number()),
      similarityBoost: v.optional(v.number()),
      style: v.optional(v.number()),
      useSpeakerBoost: v.optional(v.boolean()),
      openaiVoice: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.userId !== args.userId) return null;

    const voiceConfig = agent.voiceConfig;
    const provider = voiceConfig?.provider ?? "openai";

    function decodeKey(encoded: string): string {
      try {
        return atob(encoded);
      } catch {
        return encoded;
      }
    }

    const service = provider === "elevenlabs" ? "elevenlabs" : "openai";
    const credential = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", args.userId).eq("service", service)
      )
      .unique();

    if (!credential?.encryptedApiKey || !credential.isActive) {
      if (provider === "elevenlabs") {
        const openaiCred = await ctx.db
          .query("userCredentials")
          .withIndex("by_userId_service", (q) =>
            q.eq("userId", args.userId).eq("service", "openai")
          )
          .unique();
        if (openaiCred?.encryptedApiKey && openaiCred.isActive) {
          return {
            provider: "openai" as const,
            apiKey: decodeKey(openaiCred.encryptedApiKey),
            openaiVoice: voiceConfig?.openaiVoice ?? "nova",
          };
        }
      }
      return null;
    }

    return {
      provider,
      apiKey: decodeKey(credential.encryptedApiKey),
      voiceId: voiceConfig?.voiceId,
      modelId: voiceConfig?.modelId,
      stability: voiceConfig?.stability,
      similarityBoost: voiceConfig?.similarityBoost,
      style: voiceConfig?.style,
      useSpeakerBoost: voiceConfig?.useSpeakerBoost,
      openaiVoice: voiceConfig?.openaiVoice ?? "nova",
    };
  },
});
