# Skill Graphs for HumanAgent

## Problem

HumanAgent skills today are flat capability declarations: a name, bio, list of capabilities, and knowledge domains stored as strings. When the agent runtime builds context for an LLM call, it dumps all active skill capabilities into the system prompt as a flat list. This works for simple agents but breaks down when:

1. An agent needs deep domain knowledge (trading, legal, company ops) that cannot fit in one skill record
2. Knowledge relationships matter (concept A depends on concept B, technique X applies when condition Y)
3. Context window is wasted loading irrelevant capabilities when only a subset applies to the current task
4. Users want their agents to accumulate structured knowledge over time, not just conversation memory

Skill graphs solve this by turning flat skill files into traversable knowledge networks. Instead of loading everything into context, the agent navigates to exactly what the current task needs.

## Proposed Solution

Add a `knowledgeNodes` table that stores individual knowledge units (nodes) with YAML-style frontmatter metadata, wikilink connections to other nodes, and progressive disclosure (description before full content). Each node belongs to a user and optionally to a skill. Nodes link to each other forming a traversable graph.

The agent runtime gets a new context loading phase: after loading conversation history and semantic memory, it scans the user message for relevant knowledge nodes (via description matching and graph traversal) and injects only the relevant subset into context.

### Architecture: Three Layers

1. **Knowledge Nodes** (database records): Individual units of knowledge with description, content, tags, and links to other nodes
2. **Skill Graph Index** (per skill): An auto-generated index of all nodes linked to a skill, organized by topic clusters (MOCs)
3. **Context Router** (runtime): Selects which nodes to pull into the LLM context window based on task relevance

### Key Principles from arscontexta

- **Progressive disclosure**: index to descriptions to links to sections to full content. Most routing decisions happen before reading a single full node.
- **Descriptions as scannable metadata**: every node has a short description the agent can evaluate without loading the full content
- **Wiki links carry meaning**: links between nodes are embedded in prose, so the agent understands why a connection exists
- **Small composable pieces**: each node is one complete thought, technique, or concept

## Schema Changes

### New table: `knowledgeNodes`

```
knowledgeNodes: defineTable({
  userId: v.id("users"),
  skillId: v.optional(v.id("skills")),
  agentId: v.optional(v.id("agents")),
  title: v.string(),
  description: v.string(),                    // Short scannable summary (under 200 chars)
  content: v.string(),                        // Full node content (markdown with wikilinks)
  nodeType: v.union(                          // What kind of node
    v.literal("concept"),
    v.literal("technique"),
    v.literal("reference"),
    v.literal("moc"),                         // Map of Content (index node)
    v.literal("claim"),
    v.literal("procedure")
  ),
  tags: v.array(v.string()),
  linkedNodeIds: v.array(v.id("knowledgeNodes")),  // Explicit graph edges
  embedding: v.optional(v.array(v.float64())),      // For semantic search
  metadata: v.optional(v.any()),                     // Flexible metadata (freshness, owner, etc.)
  isPublished: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_userId", ["userId"])
.index("by_skillId", ["skillId"])
.index("by_agentId", ["agentId"])
.index("by_userId_nodeType", ["userId", "nodeType"])
.index("by_tags", ["userId"])
.searchIndex("search_content", {
  searchField: "content",
  filterFields: ["userId"],
})
.vectorIndex("by_embedding", {
  vectorField: "embedding",
  dimensions: 1536,
  filterFields: ["userId"],
})
```

### Existing table changes

- `skills` table: add `graphIndexNodeId: v.optional(v.id("knowledgeNodes"))` to link a skill to its MOC index node

## Files to Change

| File | Change |
|---|---|
| `convex/schema.ts` | Add `knowledgeNodes` table, add `graphIndexNodeId` to skills |
| `convex/functions/knowledgeGraph.ts` | New file: CRUD, linking, traversal, graph search queries |
| `convex/agent/queries.ts` | Add `loadRelevantKnowledge` query that traverses graph for task context |
| `convex/agent/securityUtils.ts` | Update `buildSystemPrompt` to include knowledge context section |
| `convex/agent/runtime.ts` | Add knowledge graph traversal step in processMessage pipeline |
| `src/pages/SkillFilePage.tsx` | Add knowledge graph viewer/editor section |
| `src/lib/platformApi.ts` | Add knowledge graph API references |

## How Context Routing Works

1. User sends a message or a task fires
2. Runtime loads agent config and conversation context (existing flow)
3. **New**: Runtime calls `loadRelevantKnowledge` with the user message
4. `loadRelevantKnowledge` does:
   a. Full text search on node descriptions for keyword matches
   b. If the agent has an embedding provider, vector search on node embeddings
   c. Start from matched nodes, traverse 1 hop via `linkedNodeIds` to pull related nodes
   d. Score and rank nodes by relevance
   e. Return top N nodes (default 5, max 10) with progressive disclosure: title + description first, full content for top 3
5. Knowledge context is injected into the system prompt as a `## Relevant Knowledge` section
6. Agent can request more nodes via a new `traverse_knowledge` action type

## Agent Actions

New action types in `<app_actions>`:

- `create_knowledge_node`: Agent creates a new knowledge node from task outcomes or learned information
- `link_knowledge_nodes`: Agent connects two existing nodes
- `traverse_knowledge`: Agent requests deeper traversal from a specific node (fetches linked nodes)

## Edge Cases

- Empty graph: gracefully skip knowledge loading, fall back to existing flat capabilities
- Circular links: traversal uses a visited set to prevent infinite loops
- Large graphs: limit traversal depth to 2 hops, limit total nodes loaded to 10
- Stale nodes: metadata.updatedAt allows freshness scoring (newer nodes rank higher)
- No embedding provider: fall back to full text search only
- Node content too large: progressive disclosure, only load full content for top matches

## Verification Steps

1. Create a knowledge node via the UI
2. Link two nodes together
3. Send an agent message related to the node content
4. Verify the agent response references knowledge from the graph
5. Check that irrelevant nodes are not loaded into context
6. Verify graph traversal stops at depth limit
7. Test with no nodes (graceful degradation)
