/**
 * LLM Provider Failover System
 *
 * Centralized candidate resolution and execution with retry/failover logic.
 * Runs in V8 (not Node.js) so it can be used by the agent runtime.
 */
import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

// LLM providers that support BYOK and failover
export const LLM_PROVIDERS = [
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

export type LLMProvider = (typeof LLM_PROVIDERS)[number];

// Error categories for failover decisions
export type ErrorCategory =
  | "invalid_key"
  | "rate_limit"
  | "timeout"
  | "server_error"
  | "bad_request"
  | "network_error";

// Candidate returned by the resolver
export interface LLMCandidate {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  source: "db" | "env";
}

// Result of an LLM call attempt
export interface LLMAttemptResult {
  success: boolean;
  content?: string;
  tokensUsed?: number;
  error?: string;
  errorCategory?: ErrorCategory;
  httpStatus?: number;
  durationMs: number;
  provider: LLMProvider;
}

// Circuit breaker configuration
const BREAKER_FAILURE_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Simple base64 decode
function decodeApiKey(encoded: string): string {
  try {
    return atob(encoded);
  } catch {
    return encoded;
  }
}

// Default base URLs for providers
export function getDefaultBaseUrl(provider: LLMProvider): string {
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

// Default fallback models per provider
export const PROVIDER_DEFAULT_MODELS: Record<LLMProvider, string> = {
  openrouter: "anthropic/claude-sonnet-4",
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  deepseek: "deepseek-chat",
  google: "gemini-2.0-flash",
  mistral: "mistral-large-latest",
  minimax: "abab6.5s-chat",
  kimi: "kimi-k2-0711-preview",
  xai: "grok-2-1212",
};

/**
 * Resolve ordered LLM candidates for failover.
 * Priority: configured provider > other active DB credentials > env providers
 */
export const resolveLLMCandidates = internalQuery({
  args: {
    userId: v.id("users"),
    preferredProvider: v.optional(v.string()),
    preferredModel: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      provider: v.string(),
      apiKey: v.string(),
      baseUrl: v.optional(v.string()),
      model: v.string(),
      source: v.union(v.literal("db"), v.literal("env")),
    })
  ),
  handler: async (ctx, args) => {
    const candidates: LLMCandidate[] = [];
    const seenProviders = new Set<string>();

    // Get all active LLM credentials for this user
    const allCredentials = await ctx.db
      .query("userCredentials")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const llmCredentials = allCredentials.filter(
      (c) =>
        c.isActive &&
        c.encryptedApiKey &&
        LLM_PROVIDERS.includes(c.service as LLMProvider)
    );

    // Get circuit breaker states for all providers
    const healthRecords = await ctx.db
      .query("llmProviderHealth")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const healthByProvider: Map<string, typeof healthRecords[number]> = new Map(
      healthRecords.map((h) => [h.provider, h])
    );

    const now = Date.now();

    // Helper to check if provider breaker is open
    const isBreakerOpen = (provider: string): boolean => {
      const health = healthByProvider.get(provider);
      if (!health) return false;
      if (!health.breakerOpen) return false;
      if (health.breakerOpenUntil && health.breakerOpenUntil < now) {
        return false; // Breaker cooldown expired
      }
      return true;
    };

    // 1. Add preferred provider first if available and breaker not open
    if (args.preferredProvider && LLM_PROVIDERS.includes(args.preferredProvider as LLMProvider)) {
      const preferredCred = llmCredentials.find(
        (c) => c.service === args.preferredProvider
      );
      if (preferredCred && !isBreakerOpen(args.preferredProvider)) {
        const provider = args.preferredProvider as LLMProvider;
        candidates.push({
          provider,
          apiKey: decodeApiKey(preferredCred.encryptedApiKey!),
          baseUrl: preferredCred.config?.baseUrl,
          model: args.preferredModel || PROVIDER_DEFAULT_MODELS[provider],
          source: "db",
        });
        seenProviders.add(provider);
      }
    }

    // 2. Add other active DB credentials (skip if breaker open)
    for (const cred of llmCredentials) {
      const provider = cred.service as LLMProvider;
      if (seenProviders.has(provider)) continue;
      if (isBreakerOpen(provider)) continue;

      candidates.push({
        provider,
        apiKey: decodeApiKey(cred.encryptedApiKey!),
        baseUrl: cred.config?.baseUrl,
        model: PROVIDER_DEFAULT_MODELS[provider],
        source: "db",
      });
      seenProviders.add(provider);
    }

    // 3. Env providers are not added here; they should be managed explicitly
    // by the platform if needed. DB BYOK has full priority.

    return candidates;
  },
});

/**
 * Get provider health status for circuit breaker decisions.
 */
export const getProviderHealth = internalQuery({
  args: {
    userId: v.id("users"),
    provider: v.string(),
  },
  returns: v.union(
    v.object({
      consecutiveFailures: v.number(),
      breakerOpen: v.boolean(),
      breakerOpenUntil: v.optional(v.number()),
      lastErrorCategory: v.optional(v.string()),
      lastErrorMessage: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const health = await ctx.db
      .query("llmProviderHealth")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider as never)
      )
      .unique();

    if (!health) return null;

    return {
      consecutiveFailures: health.consecutiveFailures,
      breakerOpen: health.breakerOpen,
      breakerOpenUntil: health.breakerOpenUntil,
      lastErrorCategory: health.lastErrorCategory,
      lastErrorMessage: health.lastErrorMessage,
    };
  },
});

/**
 * Record a successful LLM call. Resets circuit breaker.
 */
