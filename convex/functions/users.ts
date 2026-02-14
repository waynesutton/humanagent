import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { authedMutation, optionalAuthQuery } from "../lib/functions";
import { auth } from "../auth";
import type { Id } from "../_generated/dataModel";

const USERNAME_REGEX = /^[a-z0-9_]+$/;

function normalizeSocialProfile(
  service: "twitter" | "linkedin" | "github",
  raw?: string
): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;

  const fromHandle = (base: string, handle: string) => {
    const cleaned = handle.replace(/^@/, "").trim();
    return cleaned ? `${base}/${cleaned}` : undefined;
  };

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      const path = parsed.pathname.replace(/\/+$/, "");
      const segments = path.split("/").filter(Boolean);

      if (service === "twitter") {
        if ((host === "x.com" || host === "twitter.com") && segments[0]) {
          return `https://x.com/${segments[0]}`;
        }
        return value;
      }

      if (service === "github") {
        if (host === "github.com" && segments[0]) {
          return `https://github.com/${segments[0]}`;
        }
        return value;
      }

      if (service === "linkedin") {
        if (host === "linkedin.com" && segments.length > 0) {
          return `https://www.linkedin.com/${segments.join("/")}`;
        }
        return value;
      }
    } catch {
      return value;
    }
  }

  if (service === "twitter") {
    return fromHandle("https://x.com", value);
  }
  if (service === "github") {
    return fromHandle("https://github.com", value);
  }
  return fromHandle("https://www.linkedin.com/in", value);
}

function extractStorageIdFromImage(image?: string): Id<"_storage"> | null {
  if (!image || !image.startsWith("storage:")) {
    return null;
  }
  const rawId = image.slice("storage:".length).trim();
  if (!rawId) {
    return null;
  }
  return rawId as Id<"_storage">;
}

const DELETE_BATCH_SIZE = 100;

type UserOwnedTable =
  | "agents"
  | "apiKeys"
  | "auditLog"
  | "boardColumns"
  | "connectedApps"
  | "conversations"
  | "feedItems"
  | "llmsTxt"
  | "mcpConnections"
  | "permissions"
  | "securityFlags"
  | "skills"
  | "tasks"
  | "userCredentials"
  | "userSchedules"
  | "agentHealth"
  | "agentMemory";

async function deleteUserOwnedRows(
  ctx: MutationCtx,
  userId: Id<"users">,
  table: UserOwnedTable
) {
  while (true) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH_SIZE);
    if (rows.length === 0) break;

    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
  }
}

async function deleteAgentThoughtsForAgent(
  ctx: MutationCtx,
  agentId: Id<"agents">
) {
  while (true) {
    const thoughts = await ctx.db
      .query("agentThoughts")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .take(DELETE_BATCH_SIZE);
    if (thoughts.length === 0) break;

    await Promise.all(thoughts.map((thought) => ctx.db.delete(thought._id)));
  }
}

// ============================================================
// Public queries
// ============================================================

// Returns current user or null if not logged in
export const viewer = optionalAuthQuery({
  args: {},
  returns: v.union(v.any(), v.null()),
  handler: async (ctx) => {
    if (!ctx.user) return null;

    const storageId = extractStorageIdFromImage(ctx.user.image);
    if (!storageId) {
      return ctx.user;
    }

    const signedUrl = await ctx.storage.getUrl(storageId);
    return {
      ...ctx.user,
      image: signedUrl ?? ctx.user.image,
    };
  },
});

// Public lookup by username (no auth required)
// Returns user profile data with privacy settings respected
export const getByUsername = query({
  args: { username: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { username }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!user) return null;

    // Check if profile is visible
    const privacy = user.privacySettings ?? {
      profileVisible: true,
      showEmail: true,
      showPhone: false,
      showSkills: true,
      showActivity: true,
      showTasks: true,
      showEndpoints: true,
      allowAgentToAgent: false,
    };

    // If profile is not visible, return minimal data
    if (!privacy.profileVisible) {
      return {
        _id: user._id,
        username: user.username,
        name: user.name,
        profileHidden: true,
        privacySettings: privacy,
      };
    }

    // Return user with privacy settings for the frontend to use
    const storageId = extractStorageIdFromImage(user.image);
    const signedUrl = storageId ? await ctx.storage.getUrl(storageId) : null;
    return {
      ...user,
      image: signedUrl ?? user.image,
      privacySettings: privacy,
    };
  },
});

