# Knowledge Graph Auto Mode and Live Graph View

## Problem

Users manually create knowledge nodes one at a time. When a skill already has domains, capabilities, and description defined, the LLM can analyze that information and auto-generate a connected knowledge graph. Users also have no visual way to see the graph structure, only a flat list of nodes.

## Proposed solution

### Auto Mode

Add an "Auto Generate" button to the Knowledge Graph section that:

1. Reads the current skill's identity, capabilities, knowledge domains, and existing nodes
2. Sends that context to the user's connected LLM (via the same agent runtime LLM infrastructure)
3. Asks the LLM to produce a structured JSON array of nodes with relationships
4. Creates the nodes and links them in Convex
5. Shows progress with a generating state in the UI

Gated on: user must have at least one LLM provider configured with an API key.

### Live Graph View

Add a force-directed graph visualization that:

1. Renders nodes as circles with labels, edges as lines between linked nodes
2. Uses HTML5 Canvas for performance (no external library deps)
3. Matches the site's design system (surface-0/1/2 backgrounds, ink-0/1 text, accent color for active nodes)
4. Interactive: drag nodes, hover for details, click to select/expand
5. Toggles between list view and graph view

## Files to change

| File | Change |
|------|--------|
| `convex/functions/knowledgeGraph.ts` | Add `autoGenerateGraph` internalAction |
| `convex/agent/runtime.ts` | Export `callLLMProvider` helper (or keep inline) |
| `src/pages/SkillFilePage.tsx` | Add Auto Generate button, graph view toggle, graph canvas component |
| `src/components/KnowledgeGraphCanvas.tsx` | New: force-directed graph visualization |

## Edge cases

- No LLM provider configured: show disabled button with tooltip
- Skill has no domains or capabilities: LLM generates generic starter nodes
- Existing nodes: LLM told about them to avoid duplicates, new nodes get linked to existing ones
- LLM returns bad JSON: graceful fallback with error notification
- Large graphs (100+ nodes): canvas viewport with zoom/pan
- Auto mode while already generating: debounce, disable button during generation

## Backend approach

Create an `internalAction` that:
1. Loads skill data (identity, capabilities, domains)
2. Loads existing nodes
3. Gets user's agent config and LLM credentials
4. Calls LLM with a structured prompt asking for JSON array of nodes
5. Parses response, creates nodes via `createNodeFromAgent`
6. Links related nodes via `linkNodesFromAgent`
7. Returns count of created nodes

The action is triggered from a public mutation that validates auth and schedules the action.
