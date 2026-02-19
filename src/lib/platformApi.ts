import { api } from "../../convex/_generated/api";

export const LLM_PROVIDERS = [
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access 400+ models with one API key",
  },
  { id: "anthropic", name: "Anthropic", description: "Claude models directly" },
  { id: "openai", name: "OpenAI", description: "GPT-4o, GPT-4 Turbo, etc." },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek chat and reasoning models via BYOK",
  },
  { id: "google", name: "Google AI", description: "Gemini models" },
  { id: "mistral", name: "Mistral", description: "Mistral models" },
  {
    id: "minimax",
    name: "MiniMax",
    description: "MiniMax open-source and reasoning models",
  },
  {
    id: "kimi",
    name: "Kimi (Moonshot)",
    description: "Kimi K2 and other Moonshot models",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    description: "Grok models for real-time X/Twitter research only",
  },
] as const;

export const INTEGRATION_SERVICES = [
  {
    id: "agentmail",
    name: "AgentMail",
    description: "Agent inbox for email communication",
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "Phone number and SMS for your agent",
  },
  {
    id: "telnyx",
    name: "Telnyx",
    description: "Voice API and global numbers for agent phone workflows",
  },
  {
    id: "plivo",
    name: "Plivo",
    description: "Voice and messaging APIs for agent communications",
  },
  {
    id: "vapi",
    name: "Vapi",
    description: "Voice agent platform for inbound and outbound calls",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "AI voice for phone calls and TTS",
  },
  {
    id: "resend",
    name: "Resend",
    description: "Transactional email notifications",
  },
] as const;

export const BROWSER_AUTOMATION_SERVICES = [
  {
    id: "firecrawl",
    name: "Firecrawl",
    description: "Web scraping and crawling for agents",
  },
  {
    id: "browserbase",
    name: "Browserbase",
    description: "Browser automation via Stagehand and Browser Use",
  },
] as const;

export const X_TWITTER_SERVICES = [
  {
    id: "xai",
    name: "xAI API",
    description:
      "Grok models with real-time X/Twitter data for analysis, research, and agent workflows",
  },
  {
    id: "twitter",
    name: "X API",
    description: "Direct X/Twitter API for posting, replying, and account management",
  },
] as const;

export type ProviderType = (typeof LLM_PROVIDERS)[number]["id"] | "custom";
export type IntegrationService = (typeof INTEGRATION_SERVICES)[number]["id"];
export type BrowserAutomationService =
  (typeof BROWSER_AUTOMATION_SERVICES)[number]["id"];
export type XTwitterService = (typeof X_TWITTER_SERVICES)[number]["id"];
export type CredentialService =
  | ProviderType
  | IntegrationService
  | BrowserAutomationService
  | XTwitterService;

