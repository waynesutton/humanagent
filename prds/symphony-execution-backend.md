# Symphony execution backend

## Summary

Add Symphony as an optional code execution backend for agents without replacing the existing HumanAgent runtime. This keeps Convex as the source of truth and preserves current Daytona behavior unless a user explicitly opts an agent into Symphony.

## Problem

HumanAgent already supports tool execution and code execution through Daytona, but there is no execution backend abstraction for isolated implementation runs. If Symphony is added directly into task orchestration or the main agent runtime, existing board, automation, and task flows could regress.

## Proposed solution

Introduce a small execution backend contract at the current code execution wrapper layer.

Chosen approach:

1. Keep `convex/agent/runtime.ts` orchestration intact
2. Keep `daytona` as the implicit default backend
3. Add optional per-agent `executionBackend` config with provider `daytona` or `symphony`
4. Add a new `symphony` credential service using the existing BYOK model
5. Route `execute_code` and `execute_command` wrapper calls through a backend selector
6. Implement Symphony as a bridge adapter that calls a user-provided endpoint and normalizes results into the same `{ success, result, error }` contract used today

This is intentionally additive. Existing agents with no backend config continue using Daytona.

## Files to change

- `prds/symphony-execution-backend.md` - feature plan and verification
- `TASK.md` - track the rollout work
- `convex/schema.ts` - add `agents.executionBackend` and `symphony` credential support
- `convex/functions/agents.ts` - accept and store execution backend config
- `convex/functions/credentials.ts` - allow Symphony credentials and status reporting
- `convex/functions/daytonaQueries.ts` - load agent execution backend and Symphony credentials
- `convex/functions/daytona.ts` - route wrapper execution to Daytona or Symphony bridge
- `src/lib/platformApi.ts` - expose Symphony in code execution services
- `src/pages/SettingsPage.tsx` - add Symphony bridge credential form
- `src/pages/AgentsPage.tsx` - add per-agent backend selection and repo context inputs
- `.env.example` - document optional Symphony bridge usage
- `changelog.md` - record the feature
- `files.md` - update inventory descriptions

## Edge cases and gotchas

- Agents without `executionBackend` config must continue using Daytona
- Symphony must never auto-activate just because a Symphony credential exists
- Symphony bridge failures must return the same shaped errors as Daytona so task outcome handling stays stable
- Symphony requires a configured bridge URL and agent repo metadata before execution can succeed
- `execute_code` and `execute_command` should remain the only routing seam in v1 so board, cron, and automation logic stay untouched

## Verification

- [ ] Existing agents without backend config still execute through Daytona
- [ ] Agents configured for `symphony` return a clear error when the bridge credential is missing
- [ ] Agents configured for `symphony` send code and command payloads to the configured bridge URL
- [ ] `execute_code` and `execute_command` still return the existing runtime wrapper shape
- [ ] `npm run typecheck`
- [ ] `npm run lint`

## Related

- `prds/automation-control-plane.md`
- `prds/composio-daytona-integration.md`
- [openai/symphony](https://github.com/openai/symphony)
