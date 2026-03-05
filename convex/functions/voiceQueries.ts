/**
 * Voice-related V8 queries (no Node.js runtime needed).
 * Separated from voice.ts which uses "use node" for TTS actions.
 */
import { v } from "convex/values";
import { authedQuery } from "../lib/functions";

/**
 * Check if the current user has at least one voice-capable credential
 * (ElevenLabs or OpenAI) that is active and configured.
 * Used by the frontend to gate the voice chat microphone button.
 */
export const hasVoiceCredential = authedQuery({
  args: {},
  handler: async (ctx) => {
    const voiceServices = ["elevenlabs", "openai"] as const;

    for (const service of voiceServices) {
      const cred = await ctx.db
        .query("userCredentials")
        .withIndex("by_userId_service", (q) =>
          q.eq("userId", ctx.userId).eq("service", service)
        )
        .first();

      if (cred?.encryptedApiKey && cred.isActive) {
        return { available: true, provider: service };
      }
    }

    return { available: false, provider: null };
  },
});