// ============================================================
// Public mutations
// ============================================================

/**
 * Create or complete user profile during onboarding.
 * Handles the case where the afterUserCreatedOrUpdated callback
 * didn't create the user record (e.g., on retry or error).
 */
export const createProfile = mutation({
  args: {
    username: v.string(),
    name: v.optional(v.string()),
    bio: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    // Get auth user ID from the auth component (throws if not authenticated)
    const authUserId = await auth.user.require(ctx);

    // Check if user record already exists
    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId as string))
      .unique();

    // Check username uniqueness
    const taken = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (taken && (!user || taken._id !== user._id)) {
      throw new Error("Username already taken");
    }

    let userId;

    if (user) {
      // User exists, update profile
      await ctx.db.patch(user._id, {
        username: args.username,
        name: args.name,
        bio: args.bio,
        onboardingComplete: true,
      });
      userId = user._id;
    } else {
      // User doesn't exist, create new record
      userId = await ctx.db.insert("users", {
        authUserId: authUserId as string,
        username: args.username,
        name: args.name,
        bio: args.bio,
        onboardingComplete: true,
        llmConfig: {
          provider: "openrouter" as const,
          model: "anthropic/claude-sonnet-4",
          tokensUsedThisMonth: 0,
          tokenBudget: 100000,
        },
      });
    }

    // Check if skill file already exists
    const existingSkill = await ctx.db
      .query("skills")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!existingSkill) {
      // Create default skill file
      await ctx.db.insert("skills", {
        userId,
        version: 1,
        identity: {
          name: args.name ?? args.username,
          bio: args.bio ?? "",
          avatar: undefined,
        },
        capabilities: [],
        knowledgeDomains: [],
        permissions: {
          public: ["send_message", "get_capabilities"],
          authenticated: ["check_availability", "request_meeting"],
          trusted: ["*"],
        },
        communicationPrefs: {
          tone: "friendly and professional",
          timezone: args.timezone ?? "America/Los_Angeles",
          availability: "available",
        },
        toolDeclarations: [],
        isPublished: false,
        updatedAt: Date.now(),
      });
    }

    // Check if board columns already exist
    const existingColumns = await ctx.db
      .query("boardColumns")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!existingColumns) {
      // Create default kanban columns
      const defaultColumns = ["Inbox", "In Progress", "Done"];
      for (let i = 0; i < defaultColumns.length; i++) {
        await ctx.db.insert("boardColumns", {
          userId,
          name: defaultColumns[i]!,
          order: i,
          isPublic: false,
          createdAt: Date.now(),
        });
      }
    }

    return userId;
  },
});

