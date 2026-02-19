# Changelog

All notable changes to HumanAgent are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- Workflow pipeline visualization: CI-style step view (inspired by GitHub Actions) showing agent processing phases with Phosphor icons, status indicators, per-step durations, connector lines, and total elapsed time. Renders in BoardPage task detail panel as a collapsible "Pipeline" section that auto-opens for in-progress tasks.
- `workflowSteps` field on the tasks table to record each agent pipeline phase (Security scan, Config load, Context build, LLM call, Parse response, Execute actions, Save memory) with timing data. Written once at end of pipeline via `setWorkflowSteps` mutation for minimal DB overhead.
- `WorkflowView` and `WorkflowViewCompact` components (`src/components/WorkflowView.tsx`) with grouped phase boxes, Phosphor status icons (`CheckCircle`, `XCircle`, `CircleNotch`, `ShieldCheck`, `GearSix`, `Brain`, `Lightning`, `CodeBlock`, `FloppyDisk`), and connector arrows.
- Lightweight datetime utility library (`src/lib/datetime.ts`) with `getUserTimezone()` (Intl API, no DB call), `formatRelativeTime()`, `formatDuration()`, `formatDateTime()`, `getLocalDateContext()` (for agent prompt injection at ~15 tokens), and `getDateContext()` for structured programmatic use.
- Agent system prompt now includes current date/time context line automatically at build time (zero DB queries, zero external API calls). Agents always know "now" without burning tokens on timezone detection.
- `addWorkflowStep`, `setWorkflowSteps`, and `getWorkflowSteps` in `convex/functions/board.ts` for workflow step CRUD.
- Custom `DateTimePicker` component (`src/components/DateTimePicker.tsx`) that replaces native `datetime-local` inputs with a styled picker matching the site's design system (surface/ink/accent tokens, 1px corners, DM Sans font). Calendar grid with month navigation, 12-hour time columns with 5-minute increments, AM/PM toggle, and Clear/Today footer actions. Supports `inline` (compact pill) and `field` (full width) variants.
- Voice TTS backend: `convex/agent/tts.ts` with ElevenLabs and OpenAI TTS actions that generate audio from text and store it in Convex file storage
- Voice listing action: `convex/functions/voice.ts` with public `listVoices` action that fetches available ElevenLabs voices from the API for the voice picker
- Audio playback on agent chat: each agent message in `AgentChatPage` now has a speaker button that generates speech via the agent's configured voice and plays it inline
- ElevenLabs voice picker: replaced the raw Voice ID text input in `AgentsPage` with a dropdown that loads available voices from the user's ElevenLabs account, with preview playback
- Voice badge on agent cards: agent list view now shows the configured voice provider
- Board task audio narration: `generate_audio` action type in the agent runtime so agents can produce TTS audio files when tasks request audio, reports, or narration
- "Listen to report" button on `BoardPage` task detail panel and outcome viewer modal; generates audio on demand via ElevenLabs or OpenAI TTS and plays it inline
- `outcomeAudioId` field on the tasks table to persist generated audio narrations; task cards show an "Audio narration available" badge when present
- `speakTaskOutcome` public action in `convex/functions/voice.ts` that reads a task outcome summary, generates TTS via the assigned agent's voice config, stores the audio, and links it to the task
- `getOutcomeAudioUrl` query and `linkOutcomeAudio` mutation in `convex/functions/board.ts` for storing and retrieving outcome audio
- `getTaskForAudio` internal query and `getDefaultAgentId` internal query for audio generation lookups
- Public profile activity feed capped at 10 items fetched and displayed (reduced from 20) to keep the section compact
- Activity feed on `PublicUserProfilePage` now scrolls within a fixed `max-h-96` container so it does not push page content down
- "Request an agent to do a task" section on public profile is now a collapsible toggle (collapsed by default) with show/hide affordance and `aria-expanded` for accessibility
- Toggle header uses `gap-3` and `shrink-0` on the label so "Show/Hide" text is never clipped

### Fixed

- Moved `getVoiceConfig` internal query from `convex/agent/tts.ts` (Node.js runtime) to `convex/agent/queries.ts` (V8 runtime) to fix Convex push error: queries cannot be defined in Node.js action files
- Fixed `BoardPage` crash (`Cannot access 'detailsTaskId' before initialization`) by moving audio playback state and handlers below all `useState` declarations they depend on
- Fixed "Show" label being cut off inside the request-task toggle button by adding `gap-3` and `shrink-0` to the flex row
- Fixed public profile grid alignment by switching from `items-end` and `items-start` to `items-stretch` so both columns share the same height

### Changed

- `getPublicFeed` query limit on `PublicUserProfilePage` reduced from 20 to 10 to match the display cap

### Previous entries

