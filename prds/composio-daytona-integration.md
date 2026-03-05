# Composio and Daytona Integration

PRD for integrating Composio (tool execution layer) and Daytona (code execution sandbox) into HumanAgent.

## Problem

Agents currently have placeholder implementations for two critical capabilities:

1. **Tool execution (`call_tool`)**: The agent runtime can parse `call_tool` actions but has no execution layer. Agents cannot interact with external SaaS tools (Gmail, Slack, GitHub, Notion, etc.).

2. **Code execution**: There is no way for agents to safely execute arbitrary code. User requests like "run this Python script" or "execute npm test" cannot be fulfilled.

## Proposed Solution

### Phase 1: Composio Integration

Composio provides 10,000+ tools with authentication handling and OAuth flows. It replaces the `call_tool` placeholder with a real execution layer.

**How it works:**
1. User configures Composio API key in Settings
2. User connects apps via Composio (GitHub, Gmail, Slack, etc.)
3. Agent uses `call_tool` action with tool name and parameters
4. Runtime routes to Composio for execution
5. Results returned to agent for task completion

**Action type (existing, now wired):**
```
<app_action type="call_tool" toolName="GITHUB_CREATE_ISSUE" parameters='{"repo": "owner/repo", "title": "Bug fix", "body": "Description"}' />
```

### Phase 2: Daytona Integration

Daytona provides secure, isolated sandboxes for executing AI-generated code with sub-90ms provisioning.

**How it works:**
1. User configures Daytona API key in Settings
2. Agent uses `execute_code` action with language and code
3. Runtime creates Daytona sandbox, executes code, captures output
4. Results written to task outcome

**New action type:**
```
<app_action type="execute_code" language="python" code="print('Hello World')" />
```

## Files Changed

### Schema (`convex/schema.ts`)

Extended `userCredentials.service` union:
- `composio` - Composio API key
- `daytona` - Daytona API key

### Backend Files

**New files:**
- `convex/functions/composio.ts`: Node.js actions for Composio API
  - `executeTool`: Execute a Composio tool
  - `listConnectedApps`: Get user's connected apps
  - `getToolSchema`: Get tool input schema
- `convex/functions/composioQueries.ts`: V8 queries for Composio state
  - `getComposioStatus`: Check if Composio is configured
  - `listAvailableTools`: Get available tools based on connected apps
- `convex/functions/daytona.ts`: Node.js actions for Daytona API
  - `createSandbox`: Create a new sandbox
  - `executeCode`: Execute code in sandbox
  - `executeCommand`: Run shell command in sandbox
  - `deleteSandbox`: Clean up sandbox
- `convex/functions/daytonaQueries.ts`: V8 queries for Daytona state
  - `getDaytonaStatus`: Check if Daytona is configured

**Modified files:**
- `convex/agent/runtime.ts`: 
  - Wire `call_tool` action to Composio execution
  - Add `execute_code` action type and handler
- `convex/agent/securityUtils.ts`: Add `execute_code` to supported action types
- `convex/functions/credentials.ts`: Add `composio` and `daytona` to service validators and status checks

### Frontend Files

**Modified files:**
- `src/lib/platformApi.ts`: Add `TOOL_EXECUTION_SERVICES` and `CODE_EXECUTION_SERVICES` arrays
- `src/pages/SettingsPage.tsx`: Add Composio and Daytona credential forms in new "Tool & Code Execution" section

### Environment

Updated `.env.example` with placeholder comments for:
- Composio API key (BYOK, stored encrypted in DB)
- Daytona API key (BYOK, stored encrypted in DB)

## Edge Cases

1. **No Composio key**: `call_tool` logs warning and continues (non-blocking)
2. **No Daytona key**: `execute_code` returns error message to user
3. **Composio tool not found**: Return descriptive error with available tools
4. **Daytona sandbox timeout**: 60-second default, configurable per action
5. **Code execution failure**: Capture stderr and return to agent for handling
6. **Rate limits**: Both services have rate limits; respect and surface errors

## Verification Steps

### Composio

1. Configure Composio API key in Settings
2. Connect a test app (e.g., GitHub) via Composio
3. Ask agent: "Create a GitHub issue in my test repo titled 'Test from HumanAgent'"
4. Verify issue created in GitHub

### Daytona

1. Configure Daytona API key in Settings
2. Ask agent: "Run this Python code: print('Hello from Daytona')"
3. Verify task outcome contains "Hello from Daytona"
4. Ask agent: "Run npm --version"
5. Verify task outcome contains version number

## API Reference

### Composio
- Docs: https://docs.composio.dev/docs
- SDK: `@composio/core` (TypeScript)
- Base URL: https://api.composio.dev

### Daytona
- Docs: https://www.daytona.io/docs/
- SDK: `@daytonaio/sdk` (TypeScript)
- Base URL: https://api.daytona.io

## Security Considerations

1. **Code execution sandboxing**: Daytona provides isolated environments; code cannot access HumanAgent infrastructure
2. **Tool permissions**: Composio tools execute with user's connected app permissions, not elevated access
3. **Audit logging**: All tool and code executions logged to audit trail
4. **Rate limiting**: Apply existing rate limit infrastructure to prevent abuse
5. **Input validation**: Sanitize code inputs for obvious exploits before sending to sandbox
