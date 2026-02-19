import { query, internalQuery, internalMutation, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { authedQuery, authedMutation } from "../lib/functions";
import { getManyFrom } from "convex-helpers/server/relationships";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const DEFAULT_BOARD_COLUMNS = ["Inbox", "Todo", "In Progress", "Done"] as const;

type TaskWithRequesterRefs = {
  requesterUserId?: Id<"users">;
  requesterAgentId?: Id<"agents">;
  description: string;
  outcomeSummary?: string;
  outcomeLinks?: Array<string>;
};

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

async function attachRequesterContext<T extends TaskWithRequesterRefs>(
  ctx: Pick<QueryCtx, "db">,
  tasks: Array<T>
): Promise<
  Array<
    T & {
      requester?: {
        userId?: Id<"users">;
        username?: string;
        name?: string;
        agentName?: string;
      };
    }
  >
> {
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

function buildOutcomeEmailText(task: {
  description: string;
  outcomeSummary?: string;
  outcomeLinks?: Array<string>;
}): string {
  const lines: Array<string> = [
    "Task completed",
    "",
    `Task: ${task.description}`,
  ];

  if (task.outcomeSummary?.trim()) {
    lines.push(
      "",
      "--- Report ---",
      "",
      task.outcomeSummary.trim(),
    );
  }

  const links = (task.outcomeLinks ?? []).map((link) => link.trim()).filter(Boolean);
  if (links.length > 0) {
    lines.push("", "Result links:");
    for (const link of links) {
      lines.push(`  ${link}`);
    }
  }

  lines.push("", "---", "View the full report on your task board.");

  return lines.join("\n");
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
// Projects
// ============================================================

export const getProjects = authedQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("boardProjects")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(200);
    return projects;
  },
});

export const createProject = authedMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  returns: v.id("boardProjects"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("Project name is required");
    }
    if (name.length > 80) {
      throw new Error("Project name must be 80 characters or less");
    }

    const existing = await ctx.db
      .query("boardProjects")
      .withIndex("by_userId_name", (q) => q.eq("userId", ctx.userId).eq("name", name))
      .unique();
    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("boardProjects", {
      userId: ctx.userId,
      name,
      description: args.description?.trim() || undefined,
      color: args.color,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateProject = authedMutation({
  args: {
    projectId: v.id("boardProjects"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    color: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== ctx.userId) {
      throw new Error("Project not found");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new Error("Project name is required");
      }
      if (name.length > 80) {
        throw new Error("Project name must be 80 characters or less");
      }
      patch.name = name;
    }
    if (args.description !== undefined) {
      patch.description = args.description?.trim() || undefined;
    }
    if (args.color !== undefined) {
      patch.color = args.color || undefined;
    }

    await ctx.db.patch(args.projectId, patch);
    return null;
  },
});

export const deleteProject = authedMutation({
  args: { projectId: v.id("boardProjects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== ctx.userId) {
      throw new Error("Project not found");
    }

    const linkedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId_projectId", (q) =>
        q.eq("userId", ctx.userId).eq("projectId", args.projectId)
      )
      .take(500);
    await Promise.all(linkedTasks.map((task) => ctx.db.patch(task._id, { projectId: undefined })));
    await ctx.db.delete(args.projectId);
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
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();
    if (!username) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!user) {
      return [];
    }

    const privacy = (user as {
      privacySettings?: { profileVisible?: boolean; showTasks?: boolean };
    }).privacySettings;
    if (privacy?.profileVisible === false || privacy?.showTasks === false) {
      return [];
    }

    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);

    return rows.filter((task) => task.isPublic && !task.isArchived).slice(0, 20);
  },
});

