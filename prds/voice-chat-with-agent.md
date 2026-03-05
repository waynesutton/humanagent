# Voice Chat with Agent

## Problem

Users can currently type messages to agents in the Agent Chat page and Board page, and listen to agent responses via TTS (text to speech). But there is no way for users to speak to agents using their microphone and have a real time voice conversation. Users who have configured a voice API (ElevenLabs or OpenAI) should be able to talk to their agent.

## Proposed solution

Add a microphone button to the Agent Chat page and Board task detail modal that:

1. Checks if the user has at least one voice API configured (ElevenLabs or OpenAI credential in userCredentials)
2. Uses the browser's Web Speech API (`SpeechRecognition`) to transcribe the user's speech to text in real time
3. Sends the transcribed text as a regular chat message to the agent
4. Automatically plays the agent's response as TTS audio (using the existing `speak` action)

This is a "voice in, voice out" loop: user speaks, text is transcribed and sent, agent replies via text, reply is spoken aloud.

## Why Web Speech API

No additional backend or third party STT service needed. Works in Chrome, Edge, Safari. Falls back gracefully with a clear message if unsupported. Zero cost to the user for speech to text.

## Files to change

### Backend (Convex)
- `convex/functions/voice.ts` - Add `hasVoiceCredential` query to check if user has ElevenLabs or OpenAI credential configured

### Frontend
- `src/hooks/useVoiceChat.ts` - New hook encapsulating SpeechRecognition, auto send, auto TTS playback
- `src/pages/AgentChatPage.tsx` - Add microphone button next to Send, wire up voice hook
- `src/pages/BoardPage.tsx` - Add mic button in task detail comment input area (stretch goal, phase 2)

## Edge cases

- Browser does not support SpeechRecognition: show disabled mic with tooltip "Voice not supported in this browser"
- No voice credential configured: show disabled mic with tooltip "Add ElevenLabs or OpenAI key in Settings to use voice"
- Empty transcription (silence): do not send, just stop listening
- Multiple rapid clicks: debounce with isListening state
- Audio playback of agent response while still listening: stop recognition during TTS playback, resume after

## Verification steps

1. Configure ElevenLabs or OpenAI credential in Settings
2. Open Agent Chat, see mic button enabled
3. Click mic, speak, see transcribed text appear in draft
4. Text auto sends and agent responds with TTS audio
5. Remove all voice credentials, mic button becomes disabled with tooltip
