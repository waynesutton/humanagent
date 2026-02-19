"use node";

/**
 * Text-to-Speech actions for ElevenLabs and OpenAI TTS.
 * Generates audio from text and stores it in Convex file storage.
 * Also lists available ElevenLabs voices for the voice picker.
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const ELEVENLABS_MAX_CHARS = 5000;
const OPENAI_TTS_MAX_CHARS = 4096;

// Voice info returned by the list endpoint
interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

/**
 * Generate audio from text using the agent's configured voice provider.
 * Stores the audio in Convex file storage and returns a URL.
 */
export const generateSpeech = internalAction({
  args: {
    userId: v.id("users"),
    agentId: v.id("agents"),
    text: v.string(),
  },
  returns: v.union(
    v.object({
      audioUrl: v.string(),
      storageId: v.string(),
      provider: v.string(),
      durationEstimate: v.optional(v.number()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const voiceConfig = await ctx.runQuery(internal.agent.queries.getVoiceConfig, {
      userId: args.userId,
      agentId: args.agentId,
    });

    if (!voiceConfig) return null;

    const text = args.text.trim();
    if (!text) return null;

    let audioBlob: Blob;

    if (voiceConfig.provider === "elevenlabs") {
      const truncated = text.slice(0, ELEVENLABS_MAX_CHARS);
      const voiceId = voiceConfig.voiceId || "EXAVITQu4vr4xnSDxMaL"; // Rachel default
      const modelId = voiceConfig.modelId || "eleven_multilingual_v2";

      const response = await fetch(
        `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": voiceConfig.apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: truncated,
            model_id: modelId,
            voice_settings: {
              stability: voiceConfig.stability ?? 0.5,
              similarity_boost: voiceConfig.similarityBoost ?? 0.75,
              style: voiceConfig.style ?? 0,
              use_speaker_boost: voiceConfig.useSpeakerBoost ?? true,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401 || response.status === 403) {
          throw new Error("ElevenLabs API key is invalid or account quota exceeded. Check your ElevenLabs credentials in agent settings.");
        }
        throw new Error(`ElevenLabs TTS error: ${response.status} ${errorText}`);
      }

      audioBlob = await response.blob();
    } else {
      // OpenAI TTS
      const truncated = text.slice(0, OPENAI_TTS_MAX_CHARS);
      const voice = voiceConfig.openaiVoice || "nova";

      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${voiceConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          input: truncated,
          voice,
          response_format: "mp3",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401 || response.status === 403) {
          throw new Error("OpenAI API key is invalid or has insufficient permissions for TTS. Check your credentials in agent settings.");
        }
        throw new Error(`OpenAI TTS error: ${response.status} ${errorText}`);
      }

      audioBlob = await response.blob();
    }

    // Store in Convex file storage
    const storageId: Id<"_storage"> = await ctx.storage.store(audioBlob);
    const audioUrl = await ctx.storage.getUrl(storageId);

    if (!audioUrl) {
      throw new Error("Failed to get storage URL for generated audio");
    }

    return {
      audioUrl,
      storageId: storageId as string,
      provider: voiceConfig.provider,
    };
  },
});

/**
 * Public-facing action for generating speech from the frontend.
 * Wraps the internal action with auth checks.
 */
export const speakText = internalAction({
  args: {
    userId: v.id("users"),
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
    const result = await ctx.runAction(internal.agent.tts.generateSpeech, {
      userId: args.userId,
      agentId: args.agentId,
      text: args.text,
    });
    return result
      ? { audioUrl: result.audioUrl, storageId: result.storageId, provider: result.provider }
      : null;
  },
});

/**
 * List available ElevenLabs voices for the voice picker.
 */
export const listElevenLabsVoices = internalAction({
  args: {
    userId: v.id("users"),
  },
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
  handler: async (ctx, args) => {
    // Get ElevenLabs credentials
    const credential = await ctx.runQuery(
      internal.agent.queries.getProviderCredentials,
      { userId: args.userId, provider: "elevenlabs" }
    );

    if (!credential) return [];

    const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
      headers: {
        "xi-api-key": credential.apiKey,
      },
    });

    if (!response.ok) {
      console.error("ElevenLabs voices API error:", response.status);
      return [];
    }

    const data = (await response.json()) as { voices?: ElevenLabsVoice[] };
    if (!data.voices) return [];

    return data.voices.map((voice) => ({
      voiceId: voice.voice_id,
      name: voice.name,
      category: voice.category,
      accent: voice.labels?.accent,
      gender: voice.labels?.gender,
      previewUrl: voice.preview_url,
    }));
  },
});
