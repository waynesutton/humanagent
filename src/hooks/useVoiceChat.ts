import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { platformApi } from "../lib/platformApi";
import { notify } from "../lib/notify";
import type { Id } from "../../convex/_generated/dataModel";

// Extend Window for SpeechRecognition browser compat
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionInstance)
    | null;
}

interface UseVoiceChatOptions {
  agentId: Id<"agents"> | null;
  onTranscript: (text: string) => void;
  onSendMessage: (text: string) => Promise<void>;
  autoSend?: boolean;
}

interface UseVoiceChatResult {
  isListening: boolean;
  isSupported: boolean;
  voiceAvailable: boolean;
  voiceProvider: string | null;
  interimTranscript: string;
  isSpeaking: boolean;
  isGeneratingAudio: boolean;
  startListening: () => void;
  stopListening: () => void;
  speakText: (text: string) => Promise<void>;
  stopSpeaking: () => void;
}

/**
 * Hook for voice chat: speech-to-text via browser SpeechRecognition,
 * auto-send transcribed text, and auto-play TTS for agent responses.
 */
export function useVoiceChat({
  agentId,
  onTranscript,
  onSendMessage,
  autoSend = true,
}: UseVoiceChatOptions): UseVoiceChatResult {
  const voiceCredential = useQuery(platformApi.convex.voice.hasVoiceCredential, {});
  const speak = useAction(api.functions.voice.speak);

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isListeningRef = useRef(false);

  const isSupported = typeof window !== "undefined" && !!getSpeechRecognition();
  const voiceAvailable = voiceCredential?.available ?? false;
  const voiceProvider = voiceCredential?.provider ?? null;

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speakTextFn = useCallback(
    async (text: string) => {
      if (!agentId || !text.trim() || !voiceAvailable) return;

      stopSpeaking();
      setIsGeneratingAudio(true);

      try {
        const result = await speak({ agentId, text: text.trim() });
        if (!result?.audioUrl) {
          notify.warning(
            "Voice not available",
            "Configure a voice provider in your agent settings."
          );
          return;
        }

        const audio = new Audio(result.audioUrl);
        audioRef.current = audio;
        setIsSpeaking(true);

        audio.addEventListener("ended", () => {
          setIsSpeaking(false);
          audioRef.current = null;
        });
        audio.addEventListener("error", () => {
          notify.error("Audio playback failed");
          setIsSpeaking(false);
          audioRef.current = null;
        });

        await audio.play();
      } catch (error) {
        notify.error("Could not generate speech", error);
      } finally {
        setIsGeneratingAudio(false);
      }
    },
    [agentId, voiceAvailable, speak, stopSpeaking]
  );

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript("");
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported || !voiceAvailable) return;
    if (isListeningRef.current) return;

    // Stop any ongoing TTS playback before listening
    stopSpeaking();

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
      setInterimTranscript("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          const transcript = result[0].transcript;
          if (result.isFinal) {
            finalText += transcript;
          } else {
            interim += transcript;
          }
        }
      }

      if (interim) {
        setInterimTranscript(interim);
        onTranscript(interim);
      }

      if (finalText.trim()) {
        setInterimTranscript("");
        onTranscript(finalText.trim());

        if (autoSend) {
          void onSendMessage(finalText.trim());
        }
      }
    };

    recognition.onerror = (event: Event & { error: string }) => {
      if (event.error === "no-speech") {
        // Silence, just stop
        setInterimTranscript("");
      } else if (event.error === "not-allowed") {
        notify.warning(
          "Microphone access denied",
          "Allow microphone permissions in your browser settings."
        );
      } else if (event.error !== "aborted") {
        notify.error("Speech recognition error", event.error);
      }
      isListeningRef.current = false;
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onend = () => {
      isListeningRef.current = false;
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      notify.error("Could not start voice recognition");
      isListeningRef.current = false;
      setIsListening(false);
    }
  }, [isSupported, voiceAvailable, autoSend, onTranscript, onSendMessage, stopSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    voiceAvailable,
    voiceProvider,
    interimTranscript,
    isSpeaking,
    isGeneratingAudio,
    startListening,
    stopListening,
    speakText: speakTextFn,
    stopSpeaking,
  };
}
