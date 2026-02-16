import { v } from "convex/values";
import {
  query,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { authedMutation } from "../lib/functions";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

const llmsResponseValidator = v.object({
  txtContent: v.string(),
  mdContent: v.string(),
  generatedAt: v.number(),
});

type AgentVisibility = {
  showApi: boolean;
  showMcp: boolean;
  showEmail: boolean;
  showSkillFile: boolean;
};

const DEFAULT_VISIBILITY: AgentVisibility = {
  showApi: true,
  showMcp: true,
  showEmail: true,
  showSkillFile: true,
};

type SkillSnapshot = {
  name: string;
  bio: string;
  capabilities: Array<{ name: string; description: string }>;
  knowledgeDomains: string[];
  communicationPrefs: { tone: string; timezone: string; availability: string };
};

type AgentSnapshot = {
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
  skills: Array<SkillSnapshot>;
};

type UserPrivacy = { showEmail?: boolean; showEndpoints?: boolean };

type LlmsGenerationData = {
  userId: Id<"users">;
  username: string;
  displayName?: string;
  bio?: string;
  userPrivacy?: UserPrivacy;
  agents: Array<AgentSnapshot>;
};

function toLlmsResponse(record: Doc<"llmsTxt">) {
  return {
    txtContent: record.txtContent,
    mdContent: record.mdContent,
    generatedAt: record.generatedAt,
  };
}

function generateContentHash(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(16);
}

function generateTxtContent(
  username: string,
  displayName: string | undefined,
  bio: string | undefined,
  agents: Array<AgentSnapshot>,
  baseUrl: string,
  userPrivacy?: UserPrivacy
): string {
  const lines: Array<string> = [];
  const publicAgents = agents.filter((a) => a.isPublic);

  lines.push(`# ${displayName || username}'s AI Agents`);
  lines.push(`> ${bio || "AI-powered personal agents"}`);
  lines.push("");
  lines.push(`Profile: ${baseUrl}/${username}`);
  if (userPrivacy?.showEndpoints !== false) {
    lines.push(`API: ${baseUrl}/api/v1/agents/${username}/messages`);
  }
  lines.push(`llms.txt: ${baseUrl}/${username}/llms.txt`);
  lines.push(`llms-full.md: ${baseUrl}/${username}/llms-full.md`);
  lines.push("");

  if (publicAgents.length === 0) {
    lines.push("No public agents available.");
    return lines.join("\n");
  }

  lines.push(`## Agents (${publicAgents.length})`);
  lines.push("");

  for (const agent of publicAgents) {
    const vis = agent.publicConnect ?? DEFAULT_VISIBILITY;
    lines.push(`### ${agent.name}`);
    if (agent.description) lines.push(`> ${agent.description}`);
    lines.push("");
    lines.push(`- Slug: ${agent.slug}`);
    lines.push(`- Agent llms.txt: ${baseUrl}/${username}/${agent.slug}/llms.txt`);
    lines.push(`- Agent llms-full.md: ${baseUrl}/${username}/${agent.slug}/llms-full.md`);
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
  }

  lines.push("---");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("Powered by HumanAgent");
  return lines.join("\n");
}

function generateMdContent(
  username: string,
  displayName: string | undefined,
  bio: string | undefined,
  agents: Array<AgentSnapshot>,
  baseUrl: string,
  userPrivacy?: UserPrivacy
): string {
  const lines: Array<string> = [];
  const publicAgents = agents.filter((a) => a.isPublic);

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

  lines.push("## Quick links");
  lines.push("");
  lines.push(`- Profile: [${baseUrl}/${username}](${baseUrl}/${username})`);
  if (userPrivacy?.showEndpoints !== false) {
    lines.push(`- Default API: \`POST ${baseUrl}/api/v1/agents/${username}/messages\``);
  }
  lines.push(`- Aggregate llms.txt: [${baseUrl}/${username}/llms.txt](${baseUrl}/${username}/llms.txt)`);
  lines.push(`- Aggregate llms-full.md: [${baseUrl}/${username}/llms-full.md](${baseUrl}/${username}/llms-full.md)`);
  lines.push("");

  if (publicAgents.length === 0) {
    lines.push("*No public agents available.*");
    return lines.join("\n");
  }

  lines.push("## Public agents");
  lines.push("");
  for (const agent of publicAgents) {
    const vis = agent.publicConnect ?? DEFAULT_VISIBILITY;
    lines.push(`### ${agent.name}`);
    lines.push("");
    if (agent.description) {
      lines.push(`> ${agent.description}`);
      lines.push("");
    }
    lines.push(`- Agent llms.txt: [${baseUrl}/${username}/${agent.slug}/llms.txt](${baseUrl}/${username}/${agent.slug}/llms.txt)`);
    lines.push(`- Agent llms-full.md: [${baseUrl}/${username}/${agent.slug}/llms-full.md](${baseUrl}/${username}/${agent.slug}/llms-full.md)`);
    if (vis.showApi) {
      lines.push(`- API: \`POST ${baseUrl}/api/v1/agents/${username}/${agent.slug}/messages\``);
    }
    if (vis.showMcp) {
      lines.push(`- MCP: \`${baseUrl}/mcp/u/${username}/${agent.slug}\``);
    }
    if (vis.showEmail && agent.agentEmail && userPrivacy?.showEmail !== false) {
      lines.push(`- Email: ${agent.agentEmail}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Generated by [HumanAgent](${baseUrl}) on ${new Date().toISOString()}*`);
  return lines.join("\n");
}

function generateAgentTxtContent(
  username: string,
  displayName: string | undefined,
  bio: string | undefined,
  agent: AgentSnapshot,
  baseUrl: string,
  userPrivacy?: UserPrivacy
): string {
  const lines: Array<string> = [];
  const vis = agent.publicConnect ?? DEFAULT_VISIBILITY;

  lines.push(`# ${agent.name} (${username})`);
  lines.push(`> ${agent.description || bio || "AI-powered public agent"}`);
  lines.push("");
  lines.push(`Profile: ${baseUrl}/${username}/${agent.slug}`);
  lines.push(`Owner: ${displayName || username}`);
  lines.push(`Aggregate llms.txt: ${baseUrl}/${username}/llms.txt`);
  lines.push("");
  if (vis.showApi && userPrivacy?.showEndpoints !== false) {
    lines.push(`API: ${baseUrl}/api/v1/agents/${username}/${agent.slug}/messages`);
  }
  if (vis.showMcp && userPrivacy?.showEndpoints !== false) {
    lines.push(`MCP: ${baseUrl}/mcp/u/${username}/${agent.slug}`);
  }
  if (vis.showEmail && agent.agentEmail && userPrivacy?.showEmail !== false) {
    lines.push(`Email: ${agent.agentEmail}`);
  }
  if (vis.showSkillFile) {
    lines.push(`Skill File: ${baseUrl}/u/${username}/${agent.slug}/SKILL.md`);
  }
  lines.push("");

  if (agent.skills.length > 0) {
    lines.push("## Capabilities");
    lines.push("");
    for (const skill of agent.skills) {
      for (const cap of skill.capabilities) {
        lines.push(`- ${cap.name}: ${cap.description}`);
      }
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("Powered by HumanAgent");
  return lines.join("\n");
}

function generateAgentMdContent(
  username: string,
  displayName: string | undefined,
  bio: string | undefined,
  agent: AgentSnapshot,
  baseUrl: string,
  userPrivacy?: UserPrivacy
): string {
  const lines: Array<string> = [];
  const vis = agent.publicConnect ?? DEFAULT_VISIBILITY;

  lines.push("---");
  lines.push(`title: "${agent.name} (${username})"`);
  lines.push(`description: "${agent.description || bio || "AI-powered public agent"}"`);
  lines.push(`profile: "${baseUrl}/${username}/${agent.slug}"`);
  lines.push(`generated: "${new Date().toISOString()}"`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${agent.name}`);
  lines.push("");
  lines.push(`Owner: ${displayName || username}`);
  lines.push("");
  if (agent.description) {
    lines.push(agent.description);
    lines.push("");
  }

  lines.push("## Endpoints");
  lines.push("");
  if (vis.showApi && userPrivacy?.showEndpoints !== false) {
    lines.push(`- API: \`POST ${baseUrl}/api/v1/agents/${username}/${agent.slug}/messages\``);
  }
  if (vis.showMcp && userPrivacy?.showEndpoints !== false) {
    lines.push(`- MCP: \`${baseUrl}/mcp/u/${username}/${agent.slug}\``);
  }
  if (vis.showEmail && agent.agentEmail && userPrivacy?.showEmail !== false) {
    lines.push(`- Email: ${agent.agentEmail}`);
  }
  if (vis.showSkillFile) {
    lines.push(`- Skill file: [SKILL.md](${baseUrl}/u/${username}/${agent.slug}/SKILL.md)`);
  }
  lines.push(`- Aggregate llms index: [${baseUrl}/${username}/llms.txt](${baseUrl}/${username}/llms.txt)`);
  lines.push("");

  if (agent.skills.length > 0) {
    lines.push("## Skills and capabilities");
    lines.push("");
    for (const skill of agent.skills) {
      lines.push(`### ${skill.name}`);
      lines.push("");
      if (skill.bio) lines.push(skill.bio);
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
        lines.push(`Knowledge domains: ${skill.knowledgeDomains.join(", ")}`);
        lines.push("");
      }
    }
  }

  lines.push("---");
  lines.push(`*Generated by [HumanAgent](${baseUrl}) on ${new Date().toISOString()}*`);
  return lines.join("\n");
}

export const getByUsername = query({
  args: { username: v.string() },
  returns: v.union(llmsResponseValidator, v.null()),
  handler: async (ctx, { username }) => {
    const scopedRecord = await ctx.db
      .query("llmsTxt")
      .withIndex("by_username_and_scope", (q) =>
        q.eq("username", username).eq("scope", "user")
      )
      .unique();
    if (scopedRecord) return toLlmsResponse(scopedRecord);

    const legacyCandidates = await ctx.db
      .query("llmsTxt")
      .withIndex("by_username", (q) => q.eq("username", username))
      .take(20);
    const legacyRecord =
      legacyCandidates.find((record) => !record.scope && !record.agentSlug) ??
      legacyCandidates[0] ??
      null;
    if (!legacyRecord) return null;

    return toLlmsResponse(legacyRecord);
  },
});

export const getByUsernameAndSlug = query({
  args: { username: v.string(), slug: v.string() },
  returns: v.union(llmsResponseValidator, v.null()),
  handler: async (ctx, { username, slug }) => {
    const record = await ctx.db
      .query("llmsTxt")
      .withIndex("by_username_and_agentSlug", (q) =>
        q.eq("username", username).eq("agentSlug", slug)
      )
      .unique();
    if (!record) return null;

    return toLlmsResponse(record);
  },
});

export const getGenerationData = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user || !user.username) return null;

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

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
        } satisfies AgentSnapshot;
      })
    );

    return {
      userId: user._id,
      username: user.username,
      displayName: user.name,
      bio: user.bio,
      userPrivacy: user.privacySettings as UserPrivacy | undefined,
      agents: agentsWithSkills,
    };
  },
});

