# HumanAgent Codebase Files

## Root

| File | Description |
|---|---|
| `package.json` | NPM config with scripts, dependencies (Convex, React, @robelest/convex-auth, etc.) |
| `tsconfig.json` | TypeScript config for `src/` and `types/` |
| `tsconfig.node.json` | TypeScript config for Node tooling (Vite) |
| `vite.config.ts` | Vite config with React plugin, path aliases (`@/`, `@types/`), dev server port 5174 |
| `tailwind.config.js` | Tailwind CSS with new color scheme (bg, text, border, accent), DM Sans font |
| `postcss.config.js` | PostCSS with Tailwind and Autoprefixer |
| `eslint.config.js` | ESLint configuration with Convex plugin |
| `index.html` | HTML entry point for the SPA |
| `.gitignore` | Ignores node_modules, dist, .env, logs |
| `.env.example` | Template env vars for Convex, auth, LLM, AgentMail, Twilio, Resend |
| `README.md` | Project overview, quick start, architecture |
| `CLAUDE.md` | AI assistant rules: security constraints, Convex patterns, file conventions |
| `files.md` | This file. Describes every file in the codebase |
| `changelog.md` | Developer changelog tracking features and fixes |
| `TASK.md` | Active development tasks and roadmap items |

## convex/

Backend functions, schema, auth, HTTP routes, and cron jobs.

| File | Description |
|---|---|
| `schema.ts` | Database schema with 20+ tables. Includes profile visibility/social fields, feed archival fields, webhook retry queue state, task collaboration tables (`taskComments`, `taskAttachments`), board project grouping (`boardProjects` + `tasks.projectId`), task timing fields (`tasks.targetCompletionAt`, `tasks.doNowAt`, `tasks.completedAt`), task outcome fields (`outcomeSummary`, `outcomeLinks`, `outcomeFileId`, `outcomeImages`, `outcomeVideoUrl`, `outcomeAudioId`, `outcomeEmailStatus`, `outcomeEmailSentAt`, `outcomeEmailLastAttemptAt`, `outcomeEmailError`), subtask hierarchy (`tasks.parentTaskId` with `by_parentTaskId` index), tool execution log (`tasks.toolCallLog`), workflow pipeline steps (`tasks.workflowSteps` array with label, status, timing, and detail per step), conversation to agent linking (`conversations.agentId`) for 1:1 dashboard chat, knowledge graph table (`knowledgeNodes` with full text search, vector search, and graph edges for traversable skill graphs), and `skills.graphIndexNodeId` for linking skills to their root MOC node |
| `auth.ts` | Auth setup with @robelest/convex-auth and GitHub OAuth provider |
| `auth.config.ts` | Auth configuration settings |
| `http.ts` | HTTP router: auth routes, fail-closed REST/MCP API auth with ownership binding (`apiKey.userId === target user`), route-group + scope checks (`api:call`, `mcp:call`), health check endpoint (`/health`), stable API error envelopes, content negotiation headers, MCP endpoints, Twilio SMS/Voice webhooks, AgentMail webhook, skill endpoints, llms endpoints (profile and per-agent paths), and discovery docs routes (`sitemap.md`, `docs.md`, `tools.md`, `openapi.json`) |
| `crons.ts` | Cron jobs: agent heartbeat (5min), monthly token reset, memory compression (24h), rate limit cleanup (1h), permissions cleanup (6h), webhook retry processor (2min), and scheduled agent runs with `processAgentTasks` action that sends pending/in-progress tasks through the LLM runtime. Includes 30-minute staleness guard that force-completes stuck tasks, directive LLM prompt that bans `in_progress` re-assignment and requires completion or failure for every task. `processAgentTasks` is also triggered immediately by `doNow` and `createTask` (not just the 5-min cron). |
| `convex.config.ts` | Convex app config registering auth and crons components |
| `tsconfig.json` | TypeScript config scoped to Convex backend |
| `README.md` | Convex functions intro (auto-generated) |

### convex/agent/

Agent runtime, LLM routing, and security middleware.

