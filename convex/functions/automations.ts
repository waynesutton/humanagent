import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { authedMutation, authedQuery } from "../lib/functions";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const MAX_LIST_ITEMS = 200;
const MIN_INTERVAL_MINUTES = 1;

function toNextRunAt(intervalMinutes?: number, now = Date.now()): number | undefined {
  if (!intervalMinutes || intervalMinutes < MIN_INTERVAL_MINUTES) {
    return undefined;
  }
  return now + intervalMinutes * 60_000;
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
    const runs = args.automationId
      ? await ctx.db
          .query("automationRuns")
          .withIndex("by_automationId", (q) => q.eq("automationId", args.automationId))
          .order("desc")
          .take(MAX_LIST_ITEMS)
      : await ctx.db
          .query("automationRuns")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .order("desc")
          .take(MAX_LIST_ITEMS);

    // Guard against cross-user leakage when querying by automation ID.
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
    actionType: v.union(v.literal("process_agent_tasks")),
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
    triggerType: v.optional(v.union(v.literal("manual"), v.literal("interval"), v.literal("event"))),
    intervalMinutes: v.optional(v.union(v.number(), v.null())),
    eventType: v.optional(v.union(v.string(), v.null())),
    actionType: v.optional(v.union(v.literal("process_agent_tasks"))),
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

    const patch: {
      name?: string;
      description?: string;
      triggerType?: "manual" | "interval" | "event";
      intervalMinutes?: number;
      nextRunAt?: number;
      eventType?: string;
      actionType?: "process_agent_tasks";
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

    if (definition.actionType === "process_agent_tasks") {
      const actionConfig = (definition.actionConfig ?? {}) as {
        agentId?: Id<"agents">;
      };
      if (!actionConfig.agentId) {
        await ctx.db.patch(runId, {
          status: "failed",
          error: "Missing actionConfig.agentId for process_agent_tasks.",
          endedAt: Date.now(),
          updatedAt: Date.now(),
        });
        return runId;
      }

      await ctx.scheduler.runAfter(0, internal.crons.processAgentTasks, {
        userId: ctx.userId,
        agentId: actionConfig.agentId,
      });
    }

    // Update scheduling metadata on manual trigger for observability.
    await ctx.db.patch(definition._id, {
      lastRunAt: now,
      updatedAt: now,
      nextRunAt:
        definition.triggerType === "interval"
          ? toNextRunAt(definition.intervalMinutes, now)
          : undefined,
    });

    return runId;
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

