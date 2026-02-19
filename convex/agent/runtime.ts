"use node";

/**
 * Agent Runtime
 *
 * The brain that processes messages, makes LLM calls, and decides actions.
 * Supports multiple LLM providers via BYOK.
 *
 * This file runs in Node.js runtime (for fetch API access).
 * Queries and mutations are in queries.ts (V8 runtime).
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { scanInput } from "./securityUtils";

// Message format for context
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://humana.gent",
      "X-Title": "HumanAgent",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    tokensUsed: data.usage?.total_tokens ?? 0,
  };
}

/**
 * Call Anthropic API
 */
async function callAnthropic(
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<{ content: string; tokensUsed: number }> {
  // Extract system message if present
  const systemMessage = messages.find((m) => m.role === "system");
  const otherMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemMessage?.content,
      messages: otherMessages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return {
    content: data.content[0].text,
    tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
  };
}

/**
 * Detect models that use internal reasoning (o-series, gpt-5 family).
 * These need higher token budgets and optional reasoning_effort control.
 */
function isReasoningModel(model: string): boolean {
  const lower = model.toLowerCase();
  return (
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4") ||
    lower.startsWith("gpt-5") ||
    lower.includes("o1-") ||
    lower.includes("o3-") ||
    lower.includes("o4-")
  );
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  baseUrl = "https://api.openai.com/v1"
): Promise<{ content: string; tokensUsed: number }> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const reasoning = isReasoningModel(model);
  const tokenBudget = reasoning ? 16384 : 2048;

  // Reasoning models: use max_completion_tokens + reasoning_effort to avoid
  // the model exhausting the budget on internal chain-of-thought before
  // producing visible output (common with gpt-5-nano/mini).
  const requestVariants: Array<Record<string, unknown>> = reasoning
    ? [
        { model, messages, max_completion_tokens: tokenBudget, reasoning_effort: "low" },
        { model, messages, max_completion_tokens: tokenBudget },
        { model, messages },
      ]
    : [
        { model, messages, max_completion_tokens: tokenBudget },
        { model, messages, max_tokens: tokenBudget },
        { model, messages },
      ];

  let response: Response | null = null;
  let lastError = "";
  for (const variant of requestVariants) {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(variant),
    });
    if (response.ok) {
      break;
    }
    lastError = await response.text();
  }

  if (!response || !response.ok) {
    const error = lastError || "Unknown OpenAI-compatible API error";
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();

  // Check for refusal (some OpenAI models use this field)
  const refusal = data.choices?.[0]?.message?.refusal;
  if (typeof refusal === "string" && refusal.trim()) {
    console.warn(`OpenAI API: Model ${model} refused with: ${refusal}`);
    return {
      content: `I was unable to process that request: ${refusal}`,
      tokensUsed: data.usage?.total_tokens ?? 0,
    };
  }

  const rawContent = data.choices?.[0]?.message?.content;
  const content =
    typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent
            .map((part) => {
              if (typeof part === "string") return part;
              if (part && typeof part === "object" && "text" in part) {
                const text = (part as { text?: unknown }).text;
                return typeof text === "string" ? text : "";
              }
              return "";
            })
            .join("")
        : "";

  if (!content.trim()) {
    // Reasoning models can exhaust the token budget on chain-of-thought,
    // leaving an empty visible message. Log usage details for diagnosis.
    const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? "n/a";
    const completionTokens = data.usage?.completion_tokens ?? "n/a";
    console.warn(
      `OpenAI API: Empty content for model ${model}. ` +
      `completion_tokens=${completionTokens}, reasoning_tokens=${reasoningTokens}, ` +
      `finish_reason=${data.choices?.[0]?.finish_reason ?? "unknown"}. ` +
      `Increase max_completion_tokens or lower reasoning_effort if this persists.`
    );
    return {
      content: "I was unable to generate a response for this request.",
      tokensUsed: data.usage?.total_tokens ?? 0,
    };
  }

  return {
    content,
    tokensUsed: data.usage?.total_tokens ?? 0,
  };
}

/**
 * Call embeddings API via an OpenAI-compatible endpoint.
 */