export const regenerate = internalMutation({
  args: { userId: v.id("users") },
  returns: v.union(v.id("llmsTxt"), v.null()),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user || !user.username) return null;

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const agentsWithSkills: Array<AgentSnapshot> = await Promise.all(
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
      userPrivacy: user.privacySettings as UserPrivacy | undefined,
      agents: agentsWithSkills,
    };

    const baseUrl = process.env.SITE_URL || "https://humanagent.dev";
    const now = Date.now();

    const userHash = generateContentHash({
      scope: "user",
      username: data.username,
      privacy: data.userPrivacy,
      agents: data.agents
        .filter((agent) => agent.isPublic)
        .map((agent) => ({
          name: agent.name,
          slug: agent.slug,
          description: agent.description,
          isPublic: agent.isPublic,
          visibility: agent.publicConnect,
          skills: agent.skills.map((skill) => ({
            name: skill.name,
            capabilities: skill.capabilities,
            knowledgeDomains: skill.knowledgeDomains,
          })),
        })),
    });

    const userRecordId = await upsertLlmsRecord(ctx, {
      userId,
      username: data.username,
      scope: "user",
      txtContent: generateTxtContent(
        data.username,
        data.displayName,
        data.bio,
        data.agents,
        baseUrl,
        data.userPrivacy
      ),
      mdContent: generateMdContent(
        data.username,
        data.displayName,
        data.bio,
        data.agents,
        baseUrl,
        data.userPrivacy
      ),
      generatedAt: now,
      contentHash: userHash,
    });

    const publicAgents = data.agents.filter((agent) => agent.isPublic);
    for (const agent of publicAgents) {
      const agentHash = generateContentHash({
        scope: "agent",
        username: data.username,
        slug: agent.slug,
        privacy: data.userPrivacy,
        visibility: agent.publicConnect,
        agent,
      });

      await upsertLlmsRecord(ctx, {
        userId,
        username: data.username,
        scope: "agent",
        agentSlug: agent.slug,
        txtContent: generateAgentTxtContent(
          data.username,
          data.displayName,
          data.bio,
          agent,
          baseUrl,
          data.userPrivacy
        ),
        mdContent: generateAgentMdContent(
          data.username,
          data.displayName,
          data.bio,
          agent,
          baseUrl,
          data.userPrivacy
        ),
        generatedAt: now,
        contentHash: agentHash,
      });
    }

    const currentPublicSlugs = new Set(publicAgents.map((agent) => agent.slug));
    const existingAgentScopedRecords = await ctx.db
      .query("llmsTxt")
      .withIndex("by_userId_and_scope", (q) =>
        q.eq("userId", userId).eq("scope", "agent")
      )
      .collect();
    await Promise.all(
      existingAgentScopedRecords
        .filter((record) => !record.agentSlug || !currentPublicSlugs.has(record.agentSlug))
        .map((record) => ctx.db.delete(record._id))
    );

    return userRecordId;
  },
});

