import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
import { authedMutation, authedQuery } from "../lib/functions";

// Service types for validation
const serviceValidator = v.union(
  // LLM providers
  v.literal("openrouter"),
  v.literal("anthropic"),
  v.literal("openai"),
  v.literal("deepseek"),
  v.literal("google"),
  v.literal("mistral"),
  v.literal("minimax"),
  v.literal("kimi"),
  v.literal("xai"), // xAI API for Grok models with real-time X data
  // Integrations
  v.literal("agentmail"),
  v.literal("twilio"),
  v.literal("elevenlabs"),
  v.literal("resend"),
  v.literal("github"),
  v.literal("twitter"), // X/Twitter API direct access
  v.literal("linkedin"),
  v.literal("slack"),
  v.literal("google_calendar"),
  v.literal("cloudflare"),
  // Browser automation (BYOK)
  v.literal("firecrawl"),
  v.literal("browserbase"),
  v.literal("custom")
);

// LLM providers that support BYOK
const LLM_PROVIDERS = [
  "openrouter",
  "anthropic",
  "openai",
  "deepseek",
  "google",
  "mistral",
  "minimax",
  "kimi",
  "xai",
] as const;

// ============================================================
// Public queries
// ============================================================

// List all credentials for the current user (masked)
export const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    const creds = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    // Return masked data (never return actual keys)
    return creds.map((c) => ({
      _id: c._id,
      service: c.service,
      hasApiKey: !!c.encryptedApiKey,
      hasAccessToken: !!c.encryptedAccessToken,
      config: c.config,
      scopes: c.scopes,
      isActive: c.isActive,
      lastUsedAt: c.lastUsedAt,
      createdAt: c.createdAt,
    }));
  },
});

// Check if a specific service has credentials configured
export const hasCredential = authedQuery({
  args: { service: serviceValidator },
  handler: async (ctx, { service }) => {
    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", ctx.userId).eq("service", service)
      )
      .first();

    return {
      exists: !!cred,
      isActive: cred?.isActive ?? false,
      hasApiKey: !!cred?.encryptedApiKey,
      hasAccessToken: !!cred?.encryptedAccessToken,
      lastUsedAt: cred?.lastUsedAt,
    };
  },
});

// Get credential status for all LLM providers and integrations
export const getLLMProviderStatus = authedQuery({
  args: {},
  handler: async (ctx) => {
    const creds = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    // Build status map for LLM providers and key integrations
    const status: Record<
      string,
      { configured: boolean; isActive: boolean; lastUsedAt?: number }
    > = {};

    // LLM providers
    for (const provider of LLM_PROVIDERS) {
      const cred = creds.find((c) => c.service === provider);
      status[provider] = {
        configured: !!cred?.encryptedApiKey,
        isActive: cred?.isActive ?? false,
        lastUsedAt: cred?.lastUsedAt,
      };
    }

    // Key integrations (AgentMail, Twilio, ElevenLabs, Resend)
    const integrations = ["agentmail", "twilio", "elevenlabs", "resend"] as const;
    for (const integration of integrations) {
      const cred = creds.find((c) => c.service === integration);
      status[integration] = {
        configured: !!cred?.encryptedApiKey,
        isActive: cred?.isActive ?? false,
        lastUsedAt: cred?.lastUsedAt,
      };
    }

    // Browser automation services (Firecrawl, Browserbase for Stagehand/BrowserUse)
    const browserServices = ["firecrawl", "browserbase"] as const;
    for (const service of browserServices) {
      const cred = creds.find((c) => c.service === service);
      status[service] = {
        configured: !!cred?.encryptedApiKey,
        isActive: cred?.isActive ?? false,
        lastUsedAt: cred?.lastUsedAt,
      };
    }

    // X/Twitter integration (xAI for Grok, twitter for direct X API)
    const xServices = ["xai", "twitter"] as const;
    for (const service of xServices) {
      const cred = creds.find((c) => c.service === service);
      status[service] = {
        configured: !!cred?.encryptedApiKey,
        isActive: cred?.isActive ?? false,
        lastUsedAt: cred?.lastUsedAt,
      };
    }

    return status;
  },
});

// ============================================================
// Public mutations
// ============================================================

