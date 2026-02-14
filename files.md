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

## convex/

Backend functions, schema, auth, HTTP routes, and cron jobs.

| File | Description |
|---|---|
| `schema.ts` | Database schema with 20+ tables: users, agents, skills, agentMemory, agentThoughts, conversations, tasks, feedItems, boardColumns, userCredentials, connectedApps, auditLog, permissions, apiKeys, mcpConnections, rateLimits, securityFlags, agentHealth, userSchedules, llmsTxt |
| `auth.ts` | Auth setup with @robelest/convex-auth, GitHub and Google OAuth providers |
| `auth.config.ts` | Auth configuration settings |
| `http.ts` | HTTP router: auth routes, REST API, MCP server endpoints, Twilio SMS/Voice webhooks, AgentMail webhook, skill file endpoints, A2A agent card, llms.txt endpoints, CORS |
| `crons.ts` | Cron jobs: agent heartbeat (5min), monthly token reset, memory compression (24h), rate limit cleanup (1h), permissions cleanup (6h) |
| `convex.config.ts` | Convex app config registering auth and crons components |
| `tsconfig.json` | TypeScript config scoped to Convex backend |
| `README.md` | Convex functions intro (auto-generated) |

### convex/agent/

Agent runtime, LLM routing, and security middleware.

| File | Description |
|---|---|
| `runtime.ts` | Main agent pipeline: multi-provider BYOK LLM calls (OpenRouter, Anthropic, OpenAI, Google, Mistral, MiniMax, Kimi, xAI), security scanning, memory management, audit logging, token tracking |
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
| `users.ts` | User queries (viewer, getByUsername, getById), mutations (create, update, updateTokenUsage), privacy settings, token budget management |
| `agents.ts` | Multi-agent management: create, update, delete, set default, get by phone, token usage tracking, scheduling, browser automation config |
| `skills.ts` | Skill CRUD (getMySkill, getPublicSkill, getByUserId), publish/unpublish, update capabilities, tool declarations |
| `credentials.ts` | Encrypted credential storage (BYOK): save, get, delete for LLM providers and integrations |
| `conversations.ts` | Conversation list, create, reply, update status, add summary, internal create/addAgentResponse |
| `feed.ts` | Public feed queries (getPublicFeed), feed item creation, expired item cleanup |
| `board.ts` | Kanban board columns and task management (create, reorder, move tasks, agent assignment, archive/restore) |
| `apiKeys.ts` | API key create/revoke, SHA-256 hashed token validation |
| `auditLog.ts` | Append-only audit log creation, query by user/action |
| `connectedApps.ts` | OAuth app management: connect/disconnect, token storage, refresh handling |
| `permissions.ts` | Scoped access control: public/authenticated/trusted permissions, tool allowlists |
| `rateLimits.ts` | Sliding-window rate limiting with check-and-increment pattern |
| `mcpConnections.ts` | External MCP server tracking: add/update/remove connections, tool allowlists, audit status |
| `userSchedules.ts` | Dynamic cron jobs per user: daily digest, calendar sync, custom schedules |
| `agentThinking.ts` | Agent reasoning/thinking capabilities: observations, decisions, reflections, goal updates |
| `llmsTxt.ts` | LLMs.txt file generation for AI discoverability following llms.txt spec |
| `xTwitter.ts` | X/Twitter integration: xAI Grok mode and direct X API mode, posting, monitoring |
| `security.ts` | Security functions: flag creation, query by user |

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
| `main.tsx` | React entry: ConvexAuthProvider, BrowserRouter, Toaster, mounts App |
| `App.tsx` | React Router routes with AuthRequired wrapper for protected pages |
| `index.css` | Base styles with DM Sans font, Tailwind utilities, component classes (btn, input, card, badge) |
| `vite-env.d.ts` | Vite environment type declarations |

### src/pages/

| File | Description |
|---|---|
| `LandingPage.tsx` | Marketing landing page with hero, features, how it works, CTA |
| `LoginPage.tsx` | OAuth login page (GitHub, Google) with redirect logic |
| `OnboardingPage.tsx` | New user setup: username, name, bio, creates skill file and board |
| `DashboardPage.tsx` | Main dashboard: status cards, quick actions, recent activity, endpoints |
| `SkillFilePage.tsx` | Edit agent capabilities, knowledge domains, communication prefs, tool declarations |
| `ConversationsPage.tsx` | List and view agent conversations with message detail |
| `BoardPage.tsx` | Kanban task board with drag and drop, task creation, agent assignment, public/private toggle, archive/restore |
| `FeedPage.tsx` | Activity feed with public post creation |
| `SettingsPage.tsx` | Profile, privacy settings, BYOK LLM config (8 providers), credentials management, API keys, browser automation, danger zone |
| `AgentsPage.tsx` | Multi-agent management: create, edit, delete agents with LLM config, phone settings, voice config, X/Twitter integration, scheduling |
| `InboxPage.tsx` | Inbox for email/phone/API conversations with reply and status management |
| `PublicUserProfilePage.tsx` | Public user profile at `/u/:username` with agent selection, WebMCP registration, privacy-aware sections |
| `PublicAgentPage.tsx` | Public agent page (deprecated, redirects to PublicUserProfilePage) |

### src/components/

| File | Description |
|---|---|
| `layout/DashboardLayout.tsx` | Dashboard shell with sidebar navigation, mobile bottom nav, sign out |
| `feed/FeedTimelineItem.tsx` | Feed timeline item component for activity display |

### src/hooks/

| File | Description |
|---|---|
| `useAuth.ts` | Custom hook wrapping @robelest/convex-auth client for React |

### src/lib/

| File | Description |
|---|---|
| `auth.ts` | Singleton instance of auth client |

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
| `setup-and-use-this-app.MD` | General setup and usage guide |
| `setup-auth-for-owner.MD` | Auth setup guide for owner |
| `setup-for-other-people.MD` | Setup guide for other users |