export const regenerateForUser = authedMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });

    return { success: true };
  },
});

export const regenerateAll = internalMutation({
  args: {},
  returns: v.object({
    checked: v.number(),
    regenerated: v.number(),
  }),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(1000);
    const usersWithUsernames = users.filter((user) => user.username);
    let regenerated = 0;

    for (const user of usersWithUsernames) {
      const agents = await ctx.db
        .query("agents")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();

      const agentData = await Promise.all(
        agents
          .filter((agent) => agent.isPublic)
          .map(async (agent) => {
            const skills = await ctx.db
              .query("skills")
              .withIndex("by_agentId", (q) => q.eq("agentId", agent._id))
              .collect();
            return {
              name: agent.name,
              slug: agent.slug,
              description: agent.description,
              isPublic: agent.isPublic,
              visibility: agent.publicConnect,
              skills: skills.map((skill) => ({
                name: skill.identity.name,
                capabilities: skill.capabilities,
                knowledgeDomains: skill.knowledgeDomains,
              })),
            };
          })
      );

      const expectedHash = generateContentHash({
        scope: "user",
        username: user.username,
        privacy: user.privacySettings,
        agents: agentData,
      });

      const existingUserRecord = await ctx.db
        .query("llmsTxt")
        .withIndex("by_userId_and_scope", (q) =>
          q.eq("userId", user._id).eq("scope", "user")
        )
        .unique();

      if (!existingUserRecord || existingUserRecord.contentHash !== expectedHash) {
        await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
          userId: user._id,
        });
        regenerated++;
      }
    }

    return { checked: usersWithUsernames.length, regenerated };
  },
});

