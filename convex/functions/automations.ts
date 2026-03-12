import { v } from "convex/values";
import { internalAction, internalMutation, query } from "../_generated/server";
import { authedMutation, authedQuery } from "../lib/functions";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const MAX_LIST_ITEMS = 200;
const MIN_INTERVAL_MINUTES = 1;
const automationActionTypeValidator = v.union(
  v.literal("process_agent_tasks"),
  v.literal("run_symphony")
);

type AutomationActionType = "process_agent_tasks" | "run_symphony";

type ProcessAgentTasksConfig = {
  agentId?: Id<"agents">;
};

type RunSymphonyConfig = {
  agentId?: Id<"agents">;
  instruction?: string;
  repoUrl?: string;
  baseBranch?: string;
  projectPath?: string;
  promptPrefix?: string;
};

type AutomationDefinitionDoc = {
  _id: Id<"automationDefinitions">;
  userId: Id<"users">;
  triggerType: "manual" | "interval" | "event";
  intervalMinutes?: number;
  actionType: AutomationActionType;
  actionConfig?: unknown;
};

function toNextRunAt(intervalMinutes?: number, now = Date.now()): number | undefined {
  if (!intervalMinutes || intervalMinutes < MIN_INTERVAL_MINUTES) {
    return undefined;
  }
  return now + intervalMinutes * 60_000;
}

function validateActionConfig(actionType: AutomationActionType, actionConfig?: unknown): void {
  if (actionType === "process_agent_tasks") {
    const config = (actionConfig ?? {}) as ProcessAgentTasksConfig;
    if (!config.agentId) {
      throw new Error("process_agent_tasks requires actionConfig.agentId.");
    }
    return;
  }

  const config = (actionConfig ?? {}) as RunSymphonyConfig;
  if (!config.agentId) {
    throw new Error("run_symphony requires actionConfig.agentId.");
  }
  if (!config.instruction?.trim()) {
    throw new Error("run_symphony requires actionConfig.instruction.");
  }
}

async function touchDefinitionSchedule(
  ctx: {
    db: {
      patch: (
        id: Id<"automationDefinitions">,
        value: {
          lastRunAt: number;
          nextRunAt?: number;
          updatedAt: number;
        }
      ) => Promise<void>;
    };
  },
  definition: AutomationDefinitionDoc,
  now: number
): Promise<void> {
  await ctx.db.patch(definition._id, {
    lastRunAt: now,
    nextRunAt:
      definition.triggerType === "interval"
        ? toNextRunAt(definition.intervalMinutes, now)
        : undefined,
    updatedAt: now,
  });
}

export const listDefinitions = authedQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return await ctx.db
      .query("automationDefinitions")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(MAX_LIST_ITEMS);
  },
});

