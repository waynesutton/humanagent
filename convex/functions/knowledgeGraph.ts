/**
 * Knowledge Graph: CRUD, linking, traversal, and search for skill graph nodes.
 * Implements progressive disclosure: descriptions first, full content on demand.
 */
import { v } from "convex/values";
import { authedMutation, authedQuery } from "../lib/functions";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_CONTENT_LENGTH = 12000;
const MAX_TAGS = 20;
const MAX_LINKS = 30;
const MAX_NODES_LOADED = 10;

const nodeTypeValidator = v.union(
  v.literal("concept"),
  v.literal("technique"),
  v.literal("reference"),
  v.literal("moc"),
  v.literal("claim"),
  v.literal("procedure")
);

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

// -- Public Queries --

export const listNodes = authedQuery({
  args: {
    skillId: v.optional(v.id("skills")),
    agentId: v.optional(v.id("agents")),
    nodeType: v.optional(nodeTypeValidator),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    if (args.nodeType) {
      return await ctx.db
        .query("knowledgeNodes")
        .withIndex("by_userId_nodeType", (q) =>
          q.eq("userId", ctx.userId).eq("nodeType", args.nodeType!)
        )
        .take(100);
    }
    if (args.skillId) {
      return await ctx.db
        .query("knowledgeNodes")
        .withIndex("by_skillId", (q) => q.eq("skillId", args.skillId))
        .take(100);
    }
    if (args.agentId) {
      return await ctx.db
        .query("knowledgeNodes")
        .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
        .take(100);
    }
    return await ctx.db
      .query("knowledgeNodes")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(100);
  },
});

export const getNode = authedQuery({
  args: { nodeId: v.id("knowledgeNodes") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { nodeId }) => {
    const node = await ctx.db.get(nodeId);
    if (!node || node.userId !== ctx.userId) return null;
    return node;
  },
});

// Get linked nodes (one hop) with progressive disclosure: title + description only
export const getLinkedNodes = authedQuery({
  args: { nodeId: v.id("knowledgeNodes") },
  returns: v.array(
    v.object({
      _id: v.id("knowledgeNodes"),
      title: v.string(),
      description: v.string(),
      nodeType: nodeTypeValidator,
      tags: v.array(v.string()),
    })
  ),
  handler: async (ctx, { nodeId }) => {
    const node = await ctx.db.get(nodeId);
    if (!node || node.userId !== ctx.userId) return [];

    const linked = await Promise.all(
      node.linkedNodeIds.map((id) => ctx.db.get(id))
    );

    return linked
      .filter((n): n is NonNullable<typeof n> => n !== null && n.userId === ctx.userId)
      .map((n) => ({
        _id: n._id,
        title: n.title,
        description: n.description,
        nodeType: n.nodeType,
        tags: n.tags,
      }));
  },
});

// Graph stats for the skill page header
export const getGraphStats = authedQuery({
  args: {
    skillId: v.optional(v.id("skills")),
  },
  returns: v.object({
    totalNodes: v.number(),
    byType: v.any(),
  }),
  handler: async (ctx, args) => {
    const nodes = args.skillId
      ? await ctx.db
          .query("knowledgeNodes")
          .withIndex("by_skillId", (q) => q.eq("skillId", args.skillId))
          .take(500)
      : await ctx.db
          .query("knowledgeNodes")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
          .take(500);

    const byType: Record<string, number> = {};
    for (const node of nodes) {
      byType[node.nodeType] = (byType[node.nodeType] || 0) + 1;
    }

    return { totalNodes: nodes.length, byType };
  },
});

// -- Public Mutations --

