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
| `schema.ts` | Database schema with 20+ tables. Includes profile visibility/social fields, feed archival fields, webhook retry queue state, and task collaboration tables (`taskComments`, `taskAttachments`) |
| `auth.ts` | Auth setup with @robelest/convex-auth and GitHub OAuth provider |
| `auth.config.ts` | Auth configuration settings |
| `http.ts` | HTTP router: auth routes, fail-closed REST API auth, health check endpoint (`/health`), stable API error envelopes, content negotiation headers, MCP endpoints, Twilio SMS/Voice webhooks, AgentMail webhook, skill endpoints, llms endpoints, and discovery docs routes (`sitemap.md`, `docs.md`, `tools.md`, `openapi.json`) |
| `crons.ts` | Cron jobs: agent heartbeat (5min), monthly token reset, memory compression (24h), rate limit cleanup (1h), permissions cleanup (6h), webhook retry processor (2min), and scheduled agent runs |
| `convex.config.ts` | Convex app config registering auth and crons components |
| `tsconfig.json` | TypeScript config scoped to Convex backend |
| `README.md` | Convex functions intro (auto-generated) |

### convex/agent/

Agent runtime, LLM routing, and security middleware.

| File | Description |
|---|---|
| `runtime.ts` | Main agent pipeline: multi-provider BYOK LLM calls (OpenRouter, Anthropic, OpenAI, DeepSeek, Google, Mistral, MiniMax, Kimi, xAI), security scanning, memory management, audit logging, token tracking |
| `queries.ts` | Agent-related queries for fetching agent data |
| `security.ts` | Input security: injection detection (15+ patterns), sensitive data patterns, exfiltration prevention, system prompt hardening, permission validation |
| `securityUtils.ts` | Security utility functions: input scanning, validation helpers |

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
| `agents.ts` | Multi-agent management: create, update, delete, set default, get by phone, token usage tracking, scheduling, browser automation config |
| `skills.ts` | Skill CRUD (getMySkill, getPublicSkill, getByUserId), publish/unpublish, update capabilities, tool declarations |
| `credentials.ts` | Encrypted credential storage (BYOK): save, get, delete for LLM providers (including DeepSeek) and integrations |
| `conversations.ts` | Conversation list, create, reply, update status, add summary, internal create/addAgentResponse |
| `feed.ts` | Public feed queries (`getPublicFeed`, `getGlobalPublicFeed`, `getArchivedFeed`), feed item CRUD (create, update, hide/unhide, archive/unarchive, delete), and expired item cleanup |
| `board.ts` | Kanban board columns and task management, plus task collaboration APIs for comments and file attachments |
| `apiKeys.ts` | API key create/revoke/rotate with SHA-256 hashed token validation |
| `auditLog.ts` | Append-only audit log creation, security event queries, and CSV export |
| `connectedApps.ts` | OAuth app management: connect/disconnect, token storage, refresh handling |
| `permissions.ts` | Scoped access control: public/authenticated/trusted permissions, tool allowlists |
| `rateLimits.ts` | Sliding-window rate limiting with check-and-increment pattern |
| `webhooks.ts` | Webhook retry queue orchestration for AgentMail failures with exponential backoff and replay processing |
| `mcpConnections.ts` | External MCP server tracking: add/update/remove connections, tool allowlists, audit status |
| `userSchedules.ts` | Dynamic cron jobs per user: daily digest, calendar sync, custom schedules |
| `agentThinking.ts` | Agent reasoning/thinking capabilities: observations, decisions, reflections, goal updates |
| `a2a.ts` | Agent-to-agent messaging: inbox/outbox threads, message sending, auto-response processing, and thread summaries |
| `llmsTxt.ts` | LLMs.txt file generation for AI discoverability following llms.txt spec, privacy-safe filtering via publicConnect/privacySettings |
| `agentDocs.ts` | Shared contract builder for agent discovery docs: sitemap.md, docs.md, tools.md, openapi.json with privacy-aware rendering |
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
| `App.tsx` | React Router routes with AuthRequired wrapper, admin-only route guard for `/admin`, legacy security route redirects to settings, and global Sileo toaster mount |
| `index.css` | Base styles with Tailwind utilities, Sileo data-attribute theme overrides, and dark-mode surface/ink utility overrides |
| `vite-env.d.ts` | Vite environment type declarations |

### src/pages/

| File | Description |
|---|---|
| `LandingPage.tsx` | Marketing landing page with hero, features, real-time public activity stream (recent 10 items in an auto-scrolling feed box), how it works, and CTA |
| `LoginPage.tsx` | OAuth login page (GitHub, Google) with redirect logic |
| `OnboardingPage.tsx` | New user setup: username, name, bio, creates skill file and board with toast feedback on profile creation |
| `DashboardPage.tsx` | Main dashboard: status cards, quick actions, recent activity, endpoints |
| `SkillFilePage.tsx` | Edit agent capabilities, knowledge domains, communication prefs, tool declarations, and import workflows with toast feedback |
| `ConversationsPage.tsx` | List and view agent conversations with message detail |
| `BoardPage.tsx` | Kanban task board with drag and drop, task creation, assignment, archive/restore, and task details modal for comments + attachments |
| `FeedPage.tsx` | Activity feed with post creation, action menu (edit, hide, archive, delete), edit modal, delete confirmation, and toast feedback |
| `SettingsPage.tsx` | Profile/privacy/BYOK/API key settings with theme controls, admin state badge, agent status section, and built-in Security tabs for alerts + rate limits |
| `RateLimitsPage.tsx` | Rate-limit monitoring dashboard with active windows, request totals, and top rate-limit keys |
| `AgentsPage.tsx` | Multi-agent management: create, edit, delete agents with LLM config, phone settings, voice config, X/Twitter integration, scheduling, and toast-based confirmations |
| `InboxPage.tsx` | Inbox for email/phone/API conversations with reply and status management |
| `A2AInboxPage.tsx` | Agent-to-agent inbox/outbox page for thread list, message flow, and cross-agent conversation management |
| `AgentThinkingPage.tsx` | Agent reasoning timeline UI with per-agent selection and type filters (observation, reasoning, decision, reflection, goal updates) |
| `AutomationPage.tsx` | Dashboard automation hub with A2A and Thinking tabs in one place |
| `AdminPage.tsx` | Admin dashboard for platform metrics and user management list |
| `SecurityAlertsPage.tsx` | Security alerts dashboard showing blocked events with CSV audit export |
| `PublicUserProfilePage.tsx` | Public profile at `/u/:username` with agent selection, privacy-aware sections, and social links from user settings or connected apps |
| `PublicAgentPage.tsx` | Public agent profile page with privacy-aware endpoint cards, llms links, and discovery docs links (API Docs, Tools Docs, OpenAPI, Sitemap) |

### src/components/

| File | Description |
|---|---|
| `layout/DashboardLayout.tsx` | Dashboard shell with updated navigation (Automation + conditional Admin), username dropdown menu (Settings/Admin/Public profile/Sign out), and mobile bottom nav |
| `feed/FeedTimelineItem.tsx` | Feed timeline item component for activity display |

### src/hooks/

| File | Description |
|---|---|
| `useAuth.ts` | Custom hook wrapping @robelest/convex-auth client for React |

### src/lib/

| File | Description |
|---|---|
| `auth.ts` | Singleton instance of auth client |
| `notify.ts` | Shared Sileo toast helper for success, error, promise, and action confirmations |
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