- Agent outcome and response pipeline: long-form file storage, thinking mode, subtasks, agent delegation, image/tool action types per `prds/agent-outcome-and-response-pipeline.md`
- Schema fields on tasks table: `outcomeFileId` (file storage ref for full reports), `outcomeImages` (generated images), `outcomeVideoUrl`, `parentTaskId` (subtask hierarchy), `toolCallLog` (tool execution records)
- `by_parentTaskId` index on tasks for subtask queries
- Long-form outcome file storage: when `cleanResponse` exceeds 8000 chars, the runtime uploads the full text as a markdown file to Convex storage and links it via `outcomeFileId`; outcome viewer shows a "Download full report" link
- Thinking mode: `parseThinkingBlocks` in `convex/agent/runtime.ts` extracts `<thinking>` blocks from LLM responses and persists them as `reasoning` type entries in `agentThoughts` via the new `saveThought` internal mutation
- Multi-step subtask support: `create_subtask` action type in `<app_actions>`, `createTaskFromAgent` accepts optional `parentTaskId`, board task cards show a progress bar with completed/total counts for parent tasks, child task cards display a "Subtask" indicator
- Agent-to-agent delegation: `delegate_to_agent` action type enables a coordinator agent to dispatch work to another agent by slug via `processMessage` on the `a2a` channel
- `generate_image` action type parsed in runtime (placeholder logging; needs DALL-E/Stability API key to produce actual images)
- `call_tool` action type parsed in runtime (placeholder logging; needs tool registry and execution sandbox)
- `getOutcomeFileUrl` authed query and `getSubtasks` authed query in `convex/functions/board.ts`
- `storeOutcomeFile` internal action and `linkOutcomeFile` internal mutation for file storage workflow
- `saveThought` internal mutation and `getAgentBySlug` internal query in `convex/agent/queries.ts`
- `OutcomeFileDownload` component in `BoardPage.tsx` for inline file download links in outcome viewer
- Subtask progress bar and subtask badge UI on board task cards
- Redesigned BoardPage header with ChatGPT-style always-visible task compose area (single input + pill option row) replacing the old multi-button toolbar
- Added left sidebar nav to BoardPage with Board/Projects view toggle, agent/project filter dropdowns, collapsible New project form, and Archive completed action
- Auto-initializes compose column selector to first sorted board column on page load so the form is always ready

### Fixed

- Redesigned task details modal in `src/pages/BoardPage.tsx` for readability and mobile: widened from `max-w-2xl` to `max-w-3xl`, removed raw task ID display, moved outcome to full-width primary section with Phosphor `CopySimple` clipboard icon, collapsed comments and attachments into `<details>` sections with count badges, improved markdown prose styles for code/lists/headings, and optimized mobile padding and dynamic max-height
- Fixed pre-existing type error where `selectedColumn` (nullable) was passed where `Id<"boardColumns"> | undefined` was expected in task creation
- Fixed `gpt-5-nano` (and other reasoning models) returning empty responses by adding `isReasoningModel` detection in `convex/agent/runtime.ts` that applies higher token budgets (16384 vs 2048) and `reasoning_effort: "low"` so the model does not exhaust its budget on internal chain-of-thought before producing visible output
- Improved empty-content diagnostic logging in `callOpenAI` to report `completion_tokens`, `reasoning_tokens`, and `finish_reason` for faster debugging when models return blank responses
- Fixed board modals in `src/pages/BoardPage.tsx` to stay within the viewport on long content by using `h-dvh` overlay sizing, constrained modal max height, and internal scrolling
- Fixed missing close affordance consistency by adding a clear top-right `X` close button to the board edit modal and keeping task-details close controls reachable while scrolling
- Fixed chat input keyboard flow in `src/pages/AgentChatPage.tsx`: `Shift+Enter` now sends and plain `Enter` inserts a new line
- Fixed board task composer keyboard flow in `src/pages/BoardPage.tsx`: composer now supports multiline input (`textarea`) with `Shift+Enter` to submit and plain `Enter` for new lines
- Fixed inbox reply keyboard flow in `src/pages/InboxPage.tsx` to match app standard: `Enter` newline and `Shift+Enter` send
- Fixed A2A compose + quick-reply keyboard flow in `src/pages/A2AInboxPage.tsx` to match app standard: `Enter` newline and `Shift+Enter` send
- Fixed public profile task-request composer keyboard flow in `src/pages/PublicUserProfilePage.tsx` to match app standard: `Enter` newline and `Shift+Enter` request task
- Added inline keyboard helper copy under message/task composers so shortcut behavior is obvious
- Fixed agent task outcome displaying only a brief meta-summary instead of the actual work content: `processMessage` in `convex/agent/runtime.ts` now uses `cleanResponse` (full LLM text reply) as `outcomeSummary` when marking tasks completed or failed, falling back to the structured action summary only when the full reply is unavailable
- Fixed recurring placeholder outcomes in completed tasks (for example "Processing scheduled tasks." or generic "Done" replies) by adding outcome-quality guards in `convex/agent/runtime.ts` that reject boilerplate and persist a detailed fallback message when no substantive output is returned
- Fixed task card badge row overflowing card boundaries by adding `flex-wrap`, `min-w-0`, and `max-w truncate` to badge containers in `TaskCard` and `ArchivedTaskCard`
- Fixed board grid at `lg` breakpoint being too narrow after sidebar was added; updated to `md:grid-cols-2 xl:grid-cols-3`