export const updateSettings = authedMutation({
  args: {
    username: v.optional(v.string()),
    name: v.optional(v.string()),
    bio: v.optional(v.string()),
    socialProfiles: v.optional(
      v.object({
        twitter: v.optional(v.string()),
        linkedin: v.optional(v.string()),
        github: v.optional(v.string()),
      })
    ),
    llmProvider: v.optional(
      v.union(
        v.literal("openrouter"),
        v.literal("anthropic"),
        v.literal("openai"),
        v.literal("google"),
        v.literal("mistral"),
        v.literal("minimax"),
        v.literal("kimi"),
        v.literal("xai"),
        v.literal("custom")
      )
    ),
    llmModel: v.optional(v.string()),
    privacySettings: v.optional(
      v.object({
        showEmail: v.boolean(),
        showPhone: v.boolean(),
        showSkills: v.boolean(),
        showActivity: v.boolean(),
        showTasks: v.boolean(),
        showEndpoints: v.boolean(),
        allowAgentToAgent: v.optional(v.boolean()),
        profileVisible: v.boolean(),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.username !== undefined) {
      const normalizedUsername = args.username.trim().toLowerCase();
      if (!normalizedUsername) {
        throw new Error("Username is required");
      }
      if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
        throw new Error("Username must be between 3 and 30 characters");
      }
      if (!USERNAME_REGEX.test(normalizedUsername)) {
        throw new Error("Username can only contain lowercase letters, numbers, and underscores");
      }
      if (normalizedUsername !== ctx.user.username) {
        const taken = await ctx.db
          .query("users")
          .withIndex("by_username", (q) => q.eq("username", normalizedUsername))
          .unique();
        if (taken && taken._id !== ctx.userId) {
          throw new Error("Username already taken");
        }
      }
      patch.username = normalizedUsername;
    }
    if (args.name !== undefined) patch.name = args.name;
    if (args.bio !== undefined) patch.bio = args.bio;
    if (args.socialProfiles !== undefined) {
      const twitter = normalizeSocialProfile("twitter", args.socialProfiles.twitter);
      const linkedin = normalizeSocialProfile("linkedin", args.socialProfiles.linkedin);
      const github = normalizeSocialProfile("github", args.socialProfiles.github);
      patch.socialProfiles =
        twitter || linkedin || github
          ? { twitter, linkedin, github }
          : undefined;
    }

    if (args.llmProvider || args.llmModel) {
      patch.llmConfig = {
        ...ctx.user.llmConfig,
        ...(args.llmProvider && { provider: args.llmProvider }),
        ...(args.llmModel && { model: args.llmModel }),
      };
    }

    if (args.privacySettings !== undefined) {
      patch.privacySettings = args.privacySettings;
    }

    await ctx.db.patch(ctx.userId, patch);
    return null;
  },
});

export const generateProfilePhotoUploadUrl = authedMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const setProfilePhoto = authedMutation({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(ctx.userId, {
      image: `storage:${args.storageId}`,
    });
    return null;
  },
});

export const deleteAccount = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = ctx.userId;
    const profilePhotoStorageId = extractStorageIdFromImage(ctx.user.image);

    // Delete agent-scoped thoughts first (agentThoughts only has by_agentId index).
    while (true) {
      const userAgents = await ctx.db
        .query("agents")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(DELETE_BATCH_SIZE);
      if (userAgents.length === 0) break;

      await Promise.all(
        userAgents.map((agent) => deleteAgentThoughtsForAgent(ctx, agent._id))
      );
      await Promise.all(userAgents.map((agent) => ctx.db.delete(agent._id)));
    }

    const userOwnedTables: Array<UserOwnedTable> = [
      "apiKeys",
      "auditLog",
      "boardColumns",
      "connectedApps",
      "conversations",
      "feedItems",
      "llmsTxt",
      "mcpConnections",
      "permissions",
      "securityFlags",
      "skills",
      "tasks",
      "userCredentials",
      "userSchedules",
      "agentHealth",
      "agentMemory",
    ];

    for (const table of userOwnedTables) {
      await deleteUserOwnedRows(ctx, userId, table);
    }

    await ctx.db.delete(userId);

    if (profilePhotoStorageId) {
      await ctx.storage.delete(profilePhotoStorageId);
    }

    return null;
  },
});

// ============================================================
// Internal functions (called by agent, crons, etc.)
// ============================================================

export const getById = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const updateTokenUsage = internalMutation({
  args: {
    userId: v.id("users"),
    tokensUsed: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, tokensUsed }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;

    await ctx.db.patch(userId, {
      llmConfig: {
        ...user.llmConfig,
        tokensUsedThisMonth:
          user.llmConfig.tokensUsedThisMonth + tokensUsed,
      },
    });
    return null;
  },
});

export const resetAllTokenBudgets = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      await ctx.db.patch(user._id, {
        llmConfig: {
          ...user.llmConfig,
          tokensUsedThisMonth: 0,
        },
      });
    }
    return null;
  },
});

export const listAllActive = internalQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    // Return all users (for heartbeat checks)
    return await ctx.db.query("users").take(500);
  },
});
