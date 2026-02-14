/**
 * Agent Thinking Functions
 *
 * Manages agent reasoning, planning, and decision-making capabilities.
 * These functions allow agents to reflect on tasks, make decisions, and update their goals.
 */
import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "../_generated/server";

// ============================================================
// Public Queries
// ============================================================

/**
 * Get recent thoughts for a specific agent
 */
export const getAgentThoughts = query({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
    type: v.optional(
      v.union(
        v.literal("observation"),
        v.literal("reasoning"),
        v.literal("decision"),
        v.literal("reflection"),
        v.literal("goal_update")
      )
    ),
  },
  returns: v.array(
    v.object({
      _id: v.id("agentThoughts"),
      _creationTime: v.number(),
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
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Verify agent ownership
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) =>
        q.eq("authUserId", identity.subject)
      )
      .unique();
    if (!user || agent.userId !== user._id) throw new Error("Unauthorized");

    const query = ctx.db
      .query("agentThoughts")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .order("desc");

    const thoughts = await query.take(args.limit ?? 20);

    // Filter by type if specified
    if (args.type) {
      return thoughts.filter((t) => t.type === args.type);
    }

    return thoughts;
  },
});

/**
 * Get thinking status for an agent
 */
export const getThinkingStatus = query({
  args: {
    agentId: v.id("agents"),
  },
  returns: v.union(
    v.object({
      enabled: v.boolean(),
      isPaused: v.boolean(),
      currentGoal: v.optional(v.string()),
      lastThought: v.optional(v.string()),
      lastThoughtAt: v.optional(v.number()),
      recentDecisions: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const agent = await ctx.db.get(args.agentId);
    if (!agent) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) =>
        q.eq("authUserId", identity.subject)
      )
      .unique();
    if (!user || agent.userId !== user._id) return null;

    // Count recent decisions (last 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentThoughts = await ctx.db
      .query("agentThoughts")
      .withIndex("by_agentId_type", (q) =>
        q.eq("agentId", args.agentId).eq("type", "decision")
      )
      .take(100);
    const recentDecisions = recentThoughts.filter(
      (t) => t.createdAt > oneDayAgo
    ).length;

    return {
      enabled: agent.thinking?.enabled ?? false,
      isPaused: agent.thinking?.isPaused ?? false,
      currentGoal: agent.thinking?.currentGoal,
      lastThought: agent.thinking?.lastThought,
      lastThoughtAt: agent.thinking?.lastThoughtAt,
      recentDecisions,
    };
  },
});

// ============================================================
// Public Mutations
// ============================================================

/**
 * Create a new thought (for user-facing operations)
 */
export const addThought = mutation({
  args: {
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) =>
        q.eq("authUserId", identity.subject)
      )
      .unique();
    if (!user || agent.userId !== user._id) throw new Error("Unauthorized");

    const now = Date.now();

    // Insert the thought
    const thoughtId = await ctx.db.insert("agentThoughts", {
      userId: user._id,
      agentId: args.agentId,
      type: args.type,
      content: args.content,
      context: args.context,
      relatedTaskId: args.relatedTaskId,
      createdAt: now,
    });

    // Update agent's last thought
    await ctx.db.patch(args.agentId, {
      thinking: {
        ...(agent.thinking ?? { enabled: true, isPaused: false }),
        lastThought: args.content.slice(0, 200),
        lastThoughtAt: now,
        ...(args.type === "goal_update" && { currentGoal: args.content }),
      },
      updatedAt: now,
    });

    return thoughtId;
  },
});

/**
 * Toggle thinking pause state
 */
export const toggleThinkingPause = mutation({
  args: {
    agentId: v.id("agents"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) =>
        q.eq("authUserId", identity.subject)
      )
      .unique();
    if (!user || agent.userId !== user._id) throw new Error("Unauthorized");

    const newPaused = !(agent.thinking?.isPaused ?? false);

    await ctx.db.patch(args.agentId, {
      thinking: {
        ...(agent.thinking ?? { enabled: true, isPaused: false }),
        isPaused: newPaused,
      },
      updatedAt: Date.now(),
    });

    return newPaused;
  },
});

/**
 * Update current goal
 */
export const updateGoal = mutation({
  args: {
    agentId: v.id("agents"),
    goal: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) =>
        q.eq("authUserId", identity.subject)
      )
      .unique();
    if (!user || agent.userId !== user._id) throw new Error("Unauthorized");

    const now = Date.now();

    // Update agent's current goal
    await ctx.db.patch(args.agentId, {
      thinking: {
        ...(agent.thinking ?? { enabled: true, isPaused: false }),
        currentGoal: args.goal,
      },
      updatedAt: now,
    });

    // Record the goal update as a thought
    await ctx.db.insert("agentThoughts", {
      userId: user._id,
      agentId: args.agentId,
      type: "goal_update",
      content: args.goal,
      context: "Manual goal update by user",
      createdAt: now,
    });

    return null;
  },
});

// ============================================================
// Internal Functions (for agent/system use)
// ============================================================

/**
 * Internal: Create a thought (for system/agent use)
 */
export const createThought = internalMutation({
  args: {
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
    metadata: v.optional(v.any()),
  },
  returns: v.id("agentThoughts"),
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    const now = Date.now();

    const thoughtId = await ctx.db.insert("agentThoughts", {
      userId: agent.userId,
      agentId: args.agentId,
      type: args.type,
      content: args.content,
      context: args.context,
      relatedTaskId: args.relatedTaskId,
      metadata: args.metadata,
      createdAt: now,
    });

    // Update agent's last thought
    await ctx.db.patch(args.agentId, {
      thinking: {
        ...(agent.thinking ?? { enabled: true, isPaused: false }),
        lastThought: args.content.slice(0, 200),
        lastThoughtAt: now,
        ...(args.type === "goal_update" && { currentGoal: args.content }),
      },
      updatedAt: now,
    });

    return thoughtId;
  },
});

/**
 * Internal: Get agent context for reasoning
 */
export const getAgentContext = internalQuery({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) return null;

    // Get recent thoughts
    const recentThoughts = await ctx.db
      .query("agentThoughts")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(10);

    // Get pending tasks
    const pendingTasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", agent.userId).eq("status", "pending")
      )
      .take(10);

    // Get in-progress tasks assigned to this agent
    const inProgressTasks = await ctx.db
      .query("tasks")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .take(10);

    // Get recent memory
    const memories = await ctx.db
      .query("agentMemory")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(5);

    return {
      agent,
      currentGoal: agent.thinking?.currentGoal,
      recentThoughts,
      pendingTasks: pendingTasks.filter((t) => !t.agentId || t.agentId === args.agentId),
      inProgressTasks: inProgressTasks.filter((t) => t.status === "in_progress"),
      memories,
    };
  },
});

/**
 * Internal: Clean up old thoughts (keep last 100 per agent)
 */
export const cleanupOldThoughts = internalMutation({
  args: {
    agentId: v.id("agents"),
    keepCount: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const keepCount = args.keepCount ?? 100;

    const thoughts = await ctx.db
      .query("agentThoughts")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(keepCount + 100);

    const toDelete = thoughts.slice(keepCount);
    
    await Promise.all(toDelete.map((t) => ctx.db.delete(t._id)));

    return toDelete.length;
  },
});