async function callEmbedding(
  apiKey: string,
  model: string,
  input: string,
  baseUrl = "https://api.openai.com/v1"
): Promise<number[]> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${error}`);
  }

  const data = await response.json();
  const vector = data.data?.[0]?.embedding;
  if (!Array.isArray(vector)) {
    throw new Error("Embedding API returned invalid vector");
  }
  return vector;
}

/**
 * Call MiniMax API via OpenAI-compatible endpoint
 */
async function callMiniMax(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  baseUrl?: string
): Promise<{ content: string; tokensUsed: number }> {
  return callOpenAI(
    apiKey,
    model,
    messages,
    baseUrl ?? "https://api.minimax.chat/v1"
  );
}

/**
 * Call Kimi (Moonshot) API via OpenAI-compatible endpoint
 */
async function callKimi(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  baseUrl?: string
): Promise<{ content: string; tokensUsed: number }> {
  return callOpenAI(
    apiKey,
    model,
    messages,
    baseUrl ?? "https://api.moonshot.ai/v1"
  );
}

/**
 * Call DeepSeek API via OpenAI-compatible endpoint
 */
async function callDeepSeek(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  baseUrl?: string
): Promise<{ content: string; tokensUsed: number }> {
  return callOpenAI(
    apiKey,
    model,
    messages,
    baseUrl ?? "https://api.deepseek.com/v1"
  );
}

/**
 * Call Google Gemini API
 */
async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<{ content: string; tokensUsed: number }> {
  // Convert to Gemini format
  const systemInstruction = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: systemInstruction
        ? { parts: [{ text: systemInstruction }] }
        : undefined,
      contents,
      generationConfig: {
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return {
    content: data.candidates[0].content.parts[0].text,
    tokensUsed:
      (data.usageMetadata?.promptTokenCount ?? 0) +
      (data.usageMetadata?.candidatesTokenCount ?? 0),
  };
}

/**
 * Call Mistral API
 */
async function callMistral(
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    tokensUsed: data.usage?.total_tokens ?? 0,
  };
}

/**
 * Shared LLM call router used by processMessage and auto-generate features.
 * Picks the right provider call function based on config.
 */
async function callLLMProvider(
  provider: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  baseUrl?: string
): Promise<{ content: string; tokensUsed: number }> {
  switch (provider) {
    case "openrouter":
      return callOpenRouter(apiKey, model, messages);
    case "anthropic":
      return callAnthropic(apiKey, model, messages);
    case "openai":
      return callOpenAI(apiKey, model, messages, baseUrl);
    case "deepseek":
      return callDeepSeek(apiKey, model, messages, baseUrl);
    case "google":
      return callGemini(apiKey, model, messages);
    case "mistral":
      return callMistral(apiKey, model, messages);
    case "minimax":
      return callMiniMax(apiKey, model, messages, baseUrl);
    case "kimi":
      return callKimi(apiKey, model, messages, baseUrl);
    default:
      return callOpenAI(apiKey, model, messages, baseUrl);
  }
}

// Define the return type for processMessage
interface ProcessMessageResult {
  response: string;
  tokensUsed: number;
  blocked: boolean;
  securityFlags: string[];
}

type CreateTaskAction = {
  type: "create_task";
  description: string;
  isPublic?: boolean;
};

type CreateFeedItemAction = {
  type: "create_feed_item";
  title: string;
  content?: string;
  isPublic?: boolean;
};

type CreateSkillAction = {
  type: "create_skill";
  name: string;
  bio?: string;
  capabilities?: Array<{ name: string; description: string }>;
};

type UpdateTaskStatusAction = {
  type: "update_task_status";
  taskId: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  outcomeSummary?: string;
  outcomeLinks?: Array<string>;
};

type MoveTaskAction = {
  type: "move_task";
  taskId: string;
  boardColumnId?: string;
  boardColumnName?: string;
};

type UpdateSkillAction = {
  type: "update_skill";
  skillId: string;
  name?: string;
  bio?: string;
  capabilities?: Array<{ name: string; description: string }>;
  isActive?: boolean;
};

type CreateSubtaskAction = {
  type: "create_subtask";
  parentTaskId: string;
  description: string;
  isPublic?: boolean;
};

type DelegateToAgentAction = {
  type: "delegate_to_agent";
  targetAgentSlug: string;
  taskDescription: string;
};

type GenerateImageAction = {
  type: "generate_image";
  prompt: string;
  taskId?: string;
};

type GenerateAudioAction = {
  type: "generate_audio";
  text: string;
  taskId?: string;
};

type CallToolAction = {
  type: "call_tool";
  toolName: string;
  input?: Record<string, unknown>;
};

type CreateKnowledgeNodeAction = {
  type: "create_knowledge_node";
  title: string;
  description: string;
  content: string;
  nodeType: "concept" | "technique" | "reference" | "moc" | "claim" | "procedure";
  tags?: string[];
};

type LinkKnowledgeNodesAction = {
  type: "link_knowledge_nodes";
  sourceNodeId: string;
  targetNodeId: string;
};

type AgentRuntimeAction =
  | CreateTaskAction
  | CreateFeedItemAction
  | CreateSkillAction
  | UpdateTaskStatusAction
  | MoveTaskAction
  | UpdateSkillAction
  | CreateSubtaskAction
  | DelegateToAgentAction
  | GenerateImageAction
  | GenerateAudioAction
  | CallToolAction
  | CreateKnowledgeNodeAction
  | LinkKnowledgeNodesAction;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function parseThinkingBlocks(rawResponse: string): {
  withoutThinking: string;
  thinkingContent: string | null;
} {
  const thinkingMatch = rawResponse.match(/<thinking>\s*([\s\S]*?)\s*<\/thinking>/i);
  if (!thinkingMatch) {
    return { withoutThinking: rawResponse, thinkingContent: null };
  }
  const thinkingContent = thinkingMatch[1]?.trim() || null;
  const withoutThinking = rawResponse.replace(thinkingMatch[0], "").trim();
  return { withoutThinking, thinkingContent };
}

function parseAgentActions(rawResponse: string): {
  cleanResponse: string;
  actions: AgentRuntimeAction[];
  thinkingContent: string | null;
} {
  // Extract thinking blocks first
  const { withoutThinking, thinkingContent } = parseThinkingBlocks(rawResponse);

  const blockMatch = withoutThinking.match(/<app_actions>\s*([\s\S]*?)\s*<\/app_actions>/i);
  if (!blockMatch) {
    return {
      cleanResponse: withoutThinking.trim(),
      actions: [],
      thinkingContent,
    };
  }

  const actionJson = blockMatch[1]?.trim() ?? "";
  const cleanResponse = withoutThinking.replace(blockMatch[0], "").trim();
  if (!actionJson) {
    return { cleanResponse, actions: [], thinkingContent };
  }

  try {
    const parsed = JSON.parse(actionJson) as unknown;
    if (!Array.isArray(parsed)) {
      return { cleanResponse, actions: [], thinkingContent };
    }

    const actions: AgentRuntimeAction[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Record<string, unknown>;
      const type = candidate.type;
      if (type === "create_task") {
        const description = typeof candidate.description === "string" ? candidate.description : "";
        if (!description.trim()) continue;
        actions.push({
          type: "create_task",
          description: description.trim().slice(0, 800),
          isPublic: candidate.isPublic === true,
        });
      } else if (type === "create_feed_item") {
        const title = typeof candidate.title === "string" ? candidate.title : "";
        if (!title.trim()) continue;
        const content =
          typeof candidate.content === "string" && candidate.content.trim()
            ? candidate.content.trim().slice(0, 320)
            : undefined;
        actions.push({
          type: "create_feed_item",
          title: title.trim().slice(0, 120),
          content,
          isPublic: candidate.isPublic === true,
        });
      } else if (type === "create_skill") {
        const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
        if (!name) continue;
        const bio =
          typeof candidate.bio === "string" && candidate.bio.trim()
            ? candidate.bio.trim().slice(0, 1200)
            : undefined;
        const capabilitiesRaw = Array.isArray(candidate.capabilities)
          ? candidate.capabilities
          : [];
        const capabilities = capabilitiesRaw
          .flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const item = entry as Record<string, unknown>;
            const capName =
              typeof item.name === "string" ? item.name.trim().slice(0, 64) : "";
            const capDescription =
              typeof item.description === "string"
                ? item.description.trim().slice(0, 320)
                : "";
            if (!capName || !capDescription) return [];
            return [{ name: capName, description: capDescription }];
          })
          .slice(0, 25);
        actions.push({
          type: "create_skill",
          name: name.slice(0, 80),
          bio,
          capabilities,
        });
      } else if (type === "update_task_status") {
        const taskId = typeof candidate.taskId === "string" ? candidate.taskId.trim() : "";
        const status = candidate.status;
        if (
          !taskId ||
          (status !== "pending" &&
            status !== "in_progress" &&
            status !== "completed" &&
            status !== "failed")
        ) {
          continue;
        }
        const outcomeSummary =
          typeof candidate.outcomeSummary === "string" && candidate.outcomeSummary.trim()
            ? candidate.outcomeSummary.trim().slice(0, 2000)
            : undefined;
        const outcomeLinks = Array.isArray(candidate.outcomeLinks)
          ? candidate.outcomeLinks
              .filter((entry): entry is string => typeof entry === "string")
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0)
              .slice(0, 8)
          : undefined;
        actions.push({
          type: "update_task_status",
          taskId,
          status,
          outcomeSummary,
          outcomeLinks,
        });
      } else if (type === "move_task") {
        const taskId = typeof candidate.taskId === "string" ? candidate.taskId.trim() : "";
        if (!taskId) continue;
        const boardColumnId =
          typeof candidate.boardColumnId === "string" && candidate.boardColumnId.trim()
            ? candidate.boardColumnId.trim()
            : undefined;
        const boardColumnName =
          typeof candidate.boardColumnName === "string" && candidate.boardColumnName.trim()
            ? candidate.boardColumnName.trim().slice(0, 80)
            : undefined;
        if (!boardColumnId && !boardColumnName) continue;
        actions.push({
          type: "move_task",
          taskId,
          boardColumnId,
          boardColumnName,
        });
      } else if (type === "update_skill") {
        const skillId = typeof candidate.skillId === "string" ? candidate.skillId.trim() : "";
        if (!skillId) continue;
        const name =
          typeof candidate.name === "string" && candidate.name.trim()
            ? candidate.name.trim().slice(0, 80)
            : undefined;
        const bio =
          typeof candidate.bio === "string" && candidate.bio.trim()
            ? candidate.bio.trim().slice(0, 1200)
            : undefined;
        const capabilitiesRaw = Array.isArray(candidate.capabilities)
          ? candidate.capabilities
          : [];
        const capabilities = capabilitiesRaw
          .flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const item = entry as Record<string, unknown>;
            const capName =
              typeof item.name === "string" ? item.name.trim().slice(0, 64) : "";
            const capDescription =
              typeof item.description === "string"
                ? item.description.trim().slice(0, 320)
                : "";
            if (!capName || !capDescription) return [];
            return [{ name: capName, description: capDescription }];
          })
          .slice(0, 25);
        const isActive = typeof candidate.isActive === "boolean" ? candidate.isActive : undefined;
        actions.push({
          type: "update_skill",
          skillId,
          name,
          bio,
          capabilities: capabilities.length > 0 ? capabilities : undefined,
          isActive,
        });
      } else if (type === "create_subtask") {
        const parentTaskId = typeof candidate.parentTaskId === "string" ? candidate.parentTaskId.trim() : "";
        const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
        if (!parentTaskId || !description) continue;
        actions.push({
          type: "create_subtask",
          parentTaskId,
          description: description.slice(0, 800),
          isPublic: candidate.isPublic === true,
        });
      } else if (type === "delegate_to_agent") {
        const targetAgentSlug = typeof candidate.targetAgentSlug === "string" ? candidate.targetAgentSlug.trim() : "";
        const taskDescription = typeof candidate.taskDescription === "string" ? candidate.taskDescription.trim() : "";
        if (!targetAgentSlug || !taskDescription) continue;
        actions.push({
          type: "delegate_to_agent",
          targetAgentSlug,
          taskDescription: taskDescription.slice(0, 800),
        });
      } else if (type === "generate_image") {
        const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : "";
        if (!prompt) continue;
        const taskId = typeof candidate.taskId === "string" ? candidate.taskId.trim() : undefined;
        actions.push({
          type: "generate_image",
          prompt: prompt.slice(0, 1000),
          taskId,
        });
      } else if (type === "generate_audio") {
        const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
        if (!text) continue;
        const taskId = typeof candidate.taskId === "string" ? candidate.taskId.trim() : undefined;
        actions.push({
          type: "generate_audio",
          text: text.slice(0, 5000),
          taskId,
        });
      } else if (type === "call_tool") {
        const toolName = typeof candidate.toolName === "string" ? candidate.toolName.trim() : "";
        if (!toolName) continue;
        const input = candidate.input && typeof candidate.input === "object"
          ? candidate.input as Record<string, unknown>
          : undefined;
        actions.push({
          type: "call_tool",
          toolName: toolName.slice(0, 120),
          input,
        });
      } else if (type === "create_knowledge_node") {
        const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
        const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
        const content = typeof candidate.content === "string" ? candidate.content : "";
        if (!title || !content) continue;
        const validNodeTypes = ["concept", "technique", "reference", "moc", "claim", "procedure"] as const;
        const nodeType = typeof candidate.nodeType === "string" && validNodeTypes.includes(candidate.nodeType as typeof validNodeTypes[number])
          ? (candidate.nodeType as typeof validNodeTypes[number])
          : "concept";
        const tags = Array.isArray(candidate.tags)
          ? candidate.tags.filter((t): t is string => typeof t === "string").slice(0, 20)
          : undefined;
        actions.push({
          type: "create_knowledge_node",
          title: title.slice(0, 120),
          description: (description || title).slice(0, 200),
          content: content.slice(0, 12000),
          nodeType,
          tags,
        });
      } else if (type === "link_knowledge_nodes") {
        const sourceNodeId = typeof candidate.sourceNodeId === "string" ? candidate.sourceNodeId.trim() : "";
        const targetNodeId = typeof candidate.targetNodeId === "string" ? candidate.targetNodeId.trim() : "";
        if (!sourceNodeId || !targetNodeId) continue;
        actions.push({
          type: "link_knowledge_nodes",
          sourceNodeId,
          targetNodeId,
        });
      }
    }

    return { cleanResponse, actions, thinkingContent };
  } catch {
    return { cleanResponse, actions: [], thinkingContent };
  }
}

function isBoilerplateOutcome(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return true;

  const knownBoilerplate = [
    /^processing scheduled tasks\.?$/,
    /^done\.?$/,
    /^done\. i applied the requested app update\.?$/,
    /^task(s)? processed\.?$/,
    /^completed\.?$/,
  ];
  if (knownBoilerplate.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  // Very short responses are usually acknowledgements, not real task output.
  return normalized.length < 40;
}

function pickTaskOutcome(args: {
  status: UpdateTaskStatusAction["status"];
  cleanResponse: string;
  actionOutcomeSummary?: string;
}): string | undefined {
  if (args.status !== "completed" && args.status !== "failed") {
    return args.actionOutcomeSummary?.trim() || undefined;
  }

  const cleanOutcome = args.cleanResponse.trim();
  const actionOutcome = args.actionOutcomeSummary?.trim() || "";

  if (cleanOutcome && !isBoilerplateOutcome(cleanOutcome)) {
    return stripInternalIds(cleanOutcome).slice(0, 8000);
  }
  if (actionOutcome && !isBoilerplateOutcome(actionOutcome)) {
    return stripInternalIds(actionOutcome).slice(0, 8000);
  }

  return args.status === "failed"
    ? "Task failed, but the agent did not return a detailed failure report. Run it again for full details."
    : "Task marked completed, but the agent did not return detailed output. Run it again for full results.";
}

// Convex IDs are 32-char alphanumeric strings. Strip patterns like
// "Task ks74jc9z0t743mq80fw1y4558181fahx" so they never leak into
// displayed outcomes or TTS audio.
const CONVEX_ID_PATTERN = /\b(?:task(?:Id)?[\s=:"]*)?[a-z0-9]{28,36}\b/gi;

function stripInternalIds(text: string): string {
  return text
    .replace(CONVEX_ID_PATTERN, (match) => {
      // Only strip if it looks like a Convex ID (mixed letters+digits, 28-36 chars)
      const clean = match.replace(/[^a-z0-9]/gi, "");
      if (clean.length < 28 || clean.length > 36) return match;
      const hasLetters = /[a-z]/i.test(clean);
      const hasDigits = /[0-9]/.test(clean);
      if (!hasLetters || !hasDigits) return match;
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildConfigDiagnosticResponse(args: {
  provider: string;
  model: string;
  baseUrl?: string;
  errorMessage: string;
}): string | null {
  const errorText = args.errorMessage.toLowerCase();
  const isConfigFailure =
    errorText.includes("unsupported parameter") ||
    errorText.includes("invalid_request_error") ||
    errorText.includes("model") ||
    errorText.includes("api key") ||
    errorText.includes("unauthorized") ||
    errorText.includes("authentication") ||
    errorText.includes("\"401\"") ||
    errorText.includes("\"403\"") ||
    errorText.includes("not found") ||
    errorText.includes("endpoint") ||
    errorText.includes("base url");

  if (!isConfigFailure) return null;

  const hints: Array<string> = [];
  if (errorText.includes("unsupported parameter")) {
    hints.push("Provider/model parameter mismatch. Try a different model for this provider.");
  }
  if (
    (errorText.includes("model") && errorText.includes("not found")) ||
    errorText.includes("does not exist")
  ) {
    hints.push("Model ID may be invalid for this provider. Re-check model name in Settings.");
  }
  if (
    errorText.includes("incorrect api key") ||
    errorText.includes("invalid api key") ||
    errorText.includes("authentication")
  ) {
    hints.push("API key may be invalid or inactive. Re-save the key in Settings.");
  }
  if (
    args.baseUrl &&
    (errorText.includes("endpoint") ||
      errorText.includes("not found") ||
      errorText.includes("base url"))
  ) {
    hints.push(
      `Base URL may be incorrect (${args.baseUrl}). Verify it is provider-correct and includes the expected /v1 path.`
    );
  }
  if (hints.length === 0) {
    hints.push("Check provider, model, and BYOK credential settings in Settings.");
  }

  return `I could not call ${args.provider} model ${args.model} due to a configuration issue. ${hints.join(
    " "
  )}`;
}

/**
 * Main agent processing function
 * Takes a message and returns a response
 */
export const processMessage = internalAction({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    message: v.string(),
    channel: v.union(
      v.literal("email"),
      v.literal("phone"),
      v.literal("api"),
      v.literal("mcp"),
      v.literal("webmcp"),
      v.literal("a2a"),
      v.literal("dashboard")
    ),
    callerId: v.optional(v.string()),
  },
  returns: v.object({
    response: v.string(),
    tokensUsed: v.number(),
    blocked: v.boolean(),
    securityFlags: v.array(v.string()),
  }),
  handler: async (ctx, args): Promise<ProcessMessageResult> => {
    // Pipeline step tracking (collected in memory, written once at end)
    type WfStep = {
      label: string;
      status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
      startedAt: number;
      completedAt?: number;
      durationMs?: number;
      detail?: string;
    };
    const wfSteps: WfStep[] = [];
    function wfRecord(label: string, startedAt: number, status: "completed" | "failed" | "skipped", detail?: string) {
      const now = Date.now();
      wfSteps.push({ label, status, startedAt, completedAt: now, durationMs: now - startedAt, detail });
    }

    // 1. Scan input for security threats
    const step1Start = Date.now();
    const securityResult = scanInput(args.message);

    if (securityResult.severity === "block") {
      // Log security flag
      for (const flag of securityResult.flags) {
        await ctx.runMutation(internal.agent.security.logSecurityFlag, {
          userId: args.userId,
          source: args.channel,
          flagType: flag.type,
          severity: flag.severity,
          pattern: flag.pattern,
          inputSnippet: args.message.substring(0, 200),
          action: "blocked",
        });
      }

      wfRecord("Security scan", step1Start, "failed", "Blocked: " + securityResult.flags.map((f) => f.type).join(", "));
      return {
        response:
          "I'm unable to process that request as it appears to contain content that violates my security guidelines. If you believe this is an error, please rephrase your request.",
        tokensUsed: 0,
        blocked: true,
        securityFlags: securityResult.flags.map((f) => f.type),
      };
    }
    wfRecord("Security scan", step1Start, "completed");

    // 2. Get agent configuration (from V8 runtime queries file)
    const step2Start = Date.now();
    const config: {
      provider: string;
      model: string;
      systemPrompt: string;
      capabilities: string[];
    } | null = await ctx.runQuery(internal.agent.queries.getAgentConfig, {
      userId: args.userId,
      agentId: args.agentId,
    });

    if (!config) {
      wfRecord("Config load", step2Start, "failed", "Agent config not found");
      return {
        response: "Agent configuration not found. Please set up your agent.",
        tokensUsed: 0,
        blocked: false,
        securityFlags: [],
      };
    }

    // 3. Get API credentials for the configured provider
    const credentials = await ctx.runQuery(
      internal.agent.queries.getProviderCredentials,
      {
        userId: args.userId,
        provider: config.provider,
      }
    );

    if (!credentials) {
      wfRecord("Config load", step2Start, "failed", "No API key for " + config.provider);
      return {
        response: `No API key configured for ${config.provider}. Please add your API key in Settings.`,
        tokensUsed: 0,
        blocked: false,
        securityFlags: [],
      };
    }
    wfRecord("Config load", step2Start, "completed", config.provider + "/" + config.model);

    // 4. Load conversation context
    const step4Start = Date.now();
    // 4a. Compute semantic query embedding when credentials are available
    let userMessageEmbedding: number[] | undefined;
    try {
      const embeddingCredentials = await ctx.runQuery(
        internal.agent.queries.getEmbeddingCredentials,
        {
          userId: args.userId,
        }
      );
      if (embeddingCredentials) {
        userMessageEmbedding = await callEmbedding(
          embeddingCredentials.apiKey,
          embeddingCredentials.model,
          securityResult.sanitizedInput,
          embeddingCredentials.baseUrl
        );
      }
    } catch (embeddingError) {
      console.warn("Embedding generation failed for query vector:", embeddingError);
    }

    const contextMessages = await ctx.runQuery(internal.agent.queries.loadContext, {
      userId: args.userId,
      agentId: args.agentId,
      maxMessages: 10,
    });

    let semanticMessages: ChatMessage[] = [];
    if (userMessageEmbedding && userMessageEmbedding.length > 0) {
      try {
        const matches = await ctx.vectorSearch("agentMemory", "by_embedding", {
          vector: userMessageEmbedding,
          limit: 8,
          filter: (q) => q.eq("userId", args.userId),
        });
        const memoryIds = matches.map((match) => match._id);
        if (memoryIds.length > 0) {
          semanticMessages = await ctx.runQuery(
            internal.agent.queries.getMemoriesByIds,
            {
              userId: args.userId,
              agentId: args.agentId,
              memoryIds,
            }
          );
        }
      } catch (semanticError) {
        console.warn("Semantic memory retrieval failed:", semanticError);
      }
    }

    // 4b. Load relevant knowledge graph nodes for task context routing
    let knowledgeContext = "";
    try {
      const knowledgeNodes: Array<{
        _id: string;
        title: string;
        description: string;
        content?: string;
        nodeType: string;
        tags: string[];
        relevanceReason: string;
      }> = await ctx.runQuery(
        internal.functions.knowledgeGraph.loadRelevantKnowledge,
        {
          userId: args.userId,
          agentId: args.agentId,
          query: securityResult.sanitizedInput,
          maxNodes: 5,
        }
      );

      if (knowledgeNodes.length > 0) {
        const sections = knowledgeNodes.map((node) => {
          if (node.content) {
            return `### ${node.title}\n${node.content}`;
          }
          return `- **${node.title}**: ${node.description}`;
        });
        knowledgeContext = `\n\n## Relevant Knowledge\n${sections.join("\n\n")}`;
      }
    } catch (knowledgeError) {
      console.warn("Knowledge graph traversal failed:", knowledgeError);
    }

    wfRecord("Context build", step4Start, "completed", `${contextMessages.length} messages, ${semanticMessages.length} memories${knowledgeContext ? ", knowledge graph active" : ""}`);

    // 5. Build full message array
    const systemPromptWithKnowledge = knowledgeContext
      ? config.systemPrompt + knowledgeContext
      : config.systemPrompt;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPromptWithKnowledge },
      ...contextMessages,
      ...semanticMessages,
      { role: "user", content: securityResult.sanitizedInput },
    ];

    // 6. Call the appropriate LLM provider
    const step6Start = Date.now();
    let result: { content: string; tokensUsed: number };

    try {
      result = await callLLMProvider(
        config.provider,
        credentials.apiKey,
        config.model,
        messages,
        credentials.baseUrl
      );
    } catch (error) {
      console.error("LLM call failed:", error);
      const errorMessage = getErrorMessage(error);
      const configDiagnostic = buildConfigDiagnosticResponse({
        provider: config.provider,
        model: config.model,
        baseUrl: credentials.baseUrl,
        errorMessage,
      });
      wfRecord("LLM call", step6Start, "failed", errorMessage.slice(0, 200));
      return {
        response:
          configDiagnostic ??
          "I encountered an error processing your request. Please try again later.",
        tokensUsed: 0,
        blocked: false,
        securityFlags:
          securityResult.severity === "warn"
            ? securityResult.flags.map((f) => f.type)
            : [],
      };
    }
    wfRecord("LLM call", step6Start, "completed", `${result.tokensUsed} tokens`);

    // 7. Parse response, extract thinking, execute actions
    const step7Start = Date.now();
    const parsedResponse = parseAgentActions(result.content);
    const fallbackActionSummary = parsedResponse.actions.find(
      (action): action is UpdateTaskStatusAction =>
        action.type === "update_task_status" &&
        typeof action.outcomeSummary === "string" &&
        action.outcomeSummary.trim().length > 0
    )?.outcomeSummary;
    const assistantResponse =
      parsedResponse.cleanResponse.trim() ||
      fallbackActionSummary?.trim() ||
      "Task actions processed.";

    wfRecord("Parse response", step7Start, "completed", `${parsedResponse.actions.length} actions`);

    // Save thinking blocks as reflection memory if present
    const step8Start = Date.now();
    if (parsedResponse.thinkingContent && args.agentId) {
      try {
        await ctx.runMutation(internal.agent.queries.saveThought, {
          userId: args.userId,
          agentId: args.agentId,
          type: "reasoning",
          content: parsedResponse.thinkingContent.slice(0, 8000),
          context: args.message.slice(0, 500),
        });
      } catch (thinkingError) {
        console.warn("Failed to save thinking block:", thinkingError);
      }
    }

    for (const action of parsedResponse.actions) {
      try {
        if (action.type === "create_task") {
          await ctx.runMutation(internal.functions.board.createTaskFromAgent, {
            userId: args.userId,
            agentId: args.agentId,
            description: action.description,
            isPublic: action.isPublic ?? false,
            source: args.channel,
          });
        } else if (action.type === "create_feed_item") {
          await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
            userId: args.userId,
            type: "status_update",
            title: action.title,
            content: action.content,
            metadata: {
              source: args.channel,
              callerId: args.callerId,
              generatedBy: "agent_runtime",
            },
            isPublic: action.isPublic ?? false,
          });
        } else if (action.type === "create_skill") {
          await ctx.runMutation(internal.functions.skills.createFromAgent, {
            userId: args.userId,
            agentId: args.agentId,
            name: action.name,
            bio: action.bio,
            capabilities: action.capabilities,
          });
        } else if (action.type === "update_task_status") {
          const effectiveOutcome = pickTaskOutcome({
            status: action.status,
            cleanResponse: assistantResponse,
            actionOutcomeSummary: action.outcomeSummary,
          });
          await ctx.runMutation(internal.functions.board.updateTaskFromAgent, {
            userId: args.userId,
            agentId: args.agentId,
            taskId: action.taskId as Id<"tasks">,
            status: action.status,
            outcomeSummary: effectiveOutcome,
            outcomeLinks: action.outcomeLinks,
            source: args.channel,
          });

          // Long-form file storage: if outcome >8000 chars, upload full content
          if (
            effectiveOutcome &&
            effectiveOutcome.length > 8000 &&
            (action.status === "completed" || action.status === "failed")
          ) {
            try {
              await ctx.runAction(internal.functions.board.storeOutcomeFile, {
                taskId: action.taskId as Id<"tasks">,
                userId: args.userId,
                content: assistantResponse,
              });
            } catch (fileError) {
              console.warn("Failed to store long-form outcome file:", fileError);
            }
          }
        } else if (action.type === "move_task") {
          await ctx.runMutation(internal.functions.board.updateTaskFromAgent, {
            userId: args.userId,
            agentId: args.agentId,
            taskId: action.taskId as Id<"tasks">,
            boardColumnId: action.boardColumnId as Id<"boardColumns"> | undefined,
            boardColumnName: action.boardColumnName,
            source: args.channel,
          });
        } else if (action.type === "update_skill") {
          await ctx.runMutation(internal.functions.skills.updateFromAgent, {
            userId: args.userId,
            agentId: args.agentId,
            skillId: action.skillId as Id<"skills">,
            name: action.name,
            bio: action.bio,
            capabilities: action.capabilities,
            isActive: action.isActive,
          });
        } else if (action.type === "create_subtask") {
          await ctx.runMutation(internal.functions.board.createTaskFromAgent, {
            userId: args.userId,
            agentId: args.agentId,
            description: action.description,
            isPublic: action.isPublic ?? false,
            source: args.channel,
            parentTaskId: action.parentTaskId as Id<"tasks">,
          });
        } else if (action.type === "delegate_to_agent") {
          // Look up target agent by slug within the same user's agents
          try {
            const targetAgent = await ctx.runQuery(
              internal.agent.queries.getAgentBySlug,
              { userId: args.userId, slug: action.targetAgentSlug }
            );
            if (targetAgent) {
              await ctx.runAction(internal.agent.runtime.processMessage, {
                userId: args.userId,
                agentId: targetAgent._id as Id<"agents">,
                message: action.taskDescription,
                channel: "a2a",
                callerId: args.agentId ? String(args.agentId) : undefined,
              });
            } else {
              console.warn(`delegate_to_agent: agent slug "${action.targetAgentSlug}" not found`);
            }
          } catch (delegateError) {
            console.warn("Agent delegation failed:", delegateError);
          }
        } else if (action.type === "generate_image") {
          // Placeholder: image generation requires an external API call
          console.log(`generate_image requested: prompt="${action.prompt.slice(0, 100)}"`);
        } else if (action.type === "generate_audio") {
          try {
            const audioResult = await ctx.runAction(internal.agent.tts.generateSpeech, {
              userId: args.userId,
              agentId: args.agentId ?? (await ctx.runQuery(internal.agent.queries.getDefaultAgentId, { userId: args.userId })),
              text: action.text,
            });
            if (audioResult && action.taskId) {
              await ctx.runMutation(internal.functions.board.linkOutcomeAudio, {
                taskId: action.taskId as Id<"tasks">,
                userId: args.userId,
                storageId: audioResult.storageId as Id<"_storage">,
              });
            }
          } catch (audioError) {
            console.warn("Audio generation failed:", audioError);
          }
        } else if (action.type === "call_tool") {
          // Placeholder: tool execution requires skill-declared tool registry
          console.log(`call_tool requested: toolName="${action.toolName}"`);
        } else if (action.type === "create_knowledge_node") {
          await ctx.runMutation(internal.functions.knowledgeGraph.createNodeFromAgent, {
            userId: args.userId,
            agentId: args.agentId,
            title: action.title,
            description: action.description,
            content: action.content,
            nodeType: action.nodeType,
            tags: action.tags,
          });
        } else if (action.type === "link_knowledge_nodes") {
          await ctx.runMutation(internal.functions.knowledgeGraph.linkNodesFromAgent, {
            userId: args.userId,
            sourceNodeId: action.sourceNodeId as Id<"knowledgeNodes">,
            targetNodeId: action.targetNodeId as Id<"knowledgeNodes">,
          });
        }
      } catch (actionError) {
        console.warn("Agent action execution failed:", actionError);
      }
    }

    wfRecord("Execute actions", step8Start, "completed", `${parsedResponse.actions.length} dispatched`);

    const step9Start = Date.now();
    await ctx.runMutation(internal.agent.queries.saveMemory, {
      userId: args.userId,
      agentId: args.agentId,
      type: "conversation",
      content: args.message,
      source: args.channel,
      embedding: userMessageEmbedding,
      metadata: { role: "user", callerId: args.callerId },
    });

    let assistantEmbedding: number[] | undefined;
    try {
      const embeddingCredentials = await ctx.runQuery(
        internal.agent.queries.getEmbeddingCredentials,
        {
          userId: args.userId,
        }
      );
      if (embeddingCredentials) {
        assistantEmbedding = await callEmbedding(
          embeddingCredentials.apiKey,
          embeddingCredentials.model,
          result.content,
          embeddingCredentials.baseUrl
        );
      }
    } catch (embeddingError) {
      console.warn("Embedding generation failed for assistant memory:", embeddingError);
    }

    await ctx.runMutation(internal.agent.queries.saveMemory, {
      userId: args.userId,
      agentId: args.agentId,
      type: "conversation",
      content: assistantResponse,
      source: args.channel,
      embedding: assistantEmbedding,
      metadata: { role: "assistant" },
    });

    wfRecord("Save memory", step9Start, "completed");

    // 8. Log to audit trail
    await ctx.runMutation(internal.agent.queries.logAgentAction, {
      userId: args.userId,
      action: "message_processed",
      resource: args.channel,
      callerType: "agent",
      callerIdentity: args.callerId ?? "anonymous",
      tokenCount: result.tokensUsed,
      status: "success",
    });

    // 9. Attach workflow pipeline to any tasks that were updated
    const updatedTaskIds = parsedResponse.actions
      .filter((a): a is UpdateTaskStatusAction => a.type === "update_task_status")
      .map((a) => a.taskId as Id<"tasks">);
    const createdTaskIds = parsedResponse.actions
      .filter((a): a is CreateTaskAction => a.type === "create_task")
      .map(() => null); // we don't have IDs for newly created tasks
    void createdTaskIds; // acknowledge but skip (no ID available)

    for (const taskId of updatedTaskIds) {
      try {
        await ctx.runMutation(internal.functions.board.setWorkflowSteps, {
          taskId,
          steps: wfSteps,
        });
      } catch (wfError) {
        console.warn("Failed to save workflow steps:", wfError);
      }
    }

    return {
      response: assistantResponse,
      tokensUsed: result.tokensUsed,
      blocked: false,
      securityFlags:
        securityResult.severity === "warn"
          ? securityResult.flags.map((f) => f.type)
          : [],
    };
  },
});

