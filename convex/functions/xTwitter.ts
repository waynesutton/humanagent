"use node";
/**
 * X/Twitter Integration Functions
 *
 * Enables agents to work with X (Twitter) via:
 * 1. xAI API (Grok) - For real-time X data analysis, trend monitoring, sentiment analysis, and research
 * 2. X API - For direct posting, replying, searching, monitoring
 *
 * Note: xAI integration is analysis/research only and does not support direct posting or DMs.
 *
 * Based on: https://docs.x.ai/overview and https://docs.x.ai/developers/quickstart
 */
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// xAI API base URL
const XAI_API_BASE = "https://api.x.ai/v1";

// ============================================================
// Types
// ============================================================

interface XAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface XAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================
// xAI Grok Integration (Real-time X data)
// ============================================================

/**
 * Query Grok with real-time X/Twitter data access
 * Grok has native access to X's real-time data for trends, sentiment, and analysis
 */
export const queryGrok = action({
  args: {
    agentId: v.id("agents"),
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
    model: v.optional(v.string()), // Default: grok-3
  },
  returns: v.object({
    success: v.boolean(),
    content: v.optional(v.string()),
    error: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    // Get xAI API key from credentials
    const credentials = await ctx.runQuery(internal.functions.credentials.getDecryptedKey, {
      service: "xai",
    });

    if (!credentials?.apiKey) {
      return {
        success: false,
        error: "xAI API key not configured. Add your key in Settings.",
      };
    }

    const messages: XAIMessage[] = [];

    // Add system prompt for X/Twitter context
    const systemMessage = args.systemPrompt || 
      "You are Grok, an AI assistant with real-time access to X (Twitter) data. " +
      "You can analyze trends, sentiment, breaking news, and social conversations. " +
      "Provide accurate, up-to-date information from X when asked about current events or social media.";

    messages.push({ role: "system", content: systemMessage });
    messages.push({ role: "user", content: args.prompt });

    try {
      const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${credentials.apiKey}`,
        },
        body: JSON.stringify({
          model: args.model || "grok-3",
          messages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `xAI API error: ${response.status} - ${errorText}`,
        };
      }

      const data = await response.json() as XAIResponse;
      const content = data.choices[0]?.message?.content;

      return {
        success: true,
        content,
        tokensUsed: data.usage?.total_tokens,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to query Grok: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Analyze X/Twitter trends using Grok's real-time data access
 */
export const analyzeTrends = action({
  args: {
    agentId: v.id("agents"),
    topic: v.optional(v.string()), // Specific topic to analyze, or general trends
    region: v.optional(v.string()), // e.g., "US", "worldwide"
  },
  returns: v.object({
    success: v.boolean(),
    analysis: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const prompt = args.topic
      ? `Analyze the current X/Twitter trends and conversations about "${args.topic}"${args.region ? ` in ${args.region}` : ""}. Include: 
         1. Current sentiment (positive/negative/mixed)
         2. Key talking points and popular opinions
         3. Notable accounts discussing this
         4. Related trending hashtags
         5. Any breaking news or developments`
      : `What are the top trending topics on X/Twitter right now${args.region ? ` in ${args.region}` : " worldwide"}? 
         Provide a brief summary of each trend and why it's trending.`;

    return await ctx.runAction(internal.functions.xTwitter.queryGrok, {
      agentId: args.agentId,
      prompt,
      systemPrompt: "You are Grok with real-time access to X/Twitter data. Provide accurate trend analysis based on current social media activity.",
    });
  },
});

/**
 * Monitor mentions and keywords on X using Grok
 */
export const monitorMentions = action({
  args: {
    agentId: v.id("agents"),
    username: v.optional(v.string()), // Account to monitor mentions for
    keywords: v.optional(v.array(v.string())), // Keywords to track
  },
  returns: v.object({
    success: v.boolean(),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    let prompt = "";

    if (args.username) {
      prompt = `Analyze recent mentions and conversations about @${args.username} on X/Twitter. 
               Include sentiment, key themes, and any notable interactions.`;
    }

    if (args.keywords && args.keywords.length > 0) {
      const keywordList = args.keywords.join(", ");
      prompt += `${prompt ? " Also, " : ""}Track discussions about these keywords on X: ${keywordList}. 
                 Summarize the current conversations, sentiment, and any trending posts.`;
    }

    if (!prompt) {
      return {
        success: false,
        error: "Provide either a username or keywords to monitor",
      };
    }

    return await ctx.runAction(internal.functions.xTwitter.queryGrok, {
      agentId: args.agentId,
      prompt,
    });
  },
});

/**
 * Research a topic using X/Twitter data via Grok
 */
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
    const depth = args.depth || "detailed";
    const prompt = depth === "brief"
      ? `Give me a quick summary of what people on X/Twitter are saying about "${args.topic}" right now.`
      : `Conduct a comprehensive research on "${args.topic}" using X/Twitter data:
         1. Current public sentiment and opinions
         2. Key influencers and thought leaders discussing this
         3. Popular posts and viral content
         4. Controversies or debates
         5. Related topics and hashtags
         6. Recent news or developments
         7. Historical context if relevant`;

    return await ctx.runAction(internal.functions.xTwitter.queryGrok, {
      agentId: args.agentId,
      prompt,
      systemPrompt: "You are Grok, a research assistant with real-time X/Twitter access. Provide thorough, factual research based on actual social media data.",
    });
  },
});