### Changed

- Replaced native `<input type="datetime-local">` in `BoardPage.tsx` (task creation form and edit task modal) with custom `DateTimePicker` component so the date/time picker visually matches the site's design system instead of using browser default chrome
- Added reasoning model detection (`isReasoningModel`) in `convex/agent/runtime.ts` for o1, o3, o4, and gpt-5 family models with automatic parameter adjustment: 16384 token budget, `reasoning_effort: "low"` as first request variant, and sequential fallback to standard `max_completion_tokens` when provider rejects reasoning params
- Changed board task assignment rules in `src/pages/BoardPage.tsx`: unassigned tasks are now blocked from being placed or dragged into board columns (Todo, In Progress, Done), with warning toasts on create/edit/drag attempts
- Board view/project toggle moved from header tab strip to sidebar nav buttons for cleaner separation of navigation and content
- Scheduled task prompt in `convex/crons.ts` now explicitly bans placeholder acknowledgements and requires per-task detailed markdown output blocks before `<app_actions>`

- Added task outcome fields in schema (`tasks.outcomeSummary`, `tasks.outcomeLinks`) and email tracking fields (`outcomeEmailStatus`, `outcomeEmailSentAt`, `outcomeEmailLastAttemptAt`, `outcomeEmailError`) for task completion reporting
- Added "Outcome" section in board task details modal with editable summary, links, and a save button so users can document what the task produced
- Added type-aware attachment previews in task details: inline image thumbnails, inline video players, PDF preview buttons, and document download links
- Added outcome email delivery via AgentMail when a task is marked completed, sending the done status and results to the user's profile email if AgentMail is configured
- Added email delivery status indicator in task details (queued, sent, failed) with timestamp and error details
- Added `processAgentTasks` internal action in `convex/crons.ts` that wires the agent scheduler to the LLM runtime, so agents in auto/cron mode now actually process pending and in-progress tasks every 5 minutes instead of only logging timestamps
- Added auto-resolve board column in `updateTaskFromAgent` so agent-driven status changes (pending to in_progress, in_progress to completed/failed) automatically move task cards to the correct Kanban column
- Added `doNowAt` timestamp setting in `updateTaskFromAgent` when an agent moves a task to in_progress, so the board displays "Started Xm ago" instead of "In progress, ETA unknown"
- Added feed items for agent-initiated task transitions: "started working on a task" (in_progress) and "marked task as failed" (failed) alongside existing completion feed items
- Added `sendMessage` internal action in `convex/functions/agentmail.ts` for general transactional email sending from agent inboxes
- Added task outcome viewer modal in `src/pages/BoardPage.tsx` with markdown-rendered report view (`react-markdown`), scrollable content area, result links section, and "Open details" navigation
- Added "View outcome" icon (document icon, green) on completed task cards in the board so users can open the report directly without entering task details first
- Added markdown read mode in the task details Outcome section: when an outcome exists it renders as formatted markdown instead of a raw textarea, with an "Edit outcome" toggle to switch back to edit mode
- Added "View full report" button in task details header that opens the dedicated outcome viewer modal
- Added shared `useEscapeKey` hook in `src/hooks/useEscapeKey.ts` for keyboard-driven modal dismissal
- Added ESC key handling to 12 modals across 6 pages (BoardPage, SettingsPage, AgentsPage, FeedPage, SkillFilePage, PublicUserProfilePage) with stacking-aware priority so the topmost modal closes first
- Added compact copy icon buttons on each public connect-option row in `src/pages/PublicUserProfilePage.tsx`, including both the main profile list and the agent modal list
- Added task execution timing fields in schema (`tasks.targetCompletionAt`, `tasks.doNowAt`) to track planned completion windows and explicit “start now” actions
- Added `doNow` task mutation in `convex/functions/board.ts` and frontend wiring in `src/lib/platformApi.ts` + `src/pages/BoardPage.tsx` so Todo tasks can be immediately moved to in-progress
- Added task target completion controls in board create/edit UX with inline due-status chips on task cards (`No target date`, `Due in Xh`, `Due`, `Overdue`)
- Added Settings `Cron jobs` management section (`#settings-cron-jobs`) with create/list/pause/resume/delete controls backed by `userSchedules` APIs
- Added chat-to-feed sync for dashboard task creation so `createTaskFromChat` now writes a feed event when a chat message becomes a board task
- Added provider model catalog APIs in `convex/functions/credentials.ts`: `getModelCatalog` (query) and `refreshModelCatalog` (action) so UI can fetch live model lists from configured BYOK providers and fall back safely when providers fail
- Added OpenAI fallback suggestions for GPT-5 family model IDs (`gpt-5.2`, `gpt-5-mini`, `gpt-5-nano`) in provider model helpers
- Added explicit “Use account default” LLM mode in `src/pages/AgentsPage.tsx` so agent-level model selection can cleanly inherit `SettingsPage` defaults
- Added BYOK credential support for additional voice providers: Telnyx, Plivo, and Vapi in schema validation, credential save/remove flows, and provider status reporting
- Added Settings BYOK integration cards and setup guidance for Telnyx, Plivo, and Vapi alongside existing Twilio/AgentMail/Resend options
- Added Landing provider visibility for Telnyx, Plivo, and Vapi in the feature + BYOK sections
- Added LLM model help modal in `src/pages/AgentsPage.tsx` with provider model-doc links, live OpenRouter model catalog lookup, and one-click model selection into the agent model field
- Added LLM model help modal in `src/pages/SettingsPage.tsx` with the same provider docs and live OpenRouter model lookup flow for user-level LLM configuration
- Added quick-link anchor navigation at the top of `src/pages/SettingsPage.tsx` for direct jumps to major settings sections (Profile, Appearance, Privacy, LLM, Usage, BYOK, API keys, Agent status, Security, Danger zone)
- Added board project support with new schema table `boardProjects`, task-level project link (`tasks.projectId`), and index `by_userId_projectId`
- Added board project Convex APIs in `convex/functions/board.ts`: `getProjects`, `createProject`, `updateProject`, `deleteProject`
- Added dual board UI modes in `src/pages/BoardPage.tsx`: `Board view` and `Projects view` for status-driven or project-driven planning
- Added project management UX in board page: create project form, project filter (`All projects` / `No project` / specific project), and project delete action that ungroups linked tasks
- Added task project assignment in board create/edit flows so tasks can be grouped by project across agents
- Added persistent board context labels that show active view and active project scope in the board header
- Added per-agent llms discovery files at `/:username/:slug/llms.txt` and `/:username/:slug/llms-full.md` (plus `/u/:username/:slug/*` aliases)
- Added 1:1 agent chat page at `/chat` with per-agent conversation threads and real-time AI responses powered by existing agent runtime (`processDashboardMessage` + `processMessage`)
- Added chat-to-board task creation flow (`createTaskFromChat`) so a message draft can become a task in the board Inbox column, assigned to the current chat agent
- Added in-thread task conversion in agent chat so any existing message bubble can be turned into a board task with one click
- Added conversation to agent linkage in schema (`conversations.agentId`) with `by_userId_agentId` index to support stable per-agent dashboard chat threads
- Added app-wide Sileo toast notifications with a shared helper in `src/lib/notify.ts`
- Added global toaster mount in `src/App.tsx` and connected mutation flows across onboarding, settings, agents, board, inbox, A2A inbox, skills, and feed pages
- Added toast-based action confirmations for destructive UI actions that previously used browser confirms
- Added DeepSeek BYOK support across runtime routing and provider configuration UI (`SettingsPage`, `AgentsPage`)
- Added DeepSeek provider guidance in settings with OpenAI-compatible default base URL (`https://api.deepseek.com/v1`)
- Added a live public activity stream section to `src/pages/LandingPage.tsx` that subscribes to real-time public feed updates before the How it works section
- Added `getGlobalPublicFeed` query in `convex/functions/feed.ts` for cross-user public feed streaming on landing surfaces
- Added feed item management: users can now hide, archive, edit, and delete their own posts
- Added `isHidden`, `isArchived`, and `updatedAt` fields to `feedItems` schema with `by_userId_archived` index
- Added feed mutations: `updatePost`, `hidePost`, `unhidePost`, `archivePost`, `unarchivePost`, `deletePost`
- Added `getArchivedFeed` query to retrieve archived posts
- Added action menu on feed items with edit (manual posts only), hide, archive, and delete options
- Added edit modal for updating post title, content, and visibility
- Added delete confirmation modal to prevent accidental deletions
- Added agent thinking timeline page (`/thinking`) to view per-agent reasoning, decisions, reflections, and goal updates
- Added security alerts dashboard (`/security`) with blocked-event visibility and one-click CSV export from audit logs
- Added health check HTTP endpoint at `/health` for uptime and monitoring checks
- Added rate-limit dashboard page (`/rate-limits`) for active window monitoring and top-key visibility
- Added webhook retry queue with exponential backoff for AgentMail webhook processing failures
- Added persisted light/dark theme support with an Appearance toggle in settings
- Added unified Automation dashboard page (`/automation`) with A2A and Thinking tabs
- Added admin dashboard page (`/admin`) with user list and system stats
- Added task collaboration support with task comments and task attachments in board task details
- Added new task collaboration tables in schema (`taskComments`, `taskAttachments`)

