# HumanAgent Tasks

Active development tasks and roadmap items.

## In Progress

- [ ] Complete agent runtime testing with all LLM providers
- [ ] Verify X/Twitter integration with xAI Grok mode
- [ ] setup domain name https://dash.cloudflare.com/fd1c9b236bcc4249878be762a9cca473/humanai.gent
- [ ] setup domain in convex
- [ ] setup docs
- [ ] update box borders on profile
- [ ] fix inbox and
- [ ] mayke sure all in sync
- [ ] npm run typecheck
- [ ] feat: harden public agent API auth and ship privacy-safe discovery docs surface

## Up Next

- [ ] Add ElevenLabs voice integration for phone calls
- [ ] Implement browser automation tools (Firecrawl, Stagehand, Browser Use)
- [ ] Add agent scheduling execution (cron-based agent runs)
- [ ] Build agent thinking UI for viewing reasoning/decisions

## Backlog

### Core Features

- [ ] Add email sending via Resend component
- [ ] Implement Google Calendar sync via connected apps
- [ ] Add Slack integration for agent notifications
- [ ] Build LinkedIn posting integration

### Agent Capabilities

- [ ] Vector search for agent memory retrieval
- [ ] Memory compression cron job implementation
- [ ] Agent-to-agent (A2A) communication protocol
- [ ] Tool execution sandbox for agent actions

### UI/UX

- [ ] Add task comments and attachments
- [ ] Build conversation thread view
- [ ] Add agent activity timeline
- [ ] Implement dark mode toggle

### Infrastructure

- [ ] Add rate limit dashboard for monitoring
- [ ] Build admin dashboard for user management
- [ ] Implement webhook retry logic
- [ ] Add health check endpoint for monitoring

### Security

- [ ] Add two-factor authentication option
- [ ] Implement API key rotation
- [ ] Add audit log export functionality
- [ ] Build security alerts dashboard

## Completed

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
- [x] Multi-provider BYOK LLM support (8 providers)
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

## Notes

- Agent runtime uses OpenRouter as default provider (free tier available)
- All credentials stored encrypted, never in plaintext
- WebMCP requires Chrome 146+ with navigator.modelContext support
- llms.txt follows the spec at llmstxt.org for AI discoverability
