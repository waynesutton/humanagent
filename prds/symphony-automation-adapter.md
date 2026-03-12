# Symphony automation adapter

## Summary

Add a first class `run_symphony` action adapter to the automation control plane so HumanAgent can launch repo-aware Symphony runs directly from automation definitions. This keeps the current `process_agent_tasks` path intact and uses the already added Symphony bridge credentials plus per-agent execution config.

## Problem

HumanAgent can now route code and command execution through Symphony from the agent runtime, but the automation control plane still only supports `process_agent_tasks`. That means scheduled or manual repo runs cannot be expressed as first class automations and must be forced through chat or task-level execution.

There is also inconsistent run bookkeeping today:

- `automationControlPlaneTick` marks queued `process_agent_tasks` runs as succeeded after dispatch
- `runNow` leaves `process_agent_tasks` runs in `queued`

If we add Symphony on top of that without cleanup, automation observability will become harder to trust.

## Proposed solution

Extend the automation control plane with a second typed adapter:

1. Add `run_symphony` to `automationDefinitions.actionType`
2. Support `actionConfig` shaped like:
   - `agentId`
   - `instruction`
   - optional repo overrides: `repoUrl`, `baseBranch`, `projectPath`, `promptPrefix`
3. Reuse the agent's `executionBackend` config and require the target agent to be configured for Symphony
4. Add an internal automation action that:
   - loads Symphony bridge credentials
   - resolves repo metadata from the agent backend config plus any action overrides
   - calls the Symphony bridge at `/automation/run`
   - writes success or failure back to `automationRuns`
5. Refactor `runNow` and cron dispatch to share one dispatch helper so run state is consistent

Safe defaults:

- Existing `process_agent_tasks` automation behavior remains supported
- Existing agents without Symphony config remain unaffected
- Symphony only runs when explicitly selected in an automation definition

## Files to change

- `prds/symphony-automation-adapter.md` - plan and verification
- `TASK.md` - track the adapter rollout
- `convex/schema.ts` - extend automation action type union
- `convex/functions/automations.ts` - add typed dispatch helper, Symphony adapter scheduling, and run-state normalization
- `convex/functions/daytona.ts` - add `runSymphonyAutomation` bridge action
- `changelog.md` - record the new adapter
- `files.md` - update inventory descriptions

## Edge cases and gotchas

- `run_symphony` should fail cleanly if the target agent is not configured for Symphony
- Missing bridge URL, missing token, or missing repo metadata should produce user-facing run errors
- Automation definitions should stay backward compatible for existing `process_agent_tasks` records
- Manual and scheduled dispatch paths must update run status consistently
- The Symphony bridge contract for automation should be distinct from `/execute/code` and `/execute/command`

## Verification

- [ ] Create a manual `run_symphony` automation definition and confirm it writes a run record
- [ ] Confirm manual dispatch moves the run through `running` to `succeeded` or `failed`
- [ ] Confirm scheduled dispatch does the same via `automationControlPlaneTick`
- [ ] Confirm `process_agent_tasks` still dispatches successfully after refactor
- [ ] Confirm a non-Symphony agent produces a clear run failure for `run_symphony`
- [ ] `npx convex codegen`
- [ ] `npm run typecheck`
- [ ] `npm run lint`

## Related

- `prds/automation-control-plane.md`
- `prds/symphony-execution-backend.md`