async function upsertLlmsRecord(
  ctx: MutationCtx,
  payload: {
    userId: Id<"users">;
    username: string;
    scope: "user" | "agent";
    agentSlug?: string;
    txtContent: string;
    mdContent: string;
    generatedAt: number;
    contentHash: string;
  }
) {
  const existing =
    payload.scope === "agent" && payload.agentSlug
      ? await ctx.db
          .query("llmsTxt")
          .withIndex("by_userId_and_scope_and_agentSlug", (q) =>
            q
              .eq("userId", payload.userId)
              .eq("scope", payload.scope)
              .eq("agentSlug", payload.agentSlug as string)
          )
          .unique()
      : await ctx.db
          .query("llmsTxt")
          .withIndex("by_userId_and_scope", (q) =>
            q.eq("userId", payload.userId).eq("scope", payload.scope)
          )
          .unique();

  if (existing) {
    if (
      existing.contentHash === payload.contentHash &&
      existing.txtContent === payload.txtContent &&
      existing.mdContent === payload.mdContent
    ) {
      return existing._id;
    }
    await ctx.db.patch(existing._id, {
      txtContent: payload.txtContent,
      mdContent: payload.mdContent,
      generatedAt: payload.generatedAt,
      contentHash: payload.contentHash,
      scope: payload.scope,
      agentSlug: payload.agentSlug,
    });
    return existing._id;
  }

  return await ctx.db.insert("llmsTxt", {
    userId: payload.userId,
    username: payload.username,
    scope: payload.scope,
    agentSlug: payload.agentSlug,
    txtContent: payload.txtContent,
    mdContent: payload.mdContent,
    generatedAt: payload.generatedAt,
    contentHash: payload.contentHash,
  });
}
