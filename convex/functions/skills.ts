import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { authedMutation, authedQuery, optionalAuthQuery } from "../lib/functions";
import { internal } from "../_generated/api";

const MAX_IMPORT_BYTES = 400_000;
const MAX_SKILLS_PER_IMPORT = 25;
const MAX_NAME_LENGTH = 80;
const MAX_BIO_LENGTH = 1200;
const MAX_CAPABILITIES = 40;
const MAX_DOMAINS = 60;

type SkillImportCandidate = {
  name: string;
  bio: string;
  capabilities: Array<{ name: string; description: string; toolId?: string }>;
  knowledgeDomains: Array<string>;
  communicationPrefs?: { tone?: string; timezone?: string; availability?: string };
};

type SecurityMatch = {
  flagType: "injection" | "sensitive" | "exfiltration";
  severity: "warn" | "block";
  pattern: string;
  snippet: string;
};

const SECURITY_RULES: Array<{
  regex: RegExp;
  flagType: "injection" | "sensitive" | "exfiltration";
  severity: "warn" | "block";
  pattern: string;
}> = [
  {
    regex: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE KEY-----/i,
    flagType: "sensitive",
    severity: "block",
    pattern: "private_key_block",
  },
  {
    regex: /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][^"']{8,}["']/i,
    flagType: "sensitive",
    severity: "block",
    pattern: "hardcoded_secret",
  },
  {
    regex: /\b(child_process|process\.env|Deno\.env)\b/i,
    flagType: "injection",
    severity: "warn",
    pattern: "runtime_access_pattern",
  },
  {
    regex: /\b(?:rm\s+-rf|curl\s+[^|]+\|\s*(?:bash|sh)|wget\s+[^|]+\|\s*(?:bash|sh))\b/i,
    flagType: "injection",
    severity: "block",
    pattern: "destructive_shell_pattern",
  },
  {
    regex: /\beval\s*\(/i,
    flagType: "injection",
    severity: "warn",
    pattern: "eval_usage",
  },
];

function clip(input: string, max: number): string {
  return input.length <= max ? input : input.slice(0, max);
}

function cleanLine(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return {};
  const raw = match[1];
  if (!raw) return {};
  const lines = raw.split("\n");
  const result: Record<string, string> = {};
  for (const line of lines) {
    const splitAt = line.indexOf(":");
    if (splitAt === -1) continue;
    const key = cleanLine(line.slice(0, splitAt));
    const value = cleanLine(line.slice(splitAt + 1)).replace(/^["']|["']$/g, "");
    if (key) result[key] = value;
  }
  return result;
}

function parseSkillMarkdown(markdown: string): SkillImportCandidate {
  const frontmatter = parseFrontmatter(markdown);
  const headingMatch = markdown.match(/^#\s+(.+)$/m);
  const descriptionMatch = markdown.match(/(?:^description:\s*(.+)$)/im);
  const name = cleanLine(frontmatter.name ?? headingMatch?.[1] ?? "Imported skill");
  const description = cleanLine(
    frontmatter.description ?? descriptionMatch?.[1] ?? "Imported from markdown skill file."
  );

  const bulletLines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => cleanLine(line.replace(/^-+\s*/, "")))
    .filter(Boolean)
    .slice(0, MAX_CAPABILITIES);

  const capabilities = bulletLines.map((line) => ({
    name: clip(line.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""), 64) || "task",
    description: clip(line, 240),
  }));

  return {
    name,
    bio: description,
    capabilities,
    knowledgeDomains: [],
  };
}

function fromUnknownSkill(value: unknown): SkillImportCandidate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const identity = raw.identity && typeof raw.identity === "object"
    ? (raw.identity as Record<string, unknown>)
    : undefined;

  const name =
    (typeof identity?.name === "string" ? identity.name : undefined) ??
    (typeof raw.name === "string" ? raw.name : undefined) ??
    (typeof raw.title === "string" ? raw.title : undefined);
  const bio =
    (typeof identity?.bio === "string" ? identity.bio : undefined) ??
    (typeof raw.bio === "string" ? raw.bio : undefined) ??
    (typeof raw.description === "string" ? raw.description : undefined);
  if (!name || !bio) return null;

  const capabilitiesInput = Array.isArray(raw.capabilities) ? raw.capabilities : [];
  const capabilities: Array<{ name: string; description: string; toolId?: string }> =
    capabilitiesInput.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      if (typeof item.name !== "string" || typeof item.description !== "string") return [];
      return [
        {
          name: item.name,
          description: item.description,
          ...(typeof item.toolId === "string" ? { toolId: item.toolId } : {}),
        },
      ];
    });

  const knowledgeDomainsInput = Array.isArray(raw.knowledgeDomains) ? raw.knowledgeDomains : [];
  const knowledgeDomains = knowledgeDomainsInput.filter(
    (entry): entry is string => typeof entry === "string"
  );

  const communicationPrefsRaw =
    raw.communicationPrefs && typeof raw.communicationPrefs === "object"
      ? (raw.communicationPrefs as Record<string, unknown>)
      : undefined;

  return {
    name,
    bio,
    capabilities,
    knowledgeDomains,
    communicationPrefs: {
      tone:
        typeof communicationPrefsRaw?.tone === "string" ? communicationPrefsRaw.tone : undefined,
      timezone:
        typeof communicationPrefsRaw?.timezone === "string"
          ? communicationPrefsRaw.timezone
          : undefined,
      availability:
        typeof communicationPrefsRaw?.availability === "string"
          ? communicationPrefsRaw.availability
          : undefined,
    },
  };
}

