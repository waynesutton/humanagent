import { query } from "../_generated/server";
import { v } from "convex/values";
import { authedQuery, authedMutation } from "../lib/functions";
import { getManyFrom } from "convex-helpers/server/relationships";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const DEFAULT_BOARD_COLUMNS = ["Inbox", "Todo", "In Progress", "Done"] as const;

async function getOrCreateInboxColumnId(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">
): Promise<Id<"boardColumns">> {
  const existingColumns = await ctx.db
    .query("boardColumns")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(20);
  const inboxColumn = existingColumns.find((column) => column.name === "Inbox");
  if (inboxColumn) {
    return inboxColumn._id;
  }

  const insertedId = await ctx.db.insert("boardColumns", {
    userId,
    name: "Inbox",
    order: 0,
    isPublic: false,
    createdAt: Date.now(),
  });
  const createdColumn = await ctx.db.get(insertedId);
  if (!createdColumn) {
    throw new Error("Could not create Inbox column");
  }
  return createdColumn._id;
}

async function attachRequesterContext(
  ctx: Pick<QueryCtx, "db">,
  tasks: Array<any>
) {
  return await Promise.all(
    tasks.map(async (task) => {
      if (!task.requesterUserId) {
        return task;
      }
      const requesterUser = (await ctx.db.get(task.requesterUserId as Id<"users">)) as
        | { username?: string; name?: string }
        | null;
      const requesterAgent = task.requesterAgentId
        ? ((await ctx.db.get(task.requesterAgentId as Id<"agents">)) as { name?: string } | null)
        : null;

      return {
        ...task,
        requester: {
          userId: task.requesterUserId,
          username: requesterUser?.username,
          name: requesterUser?.name,
          agentName: requesterAgent?.name,
        },
      };
    })
  );
}

// ============================================================
// Columns
// ============================================================

export const getColumns = authedQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return await getManyFrom(ctx.db, "boardColumns", "by_userId", ctx.userId, "userId");
  },
});

export const getPublicColumns = query({
  args: { username: v.string() },
  returns: v.array(v.any()),
  handler: async () => {
    // Task board is now private to the authenticated user.
    return [];
  },
});

// Ensure a user's board has the default columns.
// This also backfills "Todo" for existing users that only had 3 columns.
export const ensureDefaultColumns = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("boardColumns")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(20);

    const byName = new Map(existing.map((column) => [column.name, column]));

    const createOps: Array<Promise<unknown>> = [];
    for (let i = 0; i < DEFAULT_BOARD_COLUMNS.length; i += 1) {
      const name = DEFAULT_BOARD_COLUMNS[i]!;
      if (!byName.has(name)) {
        createOps.push(
          ctx.db.insert("boardColumns", {
            userId: ctx.userId,
            name,
            order: i,
            isPublic: false,
            createdAt: Date.now(),
          })
        );
      }
    }
    if (createOps.length > 0) {
      await Promise.all(createOps);
    }

    // Normalize order for known default columns if they already exist.
    const reorderOps: Array<Promise<unknown>> = [];
    for (let i = 0; i < DEFAULT_BOARD_COLUMNS.length; i += 1) {
      const name = DEFAULT_BOARD_COLUMNS[i]!;
      const column = byName.get(name);
      if (column && column.order !== i) {
        reorderOps.push(ctx.db.patch(column._id, { order: i }));
      }
    }
    if (reorderOps.length > 0) {
      await Promise.all(reorderOps);
    }

    return null;
  },
});

// ============================================================
// Tasks
// ============================================================

// Get active (non-archived) tasks
export const getTasks = authedQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(200);
    // Filter out archived tasks
    const activeTasks = tasks.filter((t) => !t.isArchived);
    return await attachRequesterContext(ctx, activeTasks);
  },
});

// Get archived tasks
export const getArchivedTasks = authedQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(200);
    // Return only archived tasks
    const archivedTasks = tasks.filter((t) => t.isArchived === true);
    return await attachRequesterContext(ctx, archivedTasks);
  },
});

