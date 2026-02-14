# CLAUDE.md - HumanAgent

## Project overview

HumanAgent gives every person an AI agent with a skill file, MCP server, REST API, email, phone number, and public page. Built on Convex with @robelest/convex-auth.

## Tech stack

- Convex (backend, real-time DB, scheduling)
- React + Vite + TypeScript + Tailwind CSS (frontend)
- @robelest/convex-auth (authentication)
- OpenRouter (default LLM provider)
- AgentMail (agent email)

## Critical rules

### Security (never violate these)

1. Never store secrets in code. All credentials go in Convex environment variables.
2. Never modify `convex/agent/security.ts` without explicit review.
3. All skills start unapproved. No auto-approval flow.
4. Webhook handlers always verify signatures.
5. No `.collect()` without `.take(n)`. Prevents unbounded queries.
6. No `any` types except where Convex requires `v.any()` for flexible JSON.
7. API keys are SHA-256 hashed. Never store plaintext.
8. OAuth scopes follow least privilege.
9. Credentials encrypted at rest, never logged, never in LLM prompts.
10. Audit log is append-only. No delete mutations for auditLog table.

### Convex patterns

- All functions use typed argument validators with `v.*`
- Use `internalQuery`/`internalMutation` for agent-to-agent calls
- Use `httpAction` for HTTP endpoints
- Indexes must be defined before use in queries
- Actions can call queries/mutations via `ctx.runQuery`/`ctx.runMutation`
- Never call `ctx.db` directly in actions (use mutations)

### Code style

- TypeScript strict mode
- No default exports except where framework requires (App, schema, etc.)
- Prefer named exports
- Use `as const` for literal arrays
- Error messages should be user-facing and helpful

### File conventions

- Convex backend: `convex/`
- React frontend: `src/`
- Shared types: `types/`
- Agent logic: `convex/agent/`
- CRUD functions: `convex/functions/`

## Testing

```bash
npx convex dev           # Start backend
npm run dev              # Start frontend
npm run typecheck        # Type checking
npm run lint             # ESLint
```

## Common tasks

### Add a new table
1. Add to `convex/schema.ts` with proper indexes
2. Create CRUD functions in `convex/functions/`
3. Add Zod schema to `types/index.ts`

### Add an HTTP endpoint
1. Add route to `convex/http.ts`
2. Include CORS headers via `corsHeaders()`
3. Validate input, check auth, log to audit trail

### Add a new auth provider
1. Install the `@auth/core/providers/*` package
2. Add to providers array in `convex/auth.ts`
3. Set env vars: `AUTH_{PROVIDER}_ID` and `AUTH_{PROVIDER}_SECRET`
