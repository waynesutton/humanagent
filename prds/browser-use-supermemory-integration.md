# Browser Use Cloud and Supermemory Integration

PRD for integrating Browser Use Cloud (stateful browser automation) and Supermemory (automatic user profiles) into HumanAgent.

## Problem

Agents need two capabilities that are currently missing:

1. **Browser automation with persistent state**: When agents need to interact with web applications (Slack, GitHub, LinkedIn, etc.), they lose login state between sessions. Each new task requiring browser access starts from scratch, requiring re-authentication.

2. **Long term user memory**: Agents lack a way to build and maintain knowledge about individual users over time. Each conversation starts without context about user preferences, past interactions, or learned facts.

## Proposed Solution

### Browser Use Cloud Integration

Browser Use Cloud provides stateful browser sessions with persistent profiles. A profile stores browser state (cookies, local storage, session data) that persists across sessions.

**How it works:**
1. User configures Browser Use API key in Settings
2. User creates browser profiles for specific services (e.g., "GitHub Profile", "Slack Profile")
3. Agent can start a session with a profile via `browser_navigate` action
4. Profile maintains login state, so subsequent sessions skip re-authentication
5. Agent can run multi-step tasks via `browser_action` on active sessions

**Action types added to agent runtime:**
- `browser_navigate`: Start a new browser session with optional profile
- `browser_action`: Execute a task on an existing session

### Supermemory Integration

Supermemory automatically builds user profiles from ingested content. It extracts static facts (permanent truths about the user) and dynamic context (recent, relevant information).

**How it works:**
1. User configures Supermemory API key in Settings
2. User enables Supermemory on specific agents with a container tag
3. Agent conversations are ingested into Supermemory (if sync enabled)
4. Task outcomes are ingested into Supermemory (if sync enabled)
5. On each agent message, profile is fetched and injected into system prompt

**Profile structure:**
- Static facts: Permanent truths like "User prefers TypeScript", "User works at Company X"
- Dynamic context: Recent relevant context like "User is working on feature Y this week"

## Files Changed

### Schema (`convex/schema.ts`)

New tables:
- `browserProfiles`: Stores browser profile metadata (browserUseProfileId, name, description, services, agentId)
- `browserSessions`: Tracks active sessions (browserProfileId, browserUseSessionId, status, lastActiveAt, actionCount, taskId, liveViewUrl)
- `supermemoryProfiles`: Caches profile data (userId, agentId, staticFacts, dynamicContext, lastFetchedAt)

Extended fields:
- `agents.supermemoryConfig`: Object with enabled, containerTag, syncConversations, syncTaskResults
- `userCredentials.service`: Union extended with `browser_use` and `supermemory`

### Backend Files

**New files:**
- `convex/functions/browserProfilesQueries.ts`: V8 queries and mutations for browser profile CRUD
- `convex/functions/browserProfiles.ts`: Node.js actions for Browser Use Cloud API
- `convex/functions/supermemoryQueries.ts`: V8 queries and mutations for profile caching
- `convex/functions/supermemory.ts`: Node.js actions for Supermemory API

**Modified files:**
- `convex/agent/runtime.ts`: Added Supermemory context loading (step 4c), browser action types and handlers
- `convex/functions/agents.ts`: Added `supermemoryConfig` to update mutation args
- `convex/functions/credentials.ts`: Added `browser_use` and `supermemory` to service checks

### Frontend Files

**Modified files:**
- `src/lib/platformApi.ts`: Added Browser Use to BROWSER_AUTOMATION_SERVICES, added MEMORY_SERVICES array
- `src/pages/SettingsPage.tsx`: Added Browser Use credential form, Memory Services section with Supermemory
- `src/pages/AgentsPage.tsx`: Added Supermemory Integration configuration section in edit modal

## Edge Cases

1. **No API key configured**: UI disables features and shows "Configure in Settings" message
2. **API rate limits**: Actions return error objects with descriptive messages
3. **Profile fetch failure**: Silently continues without profile context (logged to console)
4. **Session timeout**: Browser Use sessions have a `max_session_time` limit; sessions are stopped gracefully
5. **Stale cache**: Supermemory profiles cached for 10 minutes; stale data triggers refresh

## Verification Steps

1. Configure Browser Use API key in Settings
2. Create a browser profile via the profile creation API
3. Trigger an agent with a prompt like "Navigate to github.com using my GitHub profile"
4. Verify session creation and navigation in Browser Use Cloud dashboard

5. Configure Supermemory API key in Settings
6. Enable Supermemory on an agent in the agent edit modal
7. Have a conversation with the agent mentioning personal facts
8. Verify profile data appears in subsequent conversations

## API Reference

### Browser Use Cloud
- Docs: https://docs.cloud.browser-use.com/guides/sessions
- Base URL: https://api.cloud.browser-use.com/v1

### Supermemory
- Docs: https://supermemory.ai/docs/user-profiles
- Base URL: https://api.supermemory.ai/v1