| File | Description |
|---|---|
| `runtime.ts` | Main agent pipeline: multi-provider BYOK LLM calls, security scanning, memory management, audit logging, token tracking, reasoning model detection, LLM action parsing (`create_task`, `update_task_status`, `move_task`, `create_feed_item`, `create_skill`, `update_skill`, `create_subtask`, `delegate_to_agent`, `generate_image`, `generate_audio`, `call_tool`, `create_knowledge_node`, `link_knowledge_nodes`), thinking mode (`<thinking>` block extraction saved as agentThoughts), long-form outcome file storage (auto-upload when >8000 chars), agent-to-agent delegation via `processMessage` on `a2a` channel, subtask creation with `parentTaskId`, boilerplate outcome guard, audio generation via `generate_audio` action that calls TTS and links result to task via `linkOutcomeAudio`, knowledge graph context routing (step 4b: searches relevant nodes, traverses one hop of linked nodes, injects `## Relevant Knowledge` into system prompt with progressive disclosure), and workflow pipeline step tracking (7+ phases collected in memory and written once at end to `workflowSteps` on updated tasks) |
| `tts.ts` | Text-to-speech Node.js actions: `generateSpeech` (ElevenLabs + OpenAI TTS with Convex file storage), `speakText` (internal wrapper), `listElevenLabsVoices` (voice picker API). Voice config query lives in `queries.ts` (V8 runtime requirement). |
| `queries.ts` | Agent queries, `saveMemory`, `logAgentAction`, `updateTokenUsage`, `saveThought` (persists thinking/reasoning blocks), `getAgentBySlug` (slug-based agent lookup for delegation), `getDefaultAgentId` (returns default or fallback agent for a user), `getVoiceConfig` (voice credentials and config lookup for TTS, runs in V8) |
| `security.ts` | Input security: injection detection (15+ patterns), sensitive data patterns, exfiltration prevention, system prompt hardening, permission validation |
| `securityUtils.ts` | Security utility functions: input scanning, validation helpers, system prompt builder with supported action types including `generate_audio`, `create_knowledge_node`, and `link_knowledge_nodes`, and automatic current date/time injection into agent system prompts (zero DB cost, ~15 tokens) |

### convex/lib/

Shared utilities for Convex functions.

| File | Description |
|---|---|
| `authHelpers.ts` | Bridges @robelest/convex-auth's `Id<"user">` to the app's `Id<"users">` type with `getCurrentUserId` and `requireUserId` helpers |
| `functions.ts` | Custom function wrappers (authedQuery, authedMutation) for authentication |

### convex/functions/

CRUD functions and business logic for each domain.