function normalizeSkillCandidate(candidate: SkillImportCandidate): SkillImportCandidate {
  const name = clip(cleanLine(candidate.name), MAX_NAME_LENGTH);
  const bio = clip(cleanLine(candidate.bio), MAX_BIO_LENGTH);
  const capabilities = candidate.capabilities
    .map((capability) => ({
      name: clip(cleanLine(capability.name), 64),
      description: clip(cleanLine(capability.description), 320),
      toolId:
        capability.toolId && cleanLine(capability.toolId)
          ? clip(cleanLine(capability.toolId), 128)
          : undefined,
    }))
    .filter((capability) => capability.name && capability.description)
    .slice(0, MAX_CAPABILITIES);
  const knowledgeDomains = Array.from(
    new Set(
      candidate.knowledgeDomains
        .map((domain) => clip(cleanLine(domain), 80))
        .filter(Boolean)
        .slice(0, MAX_DOMAINS)
    )
  );

  return {
    name,
    bio,
    capabilities,
    knowledgeDomains,
    communicationPrefs: candidate.communicationPrefs,
  };
}

function parseSkillsPayload(rawPayload: string): Array<SkillImportCandidate> {
  const trimmed = rawPayload.trim();
  if (!trimmed) {
    throw new Error("Import content is empty");
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map(fromUnknownSkill)
        .filter((candidate): candidate is SkillImportCandidate => !!candidate)
        .slice(0, MAX_SKILLS_PER_IMPORT);
    }

    const direct = fromUnknownSkill(parsed);
    if (direct) return [direct];

    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { skills?: unknown }).skills)
    ) {
      const wrapped = ((parsed as { skills: unknown[] }).skills ?? [])
        .map(fromUnknownSkill)
        .filter((candidate): candidate is SkillImportCandidate => !!candidate)
        .slice(0, MAX_SKILLS_PER_IMPORT);
      if (wrapped.length > 0) return wrapped;
    }

    throw new Error("JSON does not contain a valid skill shape");
  }

  return [parseSkillMarkdown(trimmed)];
}

function runSecurityScan(payload: string): Array<SecurityMatch> {
  const matches: Array<SecurityMatch> = [];
  for (const rule of SECURITY_RULES) {
    const hit = payload.match(rule.regex);
    if (!hit) continue;
    matches.push({
      flagType: rule.flagType,
      severity: rule.severity,
      pattern: rule.pattern,
      snippet: clip(cleanLine(hit[0]), 160),
    });
  }
  return matches;
}

// ============================================================
// Public queries
// ============================================================

