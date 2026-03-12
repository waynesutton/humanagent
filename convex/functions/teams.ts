import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { authedMutation, authedQuery } from "../lib/functions";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

type TeamDoc = {
  _id: Id<"agentTeams">;
  userId: Id<"users">;
  name: string;
  slug: string;
  description?: string;
  leadAgentId: Id<"agents">;
  autonomy: {
    executionMode: "manual" | "auto";
    coordinationMode: "lead_only" | "collaborative";
    allowAutonomousTaskCreation: boolean;
    allowEmailReports: boolean;
    thinkingEnabled: boolean;
  };
  createdAt: number;
  updatedAt: number;
};

async function getOwnedAgentOrThrow(
  ctx: { db: { get: (id: Id<"agents">) => Promise<{ userId: Id<"users"> } | null> } },
  userId: Id<"users">,
  agentId: Id<"agents">
): Promise<void> {
  const agent = await ctx.db.get(agentId);
  if (!agent || agent.userId !== userId) {
    throw new Error("Agent not found");
  }
}

async function getOwnedSkillOrThrow(
  ctx: { db: { get: (id: Id<"skills">) => Promise<{ userId: Id<"users"> } | null> } },
  userId: Id<"users">,
  skillId: Id<"skills">
): Promise<void> {
  const skill = await ctx.db.get(skillId);
  if (!skill || skill.userId !== userId) {
    throw new Error("Skill not found");
  }
}

async function buildTeamSummary(
  ctx: {
    db: {
      get: <T extends Id<"agentTeams"> | Id<"agents"> | Id<"skills">>(id: T) => Promise<any>;
      query: (table: "agentTeamMembers" | "teamSkills" | "tasks") => any;
    };
  },
  team: TeamDoc
): Promise<{
  _id: Id<"agentTeams">;
  name: string;
  slug: string;
  description?: string;
  leadAgentId: Id<"agents">;
  leadAgentName?: string;
  autonomy: TeamDoc["autonomy"];
  memberAgentIds: Array<Id<"agents">>;
  memberAgents: Array<{ _id: Id<"agents">; name: string; slug: string; role: "lead" | "member" }>;
  sharedSkillIds: Array<Id<"skills">>;
  sharedSkillNames: string[];
  taskCount: number;
  createdAt: number;
  updatedAt: number;
} > {
  const [memberRows, teamSkillRows, teamTasks, leadAgent] = await Promise.all([
    ctx.db
      .query("agentTeamMembers")
      .withIndex("by_teamId", (q: any) => q.eq("teamId", team._id))
      .take(50),
    ctx.db
      .query("teamSkills")
      .withIndex("by_teamId", (q: any) => q.eq("teamId", team._id))
      .take(50),
    ctx.db
      .query("tasks")
      .withIndex("by_teamId", (q: any) => q.eq("teamId", team._id))
      .take(100),
    ctx.db.get(team.leadAgentId),
  ]);

  const memberAgentsRaw = await Promise.all(
    memberRows.map(async (row: { agentId: Id<"agents">; role: "lead" | "member" }) => {
      const agent = await ctx.db.get(row.agentId);
      if (!agent) return null;
      return {
        _id: agent._id as Id<"agents">,
        name: agent.name as string,
        slug: agent.slug as string,
        role: row.role,
      };
    })
  );

  const sharedSkillsRaw = await Promise.all(
    teamSkillRows.map(async (row: { skillId: Id<"skills"> }) => {
      const skill = await ctx.db.get(row.skillId);
      if (!skill) return null;
      return {
        _id: skill._id as Id<"skills">,
        name: skill.identity?.name as string,
      };
    })
  );

  const memberAgents = memberAgentsRaw.filter(Boolean) as Array<{
    _id: Id<"agents">;
    name: string;
    slug: string;
    role: "lead" | "member";
  }>;
  const sharedSkills = sharedSkillsRaw.filter(Boolean) as Array<{
    _id: Id<"skills">;
    name: string;
  }>;

  return {
    _id: team._id,
    name: team.name,
    slug: team.slug,
    description: team.description,
    leadAgentId: team.leadAgentId,
    leadAgentName: leadAgent?.name,
    autonomy: team.autonomy,
    memberAgentIds: memberAgents.map((member) => member._id),
    memberAgents,
    sharedSkillIds: sharedSkills.map((skill) => skill._id),
    sharedSkillNames: sharedSkills.map((skill) => skill.name),
    taskCount: teamTasks.length,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
}

export const list = authedQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const teams = await ctx.db
      .query("agentTeams")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(50);

    return await Promise.all(teams.map((team) => buildTeamSummary(ctx, team as TeamDoc)));
  },
});

