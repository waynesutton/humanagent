"use node";

/**
 * Browser Use Cloud Integration - Actions
 *
 * Handles API calls to Browser Use Cloud for stateful browser automation.
 * Profiles persist login state across sessions for sites like Slack, GitHub, etc.
 *
 * Docs: https://docs.cloud.browser-use.com/guides/sessions
 *
 * NOTE: Queries and mutations are in browserProfilesQueries.ts (V8 runtime).
 * This file only contains actions (Node.js runtime).
 */
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

const BROWSER_USE_API_BASE = "https://api.cloud.browser-use.com/v1";

// ============================================================
// Actions (Browser Use Cloud API calls)
// ============================================================

type BrowserUseCredential = { apiKey: string } | null;

/**
 * Create a profile in Browser Use Cloud
 */
export const createCloudProfile = action({
  args: {
    name: v.string(),
    agentId: v.optional(v.id("agents")),
  },
  returns: v.object({
    success: v.boolean(),
    profileId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; profileId?: string; error?: string }> => {
    const credential: BrowserUseCredential = await ctx.runQuery(internal.functions.browserProfilesQueries.getCredential, {});
    if (!credential) {
      return { success: false, error: "Browser Use API key not configured" };
    }

    try {
      const response = await fetch(`${BROWSER_USE_API_BASE}/profiles`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: args.name,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Browser Use API error: ${error}` };
      }

      const data = await response.json() as { id?: string; profile_id?: string };
      const profileId = data.id || data.profile_id;

      if (!profileId) {
        return { success: false, error: "No profile ID returned" };
      }

      // Create local record
      await ctx.runMutation(internal.functions.browserProfilesQueries.createInternal, {
        browserUseProfileId: profileId,
        name: args.name,
        agentId: args.agentId,
      });

      return { success: true, profileId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Create a browser session with optional profile
 */
export const createSession = action({
  args: {
    agentId: v.id("agents"),
    profileId: v.optional(v.string()), // Browser Use profile ID
    taskId: v.optional(v.id("tasks")),
    proxyCountry: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    sessionId: v.optional(v.string()),
    liveUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; sessionId?: string; liveUrl?: string; error?: string }> => {
    const credential: BrowserUseCredential = await ctx.runQuery(internal.functions.browserProfilesQueries.getCredential, {});
    if (!credential) {
      return { success: false, error: "Browser Use API key not configured" };
    }

    try {
      const requestBody: Record<string, unknown> = {};
      if (args.profileId) {
        requestBody.profile_id = args.profileId;
      }
      if (args.proxyCountry) {
        requestBody.proxy_country_code = args.proxyCountry;
      }

      const response = await fetch(`${BROWSER_USE_API_BASE}/sessions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Browser Use API error: ${error}` };
      }

      const data = await response.json() as {
        id?: string;
        session_id?: string;
        live_url?: string;
        share_url?: string;
      };
      const sessionId = data.id || data.session_id;
      const liveUrl = data.live_url;

      if (!sessionId) {
        return { success: false, error: "No session ID returned" };
      }

      // Create local session record
      await ctx.runMutation(internal.functions.browserProfilesQueries.createSessionInternal, {
        agentId: args.agentId,
        taskId: args.taskId,
        browserUseSessionId: sessionId,
        browserUseProfileId: args.profileId,
        liveUrl,
        shareUrl: data.share_url,
        proxyCountry: args.proxyCountry,
      });

      return { success: true, sessionId, liveUrl };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Run a task in a browser session
 */
export const runTask = action({
  args: {
    sessionId: v.string(),
    task: v.string(),
    maxSteps: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; result?: unknown; error?: string }> => {
    const credential: BrowserUseCredential = await ctx.runQuery(internal.functions.browserProfilesQueries.getCredential, {});
    if (!credential) {
      return { success: false, error: "Browser Use API key not configured" };
    }

    try {
      const response = await fetch(`${BROWSER_USE_API_BASE}/run`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: args.sessionId,
          task: args.task,
          max_steps: args.maxSteps || 10,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Browser Use API error: ${error}` };
      }

      const result = await response.json();
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Stop a browser session
 */
export const stopSession = action({
  args: {
    sessionId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const credential: BrowserUseCredential = await ctx.runQuery(internal.functions.browserProfilesQueries.getCredential, {});
    if (!credential) {
      return { success: false, error: "Browser Use API key not configured" };
    }

    try {
      const response = await fetch(`${BROWSER_USE_API_BASE}/sessions/${args.sessionId}/stop`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credential.apiKey}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Browser Use API error: ${error}` };
      }

      // Update local session record
      await ctx.runMutation(internal.functions.browserProfilesQueries.updateSessionStatus, {
        browserUseSessionId: args.sessionId,
        status: "completed",
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============================================================
// Internal Actions (for agent runtime)
// ============================================================

/**
 * Start a browser session from the agent runtime
 */
export const startBrowserSessionFromAgent = internalAction({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    url: v.string(),
    profileId: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
  },
  returns: v.object({
    success: v.boolean(),
    sessionId: v.optional(v.string()),
    liveUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; sessionId?: string; liveUrl?: string; error?: string }> => {
    const credential: BrowserUseCredential = await ctx.runQuery(
      internal.functions.browserProfilesQueries.getCredentialByUserId,
      { userId: args.userId }
    );
    if (!credential) {
      return { success: false, error: "Browser Use API key not configured" };
    }

    if (!args.agentId) {
      return { success: false, error: "Agent ID required for browser sessions" };
    }

    try {
      const requestBody: Record<string, unknown> = {
        url: args.url,
      };
      if (args.profileId) {
        requestBody.profile_id = args.profileId;
      }

      const response = await fetch(`${BROWSER_USE_API_BASE}/sessions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Browser Use API error: ${error}` };
      }

      const data = await response.json() as {
        id?: string;
        session_id?: string;
        live_url?: string;
        share_url?: string;
      };
      const sessionId = data.id || data.session_id;
      const liveUrl = data.live_url;

      if (!sessionId) {
        return { success: false, error: "No session ID returned" };
      }

      // Create local session record
      await ctx.runMutation(internal.functions.browserProfilesQueries.createSessionInternal, {
        agentId: args.agentId,
        taskId: args.taskId,
        browserUseSessionId: sessionId,
        browserUseProfileId: args.profileId,
        liveUrl,
        shareUrl: data.share_url,
      });

      return { success: true, sessionId, liveUrl };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Run a task on an existing browser session from the agent runtime
 */
export const runBrowserTaskFromAgent = internalAction({
  args: {
    userId: v.id("users"),
    sessionId: v.string(),
    task: v.string(),
    maxSteps: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; result?: unknown; error?: string }> => {
    const credential: BrowserUseCredential = await ctx.runQuery(
      internal.functions.browserProfilesQueries.getCredentialByUserId,
      { userId: args.userId }
    );
    if (!credential) {
      return { success: false, error: "Browser Use API key not configured" };
    }

    try {
      const response = await fetch(`${BROWSER_USE_API_BASE}/run`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: args.sessionId,
          task: args.task,
          max_steps: args.maxSteps || 10,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Browser Use API error: ${error}` };
      }

      // Update session action count
      await ctx.runMutation(internal.functions.browserProfilesQueries.incrementSessionAction, {
        browserUseSessionId: args.sessionId,
      });

      const result = await response.json();
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