// Get current user's skills (all skills, or filtered by agent via junction table)
export const list = authedQuery({
  args: {
    agentId: v.optional(v.id("agents")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, { agentId }) => {
    if (agentId) {
      // Get skill IDs linked to this agent via junction table
      const assignments = await ctx.db
        .query("skillAgents")
        .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
        .collect();

      // Also check legacy agentId field for backwards compat
      const legacySkills = await ctx.db
        .query("skills")
        .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
        .collect();

      const junctionSkills = await Promise.all(
        assignments.map((a) => ctx.db.get(a.skillId))
      );

      // Merge and deduplicate
      const seen = new Set<string>();
      const result = [];
      for (const skill of [...junctionSkills, ...legacySkills]) {
        if (skill && !seen.has(skill._id)) {
          seen.add(skill._id);
          result.push(skill);
        }
      }
      return result;
    }
    // Get all user's skills
    return await ctx.db
      .query("skills")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();
  },
});

// Get all skill-agent assignments for the current user (for the UI)
export const listSkillAgents = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      skillId: v.id("skills"),
      agentId: v.id("agents"),
    })
  ),
  handler: async (ctx) => {
    const assignments = await ctx.db
      .query("skillAgents")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();
    return assignments.map((a) => ({ skillId: a.skillId, agentId: a.agentId }));
  },
});

// Legacy: get single skill (for backwards compatibility)
export const getMySkill = optionalAuthQuery({
  args: {},
  returns: v.union(v.any(), v.null()),
  handler: async (ctx) => {
    const { userId } = ctx;
    if (!userId) return null;
    // Returns first skill (for backwards compat with single-skill UI)
    return await ctx.db
      .query("skills")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

export const getPublicSkill = query({
  args: { username: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { username }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!user) return null;

    // Get all published skills for this user (users can have multiple skills)
    const skills = await ctx.db
      .query("skills")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Find first published skill
    const skill = skills.find((s) => s.isPublished);
    if (!skill) return null;

    // Return only public-facing fields
    return {
      identity: skill.identity,
      capabilities: skill.capabilities,
      knowledgeDomains: skill.knowledgeDomains,
      publicPermissions: skill.permissions.public,
      communicationPrefs: skill.communicationPrefs,
      toolDeclarations: skill.toolDeclarations,
      version: skill.version,
    };
  },
});

// Public: get published skills for a specific public agent slug.
export const getPublicSkillByAgent = query({
  args: { username: v.string(), slug: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { username, slug }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!user) return null;

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_userId_slug", (q) => q.eq("userId", user._id).eq("slug", slug))
      .first();
    if (!agent || !agent.isPublic) return null;

    // Check junction table for skills linked to this agent
    const junctionAssignments = await ctx.db
      .query("skillAgents")
      .withIndex("by_agentId", (q) => q.eq("agentId", agent._id))
      .take(100);
    const junctionSkills = await Promise.all(
      junctionAssignments.map((a) => ctx.db.get(a.skillId))
    );

    // Also check legacy agentId field
    const legacySkills = await ctx.db
      .query("skills")
      .withIndex("by_agentId", (q) => q.eq("agentId", agent._id))
      .take(100);

    // Merge and deduplicate
    const seen = new Set<string>();
    const allAgentSkills = [];
    for (const skill of [...junctionSkills, ...legacySkills]) {
      if (skill && !seen.has(skill._id)) {
        seen.add(skill._id);
        allAgentSkills.push(skill);
      }
    }

    const publishedAgentSkill = allAgentSkills.find((s) => s.isPublished);

    // Backwards-compatible fallback: use user-level published skill.
    const fallbackPublishedSkill = publishedAgentSkill
      ? null
      : (await ctx.db
          .query("skills")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .take(100))
          .find((s) => s.isPublished && !s.agentId);

    const skill = publishedAgentSkill ?? fallbackPublishedSkill;
    if (!skill) return null;

    return {
      identity: skill.identity,
      capabilities: skill.capabilities,
      knowledgeDomains: skill.knowledgeDomains,
      publicPermissions: skill.permissions.public,
      communicationPrefs: skill.communicationPrefs,
      toolDeclarations: skill.toolDeclarations,
      version: skill.version,
    };
  },
});

// ============================================================
// Mutations
// ============================================================

// Create a new skill, optionally assigned to one or more agents
export const create = authedMutation({
  args: {
    agentId: v.optional(v.id("agents")), // Legacy: single agent
    agentIds: v.optional(v.array(v.id("agents"))), // Multi-agent assignment
    identity: v.object({
      name: v.string(),
      bio: v.string(),
      avatar: v.optional(v.string()),
    }),
    capabilities: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.string(),
          toolId: v.optional(v.string()),
        })
      )
    ),
    knowledgeDomains: v.optional(v.array(v.string())),
    communicationPrefs: v.optional(
      v.object({
        tone: v.string(),
        timezone: v.string(),
        availability: v.string(),
      })
    ),
  },
  returns: v.id("skills"),
  handler: async (ctx, args) => {
    // Resolve agents list: prefer agentIds, fall back to single agentId
    const resolvedAgentIds = args.agentIds ?? (args.agentId ? [args.agentId] : []);

    // Verify ownership of all agents
    for (const agentId of resolvedAgentIds) {
      const agent = await ctx.db.get(agentId);
      if (!agent || agent.userId !== ctx.userId) {
        throw new Error("Agent not found");
      }
    }

    const now = Date.now();
    const skillId = await ctx.db.insert("skills", {
      userId: ctx.userId,
      agentId: resolvedAgentIds[0] ?? undefined, // Legacy field
      version: 1,
      identity: args.identity,
      capabilities: args.capabilities ?? [],
      knowledgeDomains: args.knowledgeDomains ?? [],
      permissions: {
        public: ["send_message", "get_capabilities"],
        authenticated: ["check_availability", "request_meeting"],
        trusted: ["*"],
      },
      communicationPrefs: args.communicationPrefs ?? {
        tone: "friendly and professional",
        timezone: "America/Los_Angeles",
        availability: "available",
      },
      toolDeclarations: [],
      isPublished: false,
      isActive: true,
      updatedAt: now,
    });

    // Create junction table entries for each assigned agent
    await Promise.all(
      resolvedAgentIds.map((agentId) =>
        ctx.db.insert("skillAgents", {
          skillId,
          agentId,
          userId: ctx.userId,
          createdAt: now,
        })
      )
    );

    // Schedule llms.txt regeneration
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });

    return skillId;
  },
});

