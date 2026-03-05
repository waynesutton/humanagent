import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { authedQuery } from "../lib/functions";

/**
 * Check if Composio is configured and active for a user
 */
export const getComposioStatus = authedQuery({
  args: {},
  handler: async (ctx) => {
    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", ctx.userId).eq("service", "composio")
      )
      .first();

    return {
      configured: !!cred?.encryptedApiKey,
      isActive: cred?.isActive ?? false,
      lastUsedAt: cred?.lastUsedAt,
    };
  },
});

/**
 * Internal query to get Composio API key for agent runtime
 */
export const getComposioCredential = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", userId).eq("service", "composio")
      )
      .first();

    if (!cred || !cred.isActive || !cred.encryptedApiKey) {
      return null;
    }

    return {
      apiKey: atob(cred.encryptedApiKey),
      config: cred.config,
    };
  },
});