| File | Description |
|---|---|
| `users.ts` | User queries and mutations for onboarding/settings/profile photo, username updates, privacy settings, social profile normalization, and token budget management |
| `agents.ts` | Multi-agent management: create, update, delete, set default, get by phone, token usage tracking, scheduling, browser automation config, and explicit clearing of per-agent LLM overrides to fall back to Settings defaults |
| `skills.ts` | Skill CRUD (getMySkill, getPublicSkill, getByUserId), publish/unpublish, update capabilities, tool declarations |
| `credentials.ts` | Encrypted credential storage (BYOK): save/get/delete provider keys and status for LLM + integrations, plus provider model catalog APIs (`getModelCatalog`, `refreshModelCatalog`) with live fetch + fallback suggestions (including GPT-5 family defaults for OpenAI) |
| `conversations.ts` | Conversation list and management for inbox channels plus 1:1 dashboard agent chat (`listAgentChats`, `startAgentChat`, `sendDashboardMessage`) with scheduled AI replies |
| `feed.ts` | Public feed queries (`getPublicFeed`, `getGlobalPublicFeed`, `getArchivedFeed`), feed item CRUD (create, update, hide/unhide, archive/unarchive, delete), and expired item cleanup |
| `board.ts` | Kanban board columns and task management, default column backfill, board project CRUD, task CRUD with target completion timestamps, `doNow` quick-start (now immediately schedules `processAgentTasks` for assigned agent), `createTask` (now immediately schedules agent processing when agent assigned), privacy-aware public tasks, chat-to-task creation, task outcome fields with outcome email via AgentMail, `updateTaskFromAgent` with auto-resolve columns, subtask-aware `createTaskFromAgent` with `parentTaskId`, long-form outcome file storage (`storeOutcomeFile` action + `linkOutcomeFile` mutation), outcome audio storage (`getTaskForAudio` internal query, `linkOutcomeAudio` mutation, `getOutcomeAudioUrl` query), `getOutcomeFileUrl` and `getSubtasks` queries, workflow pipeline step mutations (`addWorkflowStep`, `setWorkflowSteps`) and `getWorkflowSteps` query, comments and attachments APIs |
| `apiKeys.ts` | API key create/revoke/rotate with SHA-256 hashed token validation, key type (`user_universal` or `agent_scoped`), optional `allowedAgentIds`, and optional `allowedRouteGroups` constraints |
| `auditLog.ts` | Append-only audit log creation, security event queries, and CSV export |
| `connectedApps.ts` | OAuth app management: connect/disconnect, token storage, refresh handling |
| `permissions.ts` | Scoped access control: public/authenticated/trusted permissions, tool allowlists |
| `rateLimits.ts` | Sliding-window rate limiting with check-and-increment pattern |
| `agentmail.ts` | AgentMail integration: `sendMessage` internal action for sending transactional emails from agent inboxes, used by task completion outcome email flow |
| `knowledgeGraph.ts` | Knowledge graph CRUD, bidirectional linking, unlinking, graph traversal search (`loadRelevantKnowledge` for agent runtime context routing with progressive disclosure), graph stats, and internal agent mutations (`createNodeFromAgent`, `linkNodesFromAgent`) |
| `webhooks.ts` | Webhook retry queue orchestration for AgentMail failures with exponential backoff and replay processing |
| `mcpConnections.ts` | External MCP server tracking: add/update/remove connections, tool allowlists, audit status |
| `userSchedules.ts` | Dynamic cron jobs per user: daily digest, calendar sync, custom schedules |
| `agentThinking.ts` | Agent reasoning/thinking capabilities: observations, decisions, reflections, goal updates, and `getAgentContext` query used by scheduler to gather pending/in-progress tasks for LLM processing |
| `a2a.ts` | Agent-to-agent messaging: inbox/outbox threads, message sending, auto-response processing, and thread summaries |
| `llmsTxt.ts` | LLMs.txt generation for AI discoverability with both profile-level aggregate files and per-agent files (`/:username/:slug/llms.*`), privacy-safe filtering via publicConnect/privacySettings, and scoped regeneration/indexing |
| `agentDocs.ts` | Shared contract builder for discovery docs and query helpers for rendered sitemap/docs/tools/openapi content, including API/MCP scope notes and public-vs-auth endpoint guidance |
| `voice.ts` | Public voice actions: `speak` (generate TTS audio for agent messages), `listVoices` (fetch available ElevenLabs voices for the picker), `speakTaskOutcome` (generate audio narration of a task outcome and link it to the task) |
| `xTwitter.ts` | X/Twitter Grok actions for trend analysis, sentiment, monitoring, account analysis, and internal Grok query helper |
| `security.ts` | Security functions: flag creation, query by user |
| `admin.ts` | Admin dashboard queries with env-gated admin access checks (`ADMIN_USERNAMES`) |

### convex/_generated/

Auto-generated by Convex. Do not edit.

| File | Description |
|---|---|
| `api.d.ts` | Generated API type definitions |
| `api.js` | Generated API module |
| `server.d.ts` | Generated server type definitions |
| `server.js` | Generated server module |
| `dataModel.d.ts` | Generated data model types from schema |

## src/

React frontend with Vite.

| File | Description |
|---|---|
| `main.tsx` | React entry with Convex provider and router; mounts `App`, app styles, initializes auth, and applies persisted light/dark theme |
| `App.tsx` | React Router routes with AuthRequired wrapper, admin-only route guard for `/admin`, dedicated `/chat` route for 1:1 agent chat, explicit discovery doc routes (including profile + per-agent llms), profile routes, and global Sileo toaster mount configured for bottom-right placement and rounded default shape |
| `index.css` | Base styles with Tailwind utilities, Sileo data-attribute theme overrides (readability + corner close control styling), dark-mode surface/ink utility overrides, and Google Fonts loaded from `index.html` instead of CSS import |
| `vite-env.d.ts` | Vite environment type declarations |

### src/pages/

