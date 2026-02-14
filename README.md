# HumanAgent

Every human gets an agent. Personal AI agent with skill file, MCP server, API, email, phone, and public page.

**humanai.gent**

## What you get

- **Skill file** - Portable capability declaration that works across AI systems
- **MCP server** - Your own Model Context Protocol endpoint
- **REST API** - Personal API at `/api/v1/agents/{username}`
- **Agent email** - `you@humanai.gent` powered by AgentMail
- **Public page** - `humanai.gent/u/{username}` with activity feed and kanban board
- **Connected apps** - Twitter/X, GitHub, Google Calendar, Slack, and more

## Tech stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Convex (real-time, fully typed)
- **LLM:** OpenRouter (400+ models) + BYOK + free/OSS models
- **Email:** AgentMail API
- **Protocols:** MCP, A2A, WebMCP

## Quick start

```bash
# Install dependencies
npm install

# Initialize Convex
npx convex dev

# Set up auth (generates JWT keys, configures OAuth)


# Set environment variables in Convex dashboard:
# AUTH_GITHUB_ID, AUTH_GITHUB_SECRET
# AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
# OPENROUTER_API_KEY

# Start the frontend
npm run dev
```

## Project structure

```
humanagent/
├── convex/                    # Convex backend
│   ├── agent/
│   │   ├── security.ts        # Input validation, prompt injection detection
│   │   ├── modelRouter.ts     # LLM routing (OpenRouter/BYOK/custom)
│   │   └── runtime.ts         # Agent message processing pipeline
│   ├── functions/
│   │   ├── users.ts           # User CRUD, token management
│   │   ├── skills.ts          # Skill file CRUD
│   │   ├── conversations.ts   # Conversation management
│   │   ├── feed.ts            # Activity feed
│   │   ├── board.ts           # Kanban board
│   │   ├── apiKeys.ts         # API key management (hashed, scoped)
│   │   ├── auditLog.ts        # Append-only audit trail
│   │   ├── security.ts        # Security flag logging
│   │   └── rateLimit.ts       # Sliding window rate limiter
│   ├── auth.ts                # @robelest/convex-auth configuration
│   ├── schema.ts              # Full database schema
│   ├── http.ts                # HTTP routes (API, webhooks, MCP, A2A)
│   ├── crons.ts               # Static cron jobs (heartbeat, cleanup)
│   ├── heartbeat.ts           # Agent health monitoring
│   └── convex.config.ts       # Component registration
├── src/                       # React frontend
│   ├── pages/
│   │   ├── LandingPage.tsx    # Public landing page
│   │   ├── LoginPage.tsx      # Auth (GitHub/Google OAuth)
│   │   ├── OnboardingPage.tsx # Profile + agent setup wizard
│   │   ├── DashboardPage.tsx  # Main authenticated dashboard
│   │   ├── SettingsPage.tsx   # LLM config, API keys, connected apps
│   │   └── AgentPage.tsx      # Public agent profile page
│   ├── components/
│   │   └── layout/
│   │       └── DashboardLayout.tsx
│   ├── styles/
│   │   └── globals.css
│   └── main.tsx               # App entry point
├── types/
│   └── index.ts               # Shared Zod schemas + TypeScript types
├── package.json
├── tailwind.config.js
├── vite.config.ts
└── tsconfig.json
```

## Security

Seven-layer security architecture. See the PRD for full details.

1. **Auth + sessions** - JWT via @robelest/convex-auth, scoped API keys
2. **Input validation** - Prompt injection detection, content sanitization
3. **Tool execution** - Allowlist-only tools, 6-step execution pipeline
4. **Credential isolation** - Encrypted at rest, never in LLM context
5. **Audit trail** - Append-only, every action logged
6. **Webhook verification** - HMAC-SHA256 signature checks
7. **Rate limiting** - Sliding window, per-user, per-key, per-endpoint

## Environment variables

Set these in your Convex dashboard (Settings > Environment Variables):

| Variable                   | Required | Description                |
| -------------------------- | -------- | -------------------------- |
| `AUTH_GITHUB_ID`           | Yes      | GitHub OAuth app ID        |
| `AUTH_GITHUB_SECRET`       | Yes      | GitHub OAuth app secret    |
| `AUTH_GOOGLE_ID`           | Yes      | Google OAuth client ID     |
| `AUTH_GOOGLE_SECRET`       | Yes      | Google OAuth client secret |
| `OPENROUTER_API_KEY`       | Yes      | Platform default LLM key   |
| `AGENTMAIL_API_KEY`        | Phase 1  | AgentMail API key          |
| `AGENTMAIL_WEBHOOK_SECRET` | Phase 1  | Webhook signature secret   |
| `TWILIO_ACCOUNT_SID`       | Phase 2  | Twilio account SID         |
| `TWILIO_AUTH_TOKEN`        | Phase 2  | Twilio auth token          |
| `RESEND_API_KEY`           | Phase 2  | Resend transactional email |

## License

MIT

# humanagent
