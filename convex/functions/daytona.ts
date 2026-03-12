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

type AgentExecutionBackendConfig = {
  provider: "daytona" | "symphony";
  repoUrl?: string;
  baseBranch?: string;
  projectPath?: string;
  promptPrefix?: string;
};

type CredentialConfig = {
  baseUrl?: string;
  organizationId?: string;
  projectId?: string;
};

type SymphonyCredential = {
  apiKey: string;
  config?: CredentialConfig;
};

type SymphonyAutomationRunResult = {
  success: boolean;
  externalRunId?: string;
  result?: string;
  error?: string;
};

function buildExecutionResultText(
  execResult: DaytonaExecutionResult,
  fallbackLabel: string
): string {
  let resultText = "";
  if (execResult.stdout) {
    resultText += execResult.stdout;
  }
  if (execResult.stderr) {
    resultText += (resultText ? "\n\nStderr:\n" : "Stderr:\n") + execResult.stderr;
  }
  if (!resultText) {
    resultText = `${fallbackLabel} (exit code: ${execResult.exitCode ?? 0})`;
  }
  return resultText;
}

function getStringField(
  payload: Record<string, unknown>,
  ...keys: Array<string>
): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function getNumberField(
  payload: Record<string, unknown>,
  ...keys: Array<string>
): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number") {
      return value;
    }
  }
  return undefined;
}

async function executeSymphonyBridgeCode(params: {
  credential: SymphonyCredential;
  backend: AgentExecutionBackendConfig;
  userId: Id<"users">;
  agentId?: Id<"agents">;
  taskId?: Id<"tasks">;
  language: string;
  code: string;
  timeout?: number;
}): Promise<DaytonaExecutionResult> {
  const bridgeUrl = params.credential.config?.baseUrl?.trim();
  if (!bridgeUrl) {
    return {
      success: false,
      error: "Symphony bridge URL not configured. Add it in Settings.",
    };
  }
  if (!params.backend.repoUrl?.trim()) {
    return {
      success: false,
      error: "Symphony backend requires a repo URL on the agent.",
    };
  }

  const timeoutMs = params.timeout ?? 60000;
  const startTime = Date.now();

  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/execute/code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.credential.apiKey}`,
      },
      body: JSON.stringify({
        userId: String(params.userId),
        agentId: params.agentId ? String(params.agentId) : undefined,
        taskId: params.taskId ? String(params.taskId) : undefined,
        repoUrl: params.backend.repoUrl,
        baseBranch: params.backend.baseBranch,
        projectPath: params.backend.projectPath,
        promptPrefix: params.backend.promptPrefix,
        language: params.language,
        code: params.code,
        timeoutMs,
      }),
      signal: AbortSignal.timeout(timeoutMs + 5000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Symphony bridge code execution failed: ${response.status} ${errorText}`,
        executionTime: Date.now() - startTime,
      };
    }

    const result = (await response.json()) as Record<string, unknown>;
    const stdout = getStringField(result, "stdout", "result", "output");
    const stderr = getStringField(result, "stderr");
    const error = getStringField(result, "error");
    const exitCode = getNumberField(result, "exitCode", "exit_code");
    const successValue = result.success;

    return {
      success:
        typeof successValue === "boolean"
          ? successValue
          : (exitCode ?? 0) === 0 && !error,
      stdout,
      stderr,
      exitCode,
      error,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: message.includes("timeout") || message.includes("aborted")
        ? `Symphony execution timed out after ${timeoutMs / 1000} seconds`
        : `Symphony execution failed: ${message}`,
      executionTime: Date.now() - startTime,
    };
  }
}