export const createTask = authedMutation({
  args: {
    description: v.string(),
    boardColumnId: v.optional(v.id("boardColumns")),
    agentId: v.optional(v.id("agents")),
    projectId: v.optional(v.id("boardProjects")),
    isPublic: v.optional(v.boolean()),
    targetCompletionAt: v.optional(v.number()),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    let agentName: string | undefined;

    // If agentId provided, verify ownership
    if (args.agentId) {
      const agent = await ctx.db.get(args.agentId);
      if (!agent || agent.userId !== ctx.userId) {
        throw new Error("Agent not found");
      }
      agentName = agent.name;
    }

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.userId !== ctx.userId) {
        throw new Error("Project not found");
      }
    }

    const trimmedDescription = args.description.trim();
    if (!trimmedDescription) {
      throw new Error("Task description is required");
    }

    const isPublic = args.isPublic ?? false;
    const targetCompletionAt =
      args.targetCompletionAt !== undefined ? Math.trunc(args.targetCompletionAt) : undefined;
    const taskId = await ctx.db.insert("tasks", {
      userId: ctx.userId,
      agentId: args.agentId,
      projectId: args.projectId,
      requestedBy: "user",
      description: trimmedDescription,
      status: "pending",
      steps: [],
      boardColumnId: args.boardColumnId,
      isPublic,
      createdAt: Date.now(),
      targetCompletionAt,
    });

    await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
      userId: ctx.userId,
      type: "status_update",
      title: agentName ? `${agentName} received a new task` : "New task created",
      content: trimmedDescription.slice(0, 140),
      metadata: {
        taskId,
        agentId: args.agentId,
        projectId: args.projectId,
      },
      isPublic,
    });

    return taskId;
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

    const taskId = await ctx.db.insert("tasks", {
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

    const assignedAgent = conversation.agentId ? await ctx.db.get(conversation.agentId) : null;
    await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
      userId: ctx.userId,
      type: "status_update",
      title: assignedAgent
        ? `${assignedAgent.name} received a new chat task`
        : "New chat task created",
      content: description.slice(0, 140),
      metadata: {
        taskId,
        agentId: conversation.agentId,
        source: "dashboard_chat",
      },
      isPublic: false,
    });

    return taskId;
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
    const assignedAgent = task.agentId ? await ctx.db.get(task.agentId) : null;
    const actorName = assignedAgent?.name ?? "Task";
    if (statusChanged && (args.status === "completed" || args.status === "failed")) {
      const requesterUserId = task.requesterUserId;
      if (requesterUserId) {
        const outcomeLabel = args.status === "completed" ? "completed" : "rejected";
        const requesterActorName = assignedAgent?.name ?? "An agent";

        await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
          userId: requesterUserId,
          type: "status_update",
          title: `${requesterActorName} ${outcomeLabel} your task request`,
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

      if (!requesterUserId) {
        await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
          userId: ctx.userId,
          type: "status_update",
          title:
            args.status === "completed"
              ? `${actorName} marked task as done`
              : `${actorName} marked task as failed`,
          content: task.description.slice(0, 140),
          metadata: {
            taskId: task._id,
            agentId: task.agentId,
            status: args.status,
          },
          isPublic: false,
        });
      }
    }

    // Public task completions are visible in the activity feed.
    if (statusChanged && args.status === "completed" && task.agentId) {
      const agent = await ctx.db.get(task.agentId);
      if (agent?.isPublic) {
        await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
          userId: ctx.userId,
          type: "task_completed",
          title: `Done: ${task.description.slice(0, 80)}`,
          content: task.description.slice(0, 140),
          metadata: {
            taskId: task._id,
            agentId: agent._id,
            outcomeSummary: task.outcomeSummary,
            outcomeLinks: task.outcomeLinks,
          },
          isPublic: true,
        });
      }
    }

    if (statusChanged && args.status === "completed") {
      const owner = await ctx.db.get(ctx.userId);
      const ownerEmail = owner?.email?.trim();
      if (ownerEmail) {
        const ownerAgents = await ctx.db
          .query("agents")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .take(50);
        const preferredAgent =
          ownerAgents.find((agent) => agent._id === task.agentId && !!agent.agentEmail) ??
          ownerAgents.find((agent) => agent.isDefault && !!agent.agentEmail) ??
          ownerAgents.find((agent) => !!agent.agentEmail);
        if (preferredAgent?.agentEmail) {
          await ctx.runMutation(internal.functions.board.setOutcomeEmailDelivery, {
            taskId: task._id,
            status: "queued",
          });
          await ctx.scheduler.runAfter(0, internal.functions.agentmail.sendMessage, {
            userId: ctx.userId,
            inboxAddress: preferredAgent.agentEmail,
            to: ownerEmail,
            subject: `Task done: ${task.description.slice(0, 80)}`,
            text: buildOutcomeEmailText(task),
            taskId: task._id,
          });
        }
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
    projectId: v.optional(v.union(v.id("boardProjects"), v.null())),
    targetCompletionAt: v.optional(v.union(v.number(), v.null())),
    outcomeSummary: v.optional(v.union(v.string(), v.null())),
    outcomeLinks: v.optional(v.union(v.array(v.string()), v.null())),
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

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.userId !== ctx.userId) {
        throw new Error("Project not found");
      }
    }

    const patch: Record<string, unknown> = {};
    if (args.description !== undefined) patch.description = args.description;
    if (args.agentId !== undefined) patch.agentId = args.agentId ?? undefined;
    if (args.projectId !== undefined) patch.projectId = args.projectId ?? undefined;
    if (args.targetCompletionAt !== undefined) {
      patch.targetCompletionAt =
        args.targetCompletionAt === null ? undefined : Math.trunc(args.targetCompletionAt);
    }
    if (args.outcomeSummary !== undefined) {
      patch.outcomeSummary = args.outcomeSummary?.trim() || undefined;
    }
    if (args.outcomeLinks !== undefined) {
      const cleanLinks =
        args.outcomeLinks
          ?.map((link) => link.trim())
          .filter((link) => link.length > 0)
          .slice(0, 8) ?? [];
      patch.outcomeLinks = cleanLinks.length > 0 ? cleanLinks : undefined;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.taskId, patch);
    }

    const hasOutcomeUpdate =
      args.outcomeSummary !== undefined || args.outcomeLinks !== undefined;
    if (task.status === "completed" && hasOutcomeUpdate) {
      const owner = await ctx.db.get(ctx.userId);
      const ownerEmail = owner?.email?.trim();
      if (ownerEmail) {
        const ownerAgents = await ctx.db
          .query("agents")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .take(50);
        const preferredAgent =
          ownerAgents.find((agent) => agent._id === (args.agentId ?? task.agentId) && !!agent.agentEmail) ??
          ownerAgents.find((agent) => agent.isDefault && !!agent.agentEmail) ??
          ownerAgents.find((agent) => !!agent.agentEmail);
        if (preferredAgent?.agentEmail) {
          await ctx.runMutation(internal.functions.board.setOutcomeEmailDelivery, {
            taskId: task._id,
            status: "queued",
          });
          await ctx.scheduler.runAfter(0, internal.functions.agentmail.sendMessage, {
            userId: ctx.userId,
            inboxAddress: preferredAgent.agentEmail,
            to: ownerEmail,
            subject: `Task results updated: ${task.description.slice(0, 80)}`,
            text: buildOutcomeEmailText({
              description: (patch.description as string | undefined) ?? task.description,
              outcomeSummary:
                (patch.outcomeSummary as string | undefined) ?? task.outcomeSummary,
              outcomeLinks:
                (patch.outcomeLinks as Array<string> | undefined) ?? task.outcomeLinks,
            }),
            taskId: task._id,
          });
        }
      }
    }
    return null;
  },
});

