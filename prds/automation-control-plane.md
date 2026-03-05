# Automation control plane

## Problem

Automation behavior is spread across one off cron handlers and webhook specific retry logic. The app has strong primitives for task execution, agent runtime processing, and audit logging, but there is no single control plane to define, schedule, run, and observe automations in one place.

Without a control plane:

- Trigger logic is fragmented
- Run history is hard to inspect
- Retry and failure handling are inconsistent across automation types
- Adding new automations increases maintenance cost

## Proposed solution

Introduce a lightweight automation control plane in Convex that orchestrates existing primitives instead of replacing them.

Core idea:

1. Define automations in a single table
2. Dispatch due automations from one cron
3. Execute existing actions through typed action adapters
4. Persist run history for observability

This is additive and backward compatible. Existing cron and webhook flows continue to work.

## Scope for this implementation

### Data model

Add two tables:

- `automationDefinitions`
  - Stores trigger and action config per user
  - Supports `manual`, `interval`, and `event` trigger types
- `automationRuns`
  - Stores execution history with status, timing, input, output, and errors

### Backend control plane functions

Create `convex/functions/automations.ts`:

- Public functions
  - `listDefinitions`
  - `listRuns`
  - `createDefinition`
  - `updateDefinition`
  - `deleteDefinition`
  - `runNow`
- Internal control plane functions
  - `listDueDefinitions`
  - `createRun`
  - `completeRun`
  - `failRun`
  - `touchSchedule`
  - `executeDefinition`
  - `dispatchDueAutomations`

### Supported action adapters in v1

- `process_agent_tasks`
  - Reuses existing `internal.crons.processAgentTasks`
  - Requires `agentId` in `actionConfig`

This gives immediate value while keeping behavior predictable.

### Scheduling integration

Update `convex/crons.ts`:

- Add one centralized dispatcher cron:
  - Every minute call `internal.functions.automations.dispatchDueAutomations`

## Files to change

- `prds/automation-control-plane.md`
- `convex/schema.ts`
- `convex/functions/automations.ts`
- `convex/crons.ts`
- `TASK.md`
- `changelog.md`
- `files.md`

## Edge cases

- Inactive definitions are skipped
- Interval definitions with missing `intervalMinutes` are ignored safely
- Action config missing required fields returns typed failure and is recorded in run history
- Failed runs do not stop other due automations
- Dispatcher limits due definitions per tick to avoid thundering herd

## Verification steps

- Create an interval automation with action `process_agent_tasks` and a valid `agentId`
- Confirm dispatcher creates a run record
- Confirm success path updates `automationRuns` and advances `nextRunAt`
- Break `actionConfig` intentionally and confirm run is marked failed with error
- Run `npm run typecheck` and `npm run lint`