export const listRuns = authedQuery({
  args: {
    automationId: v.optional(v.id("automationDefinitions")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const automationId = args.automationId;
    const runs = automationId
      ? await ctx.db
          .query("automationRuns")
          .withIndex("by_automationId", (q) => q.eq("automationId", automationId))
          .order("desc")
          .take(MAX_LIST_ITEMS)
      : await ctx.db
          .query("automationRuns")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .order("desc")
          .take(MAX_LIST_ITEMS);

    return runs.filter((run) => run.userId === ctx.userId);
  },
});

export const createDefinition = authedMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    triggerType: v.union(v.literal("manual"), v.literal("interval"), v.literal("event")),
    intervalMinutes: v.optional(v.number()),
    eventType: v.optional(v.string()),
    actionType: automationActionTypeValidator,
    actionConfig: v.optional(v.any()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.id("automationDefinitions"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("Automation name is required.");
    }

    if (args.triggerType === "interval") {
      if (
        typeof args.intervalMinutes !== "number" ||
        args.intervalMinutes < MIN_INTERVAL_MINUTES
      ) {
        throw new Error("Interval automations require intervalMinutes >= 1.");
      }
    }

    if (args.triggerType === "event" && !args.eventType?.trim()) {
      throw new Error("Event automations require eventType.");
    }

    validateActionConfig(args.actionType, args.actionConfig);

    const now = Date.now();
    const isActive = args.isActive ?? true;
    return await ctx.db.insert("automationDefinitions", {
      userId: ctx.userId,
      name: name.slice(0, 120),
      description: args.description?.trim() || undefined,
      triggerType: args.triggerType,
      intervalMinutes: args.intervalMinutes,
      nextRunAt:
        isActive && args.triggerType === "interval"
          ? toNextRunAt(args.intervalMinutes, now)
          : undefined,
      eventType: args.eventType?.trim() || undefined,
      actionType: args.actionType,
      actionConfig: args.actionConfig,
      isActive,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateDefinition = authedMutation({
  args: {
    automationId: v.id("automationDefinitions"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    triggerType: v.optional(
      v.union(v.literal("manual"), v.literal("interval"), v.literal("event"))
    ),
    intervalMinutes: v.optional(v.union(v.number(), v.null())),
    eventType: v.optional(v.union(v.string(), v.null())),
    actionType: v.optional(automationActionTypeValidator),
    actionConfig: v.optional(v.any()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.automationId);
    if (!existing || existing.userId !== ctx.userId) {
      throw new Error("Automation not found.");
    }

    const nextTriggerType = args.triggerType ?? existing.triggerType;
    const nextInterval =
      args.intervalMinutes === null
        ? undefined
        : args.intervalMinutes ?? existing.intervalMinutes;
    const nextIsActive = args.isActive ?? existing.isActive;
    const nextActionType = args.actionType ?? existing.actionType;
    const nextActionConfig =
      args.actionConfig !== undefined ? args.actionConfig : existing.actionConfig;
    const now = Date.now();

    if (nextTriggerType === "interval") {
      if (typeof nextInterval !== "number" || nextInterval < MIN_INTERVAL_MINUTES) {
        throw new Error("Interval automations require intervalMinutes >= 1.");
      }
    }

    const nextEventType =
      args.eventType === null ? undefined : args.eventType ?? existing.eventType;
    if (nextTriggerType === "event" && !nextEventType?.trim()) {
      throw new Error("Event automations require eventType.");
    }

    validateActionConfig(nextActionType, nextActionConfig);

    const patch: {
      name?: string;
      description?: string;
      triggerType?: "manual" | "interval" | "event";
      intervalMinutes?: number;
      nextRunAt?: number;
      eventType?: string;
      actionType?: AutomationActionType;
      actionConfig?: unknown;
      isActive?: boolean;
      updatedAt: number;
    } = {
      updatedAt: now,
    };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Automation name is required.");
      patch.name = name.slice(0, 120);
    }
    if (args.description !== undefined) {
      patch.description = args.description?.trim() || undefined;
    }
    if (args.triggerType !== undefined) {
      patch.triggerType = args.triggerType;
    }
    if (args.intervalMinutes !== undefined) {
      patch.intervalMinutes = nextInterval;
    }
    if (args.eventType !== undefined) {
      patch.eventType = nextEventType?.trim() || undefined;
    }
    if (args.actionType !== undefined) {
      patch.actionType = args.actionType;
    }
    if (args.actionConfig !== undefined) {
      patch.actionConfig = args.actionConfig;
    }
    if (args.isActive !== undefined) {
      patch.isActive = args.isActive;
    }

    patch.nextRunAt =
      nextIsActive && nextTriggerType === "interval"
        ? toNextRunAt(nextInterval, now)
        : undefined;

    await ctx.db.patch(args.automationId, patch);
    return null;
  },
});

export const deleteDefinition = authedMutation({
  args: {
    automationId: v.id("automationDefinitions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.automationId);
    if (!existing || existing.userId !== ctx.userId) {
      throw new Error("Automation not found.");
    }

    await ctx.db.delete(args.automationId);
    return null;
  },
});

export const runNow = authedMutation({
  args: {
    automationId: v.id("automationDefinitions"),
    input: v.optional(v.any()),
  },
  returns: v.id("automationRuns"),
  handler: async (ctx, args) => {
    const definition = await ctx.db.get(args.automationId);
    if (!definition || definition.userId !== ctx.userId) {
      throw new Error("Automation not found.");
    }

    const now = Date.now();
    const runId = await ctx.db.insert("automationRuns", {
      userId: ctx.userId,
      automationId: definition._id,
      triggerSource: "manual",
      status: "queued",
      input: args.input,
      createdAt: now,
      updatedAt: now,
    });

    try {
      if (definition.actionType === "process_agent_tasks") {
        const actionConfig = (definition.actionConfig ?? {}) as ProcessAgentTasksConfig;
        if (!actionConfig.agentId) {
          throw new Error("Missing actionConfig.agentId for process_agent_tasks.");
        }

        await ctx.scheduler.runAfter(0, internal.crons.processAgentTasks, {
          userId: ctx.userId,
          agentId: actionConfig.agentId,
        });

        await ctx.db.patch(runId, {
          status: "succeeded",
          output: {
            queued: true,
            adapter: "process_agent_tasks",
          },
          endedAt: Date.now(),
          updatedAt: Date.now(),
        });
      } else {
        const actionConfig = (definition.actionConfig ?? {}) as RunSymphonyConfig;
        if (!actionConfig.agentId) {
          throw new Error("Missing actionConfig.agentId for run_symphony.");
        }
        if (!actionConfig.instruction?.trim()) {
          throw new Error("Missing actionConfig.instruction for run_symphony.");
        }

        await ctx.db.patch(runId, {
          status: "running",
          startedAt: Date.now(),
          updatedAt: Date.now(),
        });

        await ctx.scheduler.runAfter(
          0,
          internal.functions.automations.runSymphonyAutomationRun,
          {
            runId,
            userId: ctx.userId,
            agentId: actionConfig.agentId,
            instruction: actionConfig.instruction.trim(),
            repoUrl: actionConfig.repoUrl?.trim() || undefined,
            baseBranch: actionConfig.baseBranch?.trim() || undefined,
            projectPath: actionConfig.projectPath?.trim() || undefined,
            promptPrefix: actionConfig.promptPrefix?.trim() || undefined,
          }
        );
      }
    } catch (error) {
      await ctx.db.patch(runId, {
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Automation dispatch failed.",
        endedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await touchDefinitionSchedule(ctx, definition as AutomationDefinitionDoc, now);
    return runId;
  },
});

export const dispatchDueAutomations = internalMutation({
  args: {},
  returns: v.object({
    checked: v.number(),
    queued: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const dueDefinitions = await ctx.db
      .query("automationDefinitions")
      .withIndex("by_isActive_and_nextRunAt", (q) =>
        q.eq("isActive", true).lte("nextRunAt", now)
      )
      .take(50);

    let queued = 0;
    let failed = 0;

    for (const definition of dueDefinitions) {
      const runId = await ctx.db.insert("automationRuns", {
        userId: definition.userId,
        automationId: definition._id,
        triggerSource: definition.triggerType === "interval" ? "interval" : "manual",
        status: "queued",
        input: {
          source: "automation_control_plane_tick",
          actionType: definition.actionType,
        },
        createdAt: now,
        updatedAt: now,
      });

      try {
        if (definition.actionType === "process_agent_tasks") {
          const actionConfig = (definition.actionConfig ?? {}) as ProcessAgentTasksConfig;
          if (!actionConfig.agentId) {
            throw new Error("Missing actionConfig.agentId for process_agent_tasks.");
          }

          await ctx.scheduler.runAfter(0, internal.crons.processAgentTasks, {
            userId: definition.userId,
            agentId: actionConfig.agentId,
          });

          await ctx.db.patch(runId, {
            status: "succeeded",
            output: {
              queued: true,
              adapter: "process_agent_tasks",
            },
            endedAt: Date.now(),
            updatedAt: Date.now(),
          });
        } else {
          const actionConfig = (definition.actionConfig ?? {}) as RunSymphonyConfig;
          if (!actionConfig.agentId) {
            throw new Error("Missing actionConfig.agentId for run_symphony.");
          }
          if (!actionConfig.instruction?.trim()) {
            throw new Error("Missing actionConfig.instruction for run_symphony.");
          }

          await ctx.db.patch(runId, {
            status: "running",
            startedAt: Date.now(),
            updatedAt: Date.now(),
          });

          await ctx.scheduler.runAfter(
            0,
            internal.functions.automations.runSymphonyAutomationRun,
            {
              runId,
              userId: definition.userId,
              agentId: actionConfig.agentId,
              instruction: actionConfig.instruction.trim(),
              repoUrl: actionConfig.repoUrl?.trim() || undefined,
              baseBranch: actionConfig.baseBranch?.trim() || undefined,
              projectPath: actionConfig.projectPath?.trim() || undefined,
              promptPrefix: actionConfig.promptPrefix?.trim() || undefined,
            }
          );
        }
        queued += 1;
      } catch (error) {
        failed += 1;
        await ctx.db.patch(runId, {
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Automation dispatch failed.",
          endedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      await touchDefinitionSchedule(ctx, definition as AutomationDefinitionDoc, now);
    }

    return {
      checked: dueDefinitions.length,
      queued,
      failed,
    };
  },
});

export const completeRun = internalMutation({
  args: {
    runId: v.id("automationRuns"),
    output: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "succeeded",
      output: args.output,
      endedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const failRun = internalMutation({
  args: {
    runId: v.id("automationRuns"),
    error: v.string(),
    output: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error,
      output: args.output,
      endedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const runSymphonyAutomationRun = internalAction({
  args: {
    runId: v.id("automationRuns"),
    userId: v.id("users"),
    agentId: v.id("agents"),
    instruction: v.string(),
    repoUrl: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    projectPath: v.optional(v.string()),
    promptPrefix: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const result: {
      success: boolean;
      externalRunId?: string;
      result?: string;
      error?: string;
    } = await ctx.runAction(internal.functions.daytona.runSymphonyAutomation, {
      userId: args.userId,
      agentId: args.agentId,
      instruction: args.instruction,
      repoUrl: args.repoUrl,
      baseBranch: args.baseBranch,
      projectPath: args.projectPath,
      promptPrefix: args.promptPrefix,
    });

    if (result.success) {
      const completeResult: null = await ctx.runMutation(
        internal.functions.automations.completeRun,
        {
          runId: args.runId,
          output: {
            adapter: "run_symphony",
            externalRunId: result.externalRunId,
            result: result.result,
          },
        }
      );
      return completeResult;
    }

    const failResult: null = await ctx.runMutation(internal.functions.automations.failRun, {
      runId: args.runId,
      error: result.error ?? "Symphony automation failed.",
      output: {
        adapter: "run_symphony",
        externalRunId: result.externalRunId,
        result: result.result,
      },
    });
    return failResult;
  },
});

// Public helper query for event-driven trigger lookups in API/webhook handlers.
export const listEventDefinitions = query({
  args: {
    userId: v.id("users"),
    eventType: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("automationDefinitions")
      .withIndex("by_userId_and_triggerType_and_eventType", (q) =>
        q
          .eq("userId", args.userId)
          .eq("triggerType", "event")
          .eq("eventType", args.eventType)
      )
      .take(MAX_LIST_ITEMS);
  },
});

