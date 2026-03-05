"use node";

/**
 * Composio Integration
 *
 * Node.js actions for executing tools via Composio's API.
 * Composio provides 10,000+ SaaS integrations with OAuth handling.
 *
 * API Reference: https://docs.composio.dev/docs
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const COMPOSIO_BASE_URL = "https://api.composio.dev/api/v1";

interface ComposioToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime?: number;
}

interface ComposioTool {
  name: string;
  description: string;
  appName: string;
  parameters?: Record<string, unknown>;
}

/**
 * Execute a tool via Composio
 */
export const executeTool = internalAction({
  args: {
    userId: v.id("users"),
    toolName: v.string(),
    parameters: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<ComposioToolResult> => {
    const startTime = Date.now();

    const credential = await ctx.runQuery(
      internal.functions.composioQueries.getComposioCredential,
      { userId: args.userId }
    );

    if (!credential) {
      return {
        success: false,
        error: "Composio API key not configured. Add your key in Settings.",
      };
    }

    try {
      const response = await fetch(`${COMPOSIO_BASE_URL}/actions/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": credential.apiKey,
        },
        body: JSON.stringify({
          actionName: args.toolName,
          input: args.parameters ?? {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Composio API error (${response.status})`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch {
          if (errorText) errorMessage = errorText;
        }

        return {
          success: false,
          error: errorMessage,
          executionTime: Date.now() - startTime,
        };
      }

      const result = await response.json();

      await ctx.runMutation(internal.functions.credentials.markUsed, {
        userId: args.userId,
        service: "composio",
      });

      return {
        success: true,
        data: result.data ?? result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to execute tool: ${message}`,
        executionTime: Date.now() - startTime,
      };
    }
  },
});

/**
 * Get available tools based on user's connected apps
 */
export const listAvailableTools = internalAction({
  args: {
    userId: v.id("users"),
    appFilter: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ tools: ComposioTool[]; error?: string }> => {
    const credential = await ctx.runQuery(
      internal.functions.composioQueries.getComposioCredential,
      { userId: args.userId }
    );

    if (!credential) {
      return {
        tools: [],
        error: "Composio API key not configured",
      };
    }

    try {
      const url = new URL(`${COMPOSIO_BASE_URL}/actions`);
      if (args.appFilter) {
        url.searchParams.set("appName", args.appFilter);
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "x-api-key": credential.apiKey,
        },
      });

      if (!response.ok) {
        return {
          tools: [],
          error: `Failed to fetch tools: ${response.status}`,
        };
      }

      const result = await response.json();
      const tools: ComposioTool[] = (result.items ?? result.actions ?? []).map(
        (action: { name: string; description?: string; appName?: string; parameters?: unknown }) => ({
          name: action.name,
          description: action.description ?? "",
          appName: action.appName ?? "unknown",
          parameters: action.parameters,
        })
      );

      return { tools };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        tools: [],
        error: `Failed to list tools: ${message}`,
      };
    }
  },
});

/**
 * Get connected apps for a user
 */
export const listConnectedApps = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ apps: string[]; error?: string }> => {
    const credential = await ctx.runQuery(
      internal.functions.composioQueries.getComposioCredential,
      { userId: args.userId }
    );

    if (!credential) {
      return {
        apps: [],
        error: "Composio API key not configured",
      };
    }

    try {
      const response = await fetch(`${COMPOSIO_BASE_URL}/connectedAccounts`, {
        method: "GET",
        headers: {
          "x-api-key": credential.apiKey,
        },
      });

      if (!response.ok) {
        return {
          apps: [],
          error: `Failed to fetch connected apps: ${response.status}`,
        };
      }

      const result = await response.json();
      const apps: string[] = (result.items ?? []).map(
        (account: { appName?: string }) => account.appName ?? "unknown"
      );

      return { apps: [...new Set(apps)] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        apps: [],
        error: `Failed to list connected apps: ${message}`,
      };
    }
  },
});

/**
 * Execute tool from agent runtime
 * Wrapper for agent runtime to call Composio tools
 */
export const executeToolFromAgent = internalAction({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    toolName: v.string(),
    parameters: v.optional(v.any()),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args): Promise<{ success: boolean; result?: string; error?: string }> => {
    const toolResult = await ctx.runAction(internal.functions.composio.executeTool, {
      userId: args.userId,
      toolName: args.toolName,
      parameters: args.parameters,
    });

    if (!toolResult.success) {
      return {
        success: false,
        error: toolResult.error ?? "Tool execution failed",
      };
    }

    const resultText =
      typeof toolResult.data === "string"
        ? toolResult.data
        : JSON.stringify(toolResult.data, null, 2);

    return {
      success: true,
      result: resultText,
    };
  },
});
