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
      "HTTP-Referer": "https://humanai.gent",
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
 * Call OpenAI API
 */
async function callOpenAI(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  baseUrl = "https://api.openai.com/v1"
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
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
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
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
    baseUrl ?? "https://api.moonshot.cn/v1"
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

// Define the return type for processMessage
interface ProcessMessageResult {
  response: string;
  tokensUsed: number;
  blocked: boolean;
  securityFlags: string[];
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
    // 1. Scan input for security threats
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

      return {
        response:
          "I'm unable to process that request as it appears to contain content that violates my security guidelines. If you believe this is an error, please rephrase your request.",
        tokensUsed: 0,
        blocked: true,
        securityFlags: securityResult.flags.map((f) => f.type),
      };
    }

    // 2. Get agent configuration (from V8 runtime queries file)
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
      return {
        response: `No API key configured for ${config.provider}. Please add your API key in Settings.`,
        tokensUsed: 0,
        blocked: false,
        securityFlags: [],
      };
    }

    // 4. Load conversation context
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

    // 5. Build full message array
    const messages: ChatMessage[] = [
      { role: "system", content: config.systemPrompt },
      ...contextMessages,
      ...semanticMessages,
      { role: "user", content: securityResult.sanitizedInput },
    ];

    // 6. Call the appropriate LLM provider
    let result: { content: string; tokensUsed: number };

    try {
      switch (config.provider) {
        case "openrouter":
          result = await callOpenRouter(
            credentials.apiKey,
            config.model,
            messages
          );
          break;
        case "anthropic":
          result = await callAnthropic(
            credentials.apiKey,
            config.model,
            messages
          );
          break;
        case "openai":
          result = await callOpenAI(
            credentials.apiKey,
            config.model,
            messages,
            credentials.baseUrl
          );
          break;
        case "google":
          result = await callGemini(credentials.apiKey, config.model, messages);
          break;
        case "mistral":
          result = await callMistral(
            credentials.apiKey,
            config.model,
            messages
          );
          break;
        case "minimax":
          result = await callMiniMax(
            credentials.apiKey,
            config.model,
            messages,
            credentials.baseUrl
          );
          break;
        case "kimi":
          result = await callKimi(
            credentials.apiKey,
            config.model,
            messages,
            credentials.baseUrl
          );
          break;
        default:
          // Custom provider - use OpenAI-compatible endpoint
          result = await callOpenAI(
            credentials.apiKey,
            config.model,
            messages,
            credentials.baseUrl
          );
      }
    } catch (error) {
      console.error("LLM call failed:", error);
      return {
        response: `I encountered an error processing your request. Please try again later.`,
        tokensUsed: 0,
        blocked: false,
        securityFlags:
          securityResult.severity === "warn"
            ? securityResult.flags.map((f) => f.type)
            : [],
      };
    }

    // 7. Save the interaction to memory
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
      content: result.content,
      source: args.channel,
      embedding: assistantEmbedding,
      metadata: { role: "assistant" },
    });

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

    return {
      response: result.content,
      tokensUsed: result.tokensUsed,
      blocked: false,
      securityFlags:
        securityResult.severity === "warn"
          ? securityResult.flags.map((f) => f.type)
          : [],
    };
  },
});
