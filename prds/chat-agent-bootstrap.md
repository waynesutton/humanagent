# Chat agent bootstrap

## Summary

The `/chat` experience currently assumes the user already has at least one agent. This feature lets chat bootstrap that state by supporting slash commands for creating or switching agents and by showing an inline guided setup flow when no agent exists.

## Problem

Users who land in chat without an agent hit a dead end. The page tells them to create one first, but the runtime, conversation model, and existing send flow all require a real `agentId`, so chat cannot currently act as the starting point.

## Root cause

The app creates a user profile, skill file, and board columns during onboarding, but not an agent. The `/chat` page and `sendDashboardMessage` flow depend on an existing conversation linked to an `agentId`, and the UI falls back to the first agent rather than a deliberate bootstrap flow.

## Proposed solution

Add a lightweight chat setup layer inside `src/pages/AgentChatPage.tsx` that keeps the existing conversation model intact.

- Add an inline guided setup experience when `agents.length === 0`
- Ask a short series of questions with quick-pick choices and custom input support
- Create a minimal private agent through the existing `api.functions.agents.create` mutation
- Immediately open the standard dashboard chat through `api.functions.conversations.startAgentChat`
- Optionally send the user’s original request after bootstrap so the conversation continues naturally
- Intercept slash commands in the chat composer for fast operations such as creating a new agent or switching to an existing one
- Prefer the existing default agent (`isDefault`) before falling back to the first item

This approach keeps `/chat`, agent conversations, board task creation, voice chat, and runtime behavior aligned with the current app architecture without introducing a new backend chat state machine.

## Files to change

- `prds/chat-agent-bootstrap.md` - records the problem, chosen approach, and verification steps
- `TASK.md` - adds the implementation checklist and later completion details
- `src/pages/AgentChatPage.tsx` - adds guided bootstrap UI, slash command parsing, default-agent selection, and agent create/switch handling
- `files.md` - updates codebase inventory if a new project file is added
- `changelog.md` - records the chat bootstrap and slash-command update

## Edge cases and gotchas

- Users can have zero agents, which means `/chat` cannot call the existing send mutation until bootstrap finishes
- Dashboard conversations are keyed by `agentId`, so switching agents means switching threads, not changing a persona in-place
- The runtime context comes from `agentMemory`, while visible chat comes from `conversations.messages`, so guided setup should stay UI-driven unless a real chat starts
- Agent creation should default to a private agent with inherited account LLM settings to avoid accidental public exposure
- Slash commands should not break the existing `Shift+Enter` send behavior or voice chat flow

## Verification

- [ ] Open `/chat` with no agents and complete guided setup to create the first agent
- [ ] Confirm the new agent becomes the default when it is the user’s first agent
- [ ] Confirm the page opens the normal 1:1 chat after bootstrap and can send the first real message
- [ ] Use slash commands to create a new agent and switch to an existing one
- [ ] Verify standard message sending, voice input, and create-task-from-chat behavior still work
- [ ] Run typecheck and lints for touched files

## Related

- `prds/voice-chat-with-agent.md`
- `prds/agent-teams-autonomy.md`