### Changed

- Changed task details Outcome section from textarea-only to a dual-mode view: read mode renders `outcomeSummary` as markdown with `react-markdown`, write mode shows textarea fields with Save and Cancel controls
- Changed outcome email text in `buildOutcomeEmailText` to include the full outcome summary content with a "Report" section header and a board deep-link footer
- Changed `processAgentTasks` scheduler prompt in `convex/crons.ts` to include explicit `<app_actions>` format examples so smaller LLM models can respond with structured task updates
- Changed agent scheduler in `convex/crons.ts` from a metadata-only shell (timestamps + audit log) to a full task processing pipeline that queries pending/in-progress tasks via `getAgentContext` and feeds them to the agent LLM runtime via `processMessage`
- Changed `updateTaskFromAgent` in `convex/functions/board.ts` to auto-resolve board columns on status transitions (pending maps to Todo, in_progress to In Progress, completed/failed to Done) instead of requiring an explicit column ID
- Changed `formatTargetStatus` in `src/pages/BoardPage.tsx` to show richer status labels: "Completed {date}", "Failed", "Started {time ago}", "In progress, ETA unknown", "Overdue {hours}h", and "ETA {hours}h" or "ETA {date}"
- Changed `moveTask` mutation in `convex/functions/board.ts` to create feed items for task owner when non-requested tasks transition to completed or failed
- Changed `getPublicTasks` in `convex/functions/board.ts` to return real public tasks again, scoped by user and privacy settings (`profileVisible`, `showTasks`) instead of always returning an empty list
- Updated public task rendering in `src/pages/PublicAgentPage.tsx` to include task target completion date when present
- Updated agent scheduling copy in `src/pages/AgentsPage.tsx` to deep-link account-level cron management in Settings
- Updated OpenAI-compatible runtime request handling in `convex/agent/runtime.ts` to try `max_completion_tokens`, then `max_tokens`, then no explicit token limit, improving compatibility across OpenAI, DeepSeek, MiniMax, Kimi, and custom OpenAI-style endpoints
- Updated Kimi default base URL in runtime routing to `https://api.moonshot.ai/v1` to align with provider defaults used elsewhere
- Changed LLM model selection UX in both `src/pages/SettingsPage.tsx` and `src/pages/AgentsPage.tsx` from dropdown-first to editable text input first, while still offering provider-based model suggestions through `datalist`
- Changed model field guidance copy to explicitly support GPT-5 style model IDs and other provider-native model names
- Updated `src/lib/platformApi.ts` settings contract to include `getModelCatalog` and `refreshModelCatalog` references
- Updated `convex/functions/agents.ts` update mutation to support clearing per-agent `llmConfig` overrides (`useAccountDefaultLlm`) so precedence is deterministic and reversible
- Updated `src/pages/AgentsPage.tsx` provider picker UX to disable unconfigured providers, show key-missing warnings, and label whether each agent is using account default or override
- Updated agent phone setup UX in `src/pages/AgentsPage.tsx` to treat Twilio, Telnyx, Plivo, and Vapi as valid provider keys for enabling phone workflows
- Updated agent communication copy and setup instructions to reflect multi-provider phone support instead of Twilio-only wording
- Updated both LLM help modals to include inline future-maintenance comments around provider-map synchronization and optional backend-proxy migration for live catalog fetching
- Updated Settings to include a default-agent control wired to the same `setDefault` mutation as Agents, keeping base username API/MCP routing behavior in sync
- Updated landing-page endpoint diagram copy to explicitly note that base username routes resolve to the configured default agent
- Updated llms endpoint labels across canonical sharing surfaces to standardized wording: `Profile llms (aggregate)` and `Agent llms (persona)` (plus explicit `full` variants)
- Updated board task cards and archived task cards to display project badges alongside status and agent labels
- Updated board archived-task rendering to respect active agent and project filters
- Updated frontend board API mapping in `src/lib/platformApi.ts` to include board project endpoints
- Updated llms generation model to support both profile aggregate files and per-agent files with scoped records in `llmsTxt`
- Updated public discovery surfaces (`LandingPage`, `PublicUserProfilePage`, `PublicAgentPage`, `PublicDocsPage`) to link and render both username-level and agent-level llms files
- Updated API key model to support one universal key system with optional delegation overlay (`keyType`, `allowedAgentIds`, `allowedRouteGroups`) while preserving backwards compatibility
- Updated HTTP gateway auth enforcement to require key ownership binding, route-group checks, and scoped access (`api:call` for REST message routes, `mcp:call` for MCP routes)
- Updated Settings API key flow with advanced controls for key type, route groups, and optional agent-level restrictions
- Updated generated discovery docs and OpenAPI metadata to document scope requirements and public vs authenticated route behavior
- Updated task board defaults to include four columns: `Inbox`, `Todo`, `In Progress`, and `Done`
- Updated board initialization/backfill so existing users missing `Todo` automatically get default columns normalized
- Updated dashboard navigation with a dedicated `Chat` route and kept `Inbox` focused on external channels by excluding dashboard chats from Inbox view
- Updated notification UX to use consistent success, warning, info, and error feedback across frontend actions
- Updated notification defaults to a unified 5400ms timeout for both standard and confirm/action toasts
- Updated global Sileo placement and shape defaults to bottom-right with rounded corners for a more native Sileo look
- Updated `files.md` to reflect the Sileo notification layer and page-level notification behavior
- Expanded schema and Convex provider validators to include `deepseek` across user, agent, and credential configuration
- BYOK provider coverage is now 9 providers (OpenRouter, Anthropic, OpenAI, DeepSeek, Google, Mistral, MiniMax, Kimi, xAI)
- Updated `feedItems` schema indexing with `by_public` to support efficient global public feed queries
- Updated landing page live activity UX to show the latest 10 public items in a scrollable feed container that auto-scrolls as new activity streams in
- Updated `getMyFeed` query to accept `includeArchived` and `includeHidden` params for filtering
- Updated `getPublicFeed` to filter out hidden and archived items from public profiles
- Updated API key management to support key rotation (create replacement key + revoke old key)
- Updated dashboard navigation to use Automation and Admin surfaces
- Updated Settings page to include Security tabs for both alerts and rate limits
- Updated header account UX to use a username dropdown menu with Sign out under the username
- Updated header to remove the global Online chip and moved status visibility into Settings
- Updated Admin visibility so non-admin users do not see Admin nav and cannot access `/admin`
- Updated Settings header to show a live "You are admin" role badge for admin users
- Updated public profile behavior so `/:username` stays stable and no longer auto-redirects to `/:username/:slug`
- Updated SPA routing to handle discovery docs URLs (`/:username/sitemap.md`, `/:username/llms.txt`, `/:username/llms-full.md`, `/api/v1/agents/:username/docs.md`, `/tools.md`, `/openapi.json`) without being interpreted as agent slugs

