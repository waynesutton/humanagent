import { v } from "convex/values";
import { query, internalQuery, internalMutation } from "../_generated/server";
import { authedMutation, authedQuery } from "../lib/functions";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

function extractStorageIdFromImage(image?: string): Id<"_storage"> | null {
  if (!image || !image.startsWith("storage:")) return null;
  const rawId = image.slice("storage:".length).trim();
  if (!rawId) return null;
  return rawId as Id<"_storage">;
}

// ============================================================
// Public queries
// ============================================================

// List all agents for the current user
export const list = authedQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    return await Promise.all(
      agents.map(async (agent) => {
        const storageId = extractStorageIdFromImage(agent.image);
        if (!storageId) return agent;

        const signedUrl = await ctx.storage.getUrl(storageId);
        return {
          ...agent,
          image: signedUrl ?? agent.image,
        };
      })
    );
  },
});

// Get a specific agent by ID
export const get = authedQuery({
  args: { agentId: v.id("agents") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    // Verify ownership
    if (!agent || agent.userId !== ctx.userId) {
      return null;
    }
    return agent;
  },
});

// Get user's default agent
export const getDefault = authedQuery({
  args: {},
  returns: v.union(v.any(), v.null()),
  handler: async (ctx) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_userId_default", (q) =>
        q.eq("userId", ctx.userId).eq("isDefault", true)
      )
      .first();
  },
});

// ============================================================
// Public mutations
// ============================================================

// Create a new agent
export const create = authedMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    publicConnect: v.optional(
      v.object({
        showApi: v.boolean(),
        showMcp: v.boolean(),
        showEmail: v.boolean(),
        showSkillFile: v.boolean(),
      })
    ),
    a2aConfig: v.optional(
      v.object({
        enabled: v.boolean(),
        allowPublicAgents: v.boolean(),
        autoRespond: v.optional(v.boolean()),
        maxAutoReplyHops: v.optional(v.number()),
      })
    ),
  },
  returns: v.id("agents"),
  handler: async (ctx, args) => {
    // Validate slug format (URL-safe, lowercase)
    const slug = args.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    // Check for duplicate slug for this user
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_userId_slug", (q) =>
        q.eq("userId", ctx.userId).eq("slug", slug)
      )
      .first();

    if (existing) {
      throw new Error("An agent with this slug already exists");
    }

    // Check if this is the user's first agent (make it default)
    const existingAgents = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    const isFirstAgent = !existingAgents;

    const now = Date.now();
    const agentId = await ctx.db.insert("agents", {
      userId: ctx.userId,
      name: args.name,
      slug,
      description: args.description,
      icon: args.icon,
      isDefault: isFirstAgent,
      isPublic: args.isPublic ?? false,
      publicConnect: args.publicConnect,
      a2aConfig: args.a2aConfig ?? {
        enabled: false,
        allowPublicAgents: false,
        autoRespond: true,
        maxAutoReplyHops: 2,
      },
      schedulingActive: false,
      schedulingMode: "manual",
      createdAt: now,
      updatedAt: now,
    });

    // If this is the first agent, set as default on user
    if (isFirstAgent) {
      await ctx.db.patch(ctx.userId, { defaultAgentId: agentId });
    }

    // Schedule llms.txt regeneration
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });

    return agentId;
  },
});

