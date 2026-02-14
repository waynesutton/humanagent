/**
 * Agent Security Module
 *
 * Database operations for security logging.
 * Pure utility functions are in securityUtils.ts.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Re-export pure functions for convenience
export { scanInput, buildSystemPrompt, type SecurityScanResult } from "./securityUtils";

// Database operations for security logging
export const logSecurityFlag = internalMutation({
  args: {
    userId: v.id("users"),
    source: v.string(),
    flagType: v.union(
      v.literal("injection"),
      v.literal("sensitive"),
      v.literal("exfiltration")
    ),
    severity: v.union(v.literal("warn"), v.literal("block")),
    pattern: v.string(),
    inputSnippet: v.string(),
    action: v.string(),
  },
  returns: v.id("securityFlags"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("securityFlags", {
      userId: args.userId,
      source: args.source,
      flagType: args.flagType,
      severity: args.severity,
      pattern: args.pattern,
      inputSnippet: args.inputSnippet.substring(0, 200),
      action: args.action,
      timestamp: Date.now(),
    });
  },
});

export const getRecentSecurityFlags = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("securityFlags"),
      _creationTime: v.number(),
      userId: v.id("users"),
      source: v.string(),
      flagType: v.union(
        v.literal("injection"),
        v.literal("sensitive"),
        v.literal("exfiltration")
      ),
      severity: v.union(v.literal("warn"), v.literal("block")),
      pattern: v.string(),
      inputSnippet: v.string(),
      action: v.string(),
      timestamp: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("securityFlags")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// Validate that caller has permission for the requested action
export async function validatePermission(
  ctx: { db: { query: (table: string) => { withIndex: (name: string, fn: (q: unknown) => unknown) => { unique: () => Promise<unknown> } } } },
  userId: Id<"users">,
  callerId: string,
  action: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Get permission record for this caller
  const permission = await ctx.db
    .query("permissions")
    .withIndex("by_userId_callerId", (q: unknown) =>
      (q as { eq: (field: string, value: string) => { eq: (field: string, value: string) => unknown } }).eq("userId", userId).eq("callerId", callerId)
    )
    .unique() as { expiresAt?: number; allowedTools: string[]; scope: string } | null;

  // Check wildcard permissions
  if (!permission) {
    const publicPermission = await ctx.db
      .query("permissions")
      .withIndex("by_userId_callerId", (q: unknown) =>
        (q as { eq: (field: string, value: string) => { eq: (field: string, value: string) => unknown } }).eq("userId", userId).eq("callerId", "*")
      )
      .unique() as { expiresAt?: number; allowedTools: string[]; scope: string } | null;

    if (!publicPermission) {
      return { allowed: false, reason: "No permission record found" };
    }

    if (publicPermission.scope !== "public") {
      return { allowed: false, reason: "Public access not enabled" };
    }

    if (
      publicPermission.allowedTools.length > 0 &&
      !publicPermission.allowedTools.includes(action)
    ) {
      return { allowed: false, reason: `Action "${action}" not in allowed list` };
    }

    return { allowed: true };
  }

  // Check if permission has expired
  if (permission.expiresAt && permission.expiresAt < Date.now()) {
    return { allowed: false, reason: "Permission expired" };
  }

  // Check if action is in allowed list
  if (
    permission.allowedTools.length > 0 &&
    !permission.allowedTools.includes(action) &&
    !permission.allowedTools.includes("*")
  ) {
    return { allowed: false, reason: `Action "${action}" not permitted` };
  }

  return { allowed: true };
}
