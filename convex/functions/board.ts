import { query } from "../_generated/server";
import { v } from "convex/values";
import { authedQuery, authedMutation } from "../lib/functions";
import { getManyFrom } from "convex-helpers/server/relationships";
import { internal } from "../_generated/api";

// ============================================================
// Columns
// ============================================================

export const getColumns = authedQuery({
  args: {},
  handler: async (ctx) => {
    return await getManyFrom(ctx.db, "boardColumns", "by_userId", ctx.userId, "userId");
  },
});

export const getPublicColumns = query({
  args: { username: v.string() },
  handler: async (_ctx, _args) => {
    // Task board is now private to the authenticated user.
    return [];
  },
});

// ============================================================
// Tasks
// ============================================================

// Get active (non-archived) tasks
export const getTasks = authedQuery({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(200);
    // Filter out archived tasks
    return tasks.filter((t) => !t.isArchived);
  },
});

// Get archived tasks
export const getArchivedTasks = authedQuery({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(200);
    // Return only archived tasks
    return tasks.filter((t) => t.isArchived === true);
  },
});

export const getPublicTasks = query({
  args: { username: v.string() },
  handler: async (_ctx, _args) => {
    // Task board is now private to the authenticated user.
    return [];
  },
});

export const createTask = authedMutation({
  args: {
    description: v.string(),
    boardColumnId: v.optional(v.id("boardColumns")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    // If agentId provided, verify ownership
    if (args.agentId) {
      const agent = await ctx.db.get(args.agentId);
      if (!agent || agent.userId !== ctx.userId) {
        throw new Error("Agent not found");
      }
    }

    return await ctx.db.insert("tasks", {
      userId: ctx.userId,
      agentId: args.agentId,
      requestedBy: "user",
      description: args.description,
      status: "pending",
      steps: [],
      boardColumnId: args.boardColumnId,
      isPublic: false,
      createdAt: Date.now(),
    });
  },
});

export const moveTask = authedMutation({
  args: {
    taskId: v.id("tasks"),
    boardColumnId: v.id("boardColumns"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("failed")
      )
    ),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== ctx.userId) throw new Error("Task not found");

    const patch: Record<string, unknown> = {
      boardColumnId: args.boardColumnId,
    };
    if (args.status) {
      patch.status = args.status;
      if (args.status === "completed") {
        patch.completedAt = Date.now();
      }
    }

    await ctx.db.patch(args.taskId, patch);

    // Public agent task completions are visible in the activity feed.
    if (args.status === "completed" && task.agentId) {
      const agent = await ctx.db.get(task.agentId);
      if (agent?.isPublic) {
        await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
          userId: ctx.userId,
          type: "task_completed",
          title: `${agent.name} completed a task`,
          content: task.description.slice(0, 140),
          metadata: {
            taskId: task._id,
            agentId: agent._id,
          },
          isPublic: true,
        });
      }
    }
  },
});

// Update task (description, agent assignment, public status)
export const updateTask = authedMutation({
  args: {
    taskId: v.id("tasks"),
    description: v.optional(v.string()),
    agentId: v.optional(v.union(v.id("agents"), v.null())),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== ctx.userId) throw new Error("Task not found");

    // If assigning to an agent, verify ownership
    if (args.agentId) {
      const agent = await ctx.db.get(args.agentId);
      if (!agent || agent.userId !== ctx.userId) {
        throw new Error("Agent not found");
      }
    }

    const patch: Record<string, unknown> = {};
    if (args.description !== undefined) patch.description = args.description;
    if (args.agentId !== undefined) patch.agentId = args.agentId;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.taskId, patch);
    }
  },
});

// Delete a task
export const deleteTask = authedMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== ctx.userId) throw new Error("Task not found");
    await ctx.db.delete(taskId);
  },
});

// Archive a task
export const archiveTask = authedMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== ctx.userId) throw new Error("Task not found");
    await ctx.db.patch(taskId, {
      isArchived: true,
      archivedAt: Date.now(),
    });
  },
});

// Unarchive a task (restore from archive)
export const unarchiveTask = authedMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== ctx.userId) throw new Error("Task not found");
    await ctx.db.patch(taskId, {
      isArchived: false,
      archivedAt: undefined,
    });
  },
});

// Bulk archive completed tasks
export const archiveCompletedTasks = authedMutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    const completedTasks = tasks.filter(
      (t) => t.status === "completed" && !t.isArchived
    );

    const now = Date.now();
    await Promise.all(
      completedTasks.map((t) =>
        ctx.db.patch(t._id, { isArchived: true, archivedAt: now })
      )
    );

    return completedTasks.length;
  },
});

// Delete all archived tasks
export const deleteArchivedTasks = authedMutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    const archivedTasks = tasks.filter((t) => t.isArchived === true);

    await Promise.all(archivedTasks.map((t) => ctx.db.delete(t._id)));

    return archivedTasks.length;
  },
});
