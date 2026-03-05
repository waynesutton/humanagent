"use node";

/**
 * Daytona Integration
 *
 * Node.js actions for executing code in secure Daytona sandboxes.
 * Daytona provides sub-90ms sandbox provisioning with stateful execution.
 *
 * API Reference: https://www.daytona.io/docs/
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const DAYTONA_BASE_URL = "https://api.daytona.io/v1";

interface DaytonaExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  executionTime?: number;
}

interface DaytonaSandbox {
  id: string;
  state: string;
}

type SupportedLanguage = "python" | "javascript" | "typescript" | "bash" | "go" | "rust";

const LANGUAGE_MAP: Record<SupportedLanguage, string> = {
  python: "python",
  javascript: "node",
  typescript: "typescript",
  bash: "bash",
  go: "go",
  rust: "rust",
};

/**
 * Execute code in a Daytona sandbox
 */
export const executeCode = internalAction({
  args: {
    userId: v.id("users"),
    language: v.string(),
    code: v.string(),
    timeout: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DaytonaExecutionResult> => {
    const startTime = Date.now();

    const credential = await ctx.runQuery(
      internal.functions.daytonaQueries.getDaytonaCredential,
      { userId: args.userId }
    );

    if (!credential) {
      return {
        success: false,
        error: "Daytona API key not configured. Add your key in Settings.",
      };
    }

    const timeoutMs = args.timeout ?? 60000;

    try {
      const createResponse = await fetch(`${DAYTONA_BASE_URL}/sandboxes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential.apiKey}`,
        },
        body: JSON.stringify({
          language: LANGUAGE_MAP[args.language as SupportedLanguage] ?? args.language,
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        return {
          success: false,
          error: `Failed to create sandbox: ${createResponse.status} ${errorText}`,
          executionTime: Date.now() - startTime,
        };
      }

      const sandbox: DaytonaSandbox = await createResponse.json();

      try {
        const execResponse = await fetch(
          `${DAYTONA_BASE_URL}/sandboxes/${sandbox.id}/process/code_run`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${credential.apiKey}`,
            },
            body: JSON.stringify({
              code: args.code,
              timeout: Math.floor(timeoutMs / 1000),
            }),
            signal: AbortSignal.timeout(timeoutMs + 5000),
          }
        );

        if (!execResponse.ok) {
          const errorText = await execResponse.text();
          return {
            success: false,
            error: `Code execution failed: ${execResponse.status} ${errorText}`,
            executionTime: Date.now() - startTime,
          };
        }

        const result = await execResponse.json();

        await ctx.runMutation(internal.functions.credentials.markUsed, {
          userId: args.userId,
          service: "daytona",
        });

        return {
          success: result.exit_code === 0,
          stdout: result.result ?? result.stdout ?? "",
          stderr: result.stderr ?? "",
          exitCode: result.exit_code ?? 0,
          executionTime: Date.now() - startTime,
        };
      } finally {
        fetch(`${DAYTONA_BASE_URL}/sandboxes/${sandbox.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${credential.apiKey}`,
          },
        }).catch(() => {});
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message.includes("timeout") || message.includes("aborted")) {
        return {
          success: false,
          error: `Execution timed out after ${timeoutMs / 1000} seconds`,
          executionTime: Date.now() - startTime,
        };
      }

      return {
        success: false,
        error: `Sandbox execution failed: ${message}`,
        executionTime: Date.now() - startTime,
      };
    }
  },
});

/**
 * Execute a shell command in a Daytona sandbox
 */
export const executeCommand = internalAction({
  args: {
    userId: v.id("users"),
    command: v.string(),
    workdir: v.optional(v.string()),
    timeout: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DaytonaExecutionResult> => {
    const startTime = Date.now();

    const credential = await ctx.runQuery(
      internal.functions.daytonaQueries.getDaytonaCredential,
      { userId: args.userId }
    );

    if (!credential) {
      return {
        success: false,
        error: "Daytona API key not configured. Add your key in Settings.",
      };
    }

    const timeoutMs = args.timeout ?? 60000;

    try {
      const createResponse = await fetch(`${DAYTONA_BASE_URL}/sandboxes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential.apiKey}`,
        },
        body: JSON.stringify({
          language: "bash",
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        return {
          success: false,
          error: `Failed to create sandbox: ${createResponse.status} ${errorText}`,
          executionTime: Date.now() - startTime,
        };
      }

      const sandbox: DaytonaSandbox = await createResponse.json();

      try {
        const execResponse = await fetch(
          `${DAYTONA_BASE_URL}/sandboxes/${sandbox.id}/process/exec`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${credential.apiKey}`,
            },
            body: JSON.stringify({
              command: args.command,
              cwd: args.workdir ?? "/home/daytona",
              timeout: Math.floor(timeoutMs / 1000),
            }),
            signal: AbortSignal.timeout(timeoutMs + 5000),
          }
        );

        if (!execResponse.ok) {
          const errorText = await execResponse.text();
          return {
            success: false,
            error: `Command execution failed: ${execResponse.status} ${errorText}`,
            executionTime: Date.now() - startTime,
          };
        }

        const result = await execResponse.json();

        await ctx.runMutation(internal.functions.credentials.markUsed, {
          userId: args.userId,
          service: "daytona",
        });

        return {
          success: result.exit_code === 0,
          stdout: result.result ?? result.stdout ?? "",
          stderr: result.stderr ?? "",
          exitCode: result.exit_code ?? 0,
          executionTime: Date.now() - startTime,
        };
      } finally {
        fetch(`${DAYTONA_BASE_URL}/sandboxes/${sandbox.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${credential.apiKey}`,
          },
        }).catch(() => {});
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message.includes("timeout") || message.includes("aborted")) {
        return {
          success: false,
          error: `Execution timed out after ${timeoutMs / 1000} seconds`,
          executionTime: Date.now() - startTime,
        };
      }

      return {
        success: false,
        error: `Command execution failed: ${message}`,
        executionTime: Date.now() - startTime,
      };
    }
  },
});