/**
 * Auto-generate knowledge graph nodes from a skill's existing data.
 * Calls the user's configured LLM to analyze skill identity, capabilities,
 * and domains, then creates interconnected knowledge nodes.
 */
export const autoGenerateGraph = internalAction({
  args: {
    userId: v.id("users"),
    agentId: v.id("agents"),
    skillId: v.id("skills"),
  },
  returns: v.object({
    nodesCreated: v.number(),
    linksCreated: v.number(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Load agent config and credentials
    const config: {
      provider: string;
      model: string;
      systemPrompt: string;
      capabilities: string[];
    } | null = await ctx.runQuery(internal.agent.queries.getAgentConfig, {
      userId: args.userId,
      agentId: args.agentId,
    });

    if (!config) {
      return { nodesCreated: 0, linksCreated: 0, error: "No agent configuration found" };
    }

    const credentials = await ctx.runQuery(
      internal.agent.queries.getProviderCredentials,
      { userId: args.userId, provider: config.provider }
    );

    if (!credentials?.apiKey) {
      return { nodesCreated: 0, linksCreated: 0, error: "No LLM credentials configured" };
    }

    // Load skill data
    const skill = await ctx.runQuery(internal.functions.knowledgeGraph.getSkillForAutoGen, {
      skillId: args.skillId,
    });

    if (!skill) {
      return { nodesCreated: 0, linksCreated: 0, error: "Skill not found" };
    }

    // Load existing nodes to avoid duplicates
    const existingNodes: Array<{ title: string; nodeType: string; _id: string }> =
      await ctx.runQuery(internal.functions.knowledgeGraph.listNodesInternal, {
        skillId: args.skillId,
      });

    const existingTitles = existingNodes.map((n) => n.title.toLowerCase());

    const prompt = buildAutoGenPrompt(skill, existingNodes);

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a knowledge architect. You create structured knowledge graphs for AI agents. " +
          "Respond ONLY with valid JSON. No markdown, no explanation, just the JSON array.",
      },
      { role: "user", content: prompt },
    ];

    let llmResult: { content: string; tokensUsed: number };
    try {
      llmResult = await callLLMProvider(
        config.provider,
        credentials.apiKey,
        config.model,
        messages,
        credentials.baseUrl
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "LLM call failed";
      return { nodesCreated: 0, linksCreated: 0, error: msg };
    }

    // Parse the JSON response
    let generatedNodes: Array<{
      title: string;
      description: string;
      content: string;
      nodeType: string;
      tags: string[];
      linksTo: string[];
    }>;

    try {
      const cleaned = llmResult.content
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      generatedNodes = JSON.parse(cleaned);
      if (!Array.isArray(generatedNodes)) {
        throw new Error("Response is not an array");
      }
    } catch {
      return {
        nodesCreated: 0,
        linksCreated: 0,
        error: "LLM returned invalid JSON. Try again.",
      };
    }

    // Filter out nodes that already exist
    const newNodes = generatedNodes.filter(
      (n) => !existingTitles.includes(n.title.toLowerCase())
    );

    if (newNodes.length === 0) {
      return { nodesCreated: 0, linksCreated: 0 };
    }

    // Create nodes and track title -> ID mapping
    const validTypes = ["concept", "technique", "reference", "moc", "claim", "procedure"] as const;
    const titleToId = new Map<string, Id<"knowledgeNodes">>();

    // Include existing nodes in title map for cross-linking
    for (const existing of existingNodes) {
      titleToId.set(existing.title.toLowerCase(), existing._id as Id<"knowledgeNodes">);
    }

    let nodesCreated = 0;
    for (const node of newNodes.slice(0, 25)) {
      const nodeType = validTypes.includes(node.nodeType as typeof validTypes[number])
        ? (node.nodeType as typeof validTypes[number])
        : "concept";

      try {
        const nodeId: Id<"knowledgeNodes"> = await ctx.runMutation(
          internal.functions.knowledgeGraph.createNodeFromAgent,
          {
            userId: args.userId,
            agentId: args.agentId,
            skillId: args.skillId,
            title: node.title,
            description: node.description || node.title,
            content: node.content || node.description || node.title,
            nodeType: nodeType,
            tags: (node.tags ?? []).slice(0, 10),
          }
        );
        titleToId.set(node.title.toLowerCase(), nodeId);
        nodesCreated++;
      } catch (createError) {
        console.warn("Auto-gen node create failed:", createError);
      }
    }

    // Create links based on the linksTo field
    let linksCreated = 0;
    for (const node of newNodes) {
      const sourceId = titleToId.get(node.title.toLowerCase());
      if (!sourceId || !node.linksTo) continue;

      for (const targetTitle of node.linksTo) {
        const targetId = titleToId.get(targetTitle.toLowerCase());
        if (!targetId || sourceId === targetId) continue;

        try {
          await ctx.runMutation(internal.functions.knowledgeGraph.linkNodesFromAgent, {
            userId: args.userId,
            sourceNodeId: sourceId,
            targetNodeId: targetId,
          });
          linksCreated++;
        } catch {
          // Duplicate link or invalid, skip
        }
      }
    }

    return { nodesCreated, linksCreated };
  },
});

function buildAutoGenPrompt(
  skill: {
    name: string;
    bio: string;
    capabilities: Array<{ name: string; description: string }>;
    knowledgeDomains: string[];
  },
  existingNodes: Array<{ title: string; nodeType: string }>
): string {
  const parts = [
    `Analyze this AI agent skill and generate a knowledge graph.`,
    ``,
    `Skill: ${skill.name}`,
    `Description: ${skill.bio}`,
  ];

  if (skill.capabilities.length > 0) {
    parts.push(`Capabilities:`);
    for (const cap of skill.capabilities) {
      parts.push(`  - ${cap.name}: ${cap.description}`);
    }
  }

  if (skill.knowledgeDomains.length > 0) {
    parts.push(`Knowledge domains: ${skill.knowledgeDomains.join(", ")}`);
  }

  if (existingNodes.length > 0) {
    parts.push(`\nExisting nodes (do NOT duplicate these):`);
    for (const n of existingNodes) {
      parts.push(`  - "${n.title}" (${n.nodeType})`);
    }
  }

  parts.push(`
Generate 8 to 15 knowledge nodes that capture the key concepts, techniques,
and procedures this agent needs to know. Create a well-connected graph.

Each node must have:
- title: short unique name (under 120 chars)
- description: one-line summary (under 200 chars)
- content: detailed knowledge (200 to 500 chars, markdown ok)
- nodeType: one of "concept", "technique", "reference", "moc", "claim", "procedure"
- tags: array of 2 to 5 tags
- linksTo: array of titles of OTHER nodes in this list that this node relates to

Include one "moc" (Map of Content) node that acts as the central index linking to all major topics.

Return a JSON array. No markdown fences, no explanation. Just the array.`);

  return parts.join("\n");
}