### Fixed

- Fixed empty LLM response handling in `convex/agent/runtime.ts`: empty content from OpenAI-compatible models now returns a fallback string instead of throwing, preventing scheduler task processing from crashing on models that return blank responses
- Fixed OpenAI model refusal handling by checking the `refusal` field in API responses and returning a user-friendly message instead of treating it as empty content
- Fixed missing ESC key dismiss on all 12 modals across 6 pages (none had keyboard handlers previously)
- Fixed `projectId: null` schema validation error in board task updates by mapping null to undefined for optional `v.id("boardProjects")` field in both frontend (`BoardPage.tsx`) and backend (`board.ts updateTask`)
- Fixed blank board page caused by React "Rules of Hooks" violation where a `useEffect` for outcome state initialization was placed after a conditional early return block
- Fixed agent scheduler not processing tasks: the cron was running every 5 minutes but only writing timestamps and audit logs without calling the LLM runtime or moving tasks between columns
- Fixed opaque chat failures by returning targeted diagnostics for provider/model/base-URL configuration-style errors in `convex/agent/runtime.ts` instead of always returning a generic fallback response
- Fixed dashboard chat UX latency ambiguity in `src/pages/AgentChatPage.tsx` by showing an inline `Agent is thinking...` state until a new agent reply is observed
- Fixed OpenAI-compatible empty-content error handling path in `convex/agent/runtime.ts` to avoid attempting to re-read a consumed response body
- Fixed non-scrolling LLM model help modal content in both `src/pages/AgentsPage.tsx` and `src/pages/SettingsPage.tsx` by converting modal containers to flex columns and making the body a constrained scroll region
- Fixed `BoardPage` runtime hook-order crash by removing a conditional hook path and making project summary computation safe during loading
- Fixed board context clarity by adding explicit labels for which project scope the board is currently showing
- Fixed cross-user key namespace risk by enforcing `apiKey.userId === targetUser._id` in REST and MCP gateway checks
- Fixed public connect endpoint clarity by adding profile-level messaging that API/MCP endpoints are authenticated while docs and sitemap endpoints remain public
- Fixed Vite package export issue by removing invalid `sileo/dist/styles.css` import path usage from `main.tsx`
- Fixed low-contrast/blurred toast content by adding explicit Sileo data-attribute style overrides in `src/index.css`
- Fixed poor toast dismiss UX by moving close control to a compact corner `×` instead of a full-width inline button
- Fixed overly long confirm/action toast persistence by normalizing action timeout from 10000ms to 5400ms
- Fixed custom toast styling drift that made notifications look unlike Sileo by restoring rounded default toast shape and simplifying standard toast button behavior
- Fixed PostCSS warning risk from CSS font import by moving Google Fonts loading from `src/index.css` into `index.html` link tags
- Fixed noisy unauthorized errors from agent thinking queries by returning empty results for unauthenticated/unauthorized reads
- Fixed public route collision where discovery-doc paths like `/:username/sitemap.md` were incorrectly interpreted as public agent slug routes