export const createNode = authedMutation({
  args: {
    skillId: v.optional(v.id("skills")),
    agentId: v.optional(v.id("agents")),
    title: v.string(),
    description: v.string(),
    content: v.string(),
    nodeType: nodeTypeValidator,
    tags: v.optional(v.array(v.string())),
    linkedNodeIds: v.optional(v.array(v.id("knowledgeNodes"))),
    isPublished: v.optional(v.boolean()),
  },
  returns: v.id("knowledgeNodes"),
  handler: async (ctx, args) => {
    if (args.skillId) {
      const skill = await ctx.db.get(args.skillId);
      if (!skill || skill.userId !== ctx.userId) throw new Error("Skill not found");
    }
    if (args.agentId) {
      const agent = await ctx.db.get(args.agentId);
      if (!agent || agent.userId !== ctx.userId) throw new Error("Agent not found");
    }

    // Validate linked nodes belong to user
    const linkedIds = (args.linkedNodeIds ?? []).slice(0, MAX_LINKS);
    if (linkedIds.length > 0) {
      const linked = await Promise.all(linkedIds.map((id) => ctx.db.get(id)));
      for (const node of linked) {
        if (!node || node.userId !== ctx.userId) {
          throw new Error("Linked node not found or not owned by user");
        }
      }
    }

    const now = Date.now();
    return await ctx.db.insert("knowledgeNodes", {
      userId: ctx.userId,
      skillId: args.skillId,
      agentId: args.agentId,
      title: clip(args.title.trim(), MAX_TITLE_LENGTH),
      description: clip(args.description.trim(), MAX_DESCRIPTION_LENGTH),
      content: clip(args.content, MAX_CONTENT_LENGTH),
      nodeType: args.nodeType,
      tags: (args.tags ?? []).slice(0, MAX_TAGS),
      linkedNodeIds: linkedIds,
      isPublished: args.isPublished ?? false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateNode = authedMutation({
  args: {
    nodeId: v.id("knowledgeNodes"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    nodeType: v.optional(nodeTypeValidator),
    tags: v.optional(v.array(v.string())),
    linkedNodeIds: v.optional(v.array(v.id("knowledgeNodes"))),
    isPublished: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.userId !== ctx.userId) throw new Error("Node not found");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = clip(args.title.trim(), MAX_TITLE_LENGTH);
    if (args.description !== undefined) patch.description = clip(args.description.trim(), MAX_DESCRIPTION_LENGTH);
    if (args.content !== undefined) patch.content = clip(args.content, MAX_CONTENT_LENGTH);
    if (args.nodeType !== undefined) patch.nodeType = args.nodeType;
    if (args.tags !== undefined) patch.tags = args.tags.slice(0, MAX_TAGS);
    if (args.isPublished !== undefined) patch.isPublished = args.isPublished;

    if (args.linkedNodeIds !== undefined) {
      const linkedIds = args.linkedNodeIds.slice(0, MAX_LINKS);
      const linked = await Promise.all(linkedIds.map((id) => ctx.db.get(id)));
      for (const n of linked) {
        if (!n || n.userId !== ctx.userId) {
          throw new Error("Linked node not found or not owned by user");
        }
      }
      patch.linkedNodeIds = linkedIds;
    }

    await ctx.db.patch(args.nodeId, patch);
    return null;
  },
});

export const deleteNode = authedMutation({
  args: { nodeId: v.id("knowledgeNodes") },
  returns: v.null(),
  handler: async (ctx, { nodeId }) => {
    const node = await ctx.db.get(nodeId);
    if (!node || node.userId !== ctx.userId) throw new Error("Node not found");
    await ctx.db.delete(nodeId);
    return null;
  },
});

/**
 * Trigger auto-generation of knowledge graph nodes for a skill via LLM.
 * Schedules the generation as a background action.
 */
export const triggerAutoGenerate = authedMutation({
  args: {
    skillId: v.id("skills"),
    agentId: v.id("agents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill || skill.userId !== ctx.userId) throw new Error("Skill not found");

    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.userId !== ctx.userId) throw new Error("Agent not found");

    await ctx.scheduler.runAfter(0, internal.agent.runtime.autoGenerateGraph, {
      userId: ctx.userId,
      agentId: args.agentId,
      skillId: args.skillId,
    });

    return null;
  },
});

// Link two nodes bidirectionally
export const linkNodes = authedMutation({
  args: {
    sourceNodeId: v.id("knowledgeNodes"),
    targetNodeId: v.id("knowledgeNodes"),
  },
  returns: v.null(),
  handler: async (ctx, { sourceNodeId, targetNodeId }) => {
    if (sourceNodeId === targetNodeId) throw new Error("Cannot link a node to itself");

    const [source, target] = await Promise.all([
      ctx.db.get(sourceNodeId),
      ctx.db.get(targetNodeId),
    ]);
    if (!source || source.userId !== ctx.userId) throw new Error("Source node not found");
    if (!target || target.userId !== ctx.userId) throw new Error("Target node not found");

    // Add target to source's links if not already there
    if (!source.linkedNodeIds.includes(targetNodeId)) {
      await ctx.db.patch(sourceNodeId, {
        linkedNodeIds: [...source.linkedNodeIds, targetNodeId].slice(0, MAX_LINKS),
        updatedAt: Date.now(),
      });
    }

    // Add source to target's links if not already there
    if (!target.linkedNodeIds.includes(sourceNodeId)) {
      await ctx.db.patch(targetNodeId, {
        linkedNodeIds: [...target.linkedNodeIds, sourceNodeId].slice(0, MAX_LINKS),
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});

// Unlink two nodes
export const unlinkNodes = authedMutation({
  args: {
    sourceNodeId: v.id("knowledgeNodes"),
    targetNodeId: v.id("knowledgeNodes"),
  },
  returns: v.null(),
  handler: async (ctx, { sourceNodeId, targetNodeId }) => {
    const [source, target] = await Promise.all([
      ctx.db.get(sourceNodeId),
      ctx.db.get(targetNodeId),
    ]);
    if (!source || source.userId !== ctx.userId) throw new Error("Source node not found");
    if (!target || target.userId !== ctx.userId) throw new Error("Target node not found");

    await ctx.db.patch(sourceNodeId, {
      linkedNodeIds: source.linkedNodeIds.filter((id) => id !== targetNodeId),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(targetNodeId, {
      linkedNodeIds: target.linkedNodeIds.filter((id) => id !== sourceNodeId),
      updatedAt: Date.now(),
    });

    return null;
  },
});

// -- Internal Queries (for agent runtime) --

/**
 * Load relevant knowledge nodes for a given user message.
 * Uses full text search on content, then traverses 1 hop for related nodes.
 * Returns progressive disclosure: all nodes get title + description,
 * top matches get full content.
 */
export const loadRelevantKnowledge = internalQuery({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    query: v.string(),
    maxNodes: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("knowledgeNodes"),
      title: v.string(),
      description: v.string(),
      content: v.optional(v.string()), // Only included for top matches
      nodeType: v.string(),
      tags: v.array(v.string()),
      linkedNodeIds: v.array(v.id("knowledgeNodes")),
      relevanceReason: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const maxNodes = args.maxNodes ?? MAX_NODES_LOADED;
    const resultMap = new Map<
      string,
      {
        _id: Id<"knowledgeNodes">;
        title: string;
        description: string;
        content?: string;
        nodeType: string;
        tags: string[];
        linkedNodeIds: Id<"knowledgeNodes">[];
        relevanceReason: string;
        score: number;
      }
    >();

    // Phase 1: Full text search on content
    const searchResults = await ctx.db
      .query("knowledgeNodes")
      .withSearchIndex("search_content", (q) =>
        q.search("content", args.query).eq("userId", args.userId)
      )
      .take(maxNodes);

    for (let i = 0; i < searchResults.length; i++) {
      const node = searchResults[i]!;
      // Filter by agent if specified
      if (args.agentId && node.agentId && node.agentId !== args.agentId) continue;

      const isTopMatch = i < 3; // Full content for top 3 matches
      resultMap.set(node._id, {
        _id: node._id,
        title: node.title,
        description: node.description,
        content: isTopMatch ? node.content : undefined,
        nodeType: node.nodeType,
        tags: node.tags,
        linkedNodeIds: node.linkedNodeIds,
        relevanceReason: "text_match",
        score: searchResults.length - i, // Higher score for earlier results
      });
    }

    // Phase 2: Traverse one hop from matched nodes to pull related context
    const visited = new Set(resultMap.keys());
    const linkedToFetch: Id<"knowledgeNodes">[] = [];

    for (const node of resultMap.values()) {
      for (const linkedId of node.linkedNodeIds) {
        if (!visited.has(linkedId) && linkedToFetch.length < maxNodes) {
          linkedToFetch.push(linkedId);
          visited.add(linkedId);
        }
      }
    }

    if (linkedToFetch.length > 0) {
      const linkedNodes = await Promise.all(
        linkedToFetch.map((id) => ctx.db.get(id))
      );

      for (const node of linkedNodes) {
        if (!node || node.userId !== args.userId) continue;
        if (args.agentId && node.agentId && node.agentId !== args.agentId) continue;
        if (resultMap.size >= maxNodes) break;

        resultMap.set(node._id, {
          _id: node._id,
          title: node.title,
          description: node.description,
          // Linked nodes get description only (progressive disclosure)
          nodeType: node.nodeType,
          tags: node.tags,
          linkedNodeIds: node.linkedNodeIds,
          relevanceReason: "graph_traversal",
          score: 0,
        });
      }
    }

    // Phase 3: If we have MOC nodes, check if any are relevant
    if (resultMap.size < maxNodes) {
      const mocs = args.agentId
        ? await ctx.db
            .query("knowledgeNodes")
            .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
            .take(20)
        : await ctx.db
            .query("knowledgeNodes")
            .withIndex("by_userId_nodeType", (q) =>
              q.eq("userId", args.userId).eq("nodeType", "moc")
            )
            .take(10);

      for (const moc of mocs) {
        if (moc.nodeType !== "moc") continue;
        if (resultMap.has(moc._id)) continue;
        if (resultMap.size >= maxNodes) break;

        // Check if any of the MOC's linked nodes are already in results
        const hasRelevantLink = moc.linkedNodeIds.some((id) => resultMap.has(id));
        if (hasRelevantLink) {
          resultMap.set(moc._id, {
            _id: moc._id,
            title: moc.title,
            description: moc.description,
            content: moc.content, // MOCs are index nodes, always include content
            nodeType: moc.nodeType,
            tags: moc.tags,
            linkedNodeIds: moc.linkedNodeIds,
            relevanceReason: "moc_index",
            score: 1,
          });
        }
      }
    }

    // Sort by score descending, then return
    const results = Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxNodes);

    return results;
  },
});

/**
 * Create a knowledge node from the agent runtime (internal mutation).
 * Used by create_knowledge_node and learn actions.
 */
export const createNodeFromAgent = internalMutation({
  args: {
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    skillId: v.optional(v.id("skills")),
    title: v.string(),
    description: v.string(),
    content: v.string(),
    nodeType: nodeTypeValidator,
    tags: v.optional(v.array(v.string())),
    linkedNodeIds: v.optional(v.array(v.id("knowledgeNodes"))),
  },
  returns: v.id("knowledgeNodes"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("knowledgeNodes", {
      userId: args.userId,
      skillId: args.skillId,
      agentId: args.agentId,
      title: clip(args.title.trim(), MAX_TITLE_LENGTH),
      description: clip(args.description.trim(), MAX_DESCRIPTION_LENGTH),
      content: clip(args.content, MAX_CONTENT_LENGTH),
      nodeType: args.nodeType,
      tags: (args.tags ?? []).slice(0, MAX_TAGS),
      linkedNodeIds: (args.linkedNodeIds ?? []).slice(0, MAX_LINKS),
      isPublished: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Load skill data for auto-generation (internal, no auth check).
 */
export const getSkillForAutoGen = internalQuery({
  args: { skillId: v.id("skills") },
  returns: v.union(
    v.object({
      name: v.string(),
      bio: v.string(),
      capabilities: v.array(v.object({ name: v.string(), description: v.string() })),
      knowledgeDomains: v.array(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, { skillId }) => {
    const skill = await ctx.db.get(skillId);
    if (!skill) return null;
    return {
      name: skill.identity.name,
      bio: skill.identity.bio,
      capabilities: (skill.capabilities ?? []).map((c) => ({
        name: c.name,
        description: c.description,
      })),
      knowledgeDomains: skill.knowledgeDomains ?? [],
    };
  },
});

/**
 * List nodes for a skill (internal, no auth check).
 */
export const listNodesInternal = internalQuery({
  args: { skillId: v.id("skills") },
  returns: v.array(
    v.object({
      _id: v.id("knowledgeNodes"),
      title: v.string(),
      nodeType: v.string(),
    })
  ),
  handler: async (ctx, { skillId }) => {
    const nodes = await ctx.db
      .query("knowledgeNodes")
      .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
      .take(100);
    return nodes.map((n) => ({ _id: n._id, title: n.title, nodeType: n.nodeType }));
  },
});

/**
 * Link two nodes from the agent runtime (internal mutation).
 */
export const linkNodesFromAgent = internalMutation({
  args: {
    userId: v.id("users"),
    sourceNodeId: v.id("knowledgeNodes"),
    targetNodeId: v.id("knowledgeNodes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.sourceNodeId === args.targetNodeId) return null;

    const [source, target] = await Promise.all([
      ctx.db.get(args.sourceNodeId),
      ctx.db.get(args.targetNodeId),
    ]);
    if (!source || source.userId !== args.userId) return null;
    if (!target || target.userId !== args.userId) return null;

    if (!source.linkedNodeIds.includes(args.targetNodeId)) {
      await ctx.db.patch(args.sourceNodeId, {
        linkedNodeIds: [...source.linkedNodeIds, args.targetNodeId].slice(0, MAX_LINKS),
        updatedAt: Date.now(),
      });
    }
    if (!target.linkedNodeIds.includes(args.sourceNodeId)) {
      await ctx.db.patch(args.targetNodeId, {
        linkedNodeIds: [...target.linkedNodeIds, args.sourceNodeId].slice(0, MAX_LINKS),
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});