export const listAssignable = authedQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const teams = await ctx.db
      .query("agentTeams")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(50);

    return await Promise.all(
      teams.map(async (team) => {
        const leadAgent = await ctx.db.get(team.leadAgentId);
        const members = await ctx.db
          .query("agentTeamMembers")
          .withIndex("by_teamId", (q) => q.eq("teamId", team._id))
          .take(50);

        return {
          _id: team._id,
          name: team.name,
          slug: team.slug,
          leadAgentId: team.leadAgentId,
          leadAgentName: leadAgent?.name,
          autonomy: team.autonomy,
          memberCount: members.length,
        };
      })
    );
  },
});

export const create = authedMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    leadAgentId: v.id("agents"),
    memberAgentIds: v.optional(v.array(v.id("agents"))),
    sharedSkillIds: v.optional(v.array(v.id("skills"))),
    autonomy: v.optional(
      v.object({
        executionMode: v.union(v.literal("manual"), v.literal("auto")),
        coordinationMode: v.union(v.literal("lead_only"), v.literal("collaborative")),
        allowAutonomousTaskCreation: v.boolean(),
        allowEmailReports: v.boolean(),
        thinkingEnabled: v.boolean(),
      })
    ),
  },
  returns: v.id("agentTeams"),
  handler: async (ctx, args) => {
    await getOwnedAgentOrThrow(ctx, ctx.userId, args.leadAgentId);

    const normalizedSlug = args.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const existing = await ctx.db
      .query("agentTeams")
      .withIndex("by_userId_slug", (q) =>
        q.eq("userId", ctx.userId).eq("slug", normalizedSlug)
      )
      .unique();
    if (existing) {
      throw new Error("A team with this slug already exists");
    }

    const memberAgentIds = Array.from(
      new Set([args.leadAgentId, ...(args.memberAgentIds ?? [])])
    );
    for (const agentId of memberAgentIds) {
      await getOwnedAgentOrThrow(ctx, ctx.userId, agentId);
    }

    const sharedSkillIds = Array.from(new Set(args.sharedSkillIds ?? []));
    for (const skillId of sharedSkillIds) {
      await getOwnedSkillOrThrow(ctx, ctx.userId, skillId);
    }

    const now = Date.now();
    const teamId = await ctx.db.insert("agentTeams", {
      userId: ctx.userId,
      name: args.name.trim(),
      slug: normalizedSlug,
      description: args.description?.trim() || undefined,
      leadAgentId: args.leadAgentId,
      autonomy: args.autonomy ?? {
        executionMode: "manual",
        coordinationMode: "collaborative",
        allowAutonomousTaskCreation: true,
        allowEmailReports: true,
        thinkingEnabled: true,
      },
      createdAt: now,
      updatedAt: now,
    });

    await Promise.all(
      memberAgentIds.map((agentId) =>
        ctx.db.insert("agentTeamMembers", {
          teamId,
          agentId,
          userId: ctx.userId,
          role: agentId === args.leadAgentId ? "lead" : "member",
          createdAt: now,
        })
      )
    );

    await Promise.all(
      sharedSkillIds.map((skillId) =>
        ctx.db.insert("teamSkills", {
          teamId,
          skillId,
          userId: ctx.userId,
          createdAt: now,
        })
      )
    );

    return teamId;
  },
});

