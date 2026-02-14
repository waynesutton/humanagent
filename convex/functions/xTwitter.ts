"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

const XAI_API_BASE = "https://api.x.ai/v1";

interface XAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GrokResult {
  success: boolean;
  content?: string;
  error?: string;
  tokensUsed?: number;
}

interface DecryptedCredential {
  apiKey?: string;
}

function toMessages(prompt: string, systemPrompt?: string): Array<XAIMessage> {
  const messages: Array<XAIMessage> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });
  return messages;
}

async function callGrokApi(
  apiKey: string,
  prompt: string,
  systemPrompt?: string,
  model?: string
): Promise<GrokResult> {
  try {
    const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "grok-3",
        messages: toMessages(prompt, systemPrompt),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `xAI API error: ${response.status} - ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };

    return {
      success: true,
      content: data.choices?.[0]?.message?.content,
      tokensUsed: data.usage?.total_tokens,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to query Grok: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

export const queryGrok = action({
  args: {
    agentId: v.id("agents"),
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    content: v.optional(v.string()),
    error: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const agent = await ctx.runQuery(internal.functions.agents.getById, {
      agentId: args.agentId,
    });
    if (!agent) {
      return { success: false, error: "Agent not found" };
    }

    const credentials = (await ctx.runQuery(
      internal.functions.credentials.getDecryptedApiKey,
      { userId: agent.userId, service: "xai" }
    )) as DecryptedCredential | null;

    if (!credentials?.apiKey) {
      return {
        success: false,
        error: "xAI API key not configured. Add your key in Settings.",
      };
    }

    return await callGrokApi(
      credentials.apiKey,
      args.prompt,
      args.systemPrompt ??
        "You are Grok, an AI assistant with real-time access to X/Twitter data.",
      args.model
    );
  },
});

export const analyzeTrends = action({
  args: {
    agentId: v.id("agents"),
    topic: v.optional(v.string()),
    region: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    analysis: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const prompt = args.topic
      ? `Analyze X trends for "${args.topic}"${
          args.region ? ` in ${args.region}` : ""
        }.`
      : `List top X trends${args.region ? ` in ${args.region}` : " worldwide"} and why they trend.`;

    const result: GrokResult = await ctx.runAction(
      internal.functions.xTwitter.internalQueryGrok,
      {
        agentId: args.agentId,
        prompt,
        systemPrompt:
          "You are Grok with real-time X/Twitter data access for trend analysis.",
      }
    );

    return {
      success: result.success,
      analysis: result.content,
      error: result.error,
    };
  },
});

export const monitorMentions = action({
  args: {
    agentId: v.id("agents"),
    username: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
  },
  returns: v.object({
    success: v.boolean(),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    let prompt = "";
    if (args.username) {
      prompt = `Analyze recent mentions about @${args.username} on X.`;
    }
    if (args.keywords && args.keywords.length > 0) {
      prompt += `${prompt ? " " : ""}Track these keywords on X: ${args.keywords.join(
        ", "
      )}.`;
    }
    if (!prompt) {
      return {
        success: false,
        error: "Provide either a username or keywords to monitor",
      };
    }

    const result: GrokResult = await ctx.runAction(
      internal.functions.xTwitter.internalQueryGrok,
      {
        agentId: args.agentId,
        prompt,
      }
    );

    return {
      success: result.success,
      summary: result.content,
      error: result.error,
    };
  },
});

export const researchTopic = action({
  args: {
    agentId: v.id("agents"),
    topic: v.string(),
    depth: v.optional(v.union(v.literal("brief"), v.literal("detailed"))),
  },
  returns: v.object({
    success: v.boolean(),
    research: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const prompt =
      args.depth === "brief"
        ? `Give a short X/Twitter summary about "${args.topic}".`
        : `Research "${args.topic}" using real-time X/Twitter conversations and trends.`;

    const result: GrokResult = await ctx.runAction(
      internal.functions.xTwitter.internalQueryGrok,
      {
        agentId: args.agentId,
        prompt,
        systemPrompt:
          "You are Grok, a research assistant with real-time X/Twitter access.",
      }
    );

    return {
      success: result.success,
      research: result.content,
      error: result.error,
    };
  },
});

export const generateTweetDraft = action({
  args: {
    agentId: v.id("agents"),
    topic: v.string(),
    tone: v.optional(v.string()),
    includeHashtags: v.optional(v.boolean()),
    threadLength: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    drafts: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const prompt = `Write ${
      args.threadLength && args.threadLength > 1
        ? `a ${args.threadLength}-tweet thread`
        : "a tweet"
    } about "${args.topic}" in a ${args.tone || "professional"} tone. ${
      args.includeHashtags ? "Include hashtags." : "No hashtags."
    }`;

    const result: GrokResult = await ctx.runAction(
      internal.functions.xTwitter.internalQueryGrok,
      {
        agentId: args.agentId,
        prompt,
        systemPrompt:
          "You are a social media writer creating human-sounding tweet drafts.",
      }
    );

    if (!result.success || !result.content) {
      return { success: false, error: result.error };
    }

    const drafts = result.content
      .split(/\n+/)
      .map((line: string) => line.replace(/^\d+[\/\.\)]\s*/, "").trim())
      .filter((line: string) => line.length > 0 && line.length <= 280);

    return {
      success: true,
      drafts: drafts.length > 0 ? drafts : [result.content.slice(0, 280)],
    };
  },
});

export const analyzeAccount = action({
  args: {
    agentId: v.id("agents"),
    username: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    analysis: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const result: GrokResult = await ctx.runAction(
      internal.functions.xTwitter.internalQueryGrok,
      {
        agentId: args.agentId,
        prompt: `Analyze the X account @${args.username}: themes, engagement, and recent activity.`,
      }
    );

    return {
      success: result.success,
      analysis: result.content,
      error: result.error,
    };
  },
});

export const getSentiment = action({
  args: {
    agentId: v.id("agents"),
    subject: v.string(),
    timeframe: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    sentiment: v.optional(
      v.object({
        overall: v.string(),
        positive: v.string(),
        negative: v.string(),
        neutral: v.string(),
        summary: v.string(),
      })
    ),
    rawAnalysis: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const result: GrokResult = await ctx.runAction(
      internal.functions.xTwitter.internalQueryGrok,
      {
        agentId: args.agentId,
        prompt: `Analyze sentiment on X about "${args.subject}" ${
          args.timeframe || "recently"
        }.`,
      }
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, rawAnalysis: result.content };
  },
});

export const internalQueryGrok = internalAction({
  args: {
    agentId: v.id("agents"),
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    content: v.optional(v.string()),
    error: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const agent = await ctx.runQuery(internal.functions.agents.getById, {
      agentId: args.agentId,
    });
    if (!agent) {
      return { success: false, error: "Agent not found" };
    }

    const credentials = (await ctx.runQuery(
      internal.functions.credentials.getDecryptedApiKey,
      { userId: agent.userId, service: "xai" }
    )) as DecryptedCredential | null;

    if (!credentials?.apiKey) {
      return { success: false, error: "xAI API key not configured" };
    }

    return await callGrokApi(
      credentials.apiKey,
      args.prompt,
      args.systemPrompt,
      args.model
    );
  },
});
