import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "../_generated/server";
import { authedMutation } from "../lib/functions";
import { internal } from "../_generated/api";

// ============================================================
// Public Queries - Serve llms.txt content
// ============================================================

// Get llms.txt content for a user by username
export const getByUsername = query({
  args: { username: v.string() },
  returns: v.union(
    v.object({
      txtContent: v.string(),
      mdContent: v.string(),
      generatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, { username }) => {
    const record = await ctx.db
      .query("llmsTxt")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!record) return null;

    return {
      txtContent: record.txtContent,
      mdContent: record.mdContent,
      generatedAt: record.generatedAt,
    };
  },
});

// ============================================================
// Internal Functions - Generate llms.txt content
// ============================================================

// Generate content hash from user data to detect changes
function generateContentHash(data: {
  username: string;
  agents: Array<{
    name: string;
    slug: string;
    description?: string;
    isPublic: boolean;
    skills: Array<{ name: string; capabilities: Array<{ name: string; description: string }> }>;
  }>;
}): string {
  const str = JSON.stringify(data);
  // Simple hash for change detection
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// Visibility flags per agent (mirrors schema publicConnect)
type AgentVisibility = {
  showApi: boolean;
  showMcp: boolean;
  showEmail: boolean;
  showSkillFile: boolean;
};

// Default visibility when publicConnect is unset
const DEFAULT_VISIBILITY: AgentVisibility = {
  showApi: true,
  showMcp: true,
  showEmail: true,
  showSkillFile: true,
};

// Generate the llms.txt plain text content
function generateTxtContent(
  username: string,
  displayName: string | undefined,
  bio: string | undefined,
  agents: Array<{
    name: string;
    slug: string;
    description?: string;
    isPublic: boolean;
    agentEmail?: string;
    publicConnect?: AgentVisibility;
    skills: Array<{
      name: string;
      bio: string;
      capabilities: Array<{ name: string; description: string }>;
      knowledgeDomains: string[];
    }>;
  }>,
  baseUrl: string,
  userPrivacy?: { showEmail?: boolean; showEndpoints?: boolean }
): string {
  const lines: Array<string> = [];

  // Header
  lines.push(`# ${displayName || username}'s AI Agents`);
  lines.push(`> ${bio || "AI-powered personal agents"}`);
  lines.push("");
  lines.push(`Profile: ${baseUrl}/${username}`);
  // Only show default API if endpoints are visible
  if (userPrivacy?.showEndpoints !== false) {
    lines.push(`API: ${baseUrl}/api/v1/agents/${username}/messages`);
  }
  lines.push("");

  // List public agents
  const publicAgents = agents.filter((a) => a.isPublic);

  if (publicAgents.length === 0) {
    lines.push("No public agents available.");
    return lines.join("\n");
  }

  lines.push(`## Agents (${publicAgents.length})`);
  lines.push("");

  for (const agent of publicAgents) {
    const vis = agent.publicConnect ?? DEFAULT_VISIBILITY;

    lines.push(`### ${agent.name}`);
    if (agent.description) {
      lines.push(`> ${agent.description}`);
    }
    lines.push("");

    // Agent endpoints (respect visibility)
    lines.push(`- Slug: ${agent.slug}`);
    if (vis.showEmail && agent.agentEmail && userPrivacy?.showEmail !== false) {
      lines.push(`- Email: ${agent.agentEmail}`);
    }
    if (vis.showApi) {
      lines.push(`- API: ${baseUrl}/api/v1/agents/${username}/${agent.slug}/messages`);
    }
    if (vis.showMcp) {
      lines.push(`- MCP: ${baseUrl}/mcp/u/${username}/${agent.slug}`);
    }
    lines.push("");

    // Skills and capabilities
    if (agent.skills.length > 0) {
      lines.push("#### Capabilities");
      for (const skill of agent.skills) {
        for (const cap of skill.capabilities) {
          lines.push(`- ${cap.name}: ${cap.description}`);
        }
      }
      lines.push("");

      // Knowledge domains
      const allDomains = agent.skills.flatMap((s) => s.knowledgeDomains);
      if (allDomains.length > 0) {
        lines.push(`#### Knowledge: ${allDomains.join(", ")}`);
        lines.push("");
      }
    }
  }

  // Footer
  lines.push("---");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Powered by HumanAgent`);

  return lines.join("\n");
}

// Generate the llms-full.md markdown content with more details
function generateMdContent(
  username: string,
  displayName: string | undefined,
  bio: string | undefined,
  agents: Array<{
    name: string;
    slug: string;
    description?: string;
    isPublic: boolean;
    agentEmail?: string;
    agentPhone?: string;
    publicConnect?: AgentVisibility;
    personality?: {
      tone?: string;
      speakingStyle?: string;
      customInstructions?: string;
    };
    skills: Array<{
      name: string;
      bio: string;
      capabilities: Array<{ name: string; description: string }>;
      knowledgeDomains: string[];
      communicationPrefs: { tone: string; timezone: string; availability: string };
    }>;
  }>,
  baseUrl: string,
  userPrivacy?: { showEmail?: boolean; showEndpoints?: boolean }
): string {
  const lines: Array<string> = [];

  // Header with metadata
  lines.push("---");
  lines.push(`title: "${displayName || username}'s AI Agents"`);
  lines.push(`description: "${bio || "AI-powered personal agents"}"`);
  lines.push(`profile: "${baseUrl}/${username}"`);
  lines.push(`generated: "${new Date().toISOString()}"`);
  lines.push("---");
  lines.push("");

  lines.push(`# ${displayName || username}'s AI Agents`);
  lines.push("");
  if (bio) {
    lines.push(bio);
    lines.push("");
  }

  // Quick links (respect user-level endpoint visibility)
  lines.push("## Quick Links");
  lines.push("");
  lines.push(`- **Profile**: [${baseUrl}/${username}](${baseUrl}/${username})`);
  if (userPrivacy?.showEndpoints !== false) {
    lines.push(`- **API Endpoint**: \`POST ${baseUrl}/api/v1/agents/${username}/messages\``);
  }
  lines.push(`- **llms.txt**: [${baseUrl}/${username}/llms.txt](${baseUrl}/${username}/llms.txt)`);
  lines.push(`- **Docs**: [${baseUrl}/api/v1/agents/${username}/docs.md](${baseUrl}/api/v1/agents/${username}/docs.md)`);
  lines.push("");

  // List public agents with full details
  const publicAgents = agents.filter((a) => a.isPublic);

  if (publicAgents.length === 0) {
    lines.push("*No public agents available.*");
    return lines.join("\n");
  }

  lines.push(`## Agents`);
  lines.push("");

  for (const agent of publicAgents) {
    const vis = agent.publicConnect ?? DEFAULT_VISIBILITY;

    lines.push(`### ${agent.name}`);
    lines.push("");

    if (agent.description) {
      lines.push(`> ${agent.description}`);
      lines.push("");
    }

    // Contact info (filtered by visibility)
    lines.push("#### Contact");
    lines.push("");
    lines.push(`| Method | Address |`);
    lines.push(`|--------|---------|`);
    if (vis.showApi) {
      lines.push(`| API | \`POST ${baseUrl}/api/v1/agents/${username}/${agent.slug}/messages\` |`);
    }
    if (vis.showEmail && agent.agentEmail && userPrivacy?.showEmail !== false) {
      lines.push(`| Email | ${agent.agentEmail} |`);
    }
    if (vis.showMcp) {
      lines.push(`| MCP | \`${baseUrl}/mcp/u/${username}/${agent.slug}\` |`);
    }
    if (vis.showSkillFile) {
      lines.push(`| Skill File | [SKILL.md](${baseUrl}/u/${username}/${agent.slug}/SKILL.md) |`);
    }
    lines.push("");

    // Personality
    if (agent.personality) {
      lines.push("#### Personality");
      lines.push("");
      if (agent.personality.tone) {
        lines.push(`- **Tone**: ${agent.personality.tone}`);
      }
      if (agent.personality.speakingStyle) {
        lines.push(`- **Style**: ${agent.personality.speakingStyle}`);
      }
      lines.push("");
    }

    // Skills and capabilities
    if (agent.skills.length > 0) {
      lines.push("#### Skills & Capabilities");
      lines.push("");

      for (const skill of agent.skills) {
        lines.push(`**${skill.name}**`);
        if (skill.bio) {
          lines.push(`> ${skill.bio}`);
        }
        lines.push("");

        if (skill.capabilities.length > 0) {
          lines.push("| Capability | Description |");
          lines.push("|------------|-------------|");
          for (const cap of skill.capabilities) {
            lines.push(`| ${cap.name} | ${cap.description} |`);
          }
          lines.push("");
        }

        if (skill.knowledgeDomains.length > 0) {
          lines.push(`**Knowledge Domains**: ${skill.knowledgeDomains.join(", ")}`);
          lines.push("");
        }

        if (skill.communicationPrefs) {
          lines.push(`**Communication**: ${skill.communicationPrefs.tone} tone, ${skill.communicationPrefs.availability}`);
          lines.push("");
        }
      }
    }

    lines.push("---");
    lines.push("");
  }

  // API usage example
  lines.push("## API Usage");
  lines.push("");
  lines.push("```bash");
  lines.push(`curl -X POST ${baseUrl}/api/v1/agents/${username}/messages \\`);
  lines.push(`  -H "Authorization: Bearer YOUR_API_KEY" \\`);
  lines.push(`  -H "Content-Type: application/json" \\`);
  lines.push(`  -d '{"content": "Hello, how can you help me?"}'`);
  lines.push("```");
  lines.push("");
  lines.push("Content negotiation: request markdown with `Accept: text/markdown`.");
  lines.push("");

  // Footer
  lines.push("---");
  lines.push("");
  lines.push(`*Generated by [HumanAgent](${baseUrl}) on ${new Date().toISOString()}*`);

  return lines.join("\n");
}

// Internal query to get data needed for generation
export const getGenerationData = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user || !user.username) return null;

    // Get all agents for this user
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // Get skills for each agent
    const agentsWithSkills = await Promise.all(
      agents.map(async (agent) => {
        const skills = await ctx.db
          .query("skills")
          .withIndex("by_agentId", (q) => q.eq("agentId", agent._id))
          .collect();

        return {
          name: agent.name,
          slug: agent.slug,
          description: agent.description,
          isPublic: agent.isPublic,
          agentEmail: agent.agentEmail,
          agentPhone: agent.agentPhone,
          publicConnect: agent.publicConnect as AgentVisibility | undefined,
          personality: agent.personality,
          skills: skills.map((s) => ({
            name: s.identity.name,
            bio: s.identity.bio,
            capabilities: s.capabilities,
            knowledgeDomains: s.knowledgeDomains,
            communicationPrefs: s.communicationPrefs,
          })),
        };
      })
    );

    return {
      userId: user._id,
      username: user.username,
      displayName: user.name,
      bio: user.bio,
      userPrivacy: user.privacySettings as { showEmail?: boolean; showEndpoints?: boolean } | undefined,
      agents: agentsWithSkills,
    };
  },
});

