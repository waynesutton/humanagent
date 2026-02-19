# HumanAgent Tasks

Active development tasks and roadmap items.

Session updates complete on 2026-02-19. Last updated 2026-02-19.

## In Progress

- [ ] Test workflow pipeline visualization end-to-end: trigger agent task processing and verify steps appear in BoardPage task detail panel
- [ ] Regression test OpenAI-compatible providers (OpenAI, DeepSeek, MiniMax, Kimi, custom base URLs) after reasoning model detection and token-parameter changes
- [ ] Verify `gpt-5-nano` and `gpt-5-mini` produce non-empty responses after reasoning_effort + token budget fix
- [ ] Validate new chat diagnostics copy for common provider/model/base-URL misconfiguration errors
- [ ] QA model selection UX in `SettingsPage` and `AgentsPage` across providers (typed model IDs + autocomplete suggestions + modal flow)
- [ ] Validate live model fetch behavior and fallback handling for providers with BYOK keys (OpenAI, OpenRouter, Anthropic, DeepSeek, Google, Mistral, MiniMax, Kimi, xAI)
- [ ] Complete agent runtime testing with all LLM providers
- [ ] Verify X/Twitter integration with xAI Grok mode
- [ ] setup domain name https://dash.cloudflare.com/fd1c9b236bcc4249878be762a9cca473/humana.gent
- [ ] setup domain in convex
- [ ] setup docs
- [ ] update box borders on profile
- [ ] polish inbox and agent chat handoff UX
- [ ] mayke sure all in sync
- [ ] npm run typecheck
- [ ] add API key edit flow for route-group and agent restrictions (without rotation)
- [ ] terms and privacy poliyc
- [ ] PDF/image/video report generation for complex task outcomes (beyond markdown text) — external API calls not yet wired
- [ ] Actual image generation via DALL-E/Stability API when `generate_image` action fires (placeholder wired)
- [ ] Actual tool execution sandbox for `call_tool` action type (placeholder wired)
- [ ] Performance dashboard and agent metrics reports
- [x] Validate agent auto-task processing: confirm auto/cron agents pick up pending tasks via `processAgentTasks` and move them through board columns end to end
- [ ] Add "Set target date" quick action on in-progress task cards when ETA is unknown

## Up Next

- [x] Add ElevenLabs voice integration for phone calls
- [x] Implement browser automation tools (Firecrawl, Stagehand, Browser Use) (if it make sense to add browser use with stang hand)
- [x] Add agent scheduling execution (cron-based agent runs)
- [x] Build agent thinking UI for viewing reasoning/decisions

## Backlog

### Core Features

- [ ] Implement Google Calendar sync via connected apps
- [ ] add telegram, slack, discord, what's app support
- [ ] Add Slack integration for agent notifications
- [ ] Build LinkedIn posting integration

### Agent Capabilities

- [x] Vector search for agent memory retrieval
- [x] Memory compression cron job implementation
- [x] Agent-to-agent (A2A) communication protocol
- [ ] Tool execution sandbox for agent actions

### UI/UX

- [x] Add task comments and attachments
- [x] Build conversation thread view
- [ ] Add agent activity timeline
- [x] Implement dark mode toggle

### Infrastructure

- [x] Add rate limit dashboard for monitoring
- [x] Build admin dashboard for user management
- [x] Implement webhook retry logic
- [x] Add health check endpoint for monitoring

### Security

- [x] Implement API key rotation
- [x] Add audit log export functionality
- [x] Build security alerts dashboard
- [ ] Add two-factor authentication option

# TBD

- [ ] Add email sending via Resend component
-

## Completed

