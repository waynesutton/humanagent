# Workflow Visualization and DateTime Awareness

## Problem

When agents process tasks (in_progress or completed), users see a status badge and an outcome block but have no visibility into the pipeline steps that happened behind the scenes. The CI pipeline view (nodes with status, timing, connections between steps) is the gold standard for process transparency.

Additionally, datetime awareness across the codebase is fragmented. Time formatting is inline and duplicated. Agents, skills, and system functions have no lightweight way to know the user's current date/time without extra DB reads or burning tokens on timezone detection.

## Proposed Solution

### 1. Workflow Steps (Lightweight Pipeline Tracking)

Add a `workflowSteps` array to the `tasks` table that records each pipeline phase as it completes. Each step has a label, status, startedAt, completedAt, and optional metadata.

Pipeline phases to track:
1. **Security scan** (input validation)
2. **Config load** (agent config + credentials)
3. **Context build** (conversation history + semantic memory)
4. **LLM call** (provider API request)
5. **Parse response** (extract actions + thinking)
6. **Execute actions** (task updates, feed items, delegation, etc.)
7. **Save memory** (conversation + embedding persistence)

Each step is appended via a lightweight mutation as the runtime progresses. No extra reads needed since we just append to the array.

### 2. WorkflowView Component

A horizontal pipeline visualization (inspired by GitHub Actions CI view) showing:
- Nodes for each step with Phosphor icons
- Status indicators (pending: gray, in_progress: accent pulse, completed: green, failed: red)
- Connector lines between nodes
- Duration display per step
- Total elapsed time

Shows in:
- BoardPage task detail panel (between header and outcome)
- AgentChatPage (expandable under "Agent is thinking..." or after response)

### 3. DateTime Utility

Create `src/lib/datetime.ts` with:
- `getUserTimezone()`: reads `Intl.DateTimeFormat().resolvedOptions().timeZone` (no DB call)
- `formatRelativeTime(timestamp)`: unified relative time formatter (replaces 4+ inline implementations)
- `formatDateTime(timestamp, options?)`: locale-aware with user timezone
- `formatDuration(ms)`: human-readable duration ("2.3s", "1m 12s")
- `getLocalDateContext()`: returns `{ date, time, timezone, dayOfWeek }` for agent prompts (inject once at prompt build time, zero ongoing cost)

For agent prompts: inject a one-liner `Current date/time: {date} {time} {timezone}` into the system prompt builder. Zero DB queries, zero extra tokens beyond one line.

## Files to Change

### Schema
- `convex/schema.ts`: Add `workflowSteps` optional array to tasks table

### Backend
- `convex/agent/runtime.ts`: Add step tracking calls during processMessage
- `convex/functions/board.ts`: Add `addWorkflowStep` internalMutation
- `convex/agent/queries.ts`: Inject datetime context into system prompt builder

### Frontend
- `src/lib/datetime.ts` (new): Shared datetime utilities
- `src/components/WorkflowView.tsx` (new): Pipeline visualization component
- `src/pages/BoardPage.tsx`: Integrate WorkflowView in task detail panel
- `src/pages/AgentChatPage.tsx`: Show workflow progress during agent processing

### Dependencies
- `@phosphor-icons/react` (already installed)

## Edge Cases

- Tasks created before this change have no workflowSteps: component shows nothing or a "No pipeline data" message
- Security-blocked messages only have step 1: show single completed red node
- LLM errors stop at step 4: show failed node with error context
- Very fast steps (<100ms): still show them, just with "< 0.1s" duration
- Concurrent task processing: each task has its own workflowSteps array, no cross-contamination