export const doNow = authedMutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== ctx.userId) {
      throw new Error("Task not found");
    }

    const columns = await ctx.db
      .query("boardColumns")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(20);
    const inProgressColumn = columns.find((column) => column.name === "In Progress");

    await ctx.db.patch(args.taskId, {
      status: "in_progress",
      doNowAt: Date.now(),
      boardColumnId: inProgressColumn?._id ?? task.boardColumnId,
    });

    const assignedAgent = task.agentId ? await ctx.db.get(task.agentId) : null;
    await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
      userId: ctx.userId,
      type: "status_update",
      title: assignedAgent
        ? `${assignedAgent.name} is doing this task now`
        : "Task started now",
      content: task.description.slice(0, 140),
      metadata: {
        taskId: task._id,
        agentId: task.agentId,
        status: "in_progress",
      },
      isPublic: task.isPublic,
    });

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

// ============================================================
// Internal runtime actions
// ============================================================

export const createTaskFromAgent = internalMutation({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    description: v.string(),
    isPublic: v.boolean(),
    source: v.union(
      v.literal("email"),
      v.literal("phone"),
      v.literal("api"),
      v.literal("mcp"),
      v.literal("webmcp"),
      v.literal("a2a"),
      v.literal("dashboard")
    ),
    parentTaskId: v.optional(v.id("tasks")),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    const description = args.description.trim();
    if (!description) {
      throw new Error("Task description is required");
    }

    let resolvedAgentName: string | undefined;
    if (args.agentId) {
      const agent = await ctx.db.get(args.agentId);
      if (!agent || agent.userId !== args.userId) {
        throw new Error("Agent not found for user");
      }
      resolvedAgentName = agent.name;
    }

    const inboxColumnId = await getOrCreateInboxColumnId(ctx, args.userId);
    const taskId = await ctx.db.insert("tasks", {
      userId: args.userId,
      agentId: args.agentId,
      requestedBy: args.parentTaskId ? "subtask" : "chat",
      description,
      status: "pending",
      steps: [],
      boardColumnId: inboxColumnId,
      isPublic: args.isPublic,
      parentTaskId: args.parentTaskId,
      createdAt: Date.now(),
    });

    const isSubtask = !!args.parentTaskId;
    await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
      userId: args.userId,
      type: "status_update",
      title: isSubtask
        ? `${resolvedAgentName ?? "Agent"} created a subtask`
        : resolvedAgentName
          ? `${resolvedAgentName} created a task`
          : "Agent created a task",
      content: description.slice(0, 140),
      metadata: {
        taskId,
        agentId: args.agentId,
        source: args.source,
        parentTaskId: args.parentTaskId,
      },
      isPublic: args.isPublic,
    });

    return taskId;
  },
});