// Type for generation data (shared between functions)
type LlmsGenerationData = {
  userId: string;
  username: string;
  displayName?: string;
  bio?: string;
  userPrivacy?: { showEmail?: boolean; showEndpoints?: boolean };
  agents: Array<{
    name: string;
    slug: string;
    description?: string;
    isPublic: boolean;
    agentEmail?: string;
    agentPhone?: string;
    publicConnect?: AgentVisibility;
    personality?: {
      tone?: string;
      speakingStyle?: string;
      customInstructions?: string;
    };
    skills: Array<{
      name: string;
      bio: string;
      capabilities: Array<{ name: string; description: string }>;
      knowledgeDomains: string[];
      communicationPrefs: { tone: string; timezone: string; availability: string };
    }>;
  }>;
};

// Internal mutation to regenerate llms.txt for a user
export const regenerate = internalMutation({
  args: { userId: v.id("users") },
  returns: v.union(v.id("llmsTxt"), v.null()),
  handler: async (ctx, { userId }) => {
    // Get user data (inline to avoid circular reference)
    const user = await ctx.db.get(userId);
    if (!user || !user.username) return null;

    // Get all agents for this user
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // Get skills for each agent, include publicConnect
    const agentsWithSkills = await Promise.all(
      agents.map(async (agent) => {
        const skills = await ctx.db
          .query("skills")
          .withIndex("by_agentId", (q) => q.eq("agentId", agent._id))
          .collect();

        return {
          name: agent.name,
          slug: agent.slug,
          description: agent.description,
          isPublic: agent.isPublic,
          agentEmail: agent.agentEmail,
          agentPhone: agent.agentPhone,
          publicConnect: agent.publicConnect as AgentVisibility | undefined,
          personality: agent.personality,
          skills: skills.map((s) => ({
            name: s.identity.name,
            bio: s.identity.bio,
            capabilities: s.capabilities,
            knowledgeDomains: s.knowledgeDomains,
            communicationPrefs: s.communicationPrefs,
          })),
        };
      })
    );

    const data: LlmsGenerationData = {
      userId: user._id,
      username: user.username,
      displayName: user.name,
      bio: user.bio,
      userPrivacy: user.privacySettings as { showEmail?: boolean; showEndpoints?: boolean } | undefined,
      agents: agentsWithSkills,
    };

    const baseUrl = process.env.SITE_URL || "https://humanagent.dev";

    // Generate content hash (includes publicConnect for change detection)
    const contentHash = generateContentHash({
      username: data.username,
      agents: data.agents.map((a) => ({
        name: a.name,
        slug: a.slug,
        description: a.description,
        isPublic: a.isPublic,
        skills: a.skills.map((s) => ({
          name: s.name,
          capabilities: s.capabilities,
        })),
      })),
    });

    // Check if content has changed
    const existing = await ctx.db
      .query("llmsTxt")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing && existing.contentHash === contentHash) {
      return existing._id;
    }

    // Generate content with privacy-safe filtering
    const txtContent = generateTxtContent(
      data.username,
      data.displayName,
      data.bio,
      data.agents,
      baseUrl,
      data.userPrivacy
    );

    const mdContent = generateMdContent(
      data.username,
      data.displayName,
      data.bio,
      data.agents,
      baseUrl,
      data.userPrivacy
    );

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        txtContent,
        mdContent,
        generatedAt: now,
        contentHash,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("llmsTxt", {
        userId,
        username: data.username,
        txtContent,
        mdContent,
        generatedAt: now,
        contentHash,
      });
    }
  },
});