- [x] Knowledge Graph Auto Generate and Live Graph View (2026-02-19)
  - [x] LLM-powered auto generation of knowledge graph nodes: `autoGenerateGraph` internal action in `convex/agent/runtime.ts` reads skill identity, capabilities, and domains, calls user's configured LLM, parses JSON response, creates nodes and bidirectional links
  - [x] Public `triggerAutoGenerate` mutation in `knowledgeGraph.ts` gates on auth and schedules the background action
  - [x] Frontend Auto Generate button in KnowledgeGraphSection with agent selector dropdown for multi-agent setups and LLM credential status gating (disabled when no provider configured)
  - [x] Interactive force-directed Canvas graph visualization in `src/components/KnowledgeGraphCanvas.tsx` with zero external dependencies. Nodes color-coded by type (concept, technique, reference, moc, claim, procedure), edges show relationships, drag/pan/zoom, hover tooltips, click to select. Legend and zoom controls overlay.
  - [x] List/graph view toggle in KnowledgeGraphSection header
  - [x] `SelectedNodeDetail` panel below graph view showing full content, tags, and linked node navigation
  - [x] Refactored `callLLMProvider` shared helper in `convex/agent/runtime.ts` to deduplicate provider routing switch block; `processMessage` now uses it
  - [x] Added `getSkillForAutoGen` and `listNodesInternal` internal queries in `knowledgeGraph.ts` for the auto-generate pipeline
  - [x] PRD at `prds/knowledge-graph-auto-mode.md`
- [x] Strip internal Convex task IDs from outcome text, UI, and TTS audio (2026-02-18)
  - [x] Added LLM prompt instruction in `crons.ts` telling the model to never include task IDs in human-readable response text
  - [x] Added `stripInternalIds` sanitizer in `convex/agent/runtime.ts` that regex-removes Convex ID patterns (28-36 char alphanumeric strings) from outcome text before storing to DB
  - [x] Added ID stripping in `convex/functions/voice.ts` at TTS consumption point so even existing DB records with leaked IDs are never spoken by ElevenLabs or OpenAI
  - [x] Three layers of defense: prompt instruction, storage-time sanitizer, TTS-time sanitizer
- [x] Fix React Router v7 future flag warnings and TTS error handling (2026-02-18)
  - [x] Added `v7_startTransition` and `v7_relativeSplatPath` future flags to `BrowserRouter` in `src/main.tsx` to silence console warnings
  - [x] Added 401/403 error handling in `convex/agent/tts.ts` for both ElevenLabs and OpenAI TTS with clean user-facing messages instead of raw provider JSON dumps
- [x] Replace native datetime-local picker with custom DateTimePicker component (2026-02-18)
  - [x] Built `src/components/DateTimePicker.tsx` with calendar grid, 12-hour time columns, AM/PM toggle, Clear/Today actions
  - [x] Uses site design tokens: surface/ink/accent colors, 1px corners, DM Sans font
  - [x] Supports `inline` variant (compact pill for task creation row) and `field` variant (full width for edit modal)
  - [x] Replaced both `<input type="datetime-local">` instances in `BoardPage.tsx`
- [x] Fix tasks stuck in "In Progress" forever (2026-02-19)
  - [x] Root cause: `doNow` and `createTask` mutations set task status but never triggered agent processing; tasks waited for cron that only runs for agents with active scheduling
  - [x] `doNow` now calls `ctx.scheduler.runAfter(0, processAgentTasks)` to process immediately
  - [x] `createTask` now schedules agent processing when an agent is assigned
  - [x] Added 30-minute staleness guard: tasks stuck `in_progress` past threshold are force-completed by the cron with a timeout message
  - [x] Rewrote `processAgentTasks` prompt to be more directive: bans `in_progress` re-assignment, requires completion or failure for every task, stronger examples