export const updateTaskFromAgent = internalMutation({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    taskId: v.id("tasks"),
    boardColumnId: v.optional(v.id("boardColumns")),
    boardColumnName: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("failed")
      )
    ),
    outcomeSummary: v.optional(v.string()),
    outcomeLinks: v.optional(v.array(v.string())),
    source: v.union(
      v.literal("email"),
      v.literal("phone"),
      v.literal("api"),
      v.literal("mcp"),
      v.literal("webmcp"),
      v.literal("a2a"),
      v.literal("dashboard")
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== args.userId) {
      throw new Error("Task not found");
    }

    let resolvedBoardColumnId = args.boardColumnId;
    if (!resolvedBoardColumnId && args.boardColumnName?.trim()) {
      const columns = await ctx.db
        .query("boardColumns")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .take(50);
      const match = columns.find(
        (column) =>
          column.name.trim().toLowerCase() === args.boardColumnName!.trim().toLowerCase()
      );
      resolvedBoardColumnId = match?._id;
      if (!resolvedBoardColumnId) {
        throw new Error("Board column not found");
      }
    }

    // Auto-resolve board column when status changes and no explicit column given
    if (args.status && !resolvedBoardColumnId && !args.boardColumnName) {
      const columns = await ctx.db
        .query("boardColumns")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .take(50);
      const statusToColumn: Record<string, string> = {
        in_progress: "In Progress",
        completed: "Done",
        failed: "Done",
        pending: "Todo",
      };
      const targetName = statusToColumn[args.status];
      if (targetName) {
        const match = columns.find(
          (c) => c.name.trim().toLowerCase() === targetName.toLowerCase()
        );
        if (match) resolvedBoardColumnId = match._id;
      }
    }

    const patch: Record<string, unknown> = {};
    if (resolvedBoardColumnId) patch.boardColumnId = resolvedBoardColumnId;
    if (args.status) {
      patch.status = args.status;
      if (args.status === "completed") patch.completedAt = Date.now();
      // Set doNowAt when moving to in_progress so the board shows when it started
      if (args.status === "in_progress" && !task.doNowAt) {
        patch.doNowAt = Date.now();
      }
    }
    if (args.outcomeSummary !== undefined) {
      patch.outcomeSummary = args.outcomeSummary.trim() || undefined;
    }
    if (args.outcomeLinks !== undefined) {
      const cleanLinks = args.outcomeLinks
        .map((link) => link.trim())
        .filter((link) => link.length > 0)
        .slice(0, 8);
      patch.outcomeLinks = cleanLinks.length > 0 ? cleanLinks : undefined;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.taskId, patch);
    }

    // Feed items for status transitions
    const completedNow = args.status === "completed" && task.status !== "completed";
    const startedNow = args.status === "in_progress" && task.status !== "in_progress";
    const failedNow = args.status === "failed" && task.status !== "failed";

    const resolvedAgent = args.agentId
      ? await ctx.db.get(args.agentId)
      : task.agentId
        ? await ctx.db.get(task.agentId)
        : null;
    const actorName = resolvedAgent?.name ?? "Agent";

    // Notify when agent starts working on a task
    if (startedNow) {
      await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
        userId: args.userId,
        type: "status_update",
        title: `${actorName} started working on a task`,
        content: task.description.slice(0, 140),
        metadata: {
          taskId: task._id,
          agentId: resolvedAgent?._id,
          source: args.source,
          status: "in_progress",
        },
        isPublic: task.isPublic,
      });
    }

    // Notify when agent fails a task
    if (failedNow) {
      await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
        userId: args.userId,
        type: "status_update",
        title: `${actorName} marked task as failed`,
        content: task.description.slice(0, 140),
        metadata: {
          taskId: task._id,
          agentId: resolvedAgent?._id,
          source: args.source,
          status: "failed",
        },
        isPublic: false,
      });
    }

    // Public feed item when agent completes a task
    if (completedNow && resolvedAgent?.isPublic) {
      await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
        userId: args.userId,
        type: "task_completed",
        title: `Done: ${task.description.slice(0, 80)}`,
        content: task.description.slice(0, 140),
        metadata: {
          taskId: task._id,
          agentId: resolvedAgent._id,
          source: args.source,
          outcomeSummary:
            (patch.outcomeSummary as string | undefined) ?? task.outcomeSummary,
          outcomeLinks:
            (patch.outcomeLinks as Array<string> | undefined) ?? task.outcomeLinks,
        },
        isPublic: true,
      });
    }

    const shouldQueueOutcomeEmail =
      completedNow || args.outcomeSummary !== undefined || args.outcomeLinks !== undefined;
    const resultingStatus = (patch.status as string | undefined) ?? task.status;
    if (shouldQueueOutcomeEmail && resultingStatus === "completed") {
      const owner = await ctx.db.get(args.userId);
      const ownerEmail = owner?.email?.trim();
      if (ownerEmail) {
        const ownerAgents = await ctx.db
          .query("agents")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId))
          .take(50);
        const preferredAgent =
          ownerAgents.find((agent) => agent._id === (args.agentId ?? task.agentId) && !!agent.agentEmail) ??
          ownerAgents.find((agent) => agent.isDefault && !!agent.agentEmail) ??
          ownerAgents.find((agent) => !!agent.agentEmail);
        if (preferredAgent?.agentEmail) {
          await ctx.runMutation(internal.functions.board.setOutcomeEmailDelivery, {
            taskId: task._id,
            status: "queued",
          });
          await ctx.scheduler.runAfter(0, internal.functions.agentmail.sendMessage, {
            userId: args.userId,
            inboxAddress: preferredAgent.agentEmail,
            to: ownerEmail,
            subject: `Task done: ${task.description.slice(0, 80)}`,
            text: buildOutcomeEmailText({
              description: task.description,
              outcomeSummary:
                (patch.outcomeSummary as string | undefined) ?? task.outcomeSummary,
              outcomeLinks:
                (patch.outcomeLinks as Array<string> | undefined) ?? task.outcomeLinks,
            }),
            taskId: task._id,
          });
        }
      }
    }

    return null;
  },
});