// Update an agent
export const update = authedMutation({
  args: {
    agentId: v.id("agents"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.union(v.string(), v.null())),
    image: v.optional(v.union(v.string(), v.null())),
    isPublic: v.optional(v.boolean()),
    publicConnect: v.optional(
      v.object({
        showApi: v.boolean(),
        showMcp: v.boolean(),
        showEmail: v.boolean(),
        showSkillFile: v.boolean(),
      })
    ),
    llmConfig: v.optional(
      v.object({
        provider: v.union(
          v.literal("openrouter"),
          v.literal("anthropic"),
          v.literal("openai"),
          v.literal("google"),
          v.literal("mistral"),
          v.literal("minimax"),
          v.literal("kimi"),
          v.literal("xai"),
          v.literal("custom")
        ),
        model: v.string(),
        tokensUsedThisMonth: v.number(),
        tokenBudget: v.number(),
      })
    ),
    agentEmail: v.optional(v.string()),
    agentPhone: v.optional(v.string()),
    phoneConfig: v.optional(
      v.object({
        voiceEnabled: v.boolean(),
        smsEnabled: v.boolean(),
        transcribeVoicemail: v.boolean(),
        language: v.optional(v.string()),
      })
    ),
    // Voice config for TTS (ElevenLabs or OpenAI)
    voiceConfig: v.optional(
      v.object({
        provider: v.union(v.literal("elevenlabs"), v.literal("openai")),
        voiceId: v.optional(v.string()),
        modelId: v.optional(v.string()),
        stability: v.optional(v.number()),
        similarityBoost: v.optional(v.number()),
        style: v.optional(v.number()),
        useSpeakerBoost: v.optional(v.boolean()),
        openaiVoice: v.optional(v.string()),
      })
    ),
    // Personality settings
    personality: v.optional(
      v.object({
        tone: v.optional(v.string()),
        speakingStyle: v.optional(v.string()),
        customInstructions: v.optional(v.string()),
      })
    ),
    // Scheduling settings (auto/cron/manual)
    scheduling: v.optional(
      v.object({
        mode: v.union(
          v.literal("manual"),
          v.literal("auto"),
          v.literal("cron")
        ),
        cronSpec: v.optional(v.string()),
        intervalMinutes: v.optional(v.number()),
        isActive: v.boolean(),
      })
    ),
    // Thinking mode settings
    thinking: v.optional(
      v.object({
        enabled: v.boolean(),
        isPaused: v.boolean(),
        currentGoal: v.optional(v.string()),
      })
    ),
    // Browser automation settings
    browserAutomation: v.optional(
      v.object({
        firecrawlEnabled: v.boolean(),
        stagehandEnabled: v.boolean(),
        browserUseEnabled: v.boolean(),
      })
    ),
    // X/Twitter integration settings
    xConfig: v.optional(
      v.object({
        enabled: v.boolean(),
        mode: v.union(v.literal("xai_grok"), v.literal("x_api")),
        accountType: v.union(v.literal("agent"), v.literal("user")),
        xUsername: v.optional(v.string()),
        capabilities: v.optional(
          v.object({
            canPost: v.boolean(),
            canReply: v.boolean(),
            canLike: v.boolean(),
            canRetweet: v.boolean(),
            canDM: v.boolean(),
            canSearch: v.boolean(),
            canAnalyze: v.boolean(),
            canMonitor: v.boolean(),
          })
        ),
        autoPost: v.optional(
          v.object({
            enabled: v.boolean(),
            requireApproval: v.boolean(),
            maxPostsPerDay: v.optional(v.number()),
          })
        ),
        monitoring: v.optional(
          v.object({
            trackMentions: v.boolean(),
            trackKeywords: v.optional(v.array(v.string())),
            trackAccounts: v.optional(v.array(v.string())),
          })
        ),
      })
    ),
    // Agent-to-agent communication settings
    a2aConfig: v.optional(
      v.object({
        enabled: v.boolean(),
        allowPublicAgents: v.boolean(),
        autoRespond: v.optional(v.boolean()),
        maxAutoReplyHops: v.optional(v.number()),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.userId !== ctx.userId) {
      throw new Error("Agent not found");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.icon !== undefined) patch.icon = args.icon ?? undefined;
    if (args.image !== undefined) patch.image = args.image ?? undefined;
    if (args.isPublic !== undefined) patch.isPublic = args.isPublic;
    if (args.publicConnect !== undefined) patch.publicConnect = args.publicConnect;
    if (args.llmConfig !== undefined) patch.llmConfig = args.llmConfig;
    if (args.agentEmail !== undefined) patch.agentEmail = args.agentEmail;
    if (args.agentPhone !== undefined) patch.agentPhone = args.agentPhone;
    if (args.phoneConfig !== undefined) patch.phoneConfig = args.phoneConfig;
    if (args.voiceConfig !== undefined) patch.voiceConfig = args.voiceConfig;
    if (args.personality !== undefined) patch.personality = args.personality;
    if (args.scheduling !== undefined) {
      patch.scheduling = args.scheduling;
      patch.schedulingActive = args.scheduling.isActive;
      patch.schedulingMode = args.scheduling.mode;
    }
    if (args.thinking !== undefined) patch.thinking = args.thinking;
    if (args.browserAutomation !== undefined) patch.browserAutomation = args.browserAutomation;
    if (args.a2aConfig !== undefined) patch.a2aConfig = args.a2aConfig;
    if (args.xConfig !== undefined) {
      // xAI (Grok) mode is analysis-only: disable any posting/DM capabilities.
      if (args.xConfig.mode === "xai_grok") {
        patch.xConfig = {
          ...args.xConfig,
          capabilities: args.xConfig.capabilities
            ? {
                ...args.xConfig.capabilities,
                canPost: false,
                canReply: false,
                canLike: false,
                canRetweet: false,
                canDM: false,
              }
            : undefined,
          autoPost: args.xConfig.autoPost
            ? {
                ...args.xConfig.autoPost,
                enabled: false,
              }
            : undefined,
        };
      } else {
        patch.xConfig = args.xConfig;
      }
    }

    await ctx.db.patch(args.agentId, patch);

    // Schedule llms.txt regeneration if public visibility changed or description updated
    if (args.isPublic !== undefined || args.description !== undefined || args.name !== undefined) {
      await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
        userId: ctx.userId,
      });
    }
    return null;
  },
});