- [x] Knowledge Graph / Skill Graphs (2026-02-19)
  - [x] Added `knowledgeNodes` table to schema with full text search, vector search, and graph edge support
  - [x] Added `graphIndexNodeId` field to skills table for root MOC node linking
  - [x] Created `convex/functions/knowledgeGraph.ts` with CRUD, bidirectional linking, graph traversal, stats, and internal agent runtime mutations
  - [x] Integrated knowledge graph traversal into agent runtime `processMessage` pipeline (step 4b between semantic memory and message array build)
  - [x] Added `create_knowledge_node` and `link_knowledge_nodes` action types to agent runtime parser and executor
  - [x] Updated system prompt with knowledge graph action formats and instructions
  - [x] Built Knowledge Graph section in `SkillFilePage` with create, view, edit, delete, link, and unlink UI
  - [x] Wired knowledge graph APIs to `src/lib/platformApi.ts`
  - [x] PRD at `prds/skill-graphs.md`
  - [x] Verified integration: all 7 integration points pass (runtime pipeline ordering, action type/parser/executor, system prompt, schema indexes, platform API, SkillFilePage component, internal function references)
- [x] Workflow pipeline visualization and datetime awareness (2026-02-18)
  - [x] Added `workflowSteps` optional array field to tasks table schema with label, status, startedAt, completedAt, durationMs, detail
  - [x] Instrumented `convex/agent/runtime.ts` `processMessage` to collect 7 pipeline phases (Security scan, Config load, Context build, LLM call, Parse response, Execute actions, Save memory) with timing, written once at end via `setWorkflowSteps`
  - [x] Added `addWorkflowStep`, `setWorkflowSteps`, `getWorkflowSteps` mutations/queries in `convex/functions/board.ts`
  - [x] Built `WorkflowView` component with GitHub Actions CI-style pipeline boxes, Phosphor icons, status indicators, connector lines, duration labels, and total elapsed time
  - [x] Built `WorkflowViewCompact` inline variant for compact spaces
  - [x] Integrated pipeline view in BoardPage task detail panel as collapsible section (auto-open for in-progress tasks)
  - [x] Created `src/lib/datetime.ts` with `getUserTimezone()`, `formatRelativeTime()`, `formatDuration()`, `formatDateTime()`, `getLocalDateContext()`, `getDateContext()`
  - [x] Injected current date/time into agent system prompt at build time (zero DB queries, ~15 tokens per call)
  - [x] Wired `getWorkflowSteps` to `platformApi.ts`
  - [x] PRD at `prds/workflow-visualization-datetime.md`
- [x] Board task audio narration (2026-02-18)
  - [x] Added `generate_audio` action type to agent runtime so agents produce TTS audio when tasks request narration
  - [x] Added `outcomeAudioId` field to tasks table in schema
  - [x] Added `speakTaskOutcome` public action in `convex/functions/voice.ts` for on-demand audio generation from task outcomes
  - [x] Added `getTaskForAudio` internal query, `linkOutcomeAudio` mutation, `getOutcomeAudioUrl` query in board.ts
  - [x] Added `getDefaultAgentId` and `getVoiceConfig` internal queries in queries.ts
  - [x] Added "Listen to report" button on BoardPage task detail panel and outcome viewer modal
  - [x] Added "Audio narration available" badge on task cards when outcomeAudioId is present
  - [x] Updated agent system prompt to include `generate_audio` as supported action type
  - [x] Fixed: moved `getVoiceConfig` from Node.js tts.ts to V8 queries.ts (Convex only allows queries in V8)
  - [x] Fixed: `BoardPage` crash from `detailsTaskId` used before initialization (reordered hooks)