// Store long-form outcome as a file in Convex storage and link to task
export const storeOutcomeFile = internalAction({
  args: {
    taskId: v.id("tasks"),
    userId: v.id("users"),
    content: v.string(),
  },
  returns: v.union(v.id("_storage"), v.null()),
  handler: async (ctx, args) => {
    const blob = new Blob([args.content], { type: "text/markdown" });
    const storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.functions.board.linkOutcomeFile, {
      taskId: args.taskId,
      userId: args.userId,
      storageId,
    });
    return storageId;
  },
});

// Internal mutation to link a stored outcome file to a task
export const linkOutcomeFile = internalMutation({
  args: {
    taskId: v.id("tasks"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== args.userId) return null;
    await ctx.db.patch(args.taskId, { outcomeFileId: args.storageId });
    return null;
  },
});

// Get task outcome text and agent ID for audio generation
export const getTaskForAudio = internalQuery({
  args: {
    taskId: v.id("tasks"),
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      outcomeSummary: v.optional(v.string()),
      agentId: v.optional(v.id("agents")),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== args.userId) return null;
    return {
      outcomeSummary: task.outcomeSummary,
      agentId: task.agentId,
    };
  },
});

// Append a workflow step to a task's pipeline log (fire-and-forget from runtime)
export const addWorkflowStep = internalMutation({
  args: {
    taskId: v.id("tasks"),
    label: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    detail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    const existing = task.workflowSteps ?? [];
    const step = {
      label: args.label,
      status: args.status,
      startedAt: args.startedAt,
      completedAt: args.completedAt,
      durationMs: args.durationMs,
      detail: args.detail,
    };
    await ctx.db.patch(args.taskId, {
      workflowSteps: [...existing, step],
    });
    return null;
  },
});

