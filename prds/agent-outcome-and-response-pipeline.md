# Agent Response Pipeline and Task Outcome System

## Summary

This document explains how the HumanAgent agent pipeline works end to end, why task outcomes were showing only brief summaries instead of real content, how the 8000-character limit fits in, and what needs to change to support richer outputs like images, video, multi-step tasks, thinking mode, and agent-to-agent work. Intended for product owners, vibe coders, and future AI sessions working on this codebase.

---

## How the pipeline works today

### Step 1: User or agent sends a message

A message enters the system from one of these channels: `dashboard`, `chat`, `email`, `api`, `mcp`, or `a2a` (agent to agent). It lands in `convex/agent/runtime.ts` inside the `processMessage` action.

### Step 2: Security scan

The message is scanned by `scanInput` for injection attacks, sensitive data patterns, and prompt manipulation. If blocked, the pipeline stops here.

### Step 3: LLM call

The agent loads its config (provider, model, system prompt, capabilities) from Convex. It loads conversation history and semantic memory for context. It builds a full `messages` array and sends it to the configured LLM provider (OpenRouter, OpenAI, Anthropic, Google, DeepSeek, Mistral, MiniMax, Kimi, xAI, or any OpenAI-compatible custom endpoint). The LLM is given `max_tokens: 2048` which caps the response at roughly 1500 to 2000 words.

### Step 4: Parsing the LLM response

The raw LLM output goes through `parseAgentActions`. This function splits the response into two parts:

**`cleanResponse`**
The human-readable text. This is everything the agent wrote that is not wrapped in the `<app_actions>` block. This is the actual work output: the list of ideas, the essay draft, the research summary, the code snippet, the answer.

**`<app_actions>` JSON block**
A structured machine-readable payload the agent appends at the end of its reply. It looks like this:

```
<app_actions>
[
  {
    "type": "update_task_status",
    "taskId": "abc123",
    "status": "completed",
    "outcomeSummary": "Generated a list of domain ideas and saved to Markdown."
  }
]
</app_actions>
```

The `outcomeSummary` field inside this block is a one-liner the agent writes to describe what it did. It is not the actual content.

### Step 5: Actions are executed

Each action in the JSON block is dispatched to the right Convex mutation:

| Action type          | What it does                                            |
| -------------------- | ------------------------------------------------------- |
| `create_task`        | Adds a new task to the board                            |
| `update_task_status` | Marks a task pending, in_progress, completed, or failed |
| `move_task`          | Moves a task to a different board column                |
| `create_feed_item`   | Posts an update to the public activity feed             |
| `create_skill`       | Creates or updates the agent skill file                 |
| `update_skill`       | Updates agent capabilities                              |

### Step 6: Memory and audit log

The full `assistantResponse` (which equals `cleanResponse`) is saved to agent memory for future context. The interaction is logged to the audit trail with token counts.

---

## The bug: why outcomes showed only brief summaries

### What was broken

When a task completed, the board and outcome email only showed a brief one-liner like:

> "Generated a list of ideas for wayne.sh domain, saved to Markdown, and prepared email-ready results."

The actual list of ideas was nowhere to be seen.

### Root cause

The code was reading `outcomeSummary` from the `<app_actions>` JSON block only. That field is a meta-description the agent writes for the machine, not the actual content.

The actual content — the full list of domain ideas, the research, the draft — was in `cleanResponse`. That text was saved to conversation memory but was never written to the task record. So it never appeared in the task report, the outcome modal, or the outcome email.

### The fix

When a task is marked `completed` or `failed`, the code now uses `assistantResponse` (which is `cleanResponse`, the full agent text reply) as the `outcomeSummary` stored in the task. The brief action block summary is only used as a fallback when the full reply is empty.

```ts
const effectiveOutcome =
  action.status === "completed" || action.status === "failed"
    ? assistantResponse.slice(0, 8000) || action.outcomeSummary
    : action.outcomeSummary;
```

---

## The 8000-character limit

### Why it exists

The LLM is given `max_tokens: 2048` which means the raw response is at most around 8000 to 10000 characters (roughly 2048 tokens x 4 chars per token). The `.slice(0, 8000)` in the fix caps the stored outcome to stay safely within a single Convex string field and within practical email/UI rendering limits.

### What 8000 characters actually holds

8000 characters is roughly 1200 to 1500 words. That covers:

- A thorough research summary
- A multi-section blog post outline with details
- A full list of 20 to 30 ideas with descriptions
- A short essay or email draft

### When 8000 characters is not enough

For tasks that produce very long outputs — a full blog post, a detailed report, a code file — 8000 characters will truncate the result. The long-form answer will be in conversation memory (no limit) but the task outcome record will show a cut-off version.

**The right fix for long-form content is covered in the future work section below.**

---

