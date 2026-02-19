"use node";

/**
 * Public voice actions for TTS generation and voice listing.
 * Frontend calls these directly.
 */
import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

/**
 * Generate speech from text for a given agent.
 * Returns an audio URL from Convex storage.
 */
export const speak = action({
  args: {
    agentId: v.id("agents"),
    text: v.string(),
  },
  returns: v.union(
    v.object({
      audioUrl: v.string(),
      storageId: v.string(),
      provider: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const viewer = await ctx.runQuery(api.functions.users.viewer, {});
    if (!viewer) throw new Error("Not authenticated");

    const result = await ctx.runAction(internal.agent.tts.generateSpeech, {
      userId: viewer._id,
      agentId: args.agentId,
      text: args.text,
    });

    return result
      ? { audioUrl: result.audioUrl, storageId: result.storageId, provider: result.provider }
      : null;
  },
});

/**
 * Generate audio narration of a task outcome and attach it to the task.
 * Called from the Board page when a user clicks "Listen to report".
 */
export const speakTaskOutcome = action({
  args: {
    taskId: v.id("tasks"),
    agentId: v.optional(v.id("agents")),
  },
  returns: v.union(
    v.object({
      audioUrl: v.string(),
      storageId: v.string(),
      provider: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const viewer = await ctx.runQuery(api.functions.users.viewer, {});
    if (!viewer) throw new Error("Not authenticated");

    // Get the task outcome text and agent info
    const taskInfo = await ctx.runQuery(internal.functions.board.getTaskForAudio, {
      taskId: args.taskId,
      userId: viewer._id,
    });
    if (!taskInfo) return null;

    const rawText = taskInfo.outcomeSummary;
    if (!rawText?.trim()) return null;

    // Strip any internal Convex IDs so they are never spoken by TTS
    const CONVEX_ID_RE = /\b(?:task(?:Id)?[\s=:"]*)?[a-z0-9]{28,36}\b/gi;
    const text = rawText.replace(CONVEX_ID_RE, (match) => {
      const clean = match.replace(/[^a-z0-9]/gi, "");
      if (clean.length < 28 || clean.length > 36) return match;
      if (!/[a-z]/i.test(clean) || !/[0-9]/.test(clean)) return match;
      return "";
    }).replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return null;

    // Determine which agent to use for voice config
    let agentId = args.agentId ?? taskInfo.agentId ?? undefined;
    if (!agentId) {
      agentId = await ctx.runQuery(internal.agent.queries.getDefaultAgentId, {
        userId: viewer._id,
      });
    }

    const result = await ctx.runAction(internal.agent.tts.generateSpeech, {
      userId: viewer._id,
      agentId: agentId,
      text: text.trim(),
    });

    if (!result) return null;

    // Link audio to the task
    await ctx.runMutation(internal.functions.board.linkOutcomeAudio, {
      taskId: args.taskId,
      userId: viewer._id,
      storageId: result.storageId as Id<"_storage">,
    });

    return { audioUrl: result.audioUrl, storageId: result.storageId, provider: result.provider };
  },
});

/**
 * List available ElevenLabs voices for the voice picker dropdown.
 */
export const listVoices = action({
  args: {},
  returns: v.array(
    v.object({
      voiceId: v.string(),
      name: v.string(),
      category: v.optional(v.string()),
      accent: v.optional(v.string()),
      gender: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
    })
  ),
  handler: async (ctx) => {
    const viewer = await ctx.runQuery(api.functions.users.viewer, {});
    if (!viewer) throw new Error("Not authenticated");

    const voices = await ctx.runAction(internal.agent.tts.listElevenLabsVoices, {
      userId: viewer._id,
    });

    return voices;
  },
});