// Batch-set all workflow steps at once (used at end of pipeline to avoid per-step writes)
export const setWorkflowSteps = internalMutation({
  args: {
    taskId: v.id("tasks"),
    steps: v.array(v.object({
      label: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("skipped")
      ),
      startedAt: v.number(),
      completedAt: v.optional(v.number()),
      durationMs: v.optional(v.number()),
      detail: v.optional(v.string()),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    await ctx.db.patch(args.taskId, { workflowSteps: args.steps });
    return null;
  },
});

// Link a generated audio file to a task outcome
export const linkOutcomeAudio = internalMutation({
  args: {
    taskId: v.id("tasks"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== args.userId) return null;
    await ctx.db.patch(args.taskId, { outcomeAudioId: args.storageId });
    return null;
  },
});

// Get the playback URL for a task's outcome audio
export const getOutcomeAudioUrl = authedQuery({
  args: { taskId: v.id("tasks") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== ctx.userId) return null;
    if (!task.outcomeAudioId) return null;
    return await ctx.storage.getUrl(task.outcomeAudioId);
  },
});

// Get the download URL for a task's outcome file
export const getOutcomeFileUrl = authedQuery({
  args: { taskId: v.id("tasks") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== ctx.userId) return null;
    if (!task.outcomeFileId) return null;
    return await ctx.storage.getUrl(task.outcomeFileId);
  },
});

// Get workflow pipeline steps for a task
export const getWorkflowSteps = authedQuery({
  args: { taskId: v.id("tasks") },
  returns: v.union(
    v.array(v.object({
      label: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("skipped")
      ),
      startedAt: v.number(),
      completedAt: v.optional(v.number()),
      durationMs: v.optional(v.number()),
      detail: v.optional(v.string()),
    })),
    v.null()
  ),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== ctx.userId) return null;
    return task.workflowSteps ?? null;
  },
});

// Get subtasks for a parent task
export const getSubtasks = authedQuery({
  args: { parentTaskId: v.id("tasks") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentTaskId);
    if (!parent || parent.userId !== ctx.userId) return [];
    return await ctx.db
      .query("tasks")
      .withIndex("by_parentTaskId", (q) => q.eq("parentTaskId", args.parentTaskId))
      .order("asc")
      .take(50);
  },
});

export const setOutcomeEmailDelivery = internalMutation({
  args: {
    taskId: v.id("tasks"),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    const now = Date.now();
    const patch: Record<string, unknown> = {
      outcomeEmailStatus: args.status,
      outcomeEmailLastAttemptAt: now,
    };
    if (args.status === "sent") {
      patch.outcomeEmailSentAt = now;
      patch.outcomeEmailError = undefined;
    }
    if (args.status === "failed") {
      patch.outcomeEmailError = args.error?.trim() || "Email delivery failed.";
    }
    await ctx.db.patch(args.taskId, patch);
    return null;
  },
});