## [0.3.3] - 2026-02-14

### Changed

- Updated auth tracking PRD (`prds/robel-auth.md`) after upstream review to document current compatibility state: app remains on `@robelest/convex-auth` with `auth.addHttpRoutes(http)` until `@convex-dev/auth` is installable in this environment
- Synced project inventory docs (`files.md`, `TASK.md`) with the latest auth compatibility and frontend build fixes

### Fixed

- Fixed Vite import-analysis failure for Sileo styles by switching `src/main.tsx` from `sileo/dist/styles.css` package subpath import to direct `../node_modules/sileo/dist/styles.css`
- Verified frontend bundling after the style import change (`npx vite build` passes)

## [0.3.2] - 2026-02-14

### Added

- Agent discovery docs: `/{username}/sitemap.md`, `/api/v1/agents/{username}/docs.md`, `/api/v1/agents/{username}/tools.md`, `/api/v1/agents/{username}/openapi.json`
- Shared contract builder module (`convex/functions/agentDocs.ts`) for rendering docs/tools/openapi/sitemap from a single query
- Content negotiation: `Vary: Accept` and `Cache-Control` headers on all negotiated GET endpoints
- `X-Markdown-Tokens` header on all markdown responses for token budget estimation
- Discovery endpoint cards (API Docs, Tools Docs, OpenAPI, Sitemap) on public agent and user profile pages

