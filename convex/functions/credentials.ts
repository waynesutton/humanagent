import { v } from "convex/values";
import { action, internalQuery, internalMutation } from "../_generated/server";
import { authedMutation, authedQuery } from "../lib/functions";
import { api, internal } from "../_generated/api";

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
  v.literal("telnyx"),
  v.literal("plivo"),
  v.literal("vapi"),
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

const providerValidator = v.union(
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
);

const modelOptionValidator = v.object({
  id: v.string(),
  label: v.string(),
});

const modelCatalogResultValidator = v.object({
  provider: providerValidator,
  models: v.array(modelOptionValidator),
  source: v.union(v.literal("live"), v.literal("fallback"), v.literal("empty")),
  fetchedAt: v.number(),
  hasCredential: v.boolean(),
  error: v.optional(v.string()),
});

const PROVIDER_MODEL_FALLBACKS: Record<
  (typeof LLM_PROVIDERS)[number],
  Array<{ id: string; label: string }>
> = {
  openrouter: [
    { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
    { id: "openai/gpt-4o", label: "GPT-4o" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
  ],
  openai: [
    { id: "gpt-5.2", label: "GPT-5.2" },
    { id: "gpt-5-mini", label: "GPT-5 mini" },
    { id: "gpt-5-nano", label: "GPT-5 nano" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek Chat" },
    { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
  google: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large" },
    { id: "ministral-8b-latest", label: "Ministral 8B" },
  ],
  minimax: [{ id: "abab6.5s-chat", label: "MiniMax ABAB 6.5S" }],
  kimi: [{ id: "kimi-k2-0711-preview", label: "Kimi K2" }],
  xai: [
    { id: "grok-2-1212", label: "Grok 2" },
    { id: "grok-beta", label: "Grok Beta" },
  ],
};

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

    // Key integrations (email, telephony, and voice orchestration)
    const integrations = [
      "agentmail",
      "twilio",
      "telnyx",
      "plivo",
      "vapi",
      "elevenlabs",
      "resend",
    ] as const;
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

export const getModelCatalog = authedQuery({
  args: { provider: providerValidator },
  returns: modelCatalogResultValidator,
  handler: async (ctx, { provider }) => {
    if (provider === "custom") {
      return {
        provider,
        models: [],
        source: "empty" as const,
        fetchedAt: Date.now(),
        hasCredential: false,
      };
    }
    const cred = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId_service", (q) =>
        q.eq("userId", ctx.userId).eq("service", provider)
      )
      .first();

    return {
      provider,
      models: cred?.encryptedApiKey
        ? PROVIDER_MODEL_FALLBACKS[provider]
        : [],
      source: cred?.encryptedApiKey ? ("fallback" as const) : ("empty" as const),
      fetchedAt: Date.now(),
      hasCredential: !!cred?.encryptedApiKey,
    };
  },
});

export const refreshModelCatalog = action({
  args: { provider: providerValidator },
  returns: modelCatalogResultValidator,
  handler: async (ctx, { provider }) => {
    if (provider === "custom") {
      return {
        provider,
        models: [],
        source: "empty" as const,
        fetchedAt: Date.now(),
        hasCredential: false,
      };
    }

    const viewer = await ctx.runQuery(api.functions.users.viewer, {});
    if (!viewer) throw new Error("Not authenticated");

    const credential = await ctx.runQuery(internal.functions.credentials.getDecryptedApiKey, {
      userId: viewer._id,
      service: provider,
    });

    if (!credential?.apiKey) {
      return {
        provider,
        models: [],
        source: "empty" as const,
        fetchedAt: Date.now(),
        hasCredential: false,
      };
    }

    const fetchedAt = Date.now();
    try {
      const models = await fetchProviderModels(
        provider,
        credential.apiKey,
        credential.config?.baseUrl
      );
      if (models.length === 0) {
        return {
          provider,
          models: PROVIDER_MODEL_FALLBACKS[provider],
          source: "fallback" as const,
          fetchedAt,
          hasCredential: true,
        };
      }
      return {
        provider,
        models,
        source: "live" as const,
        fetchedAt,
        hasCredential: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load models";
      return {
        provider,
        models: PROVIDER_MODEL_FALLBACKS[provider],
        source: "fallback" as const,
        fetchedAt,
        hasCredential: true,
        error: message,
      };
    }
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

function normalizeModelOptions(
  rawModels: Array<{ id?: string; name?: string }>
): Array<{ id: string; label: string }> {
  const deduped = new Map<string, { id: string; label: string }>();
  for (const model of rawModels) {
    if (!model.id) continue;
    deduped.set(model.id, {
      id: model.id,
      label: model.name?.trim() ? model.name : model.id,
    });
  }
  return Array.from(deduped.values()).sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchProviderModels(
  provider: (typeof LLM_PROVIDERS)[number],
  apiKey: string,
  baseUrl?: string
): Promise<Array<{ id: string; label: string }>> {
  if (provider === "google") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`
    );
    if (!response.ok) throw new Error(`Google AI model fetch failed: ${response.status}`);
    const payload = (await response.json()) as {
      models?: Array<{ name?: string; displayName?: string }>;
    };
    const raw = (payload.models ?? []).map((m) => ({
      id: m.name?.replace("models/", ""),
      name: m.displayName,
    }));
    return normalizeModelOptions(raw);
  }

  const resolvedBaseUrl = (baseUrl?.trim() || getDefaultBaseUrl(provider)).replace(/\/$/, "");
  const response = await fetch(`${resolvedBaseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(provider === "anthropic" ? { "anthropic-version": "2023-06-01" } : {}),
    },
  });
  if (!response.ok) throw new Error(`${provider} model fetch failed: ${response.status}`);
  const payload = (await response.json()) as {
    data?: Array<{ id?: string; name?: string }>;
    models?: Array<{ id?: string; name?: string }>;
  };
  const raw = payload.data ?? payload.models ?? [];
  return normalizeModelOptions(raw);
}

function getDefaultBaseUrl(provider: (typeof LLM_PROVIDERS)[number]): string {
  switch (provider) {
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "openai":
      return "https://api.openai.com/v1";
    case "deepseek":
      return "https://api.deepseek.com/v1";
    case "google":
      return "https://generativelanguage.googleapis.com/v1beta";
    case "mistral":
      return "https://api.mistral.ai/v1";
    case "minimax":
      return "https://api.minimax.chat/v1";
    case "kimi":
      return "https://api.moonshot.ai/v1";
    case "xai":
      return "https://api.x.ai/v1";
  }
}