- [x] Voice TTS features: ElevenLabs and OpenAI TTS backend actions, chat audio playback, voice picker dropdown on AgentsPage (2026-02-18)
- [x] Cap public profile activity feed to 10 items with scroll (2026-02-18)
- [x] Make "Request an agent to do a task" a collapsible toggle on public profile (2026-02-18)
- [x] Fix grid alignment on public profile page (items-stretch) (2026-02-18)
- [x] Fix "Show/Hide" label clipping in request-task toggle button (2026-02-18)
- [x] Agent outcome and response pipeline features from PRD (2026-02-18)
  - [x] Schema: added `outcomeFileId`, `outcomeImages`, `outcomeVideoUrl`, `parentTaskId`, `toolCallLog` to tasks table with `by_parentTaskId` index
  - [x] Long-form file storage: runtime auto-uploads cleanResponse to Convex file storage when >8000 chars, saves `outcomeFileId` on task, download link in outcome viewer
  - [x] Thinking mode: `parseThinkingBlocks` extracts `<thinking>` blocks from LLM responses and saves as `reasoning` type agentThoughts via `saveThought` mutation
  - [x] Multi-step subtasks: `create_subtask` action type in runtime parser, `createTaskFromAgent` accepts `parentTaskId`, board shows subtask progress bar on parent cards
  - [x] Agent-to-agent delegation: `delegate_to_agent` action type dispatches tasks to target agent by slug via `processMessage` with `a2a` channel
  - [x] Image output: `generate_image` action type parsed and logged (actual API call placeholder, needs DALL-E/Stability key)
  - [x] Tool use: `call_tool` action type parsed and logged (actual execution placeholder, needs tool registry)
  - [x] BoardPage UI: subtask badge on child tasks, subtask progress bar on parent cards, full report download link, outcome file indicator on cards
  - [x] Added `getOutcomeFileUrl`, `getSubtasks`, `storeOutcomeFile`, `linkOutcomeFile` queries/mutations in board.ts
  - [x] Added `saveThought`, `getAgentBySlug` in agent queries.ts
  - [x] Wired new board APIs to platformApi.ts
- [x] Fix gpt-5-nano empty response issue in agent runtime (2026-02-18)
  - [x] Added `isReasoningModel()` detection for o1, o3, o4, and gpt-5 family models
  - [x] Reasoning models now get 16384 token budget (up from 2048) so chain-of-thought does not exhaust the output budget
  - [x] Reasoning models send `reasoning_effort: "low"` as first request variant to keep thinking compact
  - [x] Improved empty-content diagnostic logging with reasoning_tokens, completion_tokens, and finish_reason
- [x] Improve BoardPage modal usability and assignment guardrails (2026-02-18)
  - [x] Add visible close `X` to edit-task modal
  - [x] Constrain board modals to viewport height with internal scrolling so long task details stay in-window
  - [x] Block unassigned tasks from entering board columns via create/edit/drag-drop flows
  - [x] Add warning toasts explaining agent-assignment requirement for Todo/In Progress/Done placement
- [x] Update chat and board composer keyboard behavior (2026-02-17)
  - [x] `AgentChatPage`: `Shift+Enter` sends message, `Enter` adds a new line
  - [x] `BoardPage` task composer: switched to multiline textarea with `Shift+Enter` to add task and `Enter` to add new line
  - [x] `InboxPage`, `A2AInboxPage`, and `PublicUserProfilePage` request composer now use the same pattern (`Enter` newline, `Shift+Enter` send/request)
  - [x] Added inline helper hints under each composer so keyboard shortcuts are visible in UI
- [x] Harden task outcome quality so completed tasks do not store boilerplate placeholders (2026-02-17)
  - [x] Remove generic runtime fallback outcome text (`"Done. I applied the requested app update."`)
  - [x] Add boilerplate detector and outcome selection guard in `convex/agent/runtime.ts` for `update_task_status`
  - [x] Add stricter scheduled-task prompt rules in `convex/crons.ts` (explicitly ban placeholder replies and require per-task detailed markdown sections)
- [x] Add padding and visual container to Pipeline section in BoardPage task detail modal (2026-02-19)
- [x] Redesign task details modal in BoardPage for readability and mobile (2026-02-19)
  - [x] Widen modal from `max-w-2xl` to `max-w-3xl` for better outcome readability
  - [x] Remove raw task ID from header, show task description as title with status badges and date inline
  - [x] Move outcome section to full-width primary position above comments and attachments
  - [x] Add Phosphor `CopySimple` icon to copy outcome text to clipboard
  - [x] Improve markdown prose styles for headings, lists, code blocks in outcome rendering
  - [x] Collapse comments and attachments into `<details>` sections with count badges
  - [x] Optimize mobile layout with tighter padding and dynamic max-height
  - [x] Fix pre-existing `selectedColumn` null vs undefined type error in task creation