// Save or update a credential (API key based)
export const saveApiKey = authedMutation({
  args: {
    service: serviceValidator,
    apiKey: v.string(),
    config: v.optional(
      v.object({
        baseUrl: v.optional(v.string()),
        organizationId: v.optional(v.string()),
        projectId: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // In production, encrypt the API key before storing
    // For now, we store as-is (should use crypto in production)
    const encryptedApiKey = encryptApiKey(args.apiKey);

    const existing = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", ctx.userId).eq("service", args.service)
      )
      .first();

    const now = Date.now();

    if (existing) {
      // Update existing credential
      await ctx.db.patch(existing._id, {
        encryptedApiKey,
        config: args.config,
        isActive: true,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new credential
    return await ctx.db.insert("userCredentials", {
      userId: ctx.userId,
      service: args.service,
      encryptedApiKey,
      config: args.config,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Delete a credential
export const remove = authedMutation({
  args: { service: serviceValidator },
  handler: async (ctx, { service }) => {
    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", ctx.userId).eq("service", service)
      )
      .first();

    if (!cred) {
      throw new Error("Credential not found");
    }

    await ctx.db.delete(cred._id);
  },
});

// Toggle credential active state
export const toggleActive = authedMutation({
  args: {
    service: serviceValidator,
    isActive: v.boolean(),
  },
  handler: async (ctx, { service, isActive }) => {
    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", ctx.userId).eq("service", service)
      )
      .first();

    if (!cred) {
      throw new Error("Credential not found");
    }

    await ctx.db.patch(cred._id, { isActive, updatedAt: Date.now() });
  },
});

// ============================================================
// Internal functions (used by agent runtime)
// ============================================================

// Get decrypted API key for a service (internal only)
export const getDecryptedApiKey = internalQuery({
  args: {
    userId: v.id("users"),
    service: serviceValidator,
  },
  handler: async (ctx, { userId, service }) => {
    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", userId).eq("service", service)
      )
      .first();

    if (!cred || !cred.isActive || !cred.encryptedApiKey) {
      return null;
    }

    // In production, decrypt the API key
    return {
      apiKey: decryptApiKey(cred.encryptedApiKey),
      config: cred.config,
    };
  },
});

// Mark credential as recently used
export const markUsed = internalMutation({
  args: {
    userId: v.id("users"),
    service: serviceValidator,
  },
  handler: async (ctx, { userId, service }) => {
    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", userId).eq("service", service)
      )
      .first();

    if (cred) {
      await ctx.db.patch(cred._id, { lastUsedAt: Date.now() });
    }
  },
});

// Get active LLM credential for a user (checks user's provider preference)
export const getActiveLLMCredential = internalQuery({
  args: {
    userId: v.id("users"),
    preferredProvider: v.optional(
      v.union(
        v.literal("openrouter"),
        v.literal("anthropic"),
        v.literal("openai"),
        v.literal("deepseek"),
        v.literal("google"),
        v.literal("mistral"),
        v.literal("minimax"),
        v.literal("kimi"),
        v.literal("xai"),
        v.literal("custom")
      )
    ),
  },
  handler: async (ctx, { userId, preferredProvider }) => {
    // If preferred provider specified, try that first
    if (preferredProvider && preferredProvider !== "custom") {
      const cred = await ctx.db
        .query("userCredentials")
        .withIndex("by_userId_service", (q) =>
          q.eq("userId", userId).eq("service", preferredProvider)
        )
        .first();

      if (cred?.isActive && cred.encryptedApiKey) {
        return {
          provider: preferredProvider,
          apiKey: decryptApiKey(cred.encryptedApiKey),
          config: cred.config,
        };
      }
    }

    // Fall back to OpenRouter if user has it configured
    const openrouterCred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", userId).eq("service", "openrouter")
      )
      .first();

    if (openrouterCred?.isActive && openrouterCred.encryptedApiKey) {
      return {
        provider: "openrouter" as const,
        apiKey: decryptApiKey(openrouterCred.encryptedApiKey),
        config: openrouterCred.config,
      };
    }

    // No credentials found, will use platform default
    return null;
  },
});

// ============================================================
// Encryption helpers (simplified, use proper encryption in production)
// ============================================================

// In production, use AES-256-GCM with a key from env vars
// This is a placeholder implementation using btoa/atob for V8 runtime compatibility
function encryptApiKey(apiKey: string): string {
  // In production: encrypt with AES-256-GCM
  // For now, we use base64 encoding (NOT SECURE - replace in production)
  return btoa(apiKey);
}

function decryptApiKey(encrypted: string): string {
  // In production: decrypt with AES-256-GCM
  // For now, we use base64 decoding (NOT SECURE - replace in production)
  return atob(encrypted);
}
