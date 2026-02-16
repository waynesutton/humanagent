import { v } from "convex/values";
import { authedQuery } from "../lib/functions";

function getAllowedAdminUsernames(): Set<string> {
  const raw = process.env.ADMIN_USERNAMES ?? "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function assertAdmin(username?: string) {
  const admins = getAllowedAdminUsernames();
  if (!username || !admins.has(username.toLowerCase())) {
    throw new Error("Admin access required");
  }
}

export const getDashboardStats = authedQuery({
  args: {},
  returns: v.object({
    users: v.number(),
    agents: v.number(),
    activeApiKeys: v.number(),
    openTasks: v.number(),
  }),
  handler: async (ctx) => {
    assertAdmin(ctx.user.username);

    const [users, agents, apiKeys, tasks] = await Promise.all([
      ctx.db.query("users").take(1000),
      ctx.db.query("agents").take(5000),
      ctx.db.query("apiKeys").take(5000),
      ctx.db.query("tasks").take(5000),
    ]);

    return {
      users: users.length,
      agents: agents.length,
      activeApiKeys: apiKeys.filter((key) => key.isActive).length,
      openTasks: tasks.filter((task) => task.status !== "completed").length,
    };
  },
});

export const isAdmin = authedQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const admins = getAllowedAdminUsernames();
    return !!ctx.user.username && admins.has(ctx.user.username.toLowerCase());
  },
});

export const listUsers = authedQuery({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      username: v.optional(v.string()),
      name: v.optional(v.string()),
      onboardingComplete: v.boolean(),
      createdAt: v.optional(v.number()),
      agentCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    assertAdmin(ctx.user.username);

    const users = await ctx.db.query("users").take(args.limit ?? 100);
    const agents = await ctx.db.query("agents").take(5000);

    return users.map((user) => ({
      _id: user._id,
      username: user.username,
      name: user.name,
      onboardingComplete: user.onboardingComplete,
      createdAt: user._creationTime,
      agentCount: agents.filter((agent) => agent.userId === user._id).length,
    }));
  },
});
