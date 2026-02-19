# Voice and TTS Features

## Problem

ElevenLabs API key is configured but voice features are not wired up. The `voiceConfig` field on agents stores provider and voice ID settings, but no backend action generates audio and no frontend UI plays it back. The ElevenLabs Voice ID field is a raw text input with no way to browse available voices.

## Proposed solution

### Backend

1. **TTS action** (`convex/agent/tts.ts`): Node.js action that calls ElevenLabs or OpenAI TTS API, stores the audio in Convex file storage, and returns a storage URL.
2. **Voice config query** (`convex/agent/queries.ts`): Internal query to fetch the agent's voice config + decrypted ElevenLabs/OpenAI credentials.
3. **ElevenLabs voice list action** (`convex/agent/tts.ts`): Action that calls `GET /v1/voices` to return available voices for the voice picker.

### Frontend

4. **Chat playback** (`src/pages/AgentChatPage.tsx`): A small speaker icon on each agent message bubble. Clicking it calls the TTS action and plays the returned audio URL.
5. **Voice picker** (`src/pages/AgentsPage.tsx`): Replace the raw Voice ID text input with a dropdown that loads available ElevenLabs voices from the backend action. Falls back to text input if the API call fails.

## Files to change

- `convex/agent/tts.ts` (new)
- `convex/agent/queries.ts` (add getVoiceCredentials)
- `src/pages/AgentChatPage.tsx` (add playback button)
- `src/pages/AgentsPage.tsx` (voice picker dropdown)

## Edge cases

- No ElevenLabs key configured: disable voice picker, show "Configure in Settings" message
- TTS API failure: show toast error, do not break the chat
- Long messages: truncate to ElevenLabs character limit (5000 chars for v3)
- Audio already playing: stop previous before starting new
- OpenAI TTS fallback when ElevenLabs is not configured