export const importSkills = authedMutation({
  args: {
    source: v.string(),
    payload: v.string(),
    agentId: v.optional(v.id("agents")), // Legacy: single agent
    agentIds: v.optional(v.array(v.id("agents"))), // Multi-agent assignment
    defaultIsActive: v.optional(v.boolean()),
  },
  returns: v.object({
    importedCount: v.number(),
    importedSkillIds: v.array(v.id("skills")),
    warnings: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const byteLength = new TextEncoder().encode(args.payload).length;
    if (byteLength > MAX_IMPORT_BYTES) {
      throw new Error("Import payload is too large");
    }

    // Resolve agents list: prefer agentIds, fall back to single agentId
    const resolvedAgentIds = args.agentIds ?? (args.agentId ? [args.agentId] : []);

    // Verify ownership of all agents
    for (const agentId of resolvedAgentIds) {
      const agent = await ctx.db.get(agentId);
      if (!agent || agent.userId !== ctx.userId) {
        throw new Error("Agent not found");
      }
    }

    const securityMatches = runSecurityScan(args.payload);
    if (securityMatches.length > 0) {
      await Promise.all(
        securityMatches.map((match) =>
          ctx.db.insert("securityFlags", {
            userId: ctx.userId,
            source: args.source,
            flagType: match.flagType,
            severity: match.severity,
            pattern: match.pattern,
            inputSnippet: match.snippet,
            action: match.severity === "block" ? "blocked_import" : "warned_import",
            timestamp: Date.now(),
          })
        )
      );
    }

    const blocked = securityMatches.some((match) => match.severity === "block");
    if (blocked) {
      throw new Error("Import blocked by security scanner");
    }

    let candidates = parseSkillsPayload(args.payload).map(normalizeSkillCandidate);
    candidates = candidates.slice(0, MAX_SKILLS_PER_IMPORT);
    if (candidates.length === 0) {
      throw new Error("No valid skills found in import");
    }

    const warnings = securityMatches
      .filter((match) => match.severity === "warn")
      .map((match) => `Warning: ${match.pattern}`);

    const now = Date.now();
    const importedSkillIds = await Promise.all(
      candidates.map((candidate) =>
        ctx.db.insert("skills", {
          userId: ctx.userId,
          agentId: resolvedAgentIds[0] ?? undefined, // Legacy field
          version: 1,
          identity: {
            name: candidate.name,
            bio: candidate.bio,
          },
          capabilities: candidate.capabilities,
          knowledgeDomains: candidate.knowledgeDomains,
          permissions: {
            public: ["send_message", "get_capabilities"],
            authenticated: ["check_availability", "request_meeting"],
            trusted: ["*"],
          },
          communicationPrefs: {
            tone: candidate.communicationPrefs?.tone ?? "friendly and professional",
            timezone: candidate.communicationPrefs?.timezone ?? "America/Los_Angeles",
            availability: candidate.communicationPrefs?.availability ?? "available",
          },
          toolDeclarations: [],
          isPublished: false,
          isActive: args.defaultIsActive ?? true,
          updatedAt: now,
        })
      )
    );

    // Create junction table entries for each imported skill and each agent
    if (resolvedAgentIds.length > 0) {
      await Promise.all(
        importedSkillIds.flatMap((skillId) =>
          resolvedAgentIds.map((agentId) =>
            ctx.db.insert("skillAgents", {
              skillId,
              agentId,
              userId: ctx.userId,
              createdAt: now,
            })
          )
        )
      );
    }

    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });

    return {
      importedCount: importedSkillIds.length,
      importedSkillIds,
      warnings,
    };
  },
});

