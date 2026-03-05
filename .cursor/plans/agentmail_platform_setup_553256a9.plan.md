---
name: AgentMail platform setup
overview: Set up a single AgentMail webhook and platform level secrets so inbound and outbound email works for all users without per user webhook config, then verify end to end in the app.
todos:
  - id: agentmail-webhook-endpoint
    content: Create one AgentMail webhook endpoint and subscribe to four message events
    status: pending
  - id: convex-env-secrets
    content: Set AGENTMAIL_WEBHOOK_SECRET and AGENTMAIL_API_KEY in Convex env, optionally tolerance seconds
    status: pending
  - id: deploy-and-health-check
    content: Redeploy backend and confirm /webhooks/agentmail endpoint is reachable
    status: pending
  - id: e2e-inbound-outbound-test
    content: "Run end to end test: inbound email appears in Inbox and reply triggers sent/delivered or bounced events"
    status: pending
  - id: user-operating-model
    content: Adopt platform managed model so users only set agentEmail and use Inbox
    status: pending
  - id: optional-zero-setup-polish
    content: Implement auto agentEmail assignment, hide BYOK for normal users, and add Inbox delivery status chips
    status: pending
isProject: false
---

# AgentMail Platform Webhook Setup Plan

## Goal

Use one platform managed AgentMail webhook and Convex env secrets so all users get inbox and reply functionality without managing webhook secrets themselves.

## Phase 1: One time platform setup

- In AgentMail console, create one webhook endpoint at `https://<your-production-domain>/webhooks/agentmail`.
- Subscribe only to:
  - `message.received`
  - `message.sent`
  - `message.delivered`
  - `message.bounced`
- Copy the webhook secret from AgentMail and set Convex env vars:
  - `AGENTMAIL_WEBHOOK_SECRET=whsec_...`
  - `AGENTMAIL_API_KEY=...`
  - optional `AGENTMAIL_WEBHOOK_TOLERANCE_SECONDS=300`
- Redeploy/restart backend after env updates.

## Phase 2: Verify backend wiring (already implemented)

- Confirm webhook route is live at `[/Users/waynesutton/Documents/sites/humanagent/convex/http.ts](/Users/waynesutton/Documents/sites/humanagent/convex/http.ts)` (`/webhooks/agentmail`).
- Confirm verifier supports Svix + fallback signature handling in the same file.
- Confirm outbound reply action exists at `[/Users/waynesutton/Documents/sites/humanagent/convex/functions/agentmail.ts](/Users/waynesutton/Documents/sites/humanagent/convex/functions/agentmail.ts)`.
- Confirm conversation metadata and delivery state support in:
  - `[/Users/waynesutton/Documents/sites/humanagent/convex/functions/conversations.ts](/Users/waynesutton/Documents/sites/humanagent/convex/functions/conversations.ts)`
  - `[/Users/waynesutton/Documents/sites/humanagent/convex/schema.ts](/Users/waynesutton/Documents/sites/humanagent/convex/schema.ts)`

## Phase 3: End to end verification checklist

- Create or select one test agent and set `agentEmail` in agent settings UI.
- Send an external test email to that `agentEmail`.
- In AgentMail webhook logs, confirm HTTP `200` for `message.received`.
- In app Inbox (`[/Users/waynesutton/Documents/sites/humanagent/src/pages/InboxPage.tsx](/Users/waynesutton/Documents/sites/humanagent/src/pages/InboxPage.tsx)`), confirm a conversation appears.
- Reply from the app Inbox and confirm:
  - outbound reply is sent
  - AgentMail emits `message.sent`, then `message.delivered` or `message.bounced`
  - conversation/feed metadata updates accordingly

## Phase 4: User operating model

- Platform owner manages webhook endpoint and platform env secrets once.
- Users only:
  - create account and agent
  - set `agentEmail`
  - use Inbox to read/reply
- Users do not configure webhook secrets.

## Phase 5: Optional zero setup product polish

- Auto assign `agentEmail` during agent creation (username + domain) in `[/Users/waynesutton/Documents/sites/humanagent/convex/functions/agents.ts](/Users/waynesutton/Documents/sites/humanagent/convex/functions/agents.ts)`.
- Hide AgentMail BYOK fields for regular users in `[/Users/waynesutton/Documents/sites/humanagent/src/pages/SettingsPage.tsx](/Users/waynesutton/Documents/sites/humanagent/src/pages/SettingsPage.tsx)`, keep for admin/advanced mode.
- Add delivery status chip (`received/sent/delivered/bounced`) in Inbox list and thread header in `[/Users/waynesutton/Documents/sites/humanagent/src/pages/InboxPage.tsx](/Users/waynesutton/Documents/sites/humanagent/src/pages/InboxPage.tsx)`.
- Keep retry safety using existing webhook retry queue in `[/Users/waynesutton/Documents/sites/humanagent/convex/functions/webhooks.ts](/Users/waynesutton/Documents/sites/humanagent/convex/functions/webhooks.ts)` and cron trigger in `[/Users/waynesutton/Documents/sites/humanagent/convex/crons.ts](/Users/waynesutton/Documents/sites/humanagent/convex/crons.ts)`.
