import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { authedQuery, authedMutation } from "../lib/functions";

// ============================================================
// Public queries
// ============================================================

export const list = authedQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    // Never return the hash
    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      rateLimitPerMinute: k.rateLimitPerMinute,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      isActive: k.isActive,
      createdAt: k.createdAt,
    }));
  },
});

// ============================================================
// Mutations
// ============================================================

export const create = authedMutation({
  args: {
    name: v.string(),
    scopes: v.array(v.string()),
    rateLimitPerMinute: v.optional(v.number()),
    expiresInDays: v.optional(v.number()),
  },
  returns: v.object({ key: v.string(), prefix: v.string() }),
  handler: async (ctx, args) => {
    // Generate a random API key
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    const rawKey = `hag_sk_${Array.from(keyBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;

    // Hash it for storage
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(rawKey)
    );
    const keyHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const keyPrefix = rawKey.slice(0, 12);

    await ctx.db.insert("apiKeys", {
      userId: ctx.userId,
      name: args.name,
      keyHash,
      keyPrefix,
      scopes: args.scopes,
      rateLimitPerMinute: args.rateLimitPerMinute ?? 60,
      isActive: true,
      expiresAt: args.expiresInDays
        ? Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000
        : undefined,
      createdAt: Date.now(),
    });

    // Return the raw key ONCE. It's never stored or retrievable again.
    return { key: rawKey, prefix: keyPrefix };
  },
});

export const revoke = authedMutation({
  args: { keyId: v.id("apiKeys") },
  returns: v.null(),
  handler: async (ctx, { keyId }) => {
    const key = await ctx.db.get(keyId);
    if (!key || key.userId !== ctx.userId) throw new Error("Key not found");

    await ctx.db.patch(keyId, { isActive: false });
    return null;
  },
});

// ============================================================
// Internal
// ============================================================

export const validateToken = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { tokenHash }) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", tokenHash))
      .unique();

    if (!key) return null;
    if (!key.isActive) return null;
    if (key.expiresAt && key.expiresAt < Date.now()) return null;

    return key;
  },
});
