import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { authedQuery } from "../lib/functions";

// ============================================================
// Public queries
// ============================================================

export const getFlags = authedQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("securityFlags")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ============================================================
// Internal mutations
// ============================================================

export const logFlag = internalMutation({
  args: {
    userId: v.id("users"),
    source: v.string(),
    flags: v.array(
      v.object({
        type: v.union(
          v.literal("injection"),
          v.literal("sensitive"),
          v.literal("exfiltration")
        ),
        pattern: v.string(),
        severity: v.union(v.literal("warn"), v.literal("block")),
      })
    ),
    inputSnippet: v.string(),
  },
  handler: async (ctx, args) => {
    for (const flag of args.flags) {
      await ctx.db.insert("securityFlags", {
        userId: args.userId,
        source: args.source,
        flagType: flag.type,
        severity: flag.severity,
        pattern: flag.pattern,
        inputSnippet: args.inputSnippet,
        action:
          flag.severity === "block" ? "blocked" : "allowed_with_warning",
        timestamp: Date.now(),
      });
    }
  },
});