async function executeSymphonyBridgeCommand(params: {
  credential: SymphonyCredential;
  backend: AgentExecutionBackendConfig;
  userId: Id<"users">;
  agentId?: Id<"agents">;
  taskId?: Id<"tasks">;
  command: string;
  workdir?: string;
  timeout?: number;
}): Promise<DaytonaExecutionResult> {
  const bridgeUrl = params.credential.config?.baseUrl?.trim();
  if (!bridgeUrl) {
    return {
      success: false,
      error: "Symphony bridge URL not configured. Add it in Settings.",
    };
  }
  if (!params.backend.repoUrl?.trim()) {
    return {
      success: false,
      error: "Symphony backend requires a repo URL on the agent.",
    };
  }

  const timeoutMs = params.timeout ?? 60000;
  const startTime = Date.now();

  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/execute/command`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.credential.apiKey}`,
      },
      body: JSON.stringify({
        userId: String(params.userId),
        agentId: params.agentId ? String(params.agentId) : undefined,
        taskId: params.taskId ? String(params.taskId) : undefined,
        repoUrl: params.backend.repoUrl,
        baseBranch: params.backend.baseBranch,
        projectPath: params.backend.projectPath,
        promptPrefix: params.backend.promptPrefix,
        command: params.command,
        workdir: params.workdir,
        timeoutMs,
      }),
      signal: AbortSignal.timeout(timeoutMs + 5000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Symphony bridge command execution failed: ${response.status} ${errorText}`,
        executionTime: Date.now() - startTime,
      };
    }

    const result = (await response.json()) as Record<string, unknown>;
    const stdout = getStringField(result, "stdout", "result", "output");
    const stderr = getStringField(result, "stderr");
    const error = getStringField(result, "error");
    const exitCode = getNumberField(result, "exitCode", "exit_code");
    const successValue = result.success;

    return {
      success:
        typeof successValue === "boolean"
          ? successValue
          : (exitCode ?? 0) === 0 && !error,
      stdout,
      stderr,
      exitCode,
      error,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: message.includes("timeout") || message.includes("aborted")
        ? `Symphony command timed out after ${timeoutMs / 1000} seconds`
        : `Symphony command failed: ${message}`,
      executionTime: Date.now() - startTime,
    };
  }
}

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
    const backend = (await ctx.runQuery(
      internal.functions.daytonaQueries.getAgentExecutionBackend,
      {
        userId: args.userId,
        agentId: args.agentId,
      }
    )) as AgentExecutionBackendConfig;

    const execResult =
      backend.provider === "symphony"
        ? await (async () => {
            const credential = await ctx.runQuery(
              internal.functions.daytonaQueries.getSymphonyCredential,
              { userId: args.userId }
            );

            if (!credential) {
              return {
                success: false,
                error: "Symphony bridge token not configured. Add it in Settings.",
              } satisfies DaytonaExecutionResult;
            }

            const result = await executeSymphonyBridgeCode({
              credential,
              backend,
              userId: args.userId,
              agentId: args.agentId,
              taskId: args.taskId,
              language: args.language,
              code: args.code,
              timeout: args.timeout,
            });

            if (credential.config?.baseUrl?.trim() && backend.repoUrl?.trim()) {
              await ctx.runMutation(internal.functions.credentials.markUsed, {
                userId: args.userId,
                service: "symphony",
              });
            }

            return result;
          })()
        : await ctx.runAction(internal.functions.daytona.executeCode, {
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

    return {
      success: true,
      result: buildExecutionResultText(execResult, "Code executed successfully"),
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
    const backend = (await ctx.runQuery(
      internal.functions.daytonaQueries.getAgentExecutionBackend,
      {
        userId: args.userId,
        agentId: args.agentId,
      }
    )) as AgentExecutionBackendConfig;

    const execResult =
      backend.provider === "symphony"
        ? await (async () => {
            const credential = await ctx.runQuery(
              internal.functions.daytonaQueries.getSymphonyCredential,
              { userId: args.userId }
            );

            if (!credential) {
              return {
                success: false,
                error: "Symphony bridge token not configured. Add it in Settings.",
              } satisfies DaytonaExecutionResult;
            }

            const result = await executeSymphonyBridgeCommand({
              credential,
              backend,
              userId: args.userId,
              agentId: args.agentId,
              taskId: args.taskId,
              command: args.command,
              workdir: args.workdir,
              timeout: args.timeout,
            });

            if (credential.config?.baseUrl?.trim() && backend.repoUrl?.trim()) {
              await ctx.runMutation(internal.functions.credentials.markUsed, {
                userId: args.userId,
                service: "symphony",
              });
            }

            return result;
          })()
        : await ctx.runAction(internal.functions.daytona.executeCommand, {
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

    return {
      success: true,
      result: buildExecutionResultText(execResult, "Command executed successfully"),
    };
  },
});

/**
 * Launch a repo-aware Symphony automation run through the configured bridge.
 * This is used by the automation control plane, not by the normal chat runtime.
 */
export const runSymphonyAutomation = internalAction({
  args: {
    userId: v.id("users"),
    agentId: v.id("agents"),
    instruction: v.string(),
    repoUrl: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    projectPath: v.optional(v.string()),
    promptPrefix: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    externalRunId: v.optional(v.string()),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<SymphonyAutomationRunResult> => {
    const backend = (await ctx.runQuery(
      internal.functions.daytonaQueries.getAgentExecutionBackend,
      {
        userId: args.userId,
        agentId: args.agentId,
      }
    )) as AgentExecutionBackendConfig;

    if (backend.provider !== "symphony") {
      return {
        success: false,
        error: "Selected agent is not configured to use Symphony.",
      };
    }

    const credential = (await ctx.runQuery(
      internal.functions.daytonaQueries.getSymphonyCredential,
      { userId: args.userId }
    )) as SymphonyCredential | null;

    if (!credential) {
      return {
        success: false,
        error: "Symphony bridge token not configured. Add it in Settings.",
      };
    }

    const bridgeUrl: string | undefined = credential.config?.baseUrl?.trim();
    const resolvedRepoUrl = args.repoUrl?.trim() || backend.repoUrl?.trim();
    const resolvedBaseBranch = args.baseBranch?.trim() || backend.baseBranch?.trim();
    const resolvedProjectPath = args.projectPath?.trim() || backend.projectPath?.trim();
    const resolvedPromptPrefix = args.promptPrefix?.trim() || backend.promptPrefix?.trim();
    const instruction = args.instruction.trim();

    if (!bridgeUrl) {
      return {
        success: false,
        error: "Symphony bridge URL not configured. Add it in Settings.",
      };
    }
    if (!resolvedRepoUrl) {
      return {
        success: false,
        error: "Symphony automation requires a repo URL on the agent or automation.",
      };
    }
    if (!instruction) {
      return {
        success: false,
        error: "Symphony automation requires an instruction.",
      };
    }

    try {
      const response: Response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/automation/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential.apiKey}`,
        },
        body: JSON.stringify({
          userId: String(args.userId),
          agentId: String(args.agentId),
          repoUrl: resolvedRepoUrl,
          baseBranch: resolvedBaseBranch,
          projectPath: resolvedProjectPath,
          promptPrefix: resolvedPromptPrefix,
          instruction,
        }),
        signal: AbortSignal.timeout(65_000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Symphony automation failed: ${response.status} ${errorText}`,
        };
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const externalRunId =
        getStringField(payload, "externalRunId", "runId", "id") ?? undefined;
      const result =
        getStringField(payload, "result", "summary", "message", "output") ?? undefined;
      const error = getStringField(payload, "error");
      const successValue = payload.success;
      const success =
        typeof successValue === "boolean" ? successValue : !error;

      if (success) {
        await ctx.runMutation(internal.functions.credentials.markUsed, {
          userId: args.userId,
          service: "symphony",
        });
      }

      return {
        success,
        externalRunId,
        result,
        error,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error:
          message.includes("timeout") || message.includes("aborted")
            ? "Symphony automation timed out while waiting for the bridge."
            : `Symphony automation failed: ${message}`,
      };
    }
  },
});