- [x] Redesign BoardPage top UI with ChatGPT-style task compose and sidebar nav (2026-02-18)
  - [x] Replace busy header toolbar with left sidebar: Board/Projects view toggle, agent/project filters, New project toggle, Archive action
  - [x] Compose area always visible at top — single input with pill dropdowns for column, agent, project, date, public toggle
  - [x] New project form collapsible via sidebar toggle button
  - [x] Auto-initialize selected column from first sorted column on load
  - [x] Fix badge overflow on task cards: add `flex-wrap` + `min-w-0` + `max-w truncate` to badge rows
  - [x] Fix board grid breakpoint: `md:grid-cols-2 xl:grid-cols-3` to account for sidebar width
- [x] Fix agent task outcome showing only brief meta-summary instead of actual work output (2026-02-18)
  - [x] Use `cleanResponse` (full agent text reply) as `outcomeSummary` when task completes or fails
  - [x] Fall back to action block summary only when full reply is unavailable
- [x] Add task outcome viewer modal with markdown rendering (`react-markdown`) and "View full report" button in task details
- [x] Add "View outcome" icon on completed task cards in the board for quick report access
- [x] Render outcome summary as formatted markdown in task details read mode with edit toggle
- [x] Improve task completion email to include full outcome summary content with report section header
- [x] Add shared `useEscapeKey` hook and wire ESC key dismiss to all 12 modals across 6 pages
- [x] Fix empty LLM response handling (graceful fallback instead of crash) for scheduled task processing
- [x] Fix OpenAI model refusal detection via `refusal` field in API responses
- [x] Improve scheduler prompt with explicit `<app_actions>` format examples for smaller models
- [x] Wire agent scheduler to LLM runtime: `processAgentTasks` in `convex/crons.ts` now queries pending/in-progress tasks via `getAgentContext` and sends them to `processMessage` so auto/cron agents actually process tasks
- [x] Add task outcome fields (`outcomeSummary`, `outcomeLinks`) and outcome email delivery via AgentMail on task completion
- [x] Add "Outcome" section in board task details modal with editable summary, links, save button, and email delivery status indicator
- [x] Add type-aware attachment previews in task details (image thumbnails, video players, PDF preview, doc downloads)
- [x] Auto-resolve board columns in `updateTaskFromAgent` so agent status transitions move task cards to the correct Kanban column automatically
- [x] Set `doNowAt` in `updateTaskFromAgent` when moving tasks to in_progress so the board shows "Started Xm ago"
- [x] Add feed items for agent-initiated in_progress and failed task transitions
- [x] Fix `projectId: null` schema validation error in board task updates
- [x] Fix blank board page caused by React hooks ordering violation
- [x] Fix agent scheduler only writing timestamps without calling the LLM runtime
- [x] Enhanced `formatTargetStatus` with richer status labels: completed date, failed, started time ago, ETA, overdue
- [x] Agent reports to email from AgentMail (outcome email on task completion)
- [x] Add compact copy icon buttons for each public connect-option row in `PublicUserProfilePage` (main list + agent modal)
- [x] Add task target completion tracking on board tasks (`targetCompletionAt`) and show due-status context on task cards
- [x] Add Todo quick action “Do now” to move tasks into in-progress with activity feed sync
- [x] Add Settings cron jobs management section (`settings-cron-jobs`) with create/list/pause/resume/delete flows
- [x] Re-enable privacy-aware public task query for public profiles and agent pages (`getPublicTasks`)
- [x] Sync chat-to-task creation with activity feed events (`createTaskFromChat`)
- [x] Keep task board, projects, settings scheduling, chat, and public/private surfaces aligned for recent board workflow updates
- [x] Fix OpenAI model call failure for GPT-family models requiring `max_completion_tokens` instead of `max_tokens`
- [x] Harden OpenAI-compatible runtime calls with sequential request fallbacks (`max_completion_tokens` -> `max_tokens` -> no token field)
- [x] Align Kimi runtime default endpoint to `https://api.moonshot.ai/v1`
- [x] Add inline `Agent is thinking...` indicator in `/chat` while waiting for scheduled model responses
- [x] Add targeted chat diagnostics for provider/model/base-URL configuration failures instead of always returning a generic runtime error
- [x] Add provider model catalog APIs in `convex/functions/credentials.ts` (`getModelCatalog`, `refreshModelCatalog`) for live model lookup with fallback suggestions
- [x] Switch LLM model UX in `SettingsPage` and `AgentsPage` to editable text inputs with provider suggestion autocomplete (datalist), while keeping model help modals
- [x] Expand OpenAI fallback model suggestions to include GPT-5 IDs (`gpt-5.2`, `gpt-5-mini`, `gpt-5-nano`)
- [x] Improve Sileo toast UX with faster auto-dismiss defaults for standard notifications
- [x] Replace full-width toast dismiss button with compact corner `×` close control
- [x] Tune Sileo toast styling so close behavior remains readable and consistent with existing dark card UI
- [x] Normalize confirm/action toast duration to 5000ms (down from 10000ms)
- [x] Normalize all toast durations to 5400ms (standard + confirm/action) with global bottom-right placement
- [x] Restore native-looking rounded Sileo toast shape while keeping compact corner close behavior for standard toasts
- [x] Move Google Fonts loading from CSS `@import` to `index.html` links to reduce PostCSS warning noise
- [x] Add LLM model help modal to `AgentsPage` with provider model-doc links, live OpenRouter model lookup, and click-to-use model insertion
- [x] Add LLM model help modal to `SettingsPage` for user-level LLM configuration
- [x] Add quick-link anchor navigation in `SettingsPage` for section jump navigation
- [x] Fix LLM model help modal scrolling in both `SettingsPage` and `AgentsPage`
- [x] Add board projects system end to end: schema (`boardProjects`, `tasks.projectId`), Convex project CRUD APIs, project-aware task create/update, and frontend API wiring
- [x] Upgrade `BoardPage` with dual modes (Board + Projects), project create/grouping UX, project filters, project badges on task cards, and active board/project scope labels
- [x] Fix `BoardPage` crash caused by conditional hook execution path in loading state
- [x] Add dual llms discovery model with username aggregate files and per-agent files (`/:username/:slug/llms.txt`, `/:username/:slug/llms-full.md`) plus public route/UI wiring
- [x] Standardize llms endpoint labeling across canonical cards/pages (`Profile llms (aggregate)` and `Agent llms (persona)` plus full variants)
- [x] Add default-agent selector in `SettingsPage` using shared `agents.setDefault` flow, and align landing copy with default-route behavior
- [x] Add 1:1 Agent Chat page (`/chat`) with per-agent conversations and chat-to-task creation flow (creates tasks directly in Board Inbox)
- [x] Add "Create task" action on chat message bubbles so past messages can be sent to Board Inbox without copy/paste
- [x] Add `Todo` board column to default workflow and backfill for existing users via `ensureDefaultColumns`
- [x] Add feed item management: hide, archive, edit, delete posts from Activity Feed
- [x] Add `isHidden`, `isArchived`, `updatedAt` fields to `feedItems` schema with `by_userId_archived` index
- [x] Add feed mutations: `updatePost`, `hidePost`, `unhidePost`, `archivePost`, `unarchivePost`, `deletePost`
- [x] Add action menu dropdown on feed items with edit/hide/archive/delete options
- [x] Add edit modal for updating manual posts
- [x] Add delete confirmation modal for feed items
- [x] Add live public activity section on `src/pages/LandingPage.tsx` before "How it works"
- [x] Add global public feed query `getGlobalPublicFeed` in `convex/functions/feed.ts` for cross-user real-time stream consumption
- [x] Add `feedItems` index `by_public` in `convex/schema.ts` to support global public feed lookups
- [x] Update landing page public activity feed to show latest 10 items in a scrollable box with auto-scroll on incoming events
- [x] Add Sileo as global notification system with shared helper (`src/lib/notify.ts`)
- [x] Replace mutation status/error handling with Sileo toasts across onboarding, settings, agents, board, inbox, A2A inbox, skills, and feed pages
- [x] Replace browser confirm dialogs with toast-based action confirmations for destructive actions
- [x] Fix Sileo integration issues causing faded or low-contrast toast text
- [x] Update docs inventory in `files.md` and changelog entries for notification system rollout
- [x] Review upstream `robelest/convex-auth` updates and refresh `prds/robel-auth.md` with compatibility notes and migration blockers
- [x] Fix Vite Sileo stylesheet import error in `src/main.tsx` and verify with `npx vite build`
- [x] Harden public message API auth to fail closed on invalid API keys with stable JSON error envelopes
- [x] Add canonical discovery docs routes: `/:username/sitemap.md`, `/api/v1/agents/:username/docs.md`, `/tools.md`, `/openapi.json`
- [x] Add shared docs contract builder in `convex/functions/agentDocs.ts` for markdown + OpenAPI outputs
- [x] Make `llms.txt` and `llms-full.md` privacy-aware using agent `publicConnect` and user `privacySettings`
- [x] Update public profile endpoint cards to include API Docs, Tools Docs, OpenAPI, and Sitemap links
- [x] Validate project type safety after changes (`npm run typecheck` passes)
- [x] Enable username edits in settings with backend validation and uniqueness checks
- [x] Add social profile fields in settings (X/Twitter, LinkedIn, GitHub)
- [x] Normalize social input handles/URLs to canonical links on save
- [x] Add profile-card save button and helper text for social profile inputs
- [x] Resolve all current TypeScript errors (`npm run typecheck` passes)
- [x] Multi-provider BYOK LLM support (9 providers including DeepSeek)
- [x] Add DeepSeek BYOK support across settings, agents, schema validators, credentials, and runtime routing
- [x] Agent security module with injection detection
- [x] MCP server endpoints with JSON-RPC 2.0
- [x] WebMCP tool registration
- [x] Twilio SMS/Voice webhooks
- [x] Skill file endpoints
- [x] LLMs.txt endpoints for AI discoverability
- [x] Multi-agent support per user
- [x] Privacy settings for public profiles
- [x] Inbox page for conversations
- [x] Board page with task management
- [x] Feed page with public posts
- [x] X/Twitter integration config
- [x] Add admin route guard and hide Admin nav for non-admin users
- [x] Move account actions to username dropdown in dashboard header
- [x] Move Online status indicator from header into Settings
- [x] Add admin badge in Settings for instant role visibility
- [x] Keep public profile base route stable (`/:username`) without forced agent slug redirect
- [x] Fix discovery-doc route collisions so sitemap/llms/docs paths are not treated as agent slugs
- [x] Implement API key delegation overlay in `apiKeys` (`keyType`, `allowedAgentIds`, `allowedRouteGroups`) with backwards-compatible defaults
- [x] Enforce API key ownership binding + route-group + scoped gateway checks across REST (`api:call`) and MCP (`mcp:call`) routes
- [x] Update Settings API key create flow with advanced restrictions for key type, route groups, and optional agent scope
- [x] Update public profile and generated docs content to clearly separate authenticated API/MCP endpoints from public docs and sitemap routes

## Notes

- Agent runtime uses OpenRouter as default provider (free tier available)
- All credentials stored encrypted, never in plaintext
- WebMCP requires Chrome 146+ with navigator.modelContext support
- llms.txt follows the spec at llmstxt.org for AI discoverability