## Current limits and what they mean for features

| Limit                         | Value       | Why                                                 |
| ----------------------------- | ----------- | --------------------------------------------------- |
| LLM max tokens per call       | 2048        | Cost and latency. Can be raised per agent.          |
| `outcomeSummary` stored       | 8000 chars  | One Convex string field. Plenty for text summaries. |
| `action.outcomeSummary` field | 2000 chars  | Prevents bloated JSON in the `<app_actions>` block. |
| Task description              | 800 chars   | Readable task card.                                 |
| Feed item content             | 320 chars   | Feed cards are short.                               |
| Conversation context loaded   | 10 messages | Keeps LLM context window manageable.                |
| Semantic memory matches       | 8           | Top-8 vector matches per query.                     |

---

## Future features: how each one would work

### Long-form output and file storage

**Problem:** 8000 chars is enough for most text tasks but not for a full report, a long code file, or a research doc.

**How to build it:**

- When `cleanResponse` is over 8000 chars, upload the full text to Convex file storage as a `.md` file using `ctx.storage.store`.
- Save the storage ID as a new field `tasks.outcomeFileId: v.optional(v.id("_storage"))`.
- The task outcome modal loads the file URL and renders it in the viewer.
- The email includes a "View full report" link to the hosted file.

**Schema change needed:** `tasks.outcomeFileId: v.optional(v.id("_storage"))`

---

### Image output

**Problem:** Agents can call image generation APIs (DALL-E, Stability AI, Flux) but have no way to attach the result to a task.

**How to build it:**

- Add `generate_image` as a new action type in `<app_actions>`.
- The action carries a `prompt` field. The runtime calls the image API, uploads the result to Convex storage.
- The storage ID is saved to a new `tasks.outcomeImages: v.optional(v.array(v.id("_storage")))` field.
- The task outcome modal renders image thumbnails from storage URLs.
- The email includes image URLs if the provider supports inline images.

**Schema change needed:** `tasks.outcomeImages`

---

### Video output

**Problem:** No way to attach or reference a video result to a task.

**How to build it:**

- Same pattern as images. Add `generate_video` action type.
- Video files are uploaded to Convex storage (up to the file size limit).
- For large videos, store an external URL instead: `tasks.outcomeVideoUrl: v.optional(v.string())`.
- The task outcome modal renders a `<video>` element.

**Schema change needed:** `tasks.outcomeVideoUrl` or reuse `tasks.outcomeImages` as a generic `tasks.outcomeFiles` array.

---

### Multi-step tasks

**Problem:** Complex work like "research domain names, pick the best 3, write a landing page for each" cannot be tracked as a single task unit.

**How to build it:**

- Add `tasks.parentTaskId: v.optional(v.id("tasks"))` to the schema to support subtask trees.
- Add `create_subtask` as an action type. The agent creates child tasks under the current parent.
- The board shows subtask progress (e.g., "3 of 5 subtasks done") on the parent card.
- Each subtask has its own `outcomeSummary`. The parent task outcome aggregates subtask summaries.
- The cron scheduler processes subtasks in sequence, passing context from each completed subtask into the next call.

**Schema change needed:** `tasks.parentTaskId`, index `by_parentTaskId`

---

### Thinking mode (chain-of-thought)

**Problem:** For complex research or multi-decision tasks, the agent reasons better when it can "think out loud" before committing to a final answer. There is currently no way to see the agent's reasoning steps.

**How to build it:**

- Some LLM providers (Anthropic Claude, OpenAI o1/o3) support a `<thinking>` or extended reasoning block in their responses.
- Parse `<thinking>...</thinking>` blocks from the raw LLM response the same way `parseAgentActions` parses `<app_actions>`.
- Save the thinking content to `agentMemory` with `type: "reflection"` (already exists in the schema).
- The Thinking tab at `/thinking` already displays memories of type `reflection`, `decision`, and `goal_update` per agent. Thinking mode output would flow there automatically.
- No schema change needed. Just extend `parseAgentActions` to extract and save thinking blocks.
-

**What the user sees:** The Thinking tab shows the agent's reasoning chain for each task run.

---

### Agent-to-agent (A2A) mode

**Problem:** One agent completing a task on its own is limited. For complex work, a coordinator agent should be able to delegate subtasks to specialist agents (research agent, writing agent, code agent).

**How it works today:**

- The `a2a` channel is already wired in `processMessage`.
- An agent can send a message to another agent via the `a2a` HTTP endpoint.
- The receiving agent processes the message and creates a task in its own board.

**How to extend it:**