export const update = authedMutation({
  args: {
    teamId: v.id("agentTeams"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    leadAgentId: v.optional(v.id("agents")),
    autonomy: v.optional(
      v.object({
        executionMode: v.union(v.literal("manual"), v.literal("auto")),
        coordinationMode: v.union(v.literal("lead_only"), v.literal("collaborative")),
        allowAutonomousTaskCreation: v.boolean(),
        allowEmailReports: v.boolean(),
        thinkingEnabled: v.boolean(),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.userId !== ctx.userId) {
      throw new Error("Team not found");
    }

    if (args.leadAgentId) {
      const leadAgentId = args.leadAgentId;
      await getOwnedAgentOrThrow(ctx, ctx.userId, leadAgentId);
      const existingLeadMembership = await ctx.db
        .query("agentTeamMembers")
        .withIndex("by_teamId_agentId", (q) =>
          q.eq("teamId", args.teamId).eq("agentId", leadAgentId)
        )
        .unique();
      if (!existingLeadMembership) {
        await ctx.db.insert("agentTeamMembers", {
          teamId: args.teamId,
          agentId: leadAgentId,
          userId: ctx.userId,
          role: "lead",
          createdAt: Date.now(),
        });
      }

      const memberships = await ctx.db
        .query("agentTeamMembers")
        .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
        .take(50);
      await Promise.all(
        memberships.map((membership) =>
          ctx.db.patch(membership._id, {
            role: membership.agentId === leadAgentId ? "lead" : "member",
          })
        )
      );
    }

    await ctx.db.patch(args.teamId, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.description !== undefined
        ? { description: args.description?.trim() || undefined }
        : {}),
      ...(args.leadAgentId !== undefined ? { leadAgentId: args.leadAgentId } : {}),
      ...(args.autonomy !== undefined ? { autonomy: args.autonomy } : {}),
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const setTeamAgents = authedMutation({
  args: {
    teamId: v.id("agentTeams"),
    leadAgentId: v.id("agents"),
    memberAgentIds: v.array(v.id("agents")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.userId !== ctx.userId) {
      throw new Error("Team not found");
    }

    const targetAgentIds = Array.from(
      new Set([args.leadAgentId, ...args.memberAgentIds])
    );
    for (const agentId of targetAgentIds) {
      await getOwnedAgentOrThrow(ctx, ctx.userId, agentId);
    }

    const currentMembers = await ctx.db
      .query("agentTeamMembers")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .take(50);

    const currentByAgentId = new Map(
      currentMembers.map((membership) => [membership.agentId, membership])
    );

    await Promise.all(
      currentMembers
        .filter((membership) => !targetAgentIds.includes(membership.agentId))
        .map((membership) => ctx.db.delete(membership._id))
    );

    const now = Date.now();
    for (const agentId of targetAgentIds) {
      const existing = currentByAgentId.get(agentId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          role: agentId === args.leadAgentId ? "lead" : "member",
        });
      } else {
        await ctx.db.insert("agentTeamMembers", {
          teamId: args.teamId,
          agentId,
          userId: ctx.userId,
          role: agentId === args.leadAgentId ? "lead" : "member",
          createdAt: now,
        });
      }
    }

    await ctx.db.patch(args.teamId, {
      leadAgentId: args.leadAgentId,
      updatedAt: now,
    });

    return null;
  },
});

export const setTeamSkills = authedMutation({
  args: {
    teamId: v.id("agentTeams"),
    skillIds: v.array(v.id("skills")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.userId !== ctx.userId) {
      throw new Error("Team not found");
    }

    const targetSkillIds = Array.from(new Set(args.skillIds));
    for (const skillId of targetSkillIds) {
      await getOwnedSkillOrThrow(ctx, ctx.userId, skillId);
    }

    const currentSkills = await ctx.db
      .query("teamSkills")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .take(100);
    const currentBySkillId = new Map(currentSkills.map((row) => [row.skillId, row]));

    await Promise.all(
      currentSkills
        .filter((row) => !targetSkillIds.includes(row.skillId))
        .map((row) => ctx.db.delete(row._id))
    );

    const now = Date.now();
    for (const skillId of targetSkillIds) {
      if (!currentBySkillId.has(skillId)) {
        await ctx.db.insert("teamSkills", {
          teamId: args.teamId,
          skillId,
          userId: ctx.userId,
          createdAt: now,
        });
      }
    }

    await ctx.db.patch(args.teamId, { updatedAt: now });
    return null;
  },
});

export const remove = authedMutation({
  args: { teamId: v.id("agentTeams") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.userId !== ctx.userId) {
      throw new Error("Team not found");
    }

    const [members, teamSkills, tasks] = await Promise.all([
      ctx.db
        .query("agentTeamMembers")
        .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
        .take(100),
      ctx.db
        .query("teamSkills")
        .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
        .take(100),
      ctx.db
        .query("tasks")
        .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
        .take(200),
    ]);

    await Promise.all([
      ...members.map((membership) => ctx.db.delete(membership._id)),
      ...teamSkills.map((row) => ctx.db.delete(row._id)),
      ...tasks.map((task) => ctx.db.patch(task._id, { teamId: undefined })),
    ]);

    await ctx.db.delete(args.teamId);
    return null;
  },
});

export const getTaskOverview = authedQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const teams = await ctx.db
      .query("agentTeams")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .take(50);

    return await Promise.all(
      teams.map(async (team) => {
        const tasks = await ctx.db
          .query("tasks")
          .withIndex("by_teamId", (q) => q.eq("teamId", team._id))
          .take(100);

        return {
          teamId: team._id,
          name: team.name,
          pending: tasks.filter((task) => task.status === "pending").length,
          inProgress: tasks.filter((task) => task.status === "in_progress").length,
          completed: tasks.filter((task) => task.status === "completed").length,
          failed: tasks.filter((task) => task.status === "failed").length,
          executionMode: team.autonomy.executionMode,
        };
      })
    );
  },
});

