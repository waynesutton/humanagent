import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { authedQuery } from "../lib/functions";

// ============================================================
// Public queries
// ============================================================

export const list = authedQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("auditLog")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getSecurityEvents = authedQuery({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("auditLog")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(100);

    return events.filter(
      (e) => e.status === "blocked" || e.action === "message_blocked"
    );
  },
});

// ============================================================
// Internal mutations (append-only, no delete/update for status)
// ============================================================

export const create = internalMutation({
  args: {
    userId: v.id("users"),
    action: v.string(),
    resource: v.string(),
    callerType: v.union(
      v.literal("user"),
      v.literal("agent"),
      v.literal("a2a"),
      v.literal("cron"),
      v.literal("webhook")
    ),
    callerIdentity: v.optional(v.string()),
    details: v.optional(v.any()),
    status: v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("blocked"),
      v.literal("in_progress")
    ),
    channel: v.optional(v.string()),
    tokenCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLog", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

// Update is limited to status and tokenCount only
export const updateStatus = internalMutation({
  args: {
    id: v.id("auditLog"),
    status: v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("blocked")
    ),
    tokenCount: v.optional(v.number()),
    details: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return;

    const patch: Record<string, unknown> = { status: args.status };
    if (args.tokenCount !== undefined) patch.tokenCount = args.tokenCount;
    if (args.details !== undefined) {
      patch.details = { ...((existing.details as object) ?? {}), ...(args.details as object) };
    }

    await ctx.db.patch(args.id, patch);
  },
});