export const update = authedMutation({
  args: {
    skillId: v.optional(v.id("skills")), // Optional for backwards compat
    identity: v.optional(
      v.object({
        name: v.string(),
        bio: v.string(),
        avatar: v.optional(v.string()),
      })
    ),
    capabilities: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.string(),
          toolId: v.optional(v.string()),
        })
      )
    ),
    knowledgeDomains: v.optional(v.array(v.string())),
    communicationPrefs: v.optional(
      v.object({
        tone: v.string(),
        timezone: v.string(),
        availability: v.string(),
      })
    ),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let skill;

    if (args.skillId) {
      // Update specific skill
      skill = await ctx.db.get(args.skillId);
      if (!skill || skill.userId !== ctx.userId) {
        throw new Error("Skill not found");
      }
    } else {
      // Legacy: update first skill
      skill = await ctx.db
        .query("skills")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .first();
      if (!skill) throw new Error("Skill file not found. Complete onboarding first.");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.identity) patch.identity = args.identity;
    if (args.capabilities) patch.capabilities = args.capabilities;
    if (args.knowledgeDomains) patch.knowledgeDomains = args.knowledgeDomains;
    if (args.communicationPrefs) patch.communicationPrefs = args.communicationPrefs;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    // Bump version on each update
    patch.version = skill.version + 1;

    await ctx.db.patch(skill._id, patch);

    // Schedule llms.txt regeneration
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });
    return null;
  },
});

// Delete a skill and its agent assignments
export const remove = authedMutation({
  args: { skillId: v.id("skills") },
  returns: v.null(),
  handler: async (ctx, { skillId }) => {
    const skill = await ctx.db.get(skillId);
    if (!skill || skill.userId !== ctx.userId) {
      throw new Error("Skill not found");
    }

    // Remove all junction table entries for this skill
    const assignments = await ctx.db
      .query("skillAgents")
      .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
      .collect();
    await Promise.all(assignments.map((a) => ctx.db.delete(a._id)));

    await ctx.db.delete(skillId);

    // Schedule llms.txt regeneration
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });
    return null;
  },
});