export const getById = internalQuery({
  args: { teamId: v.id("agentTeams") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;
    return await buildTeamSummary(ctx, team as TeamDoc);
  },
});

export const getContext = internalQuery({
  args: { userId: v.id("users"), teamId: v.id("agentTeams") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.userId !== args.userId) {
      return null;
    }
    return await buildTeamSummary(ctx, team as TeamDoc);
  },
});

export const listTasksForTeam = authedQuery({
  args: { teamId: v.id("agentTeams") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.userId !== ctx.userId) {
      return [];
    }
    return await ctx.db
      .query("tasks")
      .withIndex("by_userId_teamId", (q) =>
        q.eq("userId", ctx.userId).eq("teamId", args.teamId)
      )
      .take(100);
  },
});

export const getRunnableTasks = internalQuery({
  args: { userId: v.id("users"), teamId: v.id("agentTeams") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.userId !== args.userId) {
      return [];
    }
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId_teamId", (q) =>
        q.eq("userId", args.userId).eq("teamId", args.teamId)
      )
      .take(100);
    return tasks.filter(
      (task) =>
        !task.isArchived &&
        (task.status === "pending" || task.status === "in_progress")
    );
  },
});

export const processTeamTasks = internalAction({
  args: {
    userId: v.id("users"),
    teamId: v.id("agentTeams"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [team, tasks] = await Promise.all([
      ctx.runQuery(internal.functions.teams.getContext, {
        userId: args.userId,
        teamId: args.teamId,
      }),
      ctx.runQuery(internal.functions.teams.getRunnableTasks, {
        userId: args.userId,
        teamId: args.teamId,
      }),
    ]);

    if (!team || team.autonomy.executionMode !== "auto" || tasks.length === 0) {
      return null;
    }

    const taskLines: Array<string> = [];
    taskLines.push(`You are coordinating the team "${team.name}".`);
    if (team.description) {
      taskLines.push(`Team brief: ${team.description}`);
    }
    taskLines.push(`Coordination mode: ${team.autonomy.coordinationMode}.`);
    taskLines.push(
      `Shared team skills: ${team.sharedSkillNames.length > 0 ? team.sharedSkillNames.join(", ") : "none"}`
    );
    taskLines.push("Team members:");
    for (const member of team.memberAgents) {
      taskLines.push(
        `  - ${member.name} (slug: ${member.slug}, role: ${member.role})`
      );
    }
    taskLines.push("");
    taskLines.push("You may create subtasks for specific members when needed.");
    taskLines.push(
      "Use create_subtask with targetAgentSlug when you want a subtask assigned to a specific team member."
    );
    taskLines.push(
      "If team coordination can finish a task directly, complete it yourself and mark it completed."
    );
    taskLines.push("");
    taskLines.push("Team tasks to process now:");
    for (const task of tasks.slice(0, 10)) {
      taskLines.push(
        `  taskId="${String(task._id)}" description="${task.description}" status="${task.status}"`
      );
    }
    taskLines.push("");
    taskLines.push(
      "This is an autonomous run. Do not ask the user for permission. Do the work, delegate internally when useful, and report back with concrete outcomes."
    );

    await ctx.runAction(internal.agent.runtime.processMessage, {
      userId: args.userId,
      agentId: team.leadAgentId,
      teamId: args.teamId,
      message: taskLines.join("\n"),
      channel: "dashboard",
    });

    return null;
  },
});