### Changed

- Public API message endpoints now fail closed on invalid API keys (returns 401 instead of proceeding as anonymous)
- All API error responses use stable envelope format: `{ "error": { "code": "...", "message": "..." } }`
- llms.txt and llms-full.md generation now respects `publicConnect` visibility flags and user `privacySettings`
- Agent email, phone, API, MCP, and skill file links are conditionally included in llms outputs based on per-agent and per-user privacy settings

### Fixed

- Security gap where an invalid API key would allow message processing with "anonymous" caller identity
- Restored clean TypeScript build by removing an unused import in `convex/functions/agentDocs.ts` (`npm run typecheck` passes)
- Enforced AgentMail webhook signature verification with HMAC-SHA256 validation against `AGENTMAIL_WEBHOOK_SECRET`
- Aligned dashboard MCP endpoint display with actual route format (`https://humana.gent/mcp/u/{username}`)
- Synced docs inventory in `files.md` with current A2A files and `TASK.md`
- Added explicit `returns` validators across core Convex function modules (`agents`, `users`, `skills`, `board`, `feed`, `apiKeys`, `conversations`, `agentDocs`, `llmsTxt`)
- Added `agents` indexes for `agentPhone` and `agentEmail`, and updated internal webhook lookups to indexed queries
- Removed full table scan in scheduled-agent lookup by adding indexed scheduling fields (`schedulingActive`, `schedulingMode`) and querying via `by_schedulingActive_mode`
- Added a backwards-compatible legacy fallback path for scheduled agents that predate scheduling denormalization fields

## [0.3.1] - 2026-02-14

### Added

- Settings profile now supports editable username with server-side validation and uniqueness checks
- Added social profile fields in settings for X/Twitter, LinkedIn, and GitHub
- Added profile-level save action in the profile card using existing button styles
- Added helper text under social inputs clarifying handle and URL input formats

### Changed

- `users.socialProfiles` is now part of the schema for storing social links on user profiles
- Public user profile social links now merge user-defined links with connected app links
- Social profile input values are normalized on save into canonical URLs (X, LinkedIn, GitHub)

### Fixed

- Resolved TypeScript errors in `convex/functions/agentThinking.ts` by aligning auth user lookup with `users.by_authUserId`
- Resolved TypeScript inference and internal action typing errors in `convex/functions/xTwitter.ts`
- Resolved implicit `any` issues in `src/pages/FeedPage.tsx` and `src/pages/SkillFilePage.tsx`

## [0.3.0] - 2026-02-14

### Added

- Agent runtime with multi-provider BYOK support (OpenRouter, Anthropic, OpenAI, Google Gemini, Mistral, MiniMax, Kimi, xAI Grok)
- Agent security module: 15+ injection detection patterns, sensitive data redaction, exfiltration prevention, system prompt hardening
- Agent memory system with vector embeddings table for conversation context retrieval
- Agent thinking system: observations, reasoning, decisions, reflections, goal updates
- MCP server endpoints at `/mcp/u/:username` with JSON-RPC 2.0 protocol (initialize, tools/list, tools/call)
- WebMCP tool registration on public agent pages for Chrome 146+ (navigator.modelContext)
- Twilio webhooks for SMS and voice inbound handling with TwiML responses
- Skill file endpoints: `/u/:username/skill.json` and `/u/:username/SKILL.md`
- LLMs.txt endpoints: `/u/:username/llms.txt` and `/u/:username/llms-full.md` for AI discoverability
- Connected apps table with OAuth token management for Twitter, GitHub, Google Calendar, Slack
- Permissions table with scoped access control (public/authenticated/trusted)
- Rate limits table with sliding window counters
- MCP connections table for tracking external MCP server connections
- Agent health table with heartbeat status tracking
- User schedules table for dynamic per-user cron jobs
- Cron jobs: agent heartbeat (5min), monthly token reset, memory compression (24h), rate limit cleanup (1h)
- Inbox page for viewing and managing email/phone/API conversations
- Multi-agent support: users can create multiple agents with independent configs
- Privacy settings: granular control over what's visible on public profile
- Public/private toggle on tasks and feed items
- X/Twitter integration with xAI Grok mode and direct X API mode
- Agent scheduling: manual, auto, or cron-based execution modes
- Browser automation config: Firecrawl, Stagehand, Browser Use (BYOK)
- ElevenLabs and OpenAI TTS voice configuration for agents
- Task archiving and restore functionality
- Agent thoughts table for storing reasoning and decision-making