| File | Description |
|---|---|
| `LandingPage.tsx` | Marketing landing page with hero, features, profile + per-agent llms discovery references, explicit default-agent routing note for base username API/MCP paths, real-time public activity stream (recent 10 items in an auto-scrolling feed box), multi-provider BYOK list (including Twilio, Telnyx, Plivo, Vapi), how it works, and CTA |
| `LoginPage.tsx` | OAuth login page (GitHub, Google) with redirect logic |
| `OnboardingPage.tsx` | New user setup: username, name, bio, creates skill file and board with toast feedback on profile creation |
| `DashboardPage.tsx` | Main dashboard: status cards, quick actions, recent activity, and canonical endpoint cards including profile llms aggregate links |
| `SkillFilePage.tsx` | Edit agent capabilities, knowledge domains, communication prefs, tool declarations, import workflows with toast feedback, and Knowledge Graph section (create, view, edit, delete, link, unlink knowledge nodes per skill with type badges, tag pills, expandable content, linked node navigation, and edit modal) |
| `ConversationsPage.tsx` | List and view agent conversations with message detail |
| `BoardPage.tsx` | Task board with dual views (Board + Projects), drag and drop columns, project creation/grouping, task create/edit with project assignment and custom DateTimePicker for target completion (replaces native datetime-local), Todo “Do now” action, due-status chips (ETA, overdue, started, completed, failed), agent/project filters with active scope labels, archive/restore, wide task details modal (`max-w-3xl`) with collapsible workflow pipeline view (auto-opens for in-progress tasks, shows CI-style phase boxes with Phosphor icons, timing, and connector arrows), full-width outcome section (Phosphor `CopySimple` clipboard copy, markdown prose rendering with styled headings/lists/code, "Full report" button, "Download full report" link for `outcomeFileId` tasks, "Listen to report" TTS audio playback via ElevenLabs or OpenAI), collapsible comments and attachments (`<details>` with count badges), type-aware attachment previews (images/video/PDF/docs), email delivery status, "View outcome" icon on completed task cards opening a dedicated report viewer modal with inline listen button, task cards show "Audio narration available" badge when `outcomeAudioId` is present, subtask badge on child tasks and subtask progress bar on parent cards, multiline task composer (`Enter` new line / `Shift+Enter` submit), modal viewport-fit + visible close controls, unassigned-task guardrails (cannot place/move into Todo/In Progress/Done without an assigned agent), and automatic default-column backfill for existing users |
| `FeedPage.tsx` | Activity feed with post creation, action menu (edit, hide, archive, delete), edit modal, delete confirmation, and toast feedback |
| `SettingsPage.tsx` | Profile/privacy/BYOK/API key settings with theme controls, admin state badge, cron jobs management (create/list/pause/resume/delete via `userSchedules`), agent status section, default-agent selector (shared with agents set-default flow), built-in Security tabs, advanced API key constraints (key type, route groups, optional per-agent restrictions), LLM model-help modal (provider docs + live OpenRouter catalog), and editable model input with provider model autocomplete suggestions (datalist) so users can type any model ID (e.g. GPT-5 family) |
| `RateLimitsPage.tsx` | Rate-limit monitoring dashboard with active windows, request totals, and top rate-limit keys |
| `AgentsPage.tsx` | Multi-agent management: create, edit, delete agents with LLM config, phone settings, voice config, X/Twitter integration, scheduling, toast-based confirmations, and LLM model-help modal with provider docs plus live OpenRouter model lookup; supports explicit “Use account default” LLM mode, disabled unconfigured provider options, key-missing warning badges, phone setup with Twilio/Telnyx/Plivo/Vapi, editable per-agent model input with provider model autocomplete suggestions, and quick deep-link guidance to Settings cron management |
| `InboxPage.tsx` | Inbox for email/phone/API conversations with reply and status management (dashboard 1:1 agent chats excluded to keep inbox channel focused), including reply keyboard shortcuts (`Enter` new line / `Shift+Enter` send) |
| `AgentChatPage.tsx` | 1:1 chat workspace for each agent with real-time message thread, send message, create board task from draft, create task directly from any existing message bubble, inline `Agent is thinking...` pending state while awaiting scheduled model responses, and chat keyboard shortcuts (`Enter` new line / `Shift+Enter` send) |
| `A2AInboxPage.tsx` | Agent-to-agent inbox/outbox page for thread list, message flow, and cross-agent conversation management, including compose and quick-reply keyboard shortcuts (`Enter` new line / `Shift+Enter` send) |
| `AgentThinkingPage.tsx` | Agent reasoning timeline UI with per-agent selection and type filters (observation, reasoning, decision, reflection, goal updates) |
| `AutomationPage.tsx` | Dashboard automation hub with A2A and Thinking tabs in one place |
| `AdminPage.tsx` | Admin dashboard for platform metrics and user management list |
| `SecurityAlertsPage.tsx` | Security alerts dashboard showing blocked events with CSV audit export |
| `PublicUserProfilePage.tsx` | Public profile at `/u/:username` with agent selection, privacy-aware sections, social links, stable base profile routing, and public connect cards with standardized llms labels (`Profile llms (aggregate)` and `Agent llms (persona)`) plus API/MCP auth guidance and per-row copy icon actions in both page and modal connect lists, with task-request keyboard shortcuts (`Enter` new line / `Shift+Enter` request task); activity feed capped at 10 items in a `max-h-96` scrollable container; "Request an agent to do a task" is a collapsible toggle (collapsed by default) |
| `PublicDocsPage.tsx` | Public discovery/doc route renderer for sitemap/docs paths and both profile + per-agent llms routes with standardized aggregate/persona titles in SPA mode |
| `PublicAgentPage.tsx` | Public agent profile page with privacy-aware endpoint cards, llms links, and discovery docs links (API Docs, Tools Docs, OpenAPI, Sitemap), plus public task cards that show target completion date when available |

