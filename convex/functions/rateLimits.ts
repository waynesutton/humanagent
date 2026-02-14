/**
 * Rate Limits Functions
 *
 * Sliding window rate limiting for API calls
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// Window duration in milliseconds (1 minute)
const WINDOW_MS = 60 * 1000;

// ============================================================
// Internal functions
// ============================================================

// Check if a request is allowed (and increment counter if so)
export const checkAndIncrement = internalMutation({
  args: {
    key: v.string(), // e.g., "user:{userId}:api" or "key:{keyPrefix}:mcp"
    limit: v.number(),
  },
  returns: v.object({
    allowed: v.boolean(),
    remaining: v.number(),
    resetAt: v.number(),
  }),
  handler: async (ctx, { key, limit }) => {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    // Get current window record
    const record = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    // If no record or window expired, create new window
    if (!record || record.windowStart < windowStart) {
      if (record) {
        await ctx.db.delete(record._id);
      }

      await ctx.db.insert("rateLimits", {
        key,
        windowStart: now,
        count: 1,
      });

      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: now + WINDOW_MS,
      };
    }

    // Check if limit exceeded
    if (record.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: record.windowStart + WINDOW_MS,
      };
    }

    // Increment counter
    await ctx.db.patch(record._id, { count: record.count + 1 });

    return {
      allowed: true,
      remaining: limit - record.count - 1,
      resetAt: record.windowStart + WINDOW_MS,
    };
  },
});

// Get current rate limit status without incrementing
export const getStatus = internalQuery({
  args: { key: v.string() },
  returns: v.union(
    v.object({
      count: v.number(),
      windowStart: v.number(),
      resetAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, { key }) => {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    const record = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (!record || record.windowStart < windowStart) {
      return null;
    }

    return {
      count: record.count,
      windowStart: record.windowStart,
      resetAt: record.windowStart + WINDOW_MS,
    };
  },
});

// Reset rate limit for a key
export const reset = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    const record = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (record) {
      await ctx.db.delete(record._id);
    }

    return null;
  },
});

// Build rate limit key for different contexts
export function buildRateLimitKey(
  type: "user" | "apiKey" | "agent",
  id: string,
  endpoint: string
): string {
  return `${type}:${id}:${endpoint}`;
}
