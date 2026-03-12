# Agent teams autonomy

## Summary

Add first class agent teams inside a user's existing workspace so multiple agents can work together on shared tasks with shared skills, team level auto mode, and team level reporting without breaking current single agent flows.

## Problem

The app already supports multiple agents, A2A messaging, skills, tasks, and autonomous task execution, but everything is still centered on one agent at a time. Users cannot group agents into a reusable team, assign work to that team, share skills across the team, or let a lead agent coordinate the team on the user's behalf.

## Proposed solution

Add agent teams as a workspace scoped concept rather than a new multi human organization model. A team belongs to one user, has a lead agent, can include multiple member agents, can have shared team skills, and can define autonomy settings for auto execution, autonomous task creation, and outbound reporting.

Extend tasks so a task can target either a single agent or a team. When a task targets a team and the team is in auto mode, route the task through a team processor that gives the lead agent team context and lets it use the existing runtime actions to delegate, create subtasks, and report back.

Fix the runtime skill lookup to use the `skillAgents` junction table as the canonical source so shared and many to many skill assignment works reliably for both individual agents and team execution.

## Files to change

- `convex/schema.ts` - add team tables and task fields for team assignment and delegation
- `convex/functions/teams.ts` - create team CRUD, membership, shared skills, and task listing APIs
- `convex/functions/board.ts` - allow team scoped task assignment and auto processing entry points
- `convex/agent/queries.ts` - load capabilities from junction tables and include team context
- `convex/agent/runtime.ts` - support team context and delegated subtasks assigned to specific agents
- `convex/crons.ts` - optionally process queued team work through the lead agent
- `src/pages/TeamsPage.tsx` - team management UI for create, edit, membership, skills, and autonomy
- `src/pages/BoardPage.tsx` - team assignment controls for tasks and team badges in the board
- `src/pages/AutomationPage.tsx` - team overview tab for orchestration visibility
- `src/App.tsx` - add teams route
- `src/components/layout/DashboardLayout.tsx` - add teams navigation
- `src/lib/platformApi.ts` - expose team APIs to the frontend
- `README.md` - document agent teams and team autonomy
- `TASK.md` - track implementation tasks
- `changelog.md` - record the feature
- `files.md` - update file inventory for new team files and changed responsibilities

## Edge cases and gotchas

- Existing tasks with only `agentId` must keep working exactly as before.
- Existing skills assigned only through `skill.agentId` still need backwards compatibility during the migration to junction driven lookups.
- Team auto mode should not create infinite delegation loops between agents.
- Team email reporting should reuse the current outbound email path instead of introducing a second delivery system.
- Team tasks should not require a team lead to have a public profile or public A2A enabled.
- Teams are user scoped only in this phase. No multi human membership or cross user workspace sharing is included.

## Verification

- [ ] Create a team with a lead agent and multiple member agents
- [ ] Assign shared skills to the team and verify team context reaches the runtime
- [ ] Create a board task assigned to a team and verify the lead agent processes it
- [ ] Verify the lead agent can create subtasks for specific member agents
- [ ] Verify existing single agent task creation and execution still works
- [ ] Verify A2A, public tasks, and skills pages keep their current behavior
- [ ] Run `npm run typecheck`
- [ ] Check edited files with lints

## Related

- `prds/automation-control-plane.md`
- `prds/agent-outcome-and-response-pipeline.md`