export const getPublicTasks = query({
  args: { username: v.string() },
  returns: v.array(v.any()),
  handler: async () => {
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
  returns: v.id("tasks"),
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

export const createTaskFromChat = authedMutation({
  args: {
    conversationId: v.id("conversations"),
    description: v.string(),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    const description = args.description.trim();
    if (!description) {
      throw new Error("Task description is required");
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== ctx.userId) {
      throw new Error("Conversation not found");
    }
    if (conversation.channel !== "dashboard") {
      throw new Error("Only dashboard chats can create board tasks");
    }

    const inboxColumnId = await getOrCreateInboxColumnId(ctx, ctx.userId);

    return await ctx.db.insert("tasks", {
      userId: ctx.userId,
      agentId: conversation.agentId,
      requestedBy: "chat",
      description,
      status: "pending",
      steps: [],
      boardColumnId: inboxColumnId,
      isPublic: false,
      createdAt: Date.now(),
    });
  },
});

export const requestPublicAgentTask = authedMutation({
  args: {
    targetUsername: v.string(),
    targetAgentId: v.id("agents"),
    requesterAgentId: v.optional(v.id("agents")),
    description: v.string(),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    const targetUsername = args.targetUsername.trim().toLowerCase();
    if (!targetUsername) {
      throw new Error("Target username is required");
    }

    const description = args.description.trim();
    if (!description) {
      throw new Error("Task description is required");
    }
    if (description.length > 800) {
      throw new Error("Task description must be 800 characters or less");
    }

    const targetUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", targetUsername))
      .unique();
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    const targetAgent = await ctx.db.get(args.targetAgentId);
    if (!targetAgent || targetAgent.userId !== targetUser._id || !targetAgent.isPublic) {
      throw new Error("Public agent not found");
    }

    const requesterAgents = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(100);
    if (requesterAgents.length === 0) {
      throw new Error("Create at least one agent before requesting tasks");
    }

    const requesterAgent =
      (args.requesterAgentId
        ? requesterAgents.find((agent) => agent._id === args.requesterAgentId)
        : undefined) ?? requesterAgents.find((agent) => agent.isDefault) ?? requesterAgents[0];
    if (!requesterAgent) {
      throw new Error("Requester agent not found");
    }

    const inboxColumnId = await getOrCreateInboxColumnId(ctx, targetUser._id);
    const taskId = await ctx.db.insert("tasks", {
      userId: targetUser._id,
      agentId: targetAgent._id,
      requesterUserId: ctx.userId,
      requesterAgentId: requesterAgent._id,
      requestedBy: "public_profile",
      description,
      status: "pending",
      steps: [],
      boardColumnId: inboxColumnId,
      isPublic: false,
      createdAt: Date.now(),
    });

    await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
      userId: targetUser._id,
      type: "status_update",
      title: `${requesterAgent.name} requested a task for ${targetAgent.name}`,
      content: description.slice(0, 140),
      metadata: {
        taskId,
        targetAgentId: targetAgent._id,
        requesterUserId: ctx.userId,
        requesterAgentId: requesterAgent._id,
      },
      isPublic: false,
    });

    await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
      userId: ctx.userId,
      type: "status_update",
      title: `Task request sent to ${targetAgent.name}`,
      content: description.slice(0, 140),
      metadata: {
        taskId,
        targetUserId: targetUser._id,
        targetAgentId: targetAgent._id,
      },
      isPublic: false,
    });

    return taskId;
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
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== ctx.userId) throw new Error("Task not found");
    const previousStatus = task.status;

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

    const statusChanged = !!args.status && args.status !== previousStatus;
    if (statusChanged && (args.status === "completed" || args.status === "failed")) {
      const assignedAgent = task.agentId ? await ctx.db.get(task.agentId) : null;
      const requesterUserId = task.requesterUserId;
      if (requesterUserId) {
        const outcomeLabel = args.status === "completed" ? "completed" : "rejected";
        const actorName = assignedAgent?.name ?? "An agent";

        await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
          userId: requesterUserId,
          type: "status_update",
          title: `${actorName} ${outcomeLabel} your task request`,
          content: task.description.slice(0, 140),
          metadata: {
            taskId: task._id,
            agentId: task.agentId,
            status: args.status,
          },
          isPublic: false,
        });

        await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
          userId: ctx.userId,
          type: "status_update",
          title:
            args.status === "completed"
              ? `Marked task request as completed`
              : `Marked task request as rejected`,
          content: task.description.slice(0, 140),
          metadata: {
            taskId: task._id,
            requesterUserId,
            agentId: task.agentId,
            status: args.status,
          },
          isPublic: false,
        });
      }
    }

    // Public agent task completions are visible in the activity feed.
    if (statusChanged && args.status === "completed" && task.agentId) {
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
    return null;
  },
});

// Update task (description, agent assignment, public status)
export const updateTask = authedMutation({
  args: {
    taskId: v.id("tasks"),
    description: v.optional(v.string()),
    agentId: v.optional(v.union(v.id("agents"), v.null())),
  },
  returns: v.null(),
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
    return null;
  },
});

// Delete a task
export const deleteTask = authedMutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== ctx.userId) throw new Error("Task not found");
    await ctx.db.delete(taskId);
    return null;
  },
});

// Archive a task
export const archiveTask = authedMutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== ctx.userId) throw new Error("Task not found");
    await ctx.db.patch(taskId, {
      isArchived: true,
      archivedAt: Date.now(),
    });
    return null;
  },
});

// Unarchive a task (restore from archive)
export const unarchiveTask = authedMutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== ctx.userId) throw new Error("Task not found");
    await ctx.db.patch(taskId, {
      isArchived: false,
      archivedAt: undefined,
    });
    return null;
  },
});

// Bulk archive completed tasks
export const archiveCompletedTasks = authedMutation({
  args: {},
  returns: v.number(),
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
  returns: v.number(),
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

// ============================================================
// Task comments and attachments
// ============================================================

export const getTaskComments = authedQuery({
  args: { taskId: v.id("tasks") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== ctx.userId) {
      return [];
    }

    return await ctx.db
      .query("taskComments")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(100);
  },
});

export const addTaskComment = authedMutation({
  args: {
    taskId: v.id("tasks"),
    content: v.string(),
  },
  returns: v.id("taskComments"),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== ctx.userId) {
      throw new Error("Task not found");
    }
    if (!args.content.trim()) {
      throw new Error("Comment is required");
    }

    return await ctx.db.insert("taskComments", {
      taskId: args.taskId,
      userId: ctx.userId,
      content: args.content.trim(),
      createdAt: Date.now(),
    });
  },
});

export const generateTaskAttachmentUploadUrl = authedMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const addTaskAttachment = authedMutation({
  args: {
    taskId: v.id("tasks"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  returns: v.id("taskAttachments"),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== ctx.userId) {
      throw new Error("Task not found");
    }

    return await ctx.db.insert("taskAttachments", {
      taskId: args.taskId,
      userId: ctx.userId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      createdAt: Date.now(),
    });
  },
});

export const getTaskAttachments = authedQuery({
  args: { taskId: v.id("tasks") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== ctx.userId) {
      return [];
    }

    const rows = await ctx.db
      .query("taskAttachments")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(100);

    const withUrls = await Promise.all(
      rows.map(async (row) => {
        const url = await ctx.storage.getUrl(row.storageId);
        return {
          ...row,
          url: url ?? null,
        };
      })
    );

    return withUrls;
  },
});
