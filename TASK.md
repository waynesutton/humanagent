# HumanAgent Tasks

Active development tasks and roadmap items.

## In Progress

- [ ] Complete agent runtime testing with all LLM providers
- [ ] Verify X/Twitter integration with xAI Grok mode
- [ ] setup domain name https://dash.cloudflare.com/fd1c9b236bcc4249878be762a9cca473/humanai.gent
- [ ] setup domain in convex
- [ ] setup docs
- [ ] update box borders on profile
- [ ] polish inbox and agent chat handoff UX
- [ ] mayke sure all in sync
- [ ] npm run typecheck
- [ ] add API key edit flow for route-group and agent restrictions (without rotation)
- [ ] terms and privacy poliyc
- [ ] agent reports to email from agentmail
- [ ] reports, dasbhaord, and markdown and pdf reports on what the agent did and perfromance

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