export const recordSuccess = internalMutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("llmProviderHealth")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider as never)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        consecutiveFailures: 0,
        breakerOpen: false,
        breakerOpenUntil: undefined,
        lastAttemptAt: now,
        lastSuccessAt: now,
        totalAttempts: existing.totalAttempts + 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("llmProviderHealth", {
        userId: args.userId,
        provider: args.provider as never,
        consecutiveFailures: 0,
        breakerOpen: false,
        lastAttemptAt: now,
        lastSuccessAt: now,
        totalAttempts: 1,
        totalFailures: 0,
        updatedAt: now,
      });
    }

    return null;
  },
});

/**
 * Record a failed LLM call. May open circuit breaker.
 */
export const recordFailure = internalMutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    errorCategory: v.union(
      v.literal("invalid_key"),
      v.literal("rate_limit"),
      v.literal("timeout"),
      v.literal("server_error"),
      v.literal("bad_request"),
      v.literal("network_error")
    ),
    errorMessage: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("llmProviderHealth")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider as never)
      )
      .unique();

    const newConsecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;
    const shouldOpenBreaker = newConsecutiveFailures >= BREAKER_FAILURE_THRESHOLD;

    if (existing) {
      await ctx.db.patch(existing._id, {
        consecutiveFailures: newConsecutiveFailures,
        breakerOpen: shouldOpenBreaker,
        breakerOpenUntil: shouldOpenBreaker ? now + BREAKER_COOLDOWN_MS : undefined,
        lastAttemptAt: now,
        lastErrorAt: now,
        lastErrorCategory: args.errorCategory,
        lastErrorMessage: args.errorMessage?.slice(0, 500),
        lastHttpStatus: args.httpStatus,
        totalAttempts: existing.totalAttempts + 1,
        totalFailures: existing.totalFailures + 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("llmProviderHealth", {
        userId: args.userId,
        provider: args.provider as never,
        consecutiveFailures: newConsecutiveFailures,
        breakerOpen: shouldOpenBreaker,
        breakerOpenUntil: shouldOpenBreaker ? now + BREAKER_COOLDOWN_MS : undefined,
        lastAttemptAt: now,
        lastErrorAt: now,
        lastErrorCategory: args.errorCategory,
        lastErrorMessage: args.errorMessage?.slice(0, 500),
        lastHttpStatus: args.httpStatus,
        totalAttempts: 1,
        totalFailures: 1,
        updatedAt: now,
      });
    }

    return null;
  },
});

/**
 * Classify an error from an LLM API response.
 */
export function classifyError(
  status: number | undefined,
  errorText: string
): ErrorCategory {
  const lowerError = errorText.toLowerCase();

  // Auth errors (401, 403)
  if (status === 401 || status === 403) {
    return "invalid_key";
  }
  if (lowerError.includes("invalid api key") || lowerError.includes("unauthorized")) {
    return "invalid_key";
  }

  // Rate limit (429)
  if (status === 429) {
    return "rate_limit";
  }
  if (lowerError.includes("rate limit") || lowerError.includes("too many requests")) {
    return "rate_limit";
  }

  // Timeout
  if (lowerError.includes("timeout") || lowerError.includes("timed out")) {
    return "timeout";
  }

  // Server errors (5xx)
  if (status && status >= 500 && status < 600) {
    return "server_error";
  }
  if (lowerError.includes("internal server error") || lowerError.includes("service unavailable")) {
    return "server_error";
  }

  // Network errors
  if (
    lowerError.includes("network") ||
    lowerError.includes("fetch failed") ||
    lowerError.includes("econnrefused") ||
    lowerError.includes("enotfound")
  ) {
    return "network_error";
  }

  // Bad request (4xx other than 401/403/429)
  if (status && status >= 400 && status < 500) {
    return "bad_request";
  }

  // Default to bad request for unclassified errors
  return "bad_request";
}

/**
 * Check if an error category should trigger failover to next provider.
 */
export function isRetryableError(category: ErrorCategory): boolean {
  switch (category) {
    case "invalid_key":
    case "rate_limit":
    case "timeout":
    case "server_error":
    case "network_error":
      return true;
    case "bad_request":
      // Bad requests are usually input errors, don't failover
      return false;
  }
}

/**
 * Get all provider health records for a user (for admin visibility).
 */
export const getAllProviderHealth = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.array(
    v.object({
      provider: v.string(),
      consecutiveFailures: v.number(),
      breakerOpen: v.boolean(),
      breakerOpenUntil: v.optional(v.number()),
      lastAttemptAt: v.optional(v.number()),
      lastSuccessAt: v.optional(v.number()),
      lastErrorAt: v.optional(v.number()),
      lastErrorCategory: v.optional(v.string()),
      lastErrorMessage: v.optional(v.string()),
      totalAttempts: v.number(),
      totalFailures: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("llmProviderHealth")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    return records.map((r) => ({
      provider: r.provider,
      consecutiveFailures: r.consecutiveFailures,
      breakerOpen: r.breakerOpen,
      breakerOpenUntil: r.breakerOpenUntil,
      lastAttemptAt: r.lastAttemptAt,
      lastSuccessAt: r.lastSuccessAt,
      lastErrorAt: r.lastErrorAt,
      lastErrorCategory: r.lastErrorCategory,
      lastErrorMessage: r.lastErrorMessage,
      totalAttempts: r.totalAttempts,
      totalFailures: r.totalFailures,
    }));
  },
});

/**
 * Reset circuit breaker for a specific provider (manual admin action).
 */
export const resetProviderHealth = internalMutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("llmProviderHealth")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider as never)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        consecutiveFailures: 0,
        breakerOpen: false,
        breakerOpenUntil: undefined,
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});