/**
 * Execute code from agent runtime
 * Wrapper for agent runtime to execute code in Daytona
 */
export const executeCodeFromAgent = internalAction({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    language: v.string(),
    code: v.string(),
    timeout: v.optional(v.number()),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args): Promise<{ success: boolean; result?: string; error?: string }> => {
    const execResult = await ctx.runAction(internal.functions.daytona.executeCode, {
      userId: args.userId,
      language: args.language,
      code: args.code,
      timeout: args.timeout,
    });

    if (!execResult.success) {
      return {
        success: false,
        error: execResult.error ?? "Code execution failed",
      };
    }

    let resultText = "";
    if (execResult.stdout) {
      resultText += execResult.stdout;
    }
    if (execResult.stderr) {
      resultText += (resultText ? "\n\nStderr:\n" : "Stderr:\n") + execResult.stderr;
    }
    if (!resultText) {
      resultText = `Code executed successfully (exit code: ${execResult.exitCode ?? 0})`;
    }

    return {
      success: true,
      result: resultText,
    };
  },
});

/**
 * Execute command from agent runtime
 * Wrapper for agent runtime to run shell commands in Daytona
 */
export const executeCommandFromAgent = internalAction({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    command: v.string(),
    workdir: v.optional(v.string()),
    timeout: v.optional(v.number()),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args): Promise<{ success: boolean; result?: string; error?: string }> => {
    const execResult = await ctx.runAction(internal.functions.daytona.executeCommand, {
      userId: args.userId,
      command: args.command,
      workdir: args.workdir,
      timeout: args.timeout,
    });

    if (!execResult.success) {
      return {
        success: false,
        error: execResult.error ?? "Command execution failed",
      };
    }

    let resultText = "";
    if (execResult.stdout) {
      resultText += execResult.stdout;
    }
    if (execResult.stderr) {
      resultText += (resultText ? "\n\nStderr:\n" : "Stderr:\n") + execResult.stderr;
    }
    if (!resultText) {
      resultText = `Command executed successfully (exit code: ${execResult.exitCode ?? 0})`;
    }

    return {
      success: true,
      result: resultText,
    };
  },
});