### Changed

- Updated schema with 20+ tables including agentThoughts, llmsTxt, and expanded agents table
- Enhanced http.ts with MCP server, Twilio webhooks, skill file endpoints, llms.txt
- Added Inbox to navigation, replaced Conversations link
- PublicUserProfilePage now supports agent selection and WebMCP tools
- Settings page now supports 8 LLM providers with BYOK credentials
- Agents page now includes X/Twitter config, scheduling, and voice settings

## [0.2.0] - 2026-02-14

### Added

- Full frontend rebuild with new color scheme based on OpenAI FM design
- New color tokens: bg-primary (#f3f3f3), accent-interactive (#ea5b26), text-primary (#232323)
- DM Sans font family throughout the app
- LandingPage: hero, features grid, how it works, CTA sections
- DashboardPage: status cards, quick actions, recent activity feed, endpoint cards
- SkillFilePage: edit identity, capabilities, knowledge domains, communication preferences
- ConversationsPage: filterable conversation list with message detail view
- BoardPage: kanban task board with drag and drop, task status badges
- FeedPage: activity feed with public post creation
- SettingsPage: profile editing, LLM config, API key management with copy functionality
- PublicAgentPage: public agent profile with capabilities, tasks, activity, connect endpoints
- DashboardLayout: sticky header, mobile bottom nav, agent status indicator
- Reusable component classes: btn, btn-accent, btn-secondary, input, card, badge
- Added listMyConversations query to conversations functions

### Changed

- Replaced surface/ink color tokens with new bg/text/accent/border scheme
- Updated Tailwind config with new animations (fade-in, slide-up, slide-down)
- Updated index.css with DM Sans import and component utility classes
- Simplified AuthRequired wrapper with new loading states

## [0.1.0] - 2026-02-14

### Added

- Convex schema with 16 tables: users, skills, agentMemory, conversations, tasks, feedItems, boardColumns, connectedApps, auditLog, permissions, apiKeys, mcpConnections, rateLimits, securityFlags, agentHealth, userSchedules
- Authentication via @robelest/convex-auth with GitHub and Google OAuth providers
- Agent runtime pipeline: security check, conversation management, LLM call, audit logging
- LLM model router supporting OpenRouter (default), Anthropic, OpenAI, and custom BYOK endpoints
- Security module with injection detection, sensitive content patterns, exfiltration prevention
- REST API endpoints: POST/GET `/api/v1/agents/:username/messages`, agent card at `/.well-known/agent.json`
- AgentMail inbound email webhook handler
- Cron jobs: agent heartbeat (60s), monthly token budget reset, weekly feed cleanup
- Agent health monitoring with stalled task and expiring credential detection
- CRUD functions for users, skills, conversations, feed, board, API keys, audit log, rate limits
- React frontend with Vite, Tailwind CSS, React Router
- Pages: landing, login, onboarding, dashboard, settings, public agent page (`/u/:username`)
- Dashboard layout with sidebar navigation
- Shared Zod schemas and TypeScript types
- Skill file system: portable capability definitions per user with publish/unpublish
- Three-tier permission model: public, authenticated, trusted
- API key management with SHA-256 hashing and scoped rate limits
- Sliding-window rate limiting
- Append-only audit log

### Fixed

- Fixed `@robelest/convex-auth` version in package.json from `^0.1.0` to `^0.0.2` (matching published versions on npm)
- Updated `convex` dependency from `^1.17.0` to `^1.31.7` (required by @robelest/convex-auth peer dependency)
- Fixed `crons.ts` using deprecated `crons.monthly` and `crons.weekly` helpers, replaced with `crons.cron` using standard cron expressions
- Fixed `convex/heartbeat.ts` import paths from `../_generated/` to `./_generated/` (file is in convex root, not a subdirectory)
- Created `convex/lib/authHelpers.ts` to bridge `Id<"user">` (auth component type) to `Id<"users">` (app schema type) across all function files
- Fixed `Id<"user">` vs `Id<"users">` type mismatch in all 9 function files (users, skills, conversations, feed, board, apiKeys, auditLog, security, rateLimit)
- Fixed circular type inference in `convex/agent/runtime.ts` by adding explicit return type annotation
- Changed `convex/agent/modelRouter.ts` from public `action` to `internalAction` (it's only called from other internal actions)