// ============================================================
// Public Mutations - Manual regeneration
// ============================================================

// Manually trigger regeneration for authenticated user
export const regenerateForUser = authedMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });

    return { success: true };
  },
});

// ============================================================
// Internal - Batch regeneration for cron
// ============================================================

// Regenerate llms.txt for all users with changes
export const regenerateAll = internalMutation({
  args: {},
  returns: v.object({
    checked: v.number(),
    regenerated: v.number(),
  }),
  handler: async (ctx) => {
    // Get all users with usernames (public profiles)
    const users = await ctx.db
      .query("users")
      .take(1000);

    const usersWithUsernames = users.filter((u) => u.username);

    let regenerated = 0;

    for (const user of usersWithUsernames) {
      // Check if regeneration needed by comparing content hash
      const existing = await ctx.db
        .query("llmsTxt")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .unique();

      // Get agents for hash computation
      const agents = await ctx.db
        .query("agents")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();

      // Build minimal data for hash
      const agentData = await Promise.all(
        agents.map(async (agent) => {
          const skills = await ctx.db
            .query("skills")
            .withIndex("by_agentId", (q) => q.eq("agentId", agent._id))
            .collect();

          return {
            name: agent.name,
            slug: agent.slug,
            description: agent.description,
            isPublic: agent.isPublic,
            skills: skills.map((s) => ({
              name: s.identity.name,
              capabilities: s.capabilities,
            })),
          };
        })
      );

      const contentHash = generateContentHash({
        username: user.username!,
        agents: agentData,
      });

      if (!existing || existing.contentHash !== contentHash) {
        // Schedule regeneration
        await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
          userId: user._id,
        });
        regenerated++;
      }
    }

    return { checked: usersWithUsernames.length, regenerated };
  },
});
