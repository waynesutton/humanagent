import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// LLM provider types
const llmProviderValidator = v.union(
  v.literal("openrouter"),
  v.literal("anthropic"),
  v.literal("openai"),
  v.literal("deepseek"),
  v.literal("google"),
  v.literal("mistral"),
  v.literal("minimax"),
  v.literal("kimi"),
  v.literal("xai"), // Grok models via xAI API
  v.literal("custom")
);

export default defineSchema({
  // App-level users linked to auth component via authUserId
  users: defineTable({
    authUserId: v.string(),
    username: v.optional(v.string()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    bio: v.optional(v.string()),
    socialProfiles: v.optional(
      v.object({
        twitter: v.optional(v.string()),
        linkedin: v.optional(v.string()),
        github: v.optional(v.string()),
      })
    ),
    onboardingComplete: v.boolean(),
    // Default LLM config (used when agent doesn't have its own)
    llmConfig: v.object({
      provider: llmProviderValidator,
      model: v.string(),
      tokensUsedThisMonth: v.number(),
      tokenBudget: v.number(),
    }),
    // Default agent for backwards compatibility
    defaultAgentId: v.optional(v.id("agents")),
    // Per-channel rate limit configuration (requests per minute unless noted)
    rateLimitConfig: v.optional(
      v.object({
        apiRequestsPerMinute: v.number(), // REST API calls/min
        mcpRequestsPerMinute: v.number(), // MCP server calls/min
        skillExecutionsPerMinute: v.number(), // Skill tool calls/min
        emailsPerHour: v.number(), // Outbound email sends/hour
        a2aRequestsPerMinute: v.number(), // Agent-to-agent calls/min
      })
    ),
    // Privacy settings: what's visible on public profile
    privacySettings: v.optional(
      v.object({
        showEmail: v.boolean(), // Show agent email on public profile
        showPhone: v.boolean(), // Show agent phone on public profile
        showSkills: v.boolean(), // Show skills/capabilities on public profile
        showActivity: v.boolean(), // Show activity feed on public profile
        showTasks: v.boolean(), // Show public tasks on profile
        showEndpoints: v.boolean(), // Show API/MCP endpoints
        allowAgentToAgent: v.optional(v.boolean()), // Allow public agents to receive A2A messages
        profileVisible: v.boolean(), // Master toggle for entire profile
      })
    ),
  })
    .index("by_authUserId", ["authUserId"])
    .index("by_username", ["username"]),

  // Agents: Users can have multiple agents, each with its own config
  agents: defineTable({
    userId: v.id("users"),
    name: v.string(),
    slug: v.string(), // URL-safe identifier (e.g., "work", "personal")
    description: v.optional(v.string()),
    icon: v.optional(v.string()), // Phosphor icon key
    image: v.optional(v.string()), // storage:<id> for uploaded photo
    isDefault: v.boolean(),
    isPublic: v.boolean(),
    // LLM configuration (can override user's default)
    llmConfig: v.optional(
      v.object({
        provider: llmProviderValidator,
        model: v.string(),
        tokensUsedThisMonth: v.number(),
        tokenBudget: v.number(),
      })
    ),
    // AgentMail inbox address (e.g., wayne-work@humanai.gent)
    agentEmail: v.optional(v.string()),
    // Agent phone number via Twilio
    agentPhone: v.optional(v.string()),
    // Phone configuration (Twilio + ElevenLabs)
    phoneConfig: v.optional(
      v.object({
        voiceEnabled: v.boolean(), // Can receive voice calls
        smsEnabled: v.boolean(), // Can receive/send SMS
        transcribeVoicemail: v.boolean(), // Auto-transcribe voicemails
        language: v.optional(v.string()), // Primary language (e.g., "en-US")
      })
    ),
    // ElevenLabs voice configuration
    voiceConfig: v.optional(
      v.object({
        provider: v.union(v.literal("elevenlabs"), v.literal("openai")),
        // ElevenLabs specific
        voiceId: v.optional(v.string()), // ElevenLabs voice ID (premade or cloned)
        modelId: v.optional(v.string()), // e.g., "eleven_multilingual_v2"
        stability: v.optional(v.number()), // 0-1
        similarityBoost: v.optional(v.number()), // 0-1
        style: v.optional(v.number()), // 0-1
        useSpeakerBoost: v.optional(v.boolean()),
        // OpenAI TTS fallback
        openaiVoice: v.optional(v.string()), // alloy, echo, fable, onyx, nova, shimmer
      })
    ),
    // Agent personality and behavior
    personality: v.optional(
      v.object({
        tone: v.optional(v.string()), // "friendly", "professional", "casual", etc.
        speakingStyle: v.optional(v.string()), // "conversational", "formal", etc.
        customInstructions: v.optional(v.string()), // System prompt additions
      })
    ),
    // MCP server endpoint path
    mcpEndpoint: v.optional(v.string()),
    // Public connect visibility for this specific agent
    publicConnect: v.optional(
      v.object({
        showApi: v.boolean(),
        showMcp: v.boolean(),
        showEmail: v.boolean(),
        showSkillFile: v.boolean(),
      })
    ),
    // Agent scheduling: run automatically or on cron schedule
    scheduling: v.optional(
      v.object({
        mode: v.union(
          v.literal("manual"), // Only runs when triggered
          v.literal("auto"), // Runs automatically based on triggers
          v.literal("cron") // Runs on a schedule
        ),
        cronSpec: v.optional(v.string()), // e.g., "0 9 * * *" for daily at 9am
        intervalMinutes: v.optional(v.number()), // For interval-based scheduling
        isActive: v.boolean(), // Whether scheduling is enabled
        lastRun: v.optional(v.number()), // Timestamp of last run
        nextRun: v.optional(v.number()), // Timestamp of next scheduled run
      })
    ),
    // Denormalized scheduling fields to support indexed cron lookups.
    schedulingActive: v.optional(v.boolean()),
    schedulingMode: v.optional(
      v.union(v.literal("manual"), v.literal("auto"), v.literal("cron"))
    ),
    // Agent-to-agent communication controls
    a2aConfig: v.optional(
      v.object({
        enabled: v.boolean(), // Whether this agent can participate in A2A
        allowPublicAgents: v.boolean(), // Whether unknown public agents can message this agent
        autoRespond: v.optional(v.boolean()), // Whether this agent auto-responds to inbound A2A
        maxAutoReplyHops: v.optional(v.number()), // Loop guard for chained agent replies
      })
    ),
    // Agent thinking: allows agent to plan and decide what to do next
    thinking: v.optional(
      v.object({
        enabled: v.boolean(), // Whether thinking mode is active
        isPaused: v.boolean(), // Whether thinking is currently paused
        currentGoal: v.optional(v.string()), // What the agent is trying to achieve
        lastThought: v.optional(v.string()), // Last reasoning output
        lastThoughtAt: v.optional(v.number()), // When last thought occurred
      })
    ),
    // Browser automation tools (optional, BYOK)
    browserAutomation: v.optional(
      v.object({
        firecrawlEnabled: v.boolean(), // Firecrawl for web scraping
        stagehandEnabled: v.boolean(), // Stagehand for AI browser automation
        browserUseEnabled: v.boolean(), // Browser Use for task automation
      })
    ),
    // X/Twitter integration (via xAI API or direct X API)
    xConfig: v.optional(
      v.object({
        enabled: v.boolean(), // Whether X integration is active
        // Connection mode: use xAI's Grok with real-time X data, or direct X API
        mode: v.union(
          v.literal("xai_grok"), // Use xAI API (Grok) for real-time X analysis/research only
          v.literal("x_api") // Direct X API access (requires X API key)
        ),
        // Account type: agent's own account or connected user account
        accountType: v.union(
          v.literal("agent"), // Agent has its own X account
          v.literal("user") // Connected to user's X account
        ),
        // X account info (when connected)
        xUsername: v.optional(v.string()), // @handle
        xUserId: v.optional(v.string()), // X user ID
        // Capabilities enabled for this agent
        capabilities: v.optional(
          v.object({
            canPost: v.boolean(), // Can post tweets
            canReply: v.boolean(), // Can reply to tweets
            canLike: v.boolean(), // Can like tweets
            canRetweet: v.boolean(), // Can retweet
            canDM: v.boolean(), // Can send/receive DMs
            canSearch: v.boolean(), // Can search tweets
            canAnalyze: v.boolean(), // Can analyze trends/sentiment
            canMonitor: v.boolean(), // Can monitor mentions/keywords
          })
        ),
        // Auto-posting settings
        autoPost: v.optional(
          v.object({
            enabled: v.boolean(),
            requireApproval: v.boolean(), // Require user approval before posting
            maxPostsPerDay: v.optional(v.number()),
            postsToday: v.optional(v.number()),
          })
        ),
        // Monitoring settings
        monitoring: v.optional(
          v.object({
            trackMentions: v.boolean(),
            trackKeywords: v.optional(v.array(v.string())),
            trackAccounts: v.optional(v.array(v.string())), // Accounts to watch
          })
        ),
        lastSyncAt: v.optional(v.number()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_slug", ["userId", "slug"])
    .index("by_userId_default", ["userId", "isDefault"])
    .index("by_agentPhone", ["agentPhone"])
    .index("by_agentEmail", ["agentEmail"])
    .index("by_schedulingActive_mode", ["schedulingActive", "schedulingMode"]),

  // Encrypted credentials for BYOK (stored per user, can be used by any agent)
  userCredentials: defineTable({
    userId: v.id("users"),
    // Service type: llm provider or integration
    service: v.union(
      // LLM providers
      v.literal("openrouter"),
      v.literal("anthropic"),
      v.literal("openai"),
      v.literal("deepseek"),
      v.literal("google"),
      v.literal("mistral"),
      v.literal("minimax"),
      v.literal("kimi"),
      v.literal("xai"), // xAI API for Grok models
      // Integrations
      v.literal("agentmail"),
      v.literal("twilio"),
      v.literal("elevenlabs"),
      v.literal("resend"),
      v.literal("github"),
      v.literal("twitter"), // X/Twitter API direct access
      v.literal("linkedin"),
      v.literal("slack"),
      v.literal("google_calendar"),
      v.literal("cloudflare"),
      // Browser automation (BYOK)
      v.literal("firecrawl"),
      v.literal("browserbase"),
      v.literal("custom")
    ),
    // Encrypted API key (never stored in plaintext)
    encryptedApiKey: v.optional(v.string()),
    // Additional config (e.g., custom endpoint URL)
    config: v.optional(
      v.object({
        baseUrl: v.optional(v.string()),
        organizationId: v.optional(v.string()),
        projectId: v.optional(v.string()),
      })
    ),
    // For OAuth-based services
    encryptedAccessToken: v.optional(v.string()),
    encryptedRefreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    scopes: v.optional(v.array(v.string())),
    isActive: v.boolean(),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_service", ["userId", "service"]),

  // Skills: Can be linked to multiple agents via skillAgents junction table
  skills: defineTable({
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")), // Legacy: kept for backwards compat
    version: v.number(),
    identity: v.object({
      name: v.string(),
      bio: v.string(),
      avatar: v.optional(v.string()),
    }),
    capabilities: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        toolId: v.optional(v.string()),
      })
    ),
    knowledgeDomains: v.array(v.string()),
    permissions: v.object({
      public: v.array(v.string()),
      authenticated: v.array(v.string()),
      trusted: v.array(v.string()),
    }),
    communicationPrefs: v.object({
      tone: v.string(),
      timezone: v.string(),
      availability: v.string(),
    }),
    toolDeclarations: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        inputSchema: v.optional(v.any()),
      })
    ),
    isPublished: v.boolean(),
    isActive: v.optional(v.boolean()), // Can enable/disable skills (optional for backwards compat)
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_agentId", ["agentId"]),

  // Junction table: many-to-many link between skills and agents
  skillAgents: defineTable({
    skillId: v.id("skills"),
    agentId: v.id("agents"),
    userId: v.id("users"), // Denormalized for ownership checks
    createdAt: v.number(),
  })
    .index("by_skillId", ["skillId"])
    .index("by_agentId", ["agentId"])
    .index("by_userId", ["userId"])
    .index("by_skillId_agentId", ["skillId", "agentId"]),

  // API keys (SHA-256 hashed, never stored plaintext)
  apiKeys: defineTable({
    userId: v.id("users"),
    name: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    keyType: v.optional(
      v.union(v.literal("user_universal"), v.literal("agent_scoped"))
    ),
    allowedAgentIds: v.optional(v.array(v.id("agents"))),
    allowedRouteGroups: v.optional(
      v.array(
        v.union(
          v.literal("api"),
          v.literal("mcp"),
          v.literal("docs"),
          v.literal("skills")
        )
      )
    ),
    scopes: v.array(v.string()),
    rateLimitPerMinute: v.number(),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_keyHash", ["keyHash"]),

  // Audit log (append-only)
  auditLog: defineTable({
    userId: v.id("users"),
    action: v.string(),
    resource: v.string(),
    callerType: v.union(
      v.literal("user"),
      v.literal("agent"),
      v.literal("a2a"),
      v.literal("cron"),
      v.literal("webhook")
    ),
    callerIdentity: v.optional(v.string()),
    details: v.optional(v.any()),
    status: v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("blocked"),
      v.literal("in_progress")
    ),
    channel: v.optional(v.string()),
    tokenCount: v.optional(v.number()),
    timestamp: v.number(),
  }).index("by_userId", ["userId"]),

  // Conversations with external contacts and 1:1 agent chats
  conversations: defineTable({
    userId: v.id("users"),
    channel: v.union(
      v.literal("email"),
      v.literal("phone"),
      v.literal("api"),
      v.literal("mcp"),
      v.literal("webmcp"),
      v.literal("a2a"),
      v.literal("twitter"),
      v.literal("slack"),
      v.literal("dashboard")
    ),
    externalId: v.string(),
    // Agent this conversation is with (for dashboard 1:1 chats)
    agentId: v.optional(v.id("agents")),
    channelMetadata: v.optional(
      v.object({
        email: v.optional(
          v.object({
            from: v.string(),
            inboxAddress: v.string(),
            inboxId: v.optional(v.string()),
            subject: v.optional(v.string()),
            threadId: v.optional(v.string()),
            lastMessageId: v.optional(v.string()),
            deliveryStatus: v.optional(
              v.union(
                v.literal("received"),
                v.literal("sent"),
                v.literal("delivered"),
                v.literal("bounced")
              )
            ),
            lastEventType: v.optional(v.string()),
            lastEventAt: v.optional(v.number()),
            lastRecipients: v.optional(v.array(v.string())),
            lastBounceType: v.optional(v.string()),
            lastBounceSubType: v.optional(v.string()),
          })
        ),
      })
    ),
    messages: v.array(
      v.object({
        role: v.union(v.literal("agent"), v.literal("external")),
        content: v.string(),
        timestamp: v.number(),
      })
    ),
    status: v.union(
      v.literal("active"),
      v.literal("resolved"),
      v.literal("escalated")
    ),
    summary: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_channel_externalId", ["channel", "externalId"])
    .index("by_userId_agentId", ["userId", "agentId"]),

  // Kanban board columns
  boardColumns: defineTable({
    userId: v.id("users"),
    name: v.string(),
    order: v.number(),
    isPublic: v.boolean(),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  // Task board projects for grouping work across agents.
  boardProjects: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_name", ["userId", "name"]),

  // Tasks / work items on the board
  tasks: defineTable({
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")), // Which agent is assigned to this task
    projectId: v.optional(v.id("boardProjects")), // Optional project grouping
    requesterUserId: v.optional(v.id("users")), // Cross-user task requester
    requesterAgentId: v.optional(v.id("agents")), // Requester's agent
    requestedBy: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    steps: v.array(
      v.object({
        description: v.string(),
        status: v.union(
          v.literal("pending"),
          v.literal("in_progress"),
          v.literal("completed"),
          v.literal("failed")
        ),
        result: v.optional(v.string()),
      })
    ),
    boardColumnId: v.optional(v.id("boardColumns")),
    isPublic: v.boolean(),
    isArchived: v.optional(v.boolean()), // Whether task is archived
    archivedAt: v.optional(v.number()), // When task was archived
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_agentId", ["agentId"])
    .index("by_userId_projectId", ["userId", "projectId"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_userId_archived", ["userId", "isArchived"]),

  // Task comments for collaboration context on board tasks.
  taskComments: defineTable({
    taskId: v.id("tasks"),
    userId: v.id("users"),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_userId", ["userId"]),

  // Task attachments metadata with storage file references.
  taskAttachments: defineTable({
    taskId: v.id("tasks"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_userId", ["userId"]),

  // Activity feed items
  feedItems: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("message_handled"),
      v.literal("task_completed"),
      v.literal("integration_action"),
      v.literal("status_update"),
      v.literal("manual_post")
    ),
    title: v.string(),
    content: v.optional(v.string()),
    metadata: v.optional(v.any()),
    isPublic: v.boolean(),
    isHidden: v.optional(v.boolean()), // Hidden from feed but not deleted
    isArchived: v.optional(v.boolean()), // Archived for later reference
    updatedAt: v.optional(v.number()), // Track edits
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_public", ["isPublic"])
    .index("by_userId_public", ["userId", "isPublic"])
    .index("by_userId_archived", ["userId", "isArchived"]),

  // Security flags for input scanning
  securityFlags: defineTable({
    userId: v.id("users"),
    source: v.string(),
    flagType: v.union(
      v.literal("injection"),
      v.literal("sensitive"),
      v.literal("exfiltration")
    ),
    severity: v.union(v.literal("warn"), v.literal("block")),
    pattern: v.string(),
    inputSnippet: v.string(),
    action: v.string(),
    timestamp: v.number(),
  }).index("by_userId", ["userId"]),

  // ============================================================
  // NEW TABLES FROM PRD
  // ============================================================

  // Agent Thoughts: Stores agent reasoning and decision-making
  agentThoughts: defineTable({
    userId: v.id("users"),
    agentId: v.id("agents"),
    type: v.union(
      v.literal("observation"), // What the agent noticed
      v.literal("reasoning"), // Step-by-step thinking
      v.literal("decision"), // What action to take
      v.literal("reflection"), // Looking back at results
      v.literal("goal_update") // Updating current goal
    ),
    content: v.string(), // The thought content
    context: v.optional(v.string()), // What triggered this thought
    relatedTaskId: v.optional(v.id("tasks")), // If related to a task
    metadata: v.optional(v.any()), // Additional context
    createdAt: v.number(),
  })
    .index("by_agentId", ["agentId"])
    .index("by_agentId_type", ["agentId", "type"]),

  // Agent Memory: Vector embeddings for conversation context retrieval
  agentMemory: defineTable({
    userId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    type: v.union(
      v.literal("conversation"),
      v.literal("learned_preference"),
      v.literal("task_result"),
      v.literal("conversation_summary")
    ),
    content: v.string(),
    embedding: v.optional(v.array(v.float64())), // Vector, 1536 dimensions
    source: v.union(
      v.literal("email"),
      v.literal("phone"),
      v.literal("api"),
      v.literal("mcp"),
      v.literal("webmcp"),
      v.literal("a2a"),
      v.literal("manual"),
      v.literal("dashboard")
    ),
    metadata: v.optional(v.any()),
    archived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_agentId", ["agentId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId"],
    }),

  // Connected Apps: OAuth credentials for integrations
  connectedApps: defineTable({
    userId: v.id("users"),
    service: v.string(), // "twitter", "github", "google_calendar", etc.
    // OAuth tokens encrypted at rest
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    // Scopes requested (minimum needed)
    scopes: v.array(v.string()),
    // Profile info from the service
    externalUserId: v.optional(v.string()),
    externalUsername: v.optional(v.string()),
    profileUrl: v.optional(v.string()),
    isActive: v.boolean(),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_service", ["userId", "service"]),

  // Permissions: Scoped access control for callers
  permissions: defineTable({
    userId: v.id("users"),
    callerId: v.string(), // API key prefix, agent ID, or "*" for public
    scope: v.union(
      v.literal("public"),
      v.literal("authenticated"),
      v.literal("trusted")
    ),
    allowedTools: v.array(v.string()),
    allowedResources: v.array(v.string()),
    rateLimit: v.number(), // requests per minute
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_callerId", ["userId", "callerId"]),

  // Rate Limits: Sliding window counters
  rateLimits: defineTable({
    key: v.string(), // "user:{userId}:api", "key:{keyPrefix}:mcp"
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),

  // MCP Connections: Track external MCP server connections
  mcpConnections: defineTable({
    userId: v.id("users"),
    serverUrl: v.string(),
    serverName: v.string(),
    version: v.string(), // Pinned version, no "latest"
    allowedTools: v.array(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("revoked")
    ),
    lastAuditedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_status", ["userId", "status"]),

  // Agent Health: Status tracking from heartbeat
  agentHealth: defineTable({
    userId: v.id("users"),
    status: v.union(
      v.literal("active"),
      v.literal("idle"),
      v.literal("error")
    ),
    lastHeartbeat: v.number(),
    lastActivity: v.number(),
    stalledTasks: v.number(),
    expiringCredentials: v.array(v.string()),
    errorMessage: v.optional(v.string()),
    checkedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // User Schedules: Dynamic cron jobs per user
  userSchedules: defineTable({
    userId: v.id("users"),
    jobName: v.string(), // e.g. "daily_digest", "calendar_sync"
    cronId: v.optional(v.string()), // ID from @convex-dev/crons
    schedule: v.object({
      kind: v.union(v.literal("cron"), v.literal("interval")),
      cronspec: v.optional(v.string()), // e.g. "0 8 * * *"
      intervalMs: v.optional(v.number()),
    }),
    isActive: v.boolean(),
    lastRun: v.optional(v.number()),
    lastResult: v.optional(
      v.union(
        v.literal("success"),
        v.literal("failure"),
        v.literal("skipped")
      )
    ),
    nextRun: v.optional(v.number()),
    config: v.optional(v.any()), // Job-specific configuration
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_jobName", ["userId", "jobName"]),

  // LLMs.txt: Auto-generated file listing user's agents and capabilities
  // Follows llms.txt spec for AI discoverability
  llmsTxt: defineTable({
    userId: v.id("users"),
    username: v.string(), // Cached for fast lookup
    scope: v.optional(v.union(v.literal("user"), v.literal("agent"))),
    agentSlug: v.optional(v.string()),
    // Plain text version (llms.txt)
    txtContent: v.string(),
    // Markdown version (llms-full.md) with more details
    mdContent: v.string(),
    // When this was last regenerated
    generatedAt: v.number(),
    // Hash of input data to detect if regeneration needed
    contentHash: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_username", ["username"])
    .index("by_userId_and_scope", ["userId", "scope"])
    .index("by_userId_and_scope_and_agentSlug", ["userId", "scope", "agentSlug"])
    .index("by_username_and_scope", ["username", "scope"])
    .index("by_username_and_agentSlug", ["username", "agentSlug"]),

  // Webhook retry queue for transient processing failures.
  webhookRetries: defineTable({
    provider: v.union(v.literal("agentmail")),
    payload: v.string(),
    attempts: v.number(),
    maxAttempts: v.number(),
    nextAttemptAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed")
    ),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_status_nextAttemptAt", [
      "provider",
      "status",
      "nextAttemptAt",
    ]),
});
