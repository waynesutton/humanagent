/**
 * User Schedules Functions
 *
 * Dynamic cron jobs per user (daily digest, calendar sync, etc.)
 */
import { v } from "convex/values";
import { authedMutation, authedQuery } from "../lib/functions";
import { internalMutation, internalQuery } from "../_generated/server";

// Available job types (exported for documentation, not used in validators since cron is flexible)
export const JOB_TYPES = [
  "daily_digest",
  "calendar_sync",
  "twitter_check",
  "github_notifications",
  "email_summary",
  "task_reminder",
] as const;

// ============================================================
// Public queries
// ============================================================

// List all schedules for the current user
export const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("userSchedules")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();
  },
});

// Get a specific schedule
export const get = authedQuery({
  args: { scheduleId: v.id("userSchedules") },
  handler: async (ctx, { scheduleId }) => {
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule || schedule.userId !== ctx.userId) {
      return null;
    }
    return schedule;
  },
});

// ============================================================
// Public mutations
// ============================================================

// Create a new schedule
export const create = authedMutation({
  args: {
    jobName: v.string(),
    schedule: v.object({
      kind: v.union(v.literal("cron"), v.literal("interval")),
      cronspec: v.optional(v.string()), // e.g., "0 8 * * *"
      intervalMs: v.optional(v.number()),
    }),
    config: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Validate schedule
    if (args.schedule.kind === "cron" && !args.schedule.cronspec) {
      throw new Error("Cron schedule requires cronspec");
    }
    if (args.schedule.kind === "interval" && !args.schedule.intervalMs) {
      throw new Error("Interval schedule requires intervalMs");
    }

    // Check for duplicate job name
    const existing = await ctx.db
      .query("userSchedules")
      .withIndex("by_userId_jobName", (q) =>
        q.eq("userId", ctx.userId).eq("jobName", args.jobName)
      )
      .first();

    if (existing) {
      throw new Error(`Schedule "${args.jobName}" already exists`);
    }

    return await ctx.db.insert("userSchedules", {
      userId: ctx.userId,
      jobName: args.jobName,
      schedule: args.schedule,
      isActive: true,
      config: args.config,
      createdAt: Date.now(),
    });
  },
});

// Update a schedule
export const update = authedMutation({
  args: {
    scheduleId: v.id("userSchedules"),
    schedule: v.optional(
      v.object({
        kind: v.union(v.literal("cron"), v.literal("interval")),
        cronspec: v.optional(v.string()),
        intervalMs: v.optional(v.number()),
      })
    ),
    config: v.optional(v.any()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, { scheduleId, ...updates }) => {
    const existing = await ctx.db.get(scheduleId);
    if (!existing || existing.userId !== ctx.userId) {
      throw new Error("Schedule not found");
    }

    const patch: Record<string, unknown> = {};
    if (updates.schedule !== undefined) {
      patch.schedule = updates.schedule;
    }
    if (updates.config !== undefined) {
      patch.config = updates.config;
    }
    if (updates.isActive !== undefined) {
      patch.isActive = updates.isActive;
    }

    await ctx.db.patch(scheduleId, patch);
  },
});

// Toggle schedule active status
export const toggleActive = authedMutation({
  args: { scheduleId: v.id("userSchedules") },
  handler: async (ctx, { scheduleId }) => {
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule || schedule.userId !== ctx.userId) {
      throw new Error("Schedule not found");
    }

    await ctx.db.patch(scheduleId, { isActive: !schedule.isActive });
  },
});

// Delete a schedule
export const remove = authedMutation({
  args: { scheduleId: v.id("userSchedules") },
  handler: async (ctx, { scheduleId }) => {
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule || schedule.userId !== ctx.userId) {
      throw new Error("Schedule not found");
    }

    await ctx.db.delete(scheduleId);
  },
});

// ============================================================
// Internal functions
// ============================================================

// Get all active schedules (for cron runner)
export const getAllActive = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("userSchedules"),
      userId: v.id("users"),
      jobName: v.string(),
      schedule: v.object({
        kind: v.union(v.literal("cron"), v.literal("interval")),
        cronspec: v.optional(v.string()),
        intervalMs: v.optional(v.number()),
      }),
      config: v.optional(v.any()),
      lastRun: v.optional(v.number()),
    })
  ),
  handler: async (ctx) => {
    const schedules = await ctx.db.query("userSchedules").take(1000);
    return schedules
      .filter((s) => s.isActive)
      .map((s) => ({
        _id: s._id,
        userId: s.userId,
        jobName: s.jobName,
        schedule: s.schedule,
        config: s.config,
        lastRun: s.lastRun,
      }));
  },
});

// Record job run result
export const recordRun = internalMutation({
  args: {
    scheduleId: v.id("userSchedules"),
    result: v.union(
      v.literal("success"),
      v.literal("failure"),
      v.literal("skipped")
    ),
    nextRun: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { scheduleId, result, nextRun }) => {
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule) return null;

    await ctx.db.patch(scheduleId, {
      lastRun: Date.now(),
      lastResult: result,
      nextRun,
    });

    return null;
  },
});
