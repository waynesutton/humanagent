import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { authedMutation, authedQuery, optionalAuthQuery } from "../lib/functions";
import { internal } from "../_generated/api";

// ============================================================
// Public queries
// ============================================================

// Get current user's skills (all skills, or filtered by agent)
export const list = authedQuery({
  args: {
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, { agentId }) => {
    if (agentId) {
      // Get skills for specific agent
      return await ctx.db
        .query("skills")
        .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
        .collect();
    }
    // Get all user's skills
    return await ctx.db
      .query("skills")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();
  },
});

// Legacy: get single skill (for backwards compatibility)
export const getMySkill = optionalAuthQuery({
  args: {},
  handler: async (ctx) => {
    const { userId } = ctx;
    if (!userId) return null;
    // Returns first skill (for backwards compat with single-skill UI)
    return await ctx.db
      .query("skills")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

export const getPublicSkill = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!user) return null;

    // Get all published skills for this user (users can have multiple skills)
    const skills = await ctx.db
      .query("skills")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Find first published skill
    const skill = skills.find((s) => s.isPublished);
    if (!skill) return null;

    // Return only public-facing fields
    return {
      identity: skill.identity,
      capabilities: skill.capabilities,
      knowledgeDomains: skill.knowledgeDomains,
      publicPermissions: skill.permissions.public,
      communicationPrefs: skill.communicationPrefs,
      toolDeclarations: skill.toolDeclarations,
      version: skill.version,
    };
  },
});

// Public: get a published skill for a specific public agent slug.
export const getPublicSkillByAgent = query({
  args: { username: v.string(), slug: v.string() },
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

    const agentSkills = await ctx.db
      .query("skills")
      .withIndex("by_agentId", (q) => q.eq("agentId", agent._id))
      .take(100);
    const publishedAgentSkill = agentSkills.find((s) => s.isPublished);

    // Backwards-compatible fallback: use user-level published skill.
    const fallbackPublishedSkill = publishedAgentSkill
      ? null
      : (await ctx.db
          .query("skills")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .take(100))
          .find((s) => s.isPublished && !s.agentId);

    const skill = publishedAgentSkill ?? fallbackPublishedSkill;
    if (!skill) return null;

    return {
      identity: skill.identity,
      capabilities: skill.capabilities,
      knowledgeDomains: skill.knowledgeDomains,
      publicPermissions: skill.permissions.public,
      communicationPrefs: skill.communicationPrefs,
      toolDeclarations: skill.toolDeclarations,
      version: skill.version,
    };
  },
});

// ============================================================
// Mutations
// ============================================================

// Create a new skill (for multi-skill support)
export const create = authedMutation({
  args: {
    agentId: v.optional(v.id("agents")),
    identity: v.object({
      name: v.string(),
      bio: v.string(),
      avatar: v.optional(v.string()),
    }),
    capabilities: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.string(),
          toolId: v.optional(v.string()),
        })
      )
    ),
    knowledgeDomains: v.optional(v.array(v.string())),
    communicationPrefs: v.optional(
      v.object({
        tone: v.string(),
        timezone: v.string(),
        availability: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // If agentId provided, verify ownership
    if (args.agentId) {
      const agent = await ctx.db.get(args.agentId);
      if (!agent || agent.userId !== ctx.userId) {
        throw new Error("Agent not found");
      }
    }

    const skillId = await ctx.db.insert("skills", {
      userId: ctx.userId,
      agentId: args.agentId,
      version: 1,
      identity: args.identity,
      capabilities: args.capabilities ?? [],
      knowledgeDomains: args.knowledgeDomains ?? [],
      permissions: {
        public: ["send_message", "get_capabilities"],
        authenticated: ["check_availability", "request_meeting"],
        trusted: ["*"],
      },
      communicationPrefs: args.communicationPrefs ?? {
        tone: "friendly and professional",
        timezone: "America/Los_Angeles",
        availability: "available",
      },
      toolDeclarations: [],
      isPublished: false,
      isActive: true,
      updatedAt: Date.now(),
    });

    // Schedule llms.txt regeneration
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });

    return skillId;
  },
});