// Public: list public agents by username (for public profile connect section)
export const listPublicByUsername = query({
  args: { username: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, { username }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!user) return [];

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(100);

    const publicAgents = agents.filter((agent) => agent.isPublic);

    return await Promise.all(
      publicAgents.map(async (agent) => {
        const storageId = extractStorageIdFromImage(agent.image);
        const signedImageUrl = storageId ? await ctx.storage.getUrl(storageId) : null;

        return {
          _id: agent._id,
          name: agent.name,
          slug: agent.slug,
          description: agent.description,
          isDefault: agent.isDefault,
          agentEmail: agent.agentEmail,
          publicConnect: agent.publicConnect,
          image: signedImageUrl ?? agent.image,
        };
      })
    );
  },
});

// Public: resolve a specific public agent by username + slug
export const getPublicByUsernameAndSlug = query({
  args: { username: v.string(), slug: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { username, slug }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!user) return null;

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_userId_slug", (q) => q.eq("userId", user._id).eq("slug", slug))
      .first();

    if (!agent || !agent.isPublic) return null;
    return agent;
  },
});

// Public: resolve the deterministic default public agent for a username
export const getPublicDefaultByUsername = query({
  args: { username: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { username }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!user) return null;

    const defaultAgent = await ctx.db
      .query("agents")
      .withIndex("by_userId_default", (q) =>
        q.eq("userId", user._id).eq("isDefault", true)
      )
      .first();
    if (defaultAgent?.isPublic) return defaultAgent;

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(100);
    return agents.find((agent) => agent.isPublic) ?? null;
  },
});

export const generateAgentPhotoUploadUrl = authedMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const setAgentPhoto = authedMutation({
  args: {
    agentId: v.id("agents"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.userId !== ctx.userId) {
      throw new Error("Agent not found");
    }

    await ctx.db.patch(args.agentId, {
      image: `storage:${args.storageId}`,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Set an agent as the default
export const setDefault = authedMutation({
  args: { agentId: v.id("agents") },
  returns: v.null(),
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.userId !== ctx.userId) {
      throw new Error("Agent not found");
    }

    // Clear default from all other agents
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    const updates = agents.map((a) =>
      ctx.db.patch(a._id, { isDefault: a._id === agentId, updatedAt: Date.now() })
    );
    await Promise.all(updates);

    // Update user's default agent reference
    await ctx.db.patch(ctx.userId, { defaultAgentId: agentId });
    return null;
  },
});

// Delete an agent
export const remove = authedMutation({
  args: { agentId: v.id("agents") },
  returns: v.null(),
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.userId !== ctx.userId) {
      throw new Error("Agent not found");
    }

    // Don't allow deleting the only agent
    const agentCount = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    if (agentCount.length <= 1) {
      throw new Error("Cannot delete your only agent");
    }

    // If deleting the default agent, set another as default
    if (agent.isDefault) {
      const other = agentCount.find((a) => a._id !== agentId);
      if (other) {
        await ctx.db.patch(other._id, { isDefault: true, updatedAt: Date.now() });
        await ctx.db.patch(ctx.userId, { defaultAgentId: other._id });
      }
    }

    // Delete associated skills
    const skills = await ctx.db
      .query("skills")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .collect();

    const skillDeletes = skills.map((s) => ctx.db.delete(s._id));
    await Promise.all(skillDeletes);

    await ctx.db.delete(agentId);
    return null;
  },
});

// ============================================================
// Internal functions
// ============================================================

export const getById = internalQuery({
  args: { agentId: v.id("agents") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { agentId }) => {
    return await ctx.db.get(agentId);
  },
});

export const getByUserIdAndSlug = internalQuery({
  args: { userId: v.id("users"), slug: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { userId, slug }) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_userId_slug", (q) => q.eq("userId", userId).eq("slug", slug))
      .first();
  },
});