export const platformApi = {
  convex: {
    auth: {
      viewer: api.functions.users.viewer,
      createProfile: api.functions.users.createProfile,
    },
    dashboard: {
      getMySkill: api.functions.skills.getMySkill,
      listConversations: api.functions.conversations.list,
      getMyFeed: api.functions.feed.getMyFeed,
    },
    settings: {
      listApiKeys: api.functions.apiKeys.list,
      createApiKey: api.functions.apiKeys.create,
      revokeApiKey: api.functions.apiKeys.revoke,
      rotateApiKey: api.functions.apiKeys.rotate,
      listCredentials: api.functions.credentials.list,
      getCredentialStatus: api.functions.credentials.getLLMProviderStatus,
      getModelCatalog: api.functions.credentials.getModelCatalog,
      refreshModelCatalog: api.functions.credentials.refreshModelCatalog,
      saveCredential: api.functions.credentials.saveApiKey,
      removeCredential: api.functions.credentials.remove,
      updateSettings: api.functions.users.updateSettings,
      deleteAccount: api.functions.users.deleteAccount,
      generateProfilePhotoUploadUrl: api.functions.users.generateProfilePhotoUploadUrl,
      setProfilePhoto: api.functions.users.setProfilePhoto,
      listSchedules: api.functions.userSchedules.list,
      createSchedule: api.functions.userSchedules.create,
      updateSchedule: api.functions.userSchedules.update,
      toggleScheduleActive: api.functions.userSchedules.toggleActive,
      removeSchedule: api.functions.userSchedules.remove,
    },
    agents: {
      list: api.functions.agents.list,
      create: api.functions.agents.create,
      update: api.functions.agents.update,
      remove: api.functions.agents.remove,
      setDefault: api.functions.agents.setDefault,
      generateAgentPhotoUploadUrl: api.functions.agents.generateAgentPhotoUploadUrl,
      setAgentPhoto: api.functions.agents.setAgentPhoto,
      listPublicByUsername: api.functions.agents.listPublicByUsername,
      getPublicDefaultByUsername: api.functions.agents.getPublicDefaultByUsername,
      getPublicByUsernameAndSlug: api.functions.agents.getPublicByUsernameAndSlug,
    },
    skills: {
      list: api.functions.skills.list,
      update: api.functions.skills.update,
      create: api.functions.skills.create,
      remove: api.functions.skills.remove,
      publish: api.functions.skills.publish,
      unpublish: api.functions.skills.unpublish,
      listSkillAgents: api.functions.skills.listSkillAgents,
      setSkillAgents: api.functions.skills.setSkillAgents,
      importSkills: api.functions.skills.importSkills,
      getPublicSkillByAgent: api.functions.skills.getPublicSkillByAgent,
    },
    conversations: {
      list: api.functions.conversations.list,
      get: api.functions.conversations.get,
      reply: api.functions.conversations.reply,
      updateStatus: api.functions.conversations.updateStatus,
      listAgentChats: api.functions.conversations.listAgentChats,
      startAgentChat: api.functions.conversations.startAgentChat,
      sendDashboardMessage: api.functions.conversations.sendDashboardMessage,
    },
    board: {
      getColumns: api.functions.board.getColumns,
      getProjects: api.functions.board.getProjects,
      getTasks: api.functions.board.getTasks,
      getArchivedTasks: api.functions.board.getArchivedTasks,
      createProject: api.functions.board.createProject,
      updateProject: api.functions.board.updateProject,
      deleteProject: api.functions.board.deleteProject,
      createTask: api.functions.board.createTask,
      createTaskFromChat: api.functions.board.createTaskFromChat,
      doNow: api.functions.board.doNow,
      moveTask: api.functions.board.moveTask,
      updateTask: api.functions.board.updateTask,
      deleteTask: api.functions.board.deleteTask,
      archiveTask: api.functions.board.archiveTask,
      unarchiveTask: api.functions.board.unarchiveTask,
      archiveCompletedTasks: api.functions.board.archiveCompletedTasks,
      deleteArchivedTasks: api.functions.board.deleteArchivedTasks,
      addTaskComment: api.functions.board.addTaskComment,
      getTaskComments: api.functions.board.getTaskComments,
      generateTaskAttachmentUploadUrl:
        api.functions.board.generateTaskAttachmentUploadUrl,
      addTaskAttachment: api.functions.board.addTaskAttachment,
      getTaskAttachments: api.functions.board.getTaskAttachments,
      ensureDefaultColumns: api.functions.board.ensureDefaultColumns,
      getPublicTasks: api.functions.board.getPublicTasks,
      getOutcomeFileUrl: api.functions.board.getOutcomeFileUrl,
      getOutcomeAudioUrl: api.functions.board.getOutcomeAudioUrl,
      getSubtasks: api.functions.board.getSubtasks,
      getWorkflowSteps: api.functions.board.getWorkflowSteps,
    },
    feed: {
      getMyFeed: api.functions.feed.getMyFeed,
      getPublicFeed: api.functions.feed.getPublicFeed,
      getGlobalPublicFeed: api.functions.feed.getGlobalPublicFeed,
      createPost: api.functions.feed.createPost,
      updatePost: api.functions.feed.updatePost,
      hidePost: api.functions.feed.hidePost,
      unhidePost: api.functions.feed.unhidePost,
      archivePost: api.functions.feed.archivePost,
      unarchivePost: api.functions.feed.unarchivePost,
      deletePost: api.functions.feed.deletePost,
    },
    a2a: {
      getInboxThreads: api.functions.a2a.getInboxThreads,
      getOutboxThreads: api.functions.a2a.getOutboxThreads,
      getThreadMessages: api.functions.a2a.getThreadMessages,
      sendFromDashboard: api.functions.a2a.sendFromDashboard,
      summarizeThread: api.functions.a2a.summarizeThread,
    },
    docs: {
      getSitemapContent: api.functions.agentDocs.getSitemapContent,
      getApiDocsContent: api.functions.agentDocs.getApiDocsContent,
      getToolsDocsContent: api.functions.agentDocs.getToolsDocsContent,
      getOpenApiContent: api.functions.agentDocs.getOpenApiContent,
      getLlmsByUsername: api.functions.llmsTxt.getByUsername,
    },
    admin: {
      isAdmin: api.functions.admin.isAdmin,
      getDashboardStats: api.functions.admin.getDashboardStats,
      listUsers: api.functions.admin.listUsers,
    },
    security: {
      getSecurityEvents: api.functions.auditLog.getSecurityEvents,
      exportSecurityCsv: api.functions.auditLog.exportCsv,
      getRateLimitDashboard: api.functions.rateLimits.getDashboard,
    },
    connectedApps: {
      getPublicByUsername: api.functions.connectedApps.getPublicByUsername,
    },
    thinking: {
      getAgentThoughts: api.functions.agentThinking.getAgentThoughts,
    },
    users: {
      getByUsername: api.functions.users.getByUsername,
    },
  },
  http: {
    paths: {
      sendMessageByUsername: (username: string) =>
        `/api/v1/agents/${username}/messages`,
      sendMessageBySlug: (username: string, slug: string) =>
        `/api/v1/agents/${username}/${slug}/messages`,
      getAgentByUsername: (username: string) => `/api/v1/agents/${username}`,
      getAgentBySlug: (username: string, slug: string) =>
        `/api/v1/agents/${username}/${slug}`,
      docsMd: (username: string) => `/api/v1/agents/${username}/docs.md`,
      toolsMd: (username: string) => `/api/v1/agents/${username}/tools.md`,
      openApiJson: (username: string) =>
        `/api/v1/agents/${username}/openapi.json`,
      sitemapMd: (username: string) => `/${username}/sitemap.md`,
      llmsTxt: (username: string) => `/${username}/llms.txt`,
      llmsFullMd: (username: string) => `/${username}/llms-full.md`,
      llmsTxtByAgent: (username: string, slug: string) =>
        `/${username}/${slug}/llms.txt`,
      llmsFullMdByAgent: (username: string, slug: string) =>
        `/${username}/${slug}/llms-full.md`,
      mcpByUsername: (username: string) => `/mcp/u/${username}`,
      mcpBySlug: (username: string, slug: string) => `/mcp/u/${username}/${slug}`,
    },
  },
} as const;