- Add a `delegate_to_agent` action type in `<app_actions>`.
- The coordinator agent provides a `targetAgentSlug` and a `taskDescription`.
- The runtime looks up the target agent, creates a task in that agent's board, and sends the task description to the target agent via `processMessage` with `channel: "a2a"`.
- When the target agent completes the task, it sends its `outcomeSummary` back to the coordinator via another `a2a` message.
- The coordinator aggregates the subtask outcomes and marks the parent task complete.
- could be added via api in settings or convex components likr r2 componet

**Schema change needed:** None immediately. Existing `tasks.requester` and `tasks.agentId` fields handle attribution.

---

### Tool use and web access

**Problem:** The agent currently generates text only. It cannot browse the web, run code, or call external APIs mid-task.

**How to build it:**

- Add `call_tool` as an action type. Tools are defined in the agent's skill file under `toolDeclarations`.
- The runtime processes a tool call, executes it (HTTP fetch, Convex action), and feeds the result back to the LLM as a `tool` role message for a second LLM call.
- Common tools: web search (Firecrawl, Brave Search, https://browser-use.com/, stagehand browserbase, URL fetch, code execution sandbox, calendar read/write.
- Each tool call adds to token usage and task duration.
- could be added via api in settings

**Schema change needed:** `tasks.toolCallLog: v.optional(v.array(v.object({...})))` to record what tools were called and what they returned.

---

## Files involved in the outcome pipeline

| File                            | Role                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `convex/agent/runtime.ts`       | LLM calls, `parseAgentActions`, `effectiveOutcome` logic, memory save              |
| `convex/functions/board.ts`     | `updateTaskFromAgent` mutation that writes `outcomeSummary` to the task record     |
| `convex/schema.ts`              | `tasks` table fields: `outcomeSummary`, `outcomeLinks`, `outcomeEmailStatus`, etc. |
| `src/pages/BoardPage.tsx`       | Task details modal (outcome read/edit), outcome viewer modal, task cards           |
| `convex/functions/agentmail.ts` | Sends outcome email when task completes                                            |

---

## Codex app server fit for HumanAgent

This app already has the right primitives for a Codex-style agent operating layer: conversations, tasks, skills, tools, MCP endpoints, and async job execution. Codex app server can be added as an optional execution interface without replacing the current UI or Convex model.

### What to use it for

- Coding tasks that need real shell and file edits with streamed progress
- Long-running agent jobs with step events, approvals, and interruption
- Tool-heavy automations where we want explicit turn and item lifecycle events
- Agent-to-agent service calls where one agent delegates specialized coding/research work

### Where it maps in this app

- **Thread** maps to `conversations`
- **Turn** maps to one user request plus its resulting task updates
- **Item events** map to `tasks.steps`, feed events, and audit log entries
- **Skill references** map to existing `skills` and `toolDeclarations`
- **MCP tool calls** map to existing `/mcp/*` and connector pathways

### Integration approach (minimal risk)

1. Add a new internal action adapter `codexRuntime.processTurn` that wraps app-server turn lifecycle and writes events into Convex.
2. Keep `processMessage` as default runtime and route only selected agents/tasks to Codex mode by config.
3. Persist turn/item snapshots in Convex so board tasks can show live progress and final outcomes.
4. Reuse existing `updateTaskFromAgent` so completed output handling stays unified.

---

## Image-guided target architecture notes

The three reference images point to one operating model: many interfaces in, one shared ontology/memory core, then coordinated skills, jobs, integrations, and databases. This matches HumanAgent direction and can be delivered incrementally.

### Architecture principles to keep

- Single source of truth in Convex for tasks, memory, skills, and audit trails
- Multi-interface ingestion (dashboard, email, API, MCP, Slack/Telegram next)
- Read-write loop design: every external action writes structured state, every agent run reads that state
- Coordinated councils/pipelines (security, advisory, social, video, daily brief) built as scheduled task programs, not separate disconnected systems

### Needed sync features (without redesigning UI)

- Task-program templates for recurring pipelines (daily briefing, social tracking, video ideas)
- Strong task output contracts: every completed task must emit detailed report text and optional files
- Unified integration event bus into feed + audit log so users can trace cross-system work
- Database-level linking between task outputs, memories, and downstream automations

---

## Verification checklist for the current fix

- [ ] Run a task that produces visible output (e.g., "generate 5 domain name ideas for waynesutton.ai")
- [ ] Task completes and moves to Done column
- [ ] Click "View full report" on the completed task card
- [ ] Outcome viewer shows the actual list of ideas, not just "Generated a list..."
- [ ] Check the outcome email — it should contain the full list, not just the one-liner
- [ ] Run a task that fails. Confirm the failure reason from `cleanResponse` is stored in `outcomeSummary`.

---

## Related

- `prds/dev-workflow.md` — general development workflow for this project
- `convex/agent/runtime.ts` — implementation of the full pipeline
- `convex/schema.ts` — all task fields including outcome fields
- `src/pages/BoardPage.tsx` — outcome modal and task report UI