export const updateTokenUsage = internalMutation({
  args: {
    agentId: v.id("agents"),
    tokensUsed: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { agentId, tokensUsed }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || !agent.llmConfig) return null;

    await ctx.db.patch(agentId, {
      llmConfig: {
        ...agent.llmConfig,
        tokensUsedThisMonth: agent.llmConfig.tokensUsedThisMonth + tokensUsed,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Get agent by phone number (for Twilio webhooks)
export const getByPhone = internalQuery({
  args: { phoneNumber: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { phoneNumber }) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_agentPhone", (q) => q.eq("agentPhone", phoneNumber))
      .first();
  },
});

// Get agent by email address (for AgentMail webhooks)
export const getByEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { email }) => {
    const normalized = email.trim().toLowerCase();
    return await ctx.db
      .query("agents")
      .withIndex("by_agentEmail", (q) => q.eq("agentEmail", normalized))
      .first();
  },
});

// Update agent thinking state
export const updateThinking = internalMutation({
  args: {
    agentId: v.id("agents"),
    enabled: v.optional(v.boolean()),
    isPaused: v.optional(v.boolean()),
    currentGoal: v.optional(v.string()),
    lastThought: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { agentId, enabled, isPaused, currentGoal, lastThought }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) return null;

    const thinking = agent.thinking ?? {
      enabled: false,
      isPaused: false,
    };

    await ctx.db.patch(agentId, {
      thinking: {
        ...thinking,
        ...(enabled !== undefined && { enabled }),
        ...(isPaused !== undefined && { isPaused }),
        ...(currentGoal !== undefined && { currentGoal }),
        ...(lastThought !== undefined && { lastThought, lastThoughtAt: Date.now() }),
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Update agent scheduling state
export const updateScheduling = internalMutation({
  args: {
    agentId: v.id("agents"),
    lastRun: v.optional(v.number()),
    nextRun: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { agentId, lastRun, nextRun }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || !agent.scheduling) return null;

    await ctx.db.patch(agentId, {
      scheduling: {
        ...agent.scheduling,
        ...(lastRun !== undefined && { lastRun }),
        ...(nextRun !== undefined && { nextRun }),
      },
      schedulingActive: agent.scheduling.isActive,
      schedulingMode: agent.scheduling.mode,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Get agents with active scheduling (for cron runner)
export const getScheduledAgents = internalQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const autoAgents = await ctx.db
      .query("agents")
      .withIndex("by_schedulingActive_mode", (q) =>
        q.eq("schedulingActive", true).eq("schedulingMode", "auto")
      )
      .collect();
    const cronAgents = await ctx.db
      .query("agents")
      .withIndex("by_schedulingActive_mode", (q) =>
        q.eq("schedulingActive", true).eq("schedulingMode", "cron")
      )
      .collect();

    const indexedAgents = [...autoAgents, ...cronAgents];
    if (indexedAgents.length > 0) {
      return indexedAgents;
    }

    // Backwards-compatible fallback for older rows before denormalized fields exist.
    const legacyAgents = await ctx.db.query("agents").collect();
    return legacyAgents.filter(
      (agent) =>
        agent.scheduling?.isActive &&
        (agent.scheduling.mode === "auto" || agent.scheduling.mode === "cron")
    );
  },
});