/**
 * Generate tweet drafts based on topic or content
 */
export const generateTweetDraft = action({
  args: {
    agentId: v.id("agents"),
    topic: v.string(),
    tone: v.optional(v.string()), // e.g., "professional", "casual", "humorous"
    includeHashtags: v.optional(v.boolean()),
    threadLength: v.optional(v.number()), // Number of tweets for a thread
  },
  returns: v.object({
    success: v.boolean(),
    drafts: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const tone = args.tone || "professional";
    const threadLength = args.threadLength || 1;

    const prompt = threadLength > 1
      ? `Create a ${threadLength}-tweet thread about "${args.topic}". 
         Tone: ${tone}
         ${args.includeHashtags ? "Include relevant hashtags." : "No hashtags needed."}
         Each tweet should be under 280 characters.
         Format as a numbered list (1/, 2/, etc.)`
      : `Write a tweet about "${args.topic}".
         Tone: ${tone}
         ${args.includeHashtags ? "Include 1-2 relevant hashtags." : "No hashtags."}
         Must be under 280 characters.`;

    const result = await ctx.runAction(internal.functions.xTwitter.queryGrok, {
      agentId: args.agentId,
      prompt,
      systemPrompt: "You are a social media expert. Create engaging, authentic tweets that feel human-written, not AI-generated.",
    });

    if (!result.success || !result.content) {
      return { success: false, error: result.error };
    }

    // Parse the response into individual tweets
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

/**
 * Analyze a specific X/Twitter account
 */
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
    const prompt = `Analyze the X/Twitter account @${args.username}:
      1. Account overview (follower count estimate, activity level)
      2. Content themes and topics they post about
      3. Engagement patterns
      4. Notable recent posts
      5. Audience type and reach
      6. Any controversies or notable interactions`;

    return await ctx.runAction(internal.functions.xTwitter.queryGrok, {
      agentId: args.agentId,
      prompt,
    });
  },
});

/**
 * Get sentiment analysis for a topic or brand
 */
export const getSentiment = action({
  args: {
    agentId: v.id("agents"),
    subject: v.string(), // Brand, topic, or keyword
    timeframe: v.optional(v.string()), // e.g., "today", "this week"
  },
  returns: v.object({
    success: v.boolean(),
    sentiment: v.optional(v.object({
      overall: v.string(),
      positive: v.string(),
      negative: v.string(),
      neutral: v.string(),
      summary: v.string(),
    })),
    rawAnalysis: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const timeframe = args.timeframe || "recently";

    const prompt = `Analyze the sentiment on X/Twitter about "${args.subject}" ${timeframe}.
      Provide:
      1. Overall sentiment (positive/negative/neutral/mixed)
      2. Percentage breakdown estimate (positive %, negative %, neutral %)
      3. Key positive themes
      4. Key negative themes/concerns
      5. Notable posts representing each sentiment
      
      Format your response with clear sections.`;

    const result = await ctx.runAction(internal.functions.xTwitter.queryGrok, {
      agentId: args.agentId,
      prompt,
      systemPrompt: "You are a sentiment analysis expert with real-time X/Twitter access. Provide accurate sentiment analysis based on actual social media data.",
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      rawAnalysis: result.content,
    };
  },
});

// ============================================================
// Internal Actions
// ============================================================

/**
 * Internal: Query Grok (exposed for other internal functions)
 */
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
    // Get xAI API key from credentials
    const credentials = await ctx.runQuery(internal.functions.credentials.getDecryptedKey, {
      service: "xai",
    });

    if (!credentials?.apiKey) {
      return {
        success: false,
        error: "xAI API key not configured",
      };
    }

    const messages: XAIMessage[] = [];

    if (args.systemPrompt) {
      messages.push({ role: "system", content: args.systemPrompt });
    }
    messages.push({ role: "user", content: args.prompt });

    try {
      const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${credentials.apiKey}`,
        },
        body: JSON.stringify({
          model: args.model || "grok-3",
          messages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `xAI API error: ${response.status} - ${errorText}`,
        };
      }

      const data = await response.json() as XAIResponse;
      const content = data.choices[0]?.message?.content;

      return {
        success: true,
        content,
        tokensUsed: data.usage?.total_tokens,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to query Grok: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