export const update = authedMutation({
  args: {
    skillId: v.optional(v.id("skills")), // Optional for backwards compat
    identity: v.optional(
      v.object({
        name: v.string(),
        bio: v.string(),
        avatar: v.optional(v.string()),
      })
    ),
    capabilities: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.string(),
          toolId: v.optional(v.string()),
        })
      )
    ),
    knowledgeDomains: v.optional(v.array(v.string())),
    communicationPrefs: v.optional(
      v.object({
        tone: v.string(),
        timezone: v.string(),
        availability: v.string(),
      })
    ),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let skill;

    if (args.skillId) {
      // Update specific skill
      skill = await ctx.db.get(args.skillId);
      if (!skill || skill.userId !== ctx.userId) {
        throw new Error("Skill not found");
      }
    } else {
      // Legacy: update first skill
      skill = await ctx.db
        .query("skills")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .first();
      if (!skill) throw new Error("Skill file not found. Complete onboarding first.");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.identity) patch.identity = args.identity;
    if (args.capabilities) patch.capabilities = args.capabilities;
    if (args.knowledgeDomains) patch.knowledgeDomains = args.knowledgeDomains;
    if (args.communicationPrefs) patch.communicationPrefs = args.communicationPrefs;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    // Bump version on each update
    patch.version = skill.version + 1;

    await ctx.db.patch(skill._id, patch);

    // Schedule llms.txt regeneration
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });
  },
});

// Delete a skill
export const remove = authedMutation({
  args: { skillId: v.id("skills") },
  handler: async (ctx, { skillId }) => {
    const skill = await ctx.db.get(skillId);
    if (!skill || skill.userId !== ctx.userId) {
      throw new Error("Skill not found");
    }
    await ctx.db.delete(skillId);

    // Schedule llms.txt regeneration
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });
  },
});

// Assign skill to an agent
export const assignToAgent = authedMutation({
  args: {
    skillId: v.id("skills"),
    agentId: v.union(v.id("agents"), v.null()),
  },
  handler: async (ctx, { skillId, agentId }) => {
    const skill = await ctx.db.get(skillId);
    if (!skill || skill.userId !== ctx.userId) {
      throw new Error("Skill not found");
    }

    // If assigning to an agent, verify ownership
    if (agentId) {
      const agent = await ctx.db.get(agentId);
      if (!agent || agent.userId !== ctx.userId) {
        throw new Error("Agent not found");
      }
    }

    await ctx.db.patch(skillId, { agentId: agentId ?? undefined, updatedAt: Date.now() });
  },
});

export const publish = authedMutation({
  args: { skillId: v.optional(v.id("skills")) },
  handler: async (ctx, { skillId }) => {
    let skill;
    if (skillId) {
      skill = await ctx.db.get(skillId);
      if (!skill || skill.userId !== ctx.userId) {
        throw new Error("Skill not found");
      }
    } else {
      // Legacy fallback
      skill = await ctx.db
        .query("skills")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .first();
      if (!skill) throw new Error("Skill file not found");
    }
    await ctx.db.patch(skill._id, { isPublished: true, updatedAt: Date.now() });

    // Schedule llms.txt regeneration when publishing
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });
  },
});

export const unpublish = authedMutation({
  args: { skillId: v.optional(v.id("skills")) },
  handler: async (ctx, { skillId }) => {
    let skill;
    if (skillId) {
      skill = await ctx.db.get(skillId);
      if (!skill || skill.userId !== ctx.userId) {
        throw new Error("Skill not found");
      }
    } else {
      // Legacy fallback
      skill = await ctx.db
        .query("skills")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .first();
      if (!skill) throw new Error("Skill file not found");
    }
    await ctx.db.patch(skill._id, { isPublished: false, updatedAt: Date.now() });

    // Schedule llms.txt regeneration when unpublishing
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });
  },
});

// ============================================================
// Internal queries
// ============================================================

// Get first skill for a user (for backwards compatibility)
export const getByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    // Users can have multiple skills, return first one
    return await ctx.db
      .query("skills")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});
