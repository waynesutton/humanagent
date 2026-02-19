/**
 * Scheduled Jobs (Crons)
 *
 * Handles recurring tasks: heartbeat, token reset, memory compression, etc.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const crons = cronJobs();

// ============================================================
// Agent Heartbeat - Check agent health every 5 minutes
// ============================================================

export const heartbeat = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const users = await ctx.db.query("users").take(1000);

    for (const user of users) {
      // Get or create health record
      const existingHealth = await ctx.db
        .query("agentHealth")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .first();

      // Check for stalled tasks
      const stalledTasks = await ctx.db
        .query("tasks")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();

      const stalled = stalledTasks.filter(
        (t) =>
          t.status === "in_progress" &&
          now - t.createdAt > 24 * 60 * 60 * 1000 // Stalled if in_progress for > 24h
      );

      // Check for expiring credentials (within 7 days)
      const credentials = await ctx.db
        .query("userCredentials")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();

      const expiringCreds = credentials
        .filter(
          (c) =>
            c.tokenExpiresAt &&
            c.tokenExpiresAt < now + 7 * 24 * 60 * 60 * 1000
        )
        .map((c) => c.service);

      // Determine status
      let status: "active" | "idle" | "error" = "idle";
      if (stalled.length > 0 || expiringCreds.length > 0) {
        status = "error";
      } else {
        // Check recent activity
        const recentAudit = await ctx.db
          .query("auditLog")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .order("desc")
          .first();

        if (recentAudit && now - recentAudit.timestamp < 60 * 60 * 1000) {
          status = "active";
        }
      }

      const healthData = {
        userId: user._id,
        status,
        lastHeartbeat: now,
        lastActivity: existingHealth?.lastActivity ?? now,
        stalledTasks: stalled.length,
        expiringCredentials: expiringCreds,
        checkedAt: now,
      };

      if (existingHealth) {
        await ctx.db.patch(existingHealth._id, healthData);
      } else {
        await ctx.db.insert("agentHealth", healthData);
      }
    }

    return null;
  },
});

crons.interval("agent heartbeat", { minutes: 5 }, internal.crons.heartbeat, {});

// ============================================================
// Monthly Token Reset - Reset token counts on the 1st of each month
// ============================================================

export const monthlyTokenReset = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Reset user token counts
    const users = await ctx.db.query("users").take(1000);
    const userUpdates = users.map((user) =>
      ctx.db.patch(user._id, {
        llmConfig: {
          ...user.llmConfig,
          tokensUsedThisMonth: 0,
        },
      })
    );
    await Promise.all(userUpdates);

    // Reset agent token counts
    const agents = await ctx.db.query("agents").take(5000);
    const agentUpdates = agents
      .filter((a) => a.llmConfig)
      .map((agent) =>
        ctx.db.patch(agent._id, {
          llmConfig: {
            ...agent.llmConfig!,
            tokensUsedThisMonth: 0,
          },
        })
      );
    await Promise.all(agentUpdates);

    return null;
  },
});

// Run on the 1st of each month at midnight UTC
crons.cron(
  "monthly token reset",
  "0 0 1 * *",
  internal.crons.monthlyTokenReset,
  {}
);

// ============================================================
// Memory Compression - Compress old memories weekly
// ============================================================

export const memoryCompression = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Get old conversation memories to summarize/archive first.
    const oldMemories = await ctx.db
      .query("agentMemory")
      .order("asc")
      .take(1000);

    const toArchive = oldMemories.filter(
      (m) => m.type === "conversation" && m.createdAt < oneWeekAgo && !m.archived
    );

    // Group archived candidates to produce compact summary memories.
    const groups = new Map<string, typeof toArchive>();
    for (const memory of toArchive.slice(0, 200)) {
      const key = `${memory.userId}:${memory.agentId ?? "none"}:${memory.source}`;
      const existing = groups.get(key) ?? [];
      existing.push(memory);
      groups.set(key, existing);
    }

    for (const [groupKey, items] of groups.entries()) {
      const [userId, agentIdRaw] = groupKey.split(":");
      const snippets = items
        .map((item) => item.content.trim())
        .filter((content) => content.length > 0)
        .slice(0, 12)
        .map((content) => content.slice(0, 220));
      if (snippets.length === 0) continue;

      await ctx.db.insert("agentMemory", {
        userId: userId as typeof items[number]["userId"],
        agentId:
          agentIdRaw === "none"
            ? undefined
            : (agentIdRaw as typeof items[number]["agentId"]),
        type: "conversation_summary",
        content: snippets.join("\n"),
        source: items[0]!.source,
        metadata: {
          summaryOf: items.length,
          rangeStart: items[0]!.createdAt,
          rangeEnd: items[items.length - 1]!.createdAt,
        },
        archived: false,
        createdAt: now,
      });
    }

    // Archive originals once summarized.
    await Promise.all(
      toArchive.slice(0, 200).map((memory) =>
        ctx.db.patch(memory._id, {
          archived: true,
          archivedAt: now,
        })
      )
    );

    // Finally prune old archived conversation noise.
    const pruneCandidates = oldMemories.filter(
      (m) =>
        m.type === "conversation" &&
        m.archived === true &&
        m.archivedAt !== undefined &&
        m.archivedAt < oneMonthAgo
    );
    await Promise.all(pruneCandidates.slice(0, 200).map((m) => ctx.db.delete(m._id)));

    return null;
  },
});

crons.interval("memory compression", { hours: 24 }, internal.crons.memoryCompression, {});

// ============================================================
// Rate Limit Cleanup - Clear old rate limit windows
// ============================================================

export const rateLimitCleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Get old rate limit entries
    const oldLimits = await ctx.db.query("rateLimits").take(1000);
    const toDelete = oldLimits.filter((r) => r.windowStart < oneHourAgo);

    const deletes = toDelete.map((r) => ctx.db.delete(r._id));
    await Promise.all(deletes);

    return null;
  },
});

crons.interval("rate limit cleanup", { hours: 1 }, internal.crons.rateLimitCleanup, {});

// ============================================================
// Expired Permissions Cleanup
// ============================================================

export const permissionsCleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();

    // Get expired permissions
    const permissions = await ctx.db.query("permissions").take(1000);
    const expired = permissions.filter(
      (p) => p.expiresAt && p.expiresAt < now
    );

    const deletes = expired.map((p) => ctx.db.delete(p._id));
    await Promise.all(deletes);

    return null;
  },
});

crons.interval("permissions cleanup", { hours: 6 }, internal.crons.permissionsCleanup, {});

// ============================================================
// Agent Scheduler - Run scheduled agents (auto/cron mode)
// ============================================================

export const agentScheduler = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();

    // Get all agents with active scheduling
    const agents = await ctx.db.query("agents").take(5000);
    const scheduledAgents = agents.filter(
      (a) => a.scheduling?.isActive && (a.scheduling.mode === "auto" || a.scheduling.mode === "cron")
    );

    for (const agent of scheduledAgents) {
      const scheduling = agent.scheduling!;
      const shouldRun = 
        scheduling.mode === "auto" ||
        (scheduling.mode === "cron" && scheduling.nextRun && scheduling.nextRun <= now);

      if (shouldRun) {
        // Record that we're running
        await ctx.db.patch(agent._id, {
          scheduling: {
            ...scheduling,
            lastRun: now,
            nextRun: scheduling.mode === "cron" ? now + 24 * 60 * 60 * 1000 : undefined,
          },
          updatedAt: now,
        });

        // If thinking is enabled and not paused, create a thinking observation
        if (agent.thinking?.enabled && !agent.thinking.isPaused) {
          await ctx.db.insert("agentThoughts", {
            userId: agent.userId,
            agentId: agent._id,
            type: "observation",
            content: "Scheduled run triggered. Checking for pending tasks and goals.",
            context: scheduling.mode === "cron" ? `Cron schedule: ${scheduling.cronSpec}` : "Auto mode",
            createdAt: now,
          });
        }

        // Create audit log entry
        await ctx.db.insert("auditLog", {
          userId: agent.userId,
          action: "agent_scheduled_run",
          resource: "scheduler",
          callerType: "cron",
          status: "success",
          details: {
            agentId: agent._id,
            agentName: agent.name,
            mode: scheduling.mode,
          },
          timestamp: now,
        });

        // Schedule actual task processing for this agent
        await ctx.scheduler.runAfter(0, internal.crons.processAgentTasks, {
          userId: agent.userId,
          agentId: agent._id,
        });
      }
    }

    return null;
  },
});

// Stale task threshold: tasks in_progress for longer than this are force-completed
const STALE_TASK_MS = 30 * 60 * 1000; // 30 minutes

// Process pending/in-progress tasks for a scheduled agent via the LLM runtime
export const processAgentTasks = internalAction({
  args: {
    userId: v.id("users"),
    agentId: v.id("agents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get agent context including pending and in-progress tasks
    const context = await ctx.runQuery(
      internal.functions.agentThinking.getAgentContext,
      { agentId: args.agentId }
    );
    if (!context || !context.agent) return null;

    const pendingTasks = context.pendingTasks ?? [];
    const inProgressTasks = context.inProgressTasks ?? [];

    // Nothing to process if no actionable tasks
    if (pendingTasks.length === 0 && inProgressTasks.length === 0) return null;

    const now = Date.now();

    // Force-complete stale in_progress tasks that the LLM has failed to finish
    const staleTasks: typeof inProgressTasks = [];
    const activeTasks: typeof inProgressTasks = [];
    for (const task of inProgressTasks) {
      const t = task as { _id: string; doNowAt?: number; createdAt: number };
      const startedAt = t.doNowAt ?? t.createdAt;
      if (now - startedAt > STALE_TASK_MS) {
        staleTasks.push(task);
      } else {
        activeTasks.push(task);
      }
    }

    // Force-complete stale tasks so they don't stay stuck forever
    for (const task of staleTasks) {
      const t = task as { _id: string; description: string };
      try {
        await ctx.runMutation(internal.functions.board.updateTaskFromAgent, {
          userId: args.userId,
          agentId: args.agentId,
          taskId: t._id as Id<"tasks">,
          status: "completed",
          outcomeSummary: "Task was auto-completed after being in progress for over 30 minutes without a result. The agent may not have been able to produce output for this request. You can re-create the task to try again.",
          source: "dashboard",
        });
        console.log(`processAgentTasks: force-completed stale task ${t._id}: "${t.description.slice(0, 80)}"`);
      } catch (staleError) {
        console.warn("Failed to force-complete stale task:", t._id, staleError);
      }
    }

    // If only stale tasks existed and they're now handled, we're done
    if (pendingTasks.length === 0 && activeTasks.length === 0) return null;

    // Build a structured prompt the LLM can act on with app_actions
    const taskLines: Array<string> = [];
    taskLines.push("TASK PROCESSING: You MUST complete every task below in a SINGLE response.");
    taskLines.push("This is an automated run. Do not ask questions. Do not defer. Complete everything now.");
    taskLines.push("CRITICAL: You MUST include an <app_actions> block at the end. Tasks without a status update will be stuck forever.");
    taskLines.push("");

    if (pendingTasks.length > 0) {
      taskLines.push(`PENDING TASKS (complete immediately or mark failed if impossible):`);
      for (const task of pendingTasks.slice(0, 10)) {
        const t = task as { _id: string; description: string; targetCompletionAt?: number };
        const eta = t.targetCompletionAt
          ? ` (due ${new Date(t.targetCompletionAt).toISOString().slice(0, 10)})`
          : "";
        taskLines.push(`  taskId="${t._id}" description="${t.description}"${eta}`);
      }
      taskLines.push("");
    }

    if (activeTasks.length > 0) {
      taskLines.push(`IN-PROGRESS TASKS (MUST complete now with outcomeSummary):`);
      for (const task of activeTasks.slice(0, 10)) {
        const t = task as { _id: string; description: string; targetCompletionAt?: number; doNowAt?: number };
        const eta = t.targetCompletionAt
          ? ` (due ${new Date(t.targetCompletionAt).toISOString().slice(0, 10)})`
          : "";
        const started = t.doNowAt
          ? ` (started ${new Date(t.doNowAt).toISOString().slice(0, 16)})`
          : "";
        taskLines.push(`  taskId="${t._id}" description="${t.description}"${eta}${started}`);
      }
      taskLines.push("");
    }

    if (context.currentGoal) {
      taskLines.push(`Current goal: ${context.currentGoal}`);
      taskLines.push("");
    }

    taskLines.push("IMPORTANT: Never mention taskId values in your human-readable response text. Task IDs are internal identifiers for the <app_actions> block only. Your written response should only contain the actual answer or result.");
    taskLines.push("");
    taskLines.push("INSTRUCTIONS:");
    taskLines.push("1. For each task, do the work and write the full result in your response.");
    taskLines.push("   - If asked to write, research, list, answer, joke, etc., produce the full output.");
    taskLines.push("   - NEVER reply with just 'Done', 'Processing', or any placeholder.");
    taskLines.push("2. After your response text, you MUST add an <app_actions> block with one update_task_status per task.");
    taskLines.push("   - For simple questions/requests: set status to 'completed' and put your answer in outcomeSummary.");
    taskLines.push("   - For tasks you cannot do: set status to 'failed' with a reason.");
    taskLines.push("   - NEVER set status to 'in_progress'. Tasks are already in progress. Move them to completed or failed.");
    taskLines.push("3. EVERY task MUST have exactly one update_task_status action. No exceptions.");
    taskLines.push("");
    taskLines.push("Format:");
    taskLines.push("<app_actions>");
    taskLines.push("[{\"type\":\"update_task_status\",\"taskId\":\"ID\",\"status\":\"completed\",\"outcomeSummary\":\"The actual answer or result here\"}]");
    taskLines.push("</app_actions>");

    const message = taskLines.join("\n");

    try {
      const result = await ctx.runAction(internal.agent.runtime.processMessage, {
        userId: args.userId,
        agentId: args.agentId,
        message,
        channel: "dashboard",
      });
      console.log(
        `processAgentTasks agent=${String(args.agentId)} tasks=${pendingTasks.length}p/${activeTasks.length}ip response=${result.response.slice(0, 200)}`
      );
    } catch (error) {
      console.warn("processAgentTasks failed for agent", args.agentId, error);
    }

    return null;
  },
});

crons.interval("agent scheduler", { minutes: 5 }, internal.crons.agentScheduler, {});

// ============================================================
// LLMs.txt Regeneration - Update llms.txt files for all users
// ============================================================

crons.interval("llms.txt regeneration", { hours: 1 }, internal.functions.llmsTxt.regenerateAll, {});

// Retry failed webhook deliveries with exponential backoff queue.
crons.interval(
  "webhook retry processor",
  { minutes: 2 },
  internal.functions.webhooks.retryAgentmailWebhooks,
  {}
);

export default crons;
