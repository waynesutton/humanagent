# Changelog

All notable changes to HumanAgent are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

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

- Updated notification UX to use consistent success, warning, info, and error feedback across frontend actions
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

### Fixed

- Fixed Vite package export issue by removing invalid `sileo/dist/styles.css` import path usage from `main.tsx`
- Fixed low-contrast/blurred toast content by adding explicit Sileo data-attribute style overrides in `src/index.css`
- Fixed noisy unauthorized errors from agent thinking queries by returning empty results for unauthenticated/unauthorized reads

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
- Aligned dashboard MCP endpoint display with actual route format (`https://humanai.gent/mcp/u/{username}`)
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