// Set which agents a skill is assigned to (replaces all current assignments)
export const setSkillAgents = authedMutation({
  args: {
    skillId: v.id("skills"),
    agentIds: v.array(v.id("agents")),
  },
  returns: v.null(),
  handler: async (ctx, { skillId, agentIds }) => {
    const skill = await ctx.db.get(skillId);
    if (!skill || skill.userId !== ctx.userId) {
      throw new Error("Skill not found");
    }

    // Verify all agents belong to user
    for (const agentId of agentIds) {
      const agent = await ctx.db.get(agentId);
      if (!agent || agent.userId !== ctx.userId) {
        throw new Error("Agent not found");
      }
    }

    // Get current assignments from junction table
    const current = await ctx.db
      .query("skillAgents")
      .withIndex("by_skillId", (q) => q.eq("skillId", skillId))
      .collect();

    const currentAgentIds = new Set(current.map((a) => a.agentId));
    const targetAgentIds = new Set(agentIds);

    // Remove assignments no longer needed
    const toRemove = current.filter((a) => !targetAgentIds.has(a.agentId));
    await Promise.all(toRemove.map((a) => ctx.db.delete(a._id)));

    // Add new assignments
    const now = Date.now();
    const toAdd = agentIds.filter((id) => !currentAgentIds.has(id));
    await Promise.all(
      toAdd.map((agentId) =>
        ctx.db.insert("skillAgents", {
          skillId,
          agentId,
          userId: ctx.userId,
          createdAt: now,
        })
      )
    );

    // Sync legacy agentId field (first assigned agent or undefined)
    await ctx.db.patch(skillId, {
      agentId: agentIds[0] ?? undefined,
      updatedAt: now,
    });
    return null;
  },
});

// Legacy: assign skill to a single agent (kept for backwards compat)
export const assignToAgent = authedMutation({
  args: {
    skillId: v.id("skills"),
    agentId: v.union(v.id("agents"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { skillId, agentId }) => {
    const skill = await ctx.db.get(skillId);
    if (!skill || skill.userId !== ctx.userId) {
      throw new Error("Skill not found");
    }

    if (agentId) {
      const agent = await ctx.db.get(agentId);
      if (!agent || agent.userId !== ctx.userId) {
        throw new Error("Agent not found");
      }

      // Also add to junction table if not already there
      const existing = await ctx.db
        .query("skillAgents")
        .withIndex("by_skillId_agentId", (q) =>
          q.eq("skillId", skillId).eq("agentId", agentId)
        )
        .first();
      if (!existing) {
        await ctx.db.insert("skillAgents", {
          skillId,
          agentId,
          userId: ctx.userId,
          createdAt: Date.now(),
        });
      }
    }

    await ctx.db.patch(skillId, { agentId: agentId ?? undefined, updatedAt: Date.now() });
    return null;
  },
});

export const publish = authedMutation({
  args: { skillId: v.optional(v.id("skills")) },
  returns: v.null(),
  handler: async (ctx, { skillId }) => {
    let skill;
    if (skillId) {
      skill = await ctx.db.get(skillId);
      if (!skill || skill.userId !== ctx.userId) {
        throw new Error("Skill not found");
      }
    } else {
      // Legacy fallback
      skill = await ctx.db
        .query("skills")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .first();
      if (!skill) throw new Error("Skill file not found");
    }
    await ctx.db.patch(skill._id, { isPublished: true, updatedAt: Date.now() });

    // Schedule llms.txt regeneration when publishing
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });
    return null;
  },
});

export const unpublish = authedMutation({
  args: { skillId: v.optional(v.id("skills")) },
  returns: v.null(),
  handler: async (ctx, { skillId }) => {
    let skill;
    if (skillId) {
      skill = await ctx.db.get(skillId);
      if (!skill || skill.userId !== ctx.userId) {
        throw new Error("Skill not found");
      }
    } else {
      // Legacy fallback
      skill = await ctx.db
        .query("skills")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .first();
      if (!skill) throw new Error("Skill file not found");
    }
    await ctx.db.patch(skill._id, { isPublished: false, updatedAt: Date.now() });

    // Schedule llms.txt regeneration when unpublishing
    await ctx.scheduler.runAfter(0, internal.functions.llmsTxt.regenerate, {
      userId: ctx.userId,
    });
    return null;
  },
});

// ============================================================
// Internal queries
// ============================================================

// Get first skill for a user (for backwards compatibility)
export const getByUserId = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { userId }) => {
    // Users can have multiple skills, return first one
    return await ctx.db
      .query("skills")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});
