/**
 * Rate Limits Functions
 *
 * Sliding window rate limiting for API calls
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { authedQuery } from "../lib/functions";

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

export const getDashboard = authedQuery({
  args: {},
  returns: v.object({
    activeWindows: v.number(),
    totalRequestsInWindow: v.number(),
    topKeys: v.array(
      v.object({
        key: v.string(),
        count: v.number(),
        resetAt: v.number(),
      })
    ),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const activeCutoff = now - WINDOW_MS;
    const userIdString = String(ctx.userId);

    const userApiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(200);
    const keyPrefixes = new Set(userApiKeys.map((apiKey) => apiKey.keyPrefix));

    const windows = await ctx.db.query("rateLimits").take(1000);
    const scoped = windows.filter((window) => {
      if (window.windowStart < activeCutoff) return false;
      if (window.key.includes(userIdString)) return true;
      for (const prefix of keyPrefixes) {
        if (window.key.includes(prefix)) return true;
      }
      return false;
    });

    const topKeys = scoped
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((entry) => ({
        key: entry.key,
        count: entry.count,
        resetAt: entry.windowStart + WINDOW_MS,
      }));

    return {
      activeWindows: scoped.length,
      totalRequestsInWindow: scoped.reduce((sum, entry) => sum + entry.count, 0),
      topKeys,
    };
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