### src/components/

| File | Description |
|---|---|
| `DateTimePicker.tsx` | Custom date and time picker component matching the site's design system (surface/ink/accent tokens, 1px corners, DM Sans). Replaces native `datetime-local` inputs. Supports `inline` (compact pill) and `field` (full width input) variants. Calendar grid with month navigation, 12-hour time columns, AM/PM toggle, Clear/Today actions. |
| `WorkflowView.tsx` | Pipeline visualization component (GitHub Actions CI style) for agent workflow steps. Full view with grouped phase boxes, Phosphor status icons, connector lines, per-step duration, and total elapsed time. Compact inline variant for tight spaces. |
| `layout/DashboardLayout.tsx` | Dashboard shell with top and mobile navigation (includes Chat route), username dropdown menu (Settings/Admin/Public profile/Sign out), and responsive layout wrappers |
| `feed/FeedTimelineItem.tsx` | Feed timeline item component for activity display |

### src/hooks/

| File | Description |
|---|---|
| `useAuth.ts` | Custom hook wrapping @robelest/convex-auth client for React |
| `useEscapeKey.ts` | Shared hook that binds ESC key to a close handler when active, used by all modal-containing pages for keyboard dismiss |

### src/lib/

| File | Description |
|---|---|
| `auth.ts` | Singleton instance of auth client |
| `datetime.ts` | Lightweight datetime utilities for the app. `getUserTimezone()` via Intl API (no DB call), `formatRelativeTime()`, `formatDuration()`, `formatDateTime()`, `getLocalDateContext()` for agent prompt injection, and `getDateContext()` for programmatic use. |
| `notify.ts` | Shared Sileo toast helper for success/error/info/warning/promise/action notifications with normalized auto-dismiss timing (5400ms), bottom-right positioning, rounded Sileo shape defaults, swipe-to-dismiss support, and corner close (`×`) for standard toasts |
| `platformApi.ts` | Central typed API contract for frontend pages: Convex function refs (including board project APIs, board `doNow`, workflow steps, `getOutcomeFileUrl`, `getSubtasks`, settings schedule CRUD/toggle APIs, and knowledge graph CRUD/link/stats APIs), service catalogs, settings model-catalog refs (`getModelCatalog`, `refreshModelCatalog`), and public HTTP route builders |
| `theme.ts` | Theme utilities for initializing and persisting light/dark dashboard mode |

## types/

Empty directory (types are defined inline in Convex schema and components).

## public/

| File | Description |
|---|---|
| `favicon.svg` | Site favicon |

## prds/

| File | Description |
|---|---|
| `prd-every-human-agent-v2.md` | Product requirements doc: vision, architecture, features, roadmap |
| `robel-auth.md` | Auth integration tracker for `@robelest/convex-auth`, upstream compatibility notes, and migration checklist |
| `setup-and-use-this-app.MD` | General setup and usage guide |
| `setup-auth-for-owner.MD` | Auth setup guide for owner |
| `setup-for-other-people.MD` | Setup guide for other users |
| `dev-workflow.md` | Developer workflow guide for running, testing, and deploying the app |
| `lessons.md` | Lessons learned from user corrections and recurring patterns |
| `agent-outcome-and-response-pipeline.md` | PRD for agent outcome and response pipeline improvements including reasoning model handling |
| `workflow-visualization-datetime.md` | PRD for workflow pipeline visualization (CI-style step view) and lightweight datetime awareness across agents, skills, and system prompts |
| `skill-graphs.md` | PRD for knowledge graph / skill graphs: traversable knowledge nodes with progressive disclosure, context routing in agent runtime, and agent actions for building graphs |
