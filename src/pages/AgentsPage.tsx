import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Doc, Id } from "../../convex/_generated/dataModel";
import {
  Robot,
  Brain,
  Lightning,
  ChatCircleDots,
  UserCircle,
} from "@phosphor-icons/react";
import { notify } from "../lib/notify";

// Agent type from schema
type Agent = Doc<"agents">;

// LLM provider options
const LLM_PROVIDERS = [
  { id: "openrouter", name: "OpenRouter" },
  { id: "anthropic", name: "Anthropic" },
  { id: "openai", name: "OpenAI" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "google", name: "Google AI" },
  { id: "mistral", name: "Mistral" },
  { id: "minimax", name: "MiniMax" },
  { id: "kimi", name: "Kimi (Moonshot)" },
  { id: "xai", name: "xAI (Grok)" },
] as const;

type ProviderType = (typeof LLM_PROVIDERS)[number]["id"] | "custom";

const MAX_AGENT_PHOTO_SIZE_BYTES = 3 * 1024 * 1024;

type ProviderModelReference = {
  id: ProviderType;
  name: string;
  docsUrl: string;
  examples: Array<string>;
};

type OpenRouterModel = {
  id: string;
  name?: string;
  description?: string;
};

// Keep this map in sync with LLM_PROVIDERS when adding/removing providers.
// Future update: if we add a backend proxy endpoint for model catalogs, switch docsUrl
// and live-fetch code to use that endpoint to avoid browser CORS/rate-limit issues.
const PROVIDER_MODEL_REFERENCES: Array<ProviderModelReference> = [
  {
    id: "openrouter",
    name: "OpenRouter",
    docsUrl: "https://openrouter.ai/models",
    examples: ["anthropic/claude-sonnet-4", "openai/gpt-4o", "google/gemini-2.0-flash-001"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
    examples: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-latest"],
  },
  {
    id: "openai",
    name: "OpenAI",
    docsUrl: "https://platform.openai.com/docs/models",
    examples: ["gpt-4o", "gpt-4.1-mini", "o3-mini"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    docsUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    examples: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "google",
    name: "Google AI",
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
    examples: ["gemini-2.0-flash", "gemini-1.5-pro"],
  },
  {
    id: "mistral",
    name: "Mistral",
    docsUrl: "https://docs.mistral.ai/getting-started/models/models_overview/",
    examples: ["mistral-large-latest", "ministral-8b-latest"],
  },
  {
    id: "minimax",
    name: "MiniMax",
    docsUrl: "https://www.minimaxi.com/platform",
    examples: ["abab6.5s-chat"],
  },
  {
    id: "kimi",
    name: "Kimi (Moonshot)",
    docsUrl: "https://platform.moonshot.ai/docs/guide/start-using-kimi-api",
    examples: ["kimi-k2-0711-preview"],
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    docsUrl: "https://docs.x.ai/docs/models",
    examples: ["grok-2-1212", "grok-beta"],
  },
] as const;

const AGENT_ICON_OPTIONS: Array<{
  id: string;
  label: string;
  Icon: typeof Robot;
}> = [
  { id: "robot", label: "Robot", Icon: Robot },
  { id: "brain", label: "Brain", Icon: Brain },
  { id: "lightning", label: "Lightning", Icon: Lightning },
  { id: "chat", label: "Chat", Icon: ChatCircleDots },
  { id: "user", label: "User", Icon: UserCircle },
];

export function AgentsPage() {
  const agents = useQuery(api.functions.agents.list);
  const credentials = useQuery(api.functions.credentials.getLLMProviderStatus);
  const createAgent = useMutation(api.functions.agents.create);
  const updateAgent = useMutation(api.functions.agents.update);
  const deleteAgent = useMutation(api.functions.agents.remove);
  const setDefaultAgent = useMutation(api.functions.agents.setDefault);
  const generateAgentPhotoUploadUrl = useMutation(
    api.functions.agents.generateAgentPhotoUploadUrl
  );
  const setAgentPhoto = useMutation(api.functions.agents.setAgentPhoto);

  // Create agent form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentSlug, setNewAgentSlug] = useState("");
  const [newAgentDescription, setNewAgentDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit agent form
  const [editingAgent, setEditingAgent] = useState<Id<"agents"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIcon, setEditIcon] = useState("robot");
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [editConnectShowApi, setEditConnectShowApi] = useState(true);
  const [editConnectShowMcp, setEditConnectShowMcp] = useState(true);
  const [editConnectShowEmail, setEditConnectShowEmail] = useState(true);
  const [editConnectShowSkillFile, setEditConnectShowSkillFile] = useState(true);
  const [editA2aEnabled, setEditA2aEnabled] = useState(false);
  const [editA2aAllowPublicAgents, setEditA2aAllowPublicAgents] = useState(false);
  const [editA2aAutoRespond, setEditA2aAutoRespond] = useState(true);
  const [editA2aMaxAutoReplyHops, setEditA2aMaxAutoReplyHops] = useState(2);
  const [editProvider, setEditProvider] = useState<ProviderType>("openrouter");
  const [editModel, setEditModel] = useState("");
  const [editAgentEmail, setEditAgentEmail] = useState("");
  const [editAgentPhone, setEditAgentPhone] = useState("");
  const [editPhoneSmsEnabled, setEditPhoneSmsEnabled] = useState(true);
  const [editPhoneVoiceEnabled, setEditPhoneVoiceEnabled] = useState(true);
  // ElevenLabs voice settings
  const [editVoiceProvider, setEditVoiceProvider] = useState<"elevenlabs" | "openai">("openai");
  const [editElevenLabsVoiceId, setEditElevenLabsVoiceId] = useState("");
  const [editOpenaiVoice, setEditOpenaiVoice] = useState("nova");
  // Personality settings
  const [editPersonalityTone, setEditPersonalityTone] = useState("friendly");
  const [editPersonalitySpeakingStyle, setEditPersonalitySpeakingStyle] = useState("conversational");
  const [editPersonalityInstructions, setEditPersonalityInstructions] = useState("");
  // Scheduling settings
  const [editSchedulingMode, setEditSchedulingMode] = useState<"manual" | "auto" | "cron">("manual");
  const [editSchedulingCronSpec, setEditSchedulingCronSpec] = useState("");
  const [editSchedulingActive, setEditSchedulingActive] = useState(false);
  // Thinking settings
  const [editThinkingEnabled, setEditThinkingEnabled] = useState(false);
  const [editThinkingPaused, setEditThinkingPaused] = useState(false);
  const [editThinkingGoal, setEditThinkingGoal] = useState("");
  // Browser automation
  const [editFirecrawlEnabled, setEditFirecrawlEnabled] = useState(false);
  const [editStagehandEnabled, setEditStagehandEnabled] = useState(false);
  const [editBrowserUseEnabled, setEditBrowserUseEnabled] = useState(false);
  // X/Twitter integration
  const [editXEnabled, setEditXEnabled] = useState(false);
  const [editXMode, setEditXMode] = useState<"xai_grok" | "x_api">("xai_grok");
  const [editXAccountType, setEditXAccountType] = useState<"agent" | "user">("user");
  const [editXUsername, setEditXUsername] = useState("");
  const [editXCanPost, setEditXCanPost] = useState(false);
  const [editXCanReply, setEditXCanReply] = useState(false);
  const [editXCanSearch, setEditXCanSearch] = useState(true);
  const [editXCanAnalyze, setEditXCanAnalyze] = useState(true);
  const [editXCanMonitor, setEditXCanMonitor] = useState(true);
  const [editXAutoPostEnabled, setEditXAutoPostEnabled] = useState(false);
  const [editXAutoPostRequireApproval, setEditXAutoPostRequireApproval] = useState(true);
  const [showModelHelpModal, setShowModelHelpModal] = useState(false);
  const [openRouterModels, setOpenRouterModels] = useState<Array<OpenRouterModel>>([]);
  const [isLoadingOpenRouterModels, setIsLoadingOpenRouterModels] = useState(false);
  const [openRouterModelLoadError, setOpenRouterModelLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Check if various services are configured
  const hasTwilioKey = credentials?.twilio?.configured ?? false;
  const hasElevenLabsKey = credentials?.elevenlabs?.configured ?? false;
  const hasFirecrawlKey = credentials?.firecrawl?.configured ?? false;
  const hasBrowserbaseKey = credentials?.browserbase?.configured ?? false;
  const hasXaiKey = credentials?.xai?.configured ?? false;
  const hasTwitterKey = credentials?.twitter?.configured ?? false;

  // Auto-generate slug from name
  function handleNameChange(name: string) {
    setNewAgentName(name);
    setNewAgentSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }

  function getIconOptionById(iconId?: string | null) {
    return AGENT_ICON_OPTIONS.find((option) => option.id === iconId) ?? AGENT_ICON_OPTIONS[0]!;
  }

  function renderAgentAvatar(agent: Agent) {
    const iconOption = getIconOptionById((agent as { icon?: string }).icon);
    const Icon = iconOption.Icon;

    if (agent.image) {
      return (
        <img
          src={agent.image}
          alt={`${agent.name} avatar`}
          className="h-12 w-12 rounded-xl border border-surface-3 object-cover"
        />
      );
    }

    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-surface-3 bg-surface-1 text-ink-1">
        <Icon size={24} weight="duotone" />
      </div>
    );
  }

  async function handleCreateAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!newAgentName.trim() || !newAgentSlug.trim()) return;

    setCreating(true);
    try {
      await createAgent({
        name: newAgentName.trim(),
        slug: newAgentSlug.trim(),
        description: newAgentDescription.trim() || undefined,
      });
      setShowCreateForm(false);
      setNewAgentName("");
      setNewAgentSlug("");
      setNewAgentDescription("");
      notify.success("Agent created");
    } catch (error) {
      notify.error("Could not create agent", error);
    } finally {
      setCreating(false);
    }
  }

  function startEditing(agent: NonNullable<typeof agents>[number]) {
    setEditingAgent(agent._id);
    setEditName(agent.name);
    setEditDescription(agent.description || "");
    setEditIcon((agent as { icon?: string }).icon || "robot");
    setEditIsPublic(agent.isPublic);
    const publicConnect = (agent as {
      publicConnect?: {
        showApi?: boolean;
        showMcp?: boolean;
        showEmail?: boolean;
        showSkillFile?: boolean;
      };
    }).publicConnect;
    setEditConnectShowApi(publicConnect?.showApi ?? true);
    setEditConnectShowMcp(publicConnect?.showMcp ?? true);
    setEditConnectShowEmail(publicConnect?.showEmail ?? true);
    setEditConnectShowSkillFile(publicConnect?.showSkillFile ?? true);
    const a2aConfig = (agent as {
      a2aConfig?: {
        enabled?: boolean;
        allowPublicAgents?: boolean;
        autoRespond?: boolean;
        maxAutoReplyHops?: number;
      };
    }).a2aConfig;
    setEditA2aEnabled(a2aConfig?.enabled ?? false);
    setEditA2aAllowPublicAgents(a2aConfig?.allowPublicAgents ?? false);
    setEditA2aAutoRespond(a2aConfig?.autoRespond ?? true);
    setEditA2aMaxAutoReplyHops(a2aConfig?.maxAutoReplyHops ?? 2);
    setEditProvider((agent.llmConfig?.provider as ProviderType) || "openrouter");
    setEditModel(agent.llmConfig?.model || "anthropic/claude-sonnet-4");
    setEditAgentEmail(agent.agentEmail || "");
    setEditAgentPhone(agent.agentPhone || "");
    // Phone config
    const phoneConfig = (agent as { phoneConfig?: { voiceEnabled?: boolean; smsEnabled?: boolean } }).phoneConfig;
    setEditPhoneVoiceEnabled(phoneConfig?.voiceEnabled ?? true);
    setEditPhoneSmsEnabled(phoneConfig?.smsEnabled ?? true);
    // Voice config
    const voiceConfig = (agent as { voiceConfig?: { provider?: string; voiceId?: string; openaiVoice?: string } }).voiceConfig;
    setEditVoiceProvider((voiceConfig?.provider as "elevenlabs" | "openai") || "openai");
    setEditElevenLabsVoiceId(voiceConfig?.voiceId || "");
    setEditOpenaiVoice(voiceConfig?.openaiVoice || "nova");
    // Personality config
    const personality = (agent as { personality?: { tone?: string; speakingStyle?: string; customInstructions?: string } }).personality;
    setEditPersonalityTone(personality?.tone || "friendly");
    setEditPersonalitySpeakingStyle(personality?.speakingStyle || "conversational");
    setEditPersonalityInstructions(personality?.customInstructions || "");
    // Scheduling config
    const scheduling = (agent as { scheduling?: { mode?: string; cronSpec?: string; isActive?: boolean } }).scheduling;
    setEditSchedulingMode((scheduling?.mode as "manual" | "auto" | "cron") || "manual");
    setEditSchedulingCronSpec(scheduling?.cronSpec || "");
    setEditSchedulingActive(scheduling?.isActive ?? false);
    // Thinking config
    const thinking = (agent as { thinking?: { enabled?: boolean; isPaused?: boolean; currentGoal?: string } }).thinking;
    setEditThinkingEnabled(thinking?.enabled ?? false);
    setEditThinkingPaused(thinking?.isPaused ?? false);
    setEditThinkingGoal(thinking?.currentGoal || "");
    // Browser automation config
    const browserAutomation = (agent as { browserAutomation?: { firecrawlEnabled?: boolean; stagehandEnabled?: boolean; browserUseEnabled?: boolean } }).browserAutomation;
    setEditFirecrawlEnabled(browserAutomation?.firecrawlEnabled ?? false);
    setEditStagehandEnabled(browserAutomation?.stagehandEnabled ?? false);
    setEditBrowserUseEnabled(browserAutomation?.browserUseEnabled ?? false);
    // X/Twitter config
    const xConfig = (agent as { xConfig?: { enabled?: boolean; mode?: string; accountType?: string; xUsername?: string; capabilities?: { canPost?: boolean; canReply?: boolean; canSearch?: boolean; canAnalyze?: boolean; canMonitor?: boolean }; autoPost?: { enabled?: boolean; requireApproval?: boolean } } }).xConfig;
    setEditXEnabled(xConfig?.enabled ?? false);
    setEditXMode((xConfig?.mode as "xai_grok" | "x_api") || "xai_grok");
    setEditXAccountType((xConfig?.accountType as "agent" | "user") || "user");
    setEditXUsername(xConfig?.xUsername || "");
    setEditXCanPost(xConfig?.capabilities?.canPost ?? false);
    setEditXCanReply(xConfig?.capabilities?.canReply ?? false);
    setEditXCanSearch(xConfig?.capabilities?.canSearch ?? true);
    setEditXCanAnalyze(xConfig?.capabilities?.canAnalyze ?? true);
    setEditXCanMonitor(xConfig?.capabilities?.canMonitor ?? true);
    setEditXAutoPostEnabled(xConfig?.autoPost?.enabled ?? false);
    setEditXAutoPostRequireApproval(xConfig?.autoPost?.requireApproval ?? true);
    setPhotoError(null);
  }

  async function handleSaveAgent() {
    if (!editingAgent) return;
    setSaving(true);
    try {
      await updateAgent({
        agentId: editingAgent,
        name: editName.trim() || undefined,
        description: editDescription.trim() || undefined,
        icon: editIcon,
        isPublic: editIsPublic,
        publicConnect: {
          showApi: editConnectShowApi,
          showMcp: editConnectShowMcp,
          showEmail: editConnectShowEmail,
          showSkillFile: editConnectShowSkillFile,
        },
        a2aConfig: {
          enabled: editA2aEnabled,
          allowPublicAgents: editA2aAllowPublicAgents,
          autoRespond: editA2aAutoRespond,
          maxAutoReplyHops: Math.max(0, Math.min(8, editA2aMaxAutoReplyHops)),
        },
        llmConfig: {
          provider: editProvider,
          model: editModel,
          tokensUsedThisMonth: 0,
          tokenBudget: 100000,
        },
        agentEmail: editAgentEmail.trim() || undefined,
        agentPhone: editAgentPhone.trim() || undefined,
        // Phone config (without voice, voice is now in voiceConfig)
        phoneConfig: editAgentPhone.trim()
          ? {
              voiceEnabled: editPhoneVoiceEnabled,
              smsEnabled: editPhoneSmsEnabled,
              transcribeVoicemail: true,
            }
          : undefined,
        // Voice config for TTS (ElevenLabs or OpenAI)
        voiceConfig: {
          provider: editVoiceProvider,
          voiceId: editVoiceProvider === "elevenlabs" ? editElevenLabsVoiceId : undefined,
          openaiVoice: editOpenaiVoice,
        },
        // Personality settings
        personality: {
          tone: editPersonalityTone,
          speakingStyle: editPersonalitySpeakingStyle,
          customInstructions: editPersonalityInstructions.trim() || undefined,
        },
        // Scheduling settings
        scheduling: {
          mode: editSchedulingMode,
          cronSpec: editSchedulingCronSpec.trim() || undefined,
          isActive: editSchedulingActive,
        },
        // Thinking settings
        thinking: {
          enabled: editThinkingEnabled,
          isPaused: editThinkingPaused,
          currentGoal: editThinkingGoal.trim() || undefined,
        },
        // Browser automation settings
        browserAutomation: {
          firecrawlEnabled: editFirecrawlEnabled,
          stagehandEnabled: editStagehandEnabled,
          browserUseEnabled: editBrowserUseEnabled,
        },
        // X/Twitter integration settings
        xConfig: {
          enabled: editXEnabled,
          mode: editXMode,
          accountType: editXAccountType,
          xUsername: editXUsername.trim() || undefined,
          capabilities: {
            canPost: editXCanPost,
            canReply: editXCanReply,
            canLike: false,
            canRetweet: false,
            canDM: false,
            canSearch: editXCanSearch,
            canAnalyze: editXCanAnalyze,
            canMonitor: editXCanMonitor,
          },
          autoPost: {
            enabled: editXAutoPostEnabled,
            requireApproval: editXAutoPostRequireApproval,
          },
        },
      });
      setEditingAgent(null);
      notify.success("Agent updated");
    } catch (error) {
      notify.error("Could not update agent", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleAgentPhotoChange(
    file: File | null,
    input: HTMLInputElement
  ) {
    if (!editingAgent || !file) return;
    setPhotoError(null);

    if (!file.type.startsWith("image/")) {
      const message = "Please select an image file.";
      setPhotoError(message);
      notify.warning("Invalid file", message);
      input.value = "";
      return;
    }

    if (file.size > MAX_AGENT_PHOTO_SIZE_BYTES) {
      const message = "Image must be under 3MB.";
      setPhotoError(message);
      notify.warning("Image too large", message);
      input.value = "";
      return;
    }

    setPhotoUploading(true);
    try {
      const uploadUrl = await generateAgentPhotoUploadUrl({});
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      const uploadResult = (await uploadResponse.json()) as {
        storageId?: string;
      };
      if (!uploadResult.storageId) {
        throw new Error("Upload did not return a storage id");
      }

      await setAgentPhoto({
        agentId: editingAgent,
        storageId: uploadResult.storageId as Id<"_storage">,
      });
      notify.success("Agent photo updated");
    } catch (error) {
      console.error("Failed to upload agent photo:", error);
      setPhotoError("Could not upload photo. Please try again.");
      notify.error("Could not upload photo", error);
    } finally {
      setPhotoUploading(false);
      input.value = "";
    }
  }

  async function handleDeleteAgent(agentId: Id<"agents">) {
    notify.confirmAction({
      title: "Delete this agent?",
      description: "This also deletes all associated skills.",
      buttonTitle: "Delete",
      onConfirm: async () => {
        try {
          await deleteAgent({ agentId });
          notify.success("Agent deleted");
        } catch (error) {
          notify.error("Could not delete agent", error);
        }
      },
    });
  }

  async function handleSetDefault(agentId: Id<"agents">) {
    try {
      await setDefaultAgent({ agentId });
      notify.success("Default agent updated");
    } catch (error) {
      notify.error("Could not set default agent", error);
    }
  }

  async function openModelHelpModal() {
    setShowModelHelpModal(true);

    // Keep the first successful response in memory for this page session.
    if (openRouterModels.length > 0 || isLoadingOpenRouterModels) return;

    setIsLoadingOpenRouterModels(true);
    setOpenRouterModelLoadError(null);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { data?: Array<OpenRouterModel> };
      setOpenRouterModels(payload.data ?? []);
    } catch (error) {
      console.error("Failed to load OpenRouter model catalog:", error);
      setOpenRouterModelLoadError(
        "Could not load live model catalog right now. Use provider docs links below."
      );
    } finally {
      setIsLoadingOpenRouterModels(false);
    }
  }

  if (!agents) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink-0">Agents</h1>
            <p className="mt-1 text-ink-1">
              Create multiple agents for different purposes. Each agent can have its own LLM, skills, email, and phone.
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn-accent"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New agent
          </button>
        </div>

        {/* Create form */}
        {showCreateForm && (
          <form onSubmit={handleCreateAgent} className="mt-6 card">
            <h2 className="font-semibold text-ink-0">Create new agent</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-0">Name</label>
                <input
                  type="text"
                  value={newAgentName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="input mt-1.5"
                  placeholder="e.g., Work Assistant, Personal Agent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-0">Slug</label>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-sm text-ink-2">humanai.gent/username/</span>
                  <input
                    type="text"
                    value={newAgentSlug}
                    onChange={(e) => setNewAgentSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    className="input flex-1"
                    placeholder="work"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-ink-2">URL-safe identifier for this agent</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-0">Description (optional)</label>
                <textarea
                  value={newAgentDescription}
                  onChange={(e) => setNewAgentDescription(e.target.value)}
                  className="input mt-1.5 resize-none"
                  rows={2}
                  placeholder="What does this agent do?"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={creating} className="btn-accent">
                {creating ? "Creating..." : "Create agent"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Agent list */}
        <div className="mt-6 space-y-4">
          {agents.length === 0 ? (
            <div className="card text-center py-12">
              <svg className="mx-auto h-12 w-12 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="mt-4 font-medium text-ink-0">No agents yet</p>
              <p className="mt-1 text-sm text-ink-1">Create your first agent to get started</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="btn-accent mt-4"
              >
                Create agent
              </button>
            </div>
          ) : (
            agents.map((agent: Agent) => (
              <div key={agent._id} className="card">
                {editingAgent === agent._id ? (
                  // Edit mode
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-ink-0">Edit agent</h3>
                      <button
                        onClick={() => setEditingAgent(null)}
                        className="rounded p-1 text-ink-2 hover:bg-surface-2"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-ink-0">Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="input mt-1.5"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-0">Description</label>
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="input mt-1.5"
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
                      <h4 className="text-sm font-medium text-ink-0">Agent profile</h4>
                      <p className="mt-1 text-xs text-ink-2">
                        Choose a Phosphor icon and optional photo (under 3MB).
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        {agent.image ? (
                          <img
                            src={agent.image}
                            alt={`${agent.name} avatar`}
                            className="h-14 w-14 rounded-xl border border-surface-3 object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-surface-3 bg-surface-2 text-ink-1">
                            {(() => {
                              const Icon = getIconOptionById(editIcon).Icon;
                              return <Icon size={30} weight="duotone" />;
                            })()}
                          </div>
                        )}
                        <div>
                          <label className="btn-secondary text-sm cursor-pointer">
                            {photoUploading ? "Uploading..." : "Upload photo"}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={photoUploading}
                              className="hidden"
                              onChange={(e) =>
                                void handleAgentPhotoChange(
                                  e.target.files?.[0] ?? null,
                                  e.currentTarget
                                )
                              }
                            />
                          </label>
                          <p className="mt-1 text-xs text-ink-2">PNG, JPG, or WebP under 3MB.</p>
                          {photoError ? <p className="mt-1 text-xs text-red-500">{photoError}</p> : null}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-5 gap-2">
                        {AGENT_ICON_OPTIONS.map((option) => {
                          const Icon = option.Icon;
                          const selected = editIcon === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setEditIcon(option.id)}
                              className={`flex h-12 items-center justify-center rounded-lg border transition-colors ${
                                selected
                                  ? "border-accent bg-accent/10 text-accent"
                                  : "border-surface-3 bg-surface-0 text-ink-1 hover:bg-surface-2"
                              }`}
                              title={option.label}
                            >
                              <Icon size={22} weight={selected ? "fill" : "duotone"} />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Visibility toggle */}
                    <div className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-1 p-4">
                      <div>
                        <label className="block text-sm font-medium text-ink-0">Public agent</label>
                        <p className="text-xs text-ink-2 mt-0.5">
                          Allow others to see this agent on your profile
                        </p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={editIsPublic}
                          onChange={(e) => setEditIsPublic(e.target.checked)}
                          className="peer sr-only"
                        />
                        <div className="h-6 w-11 rounded-full bg-surface-3 peer-checked:bg-accent peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/20 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-surface-3 after:bg-white after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                      </label>
                    </div>

                    <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
                      <h4 className="text-sm font-medium text-ink-0">Public connect settings</h4>
                      <p className="text-xs text-ink-2 mt-0.5">
                        Control which endpoints appear on this agent's public profile card.
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editConnectShowApi}
                            onChange={(e) => setEditConnectShowApi(e.target.checked)}
                            className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                          />
                          <span className="text-sm text-ink-0">Show agent API</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editConnectShowMcp}
                            onChange={(e) => setEditConnectShowMcp(e.target.checked)}
                            className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                          />
                          <span className="text-sm text-ink-0">Show agent MCP</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editConnectShowEmail}
                            onChange={(e) => setEditConnectShowEmail(e.target.checked)}
                            className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                          />
                          <span className="text-sm text-ink-0">Show agent email</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editConnectShowSkillFile}
                            onChange={(e) => setEditConnectShowSkillFile(e.target.checked)}
                            className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                          />
                          <span className="text-sm text-ink-0">Show skill file</span>
                        </label>
                      </div>
                    </div>

                    <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
                      <h4 className="text-sm font-medium text-ink-0">Agent to agent settings</h4>
                      <p className="text-xs text-ink-2 mt-0.5">
                        Configure whether this agent can participate in agent to agent conversations.
                      </p>
                      <div className="mt-3 space-y-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editA2aEnabled}
                            onChange={(e) => setEditA2aEnabled(e.target.checked)}
                            className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                          />
                          <span className="text-sm text-ink-0">Enable agent to agent messaging</span>
                        </label>
                        {editA2aEnabled && (
                          <>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={editA2aAllowPublicAgents}
                                onChange={(e) => setEditA2aAllowPublicAgents(e.target.checked)}
                                className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                              />
                              <span className="text-sm text-ink-0">Allow public external agents to initiate conversations</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={editA2aAutoRespond}
                                onChange={(e) => setEditA2aAutoRespond(e.target.checked)}
                                className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                              />
                              <span className="text-sm text-ink-0">Auto respond to inbound agent messages</span>
                            </label>
                            <div>
                              <label className="block text-sm text-ink-1">Max auto reply hops</label>
                              <input
                                type="number"
                                min={0}
                                max={8}
                                value={editA2aMaxAutoReplyHops}
                                onChange={(e) => setEditA2aMaxAutoReplyHops(Number(e.target.value || 0))}
                                className="input mt-1 w-28"
                              />
                              <p className="mt-1 text-xs text-ink-2">
                                Prevents infinite loops by capping nested agent handoffs.
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-surface-3 pt-4">
                      <h4 className="text-sm font-medium text-ink-0">LLM Configuration (BYOK)</h4>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm text-ink-1">Provider</label>
                          <select
                            value={editProvider}
                            onChange={(e) => setEditProvider(e.target.value as ProviderType)}
                            className="input mt-1"
                          >
                            {LLM_PROVIDERS.map((p) => {
                              const hasKey = credentials?.[p.id]?.configured;
                              return (
                                <option key={p.id} value={p.id}>
                                  {p.name} {hasKey ? "(key configured)" : "(needs BYOK)"}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="block text-sm text-ink-1">Model</label>
                            <button
                              type="button"
                              onClick={() => void openModelHelpModal()}
                              className="text-xs text-accent hover:underline"
                            >
                              Model help
                            </button>
                          </div>
                          <input
                            type="text"
                            value={editModel}
                            onChange={(e) => setEditModel(e.target.value)}
                            className="input mt-1"
                            placeholder="gpt-4o or glm-5"
                          />
                          <p className="mt-1 text-xs text-ink-2">
                            Supports provider-native model names, including `glm-5` with OpenAI-compatible endpoints.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-surface-3 pt-4">
                      <h4 className="text-sm font-medium text-ink-0">Communication</h4>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm text-ink-1">Agent Email (AgentMail)</label>
                          <input
                            type="email"
                            value={editAgentEmail}
                            onChange={(e) => setEditAgentEmail(e.target.value)}
                            className="input mt-1"
                            placeholder="agent@humanai.gent"
                          />
                          <p className="mt-1 text-xs text-ink-2">
                            {credentials?.agentmail?.configured
                              ? "AgentMail configured"
                              : "Configure your AgentMail API key in Settings"}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm text-ink-1">Agent Phone Number (Twilio)</label>
                          <input
                            type="tel"
                            value={editAgentPhone}
                            onChange={(e) => setEditAgentPhone(e.target.value)}
                            className="input mt-1"
                            placeholder="+1 (555) 123-4567"
                            disabled={!hasTwilioKey}
                          />
                          {!hasTwilioKey ? (
                            <p className="mt-1 text-xs text-amber-500">
                              Configure your Twilio API key in Settings first
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-ink-2">
                              Enter your Twilio phone number or provision one below
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Phone configuration (only shown if Twilio is configured) */}
                      {hasTwilioKey && editAgentPhone && (
                        <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 p-4">
                          <h4 className="text-sm font-medium text-ink-0">Phone Settings</h4>
                          <div className="mt-3 flex flex-wrap gap-4">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={editPhoneVoiceEnabled}
                                onChange={(e) => setEditPhoneVoiceEnabled(e.target.checked)}
                                className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                              />
                              <span className="text-sm text-ink-0">Enable voice calls</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={editPhoneSmsEnabled}
                                onChange={(e) => setEditPhoneSmsEnabled(e.target.checked)}
                                className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                              />
                              <span className="text-sm text-ink-0">Enable SMS messaging</span>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Voice configuration (ElevenLabs or OpenAI) */}
                      <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 p-4">
                        <h4 className="text-sm font-medium text-ink-0">Voice Settings (TTS)</h4>
                        <p className="text-xs text-ink-2 mt-1">Configure the voice for phone calls and text-to-speech</p>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm text-ink-1">Voice Provider</label>
                            <select
                              value={editVoiceProvider}
                              onChange={(e) => setEditVoiceProvider(e.target.value as "elevenlabs" | "openai")}
                              className="input mt-1"
                            >
                              <option value="openai">OpenAI TTS {!credentials?.openai?.configured && "(default)"}</option>
                              <option value="elevenlabs">
                                ElevenLabs {hasElevenLabsKey ? "(configured)" : "(needs BYOK)"}
                              </option>
                            </select>
                          </div>
                          {editVoiceProvider === "openai" ? (
                            <div>
                              <label className="block text-sm text-ink-1">OpenAI Voice</label>
                              <select
                                value={editOpenaiVoice}
                                onChange={(e) => setEditOpenaiVoice(e.target.value)}
                                className="input mt-1"
                              >
                                <option value="alloy">Alloy (Neutral)</option>
                                <option value="echo">Echo (Male)</option>
                                <option value="fable">Fable (British)</option>
                                <option value="onyx">Onyx (Deep male)</option>
                                <option value="nova">Nova (Female)</option>
                                <option value="shimmer">Shimmer (Soft female)</option>
                              </select>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-sm text-ink-1">ElevenLabs Voice ID</label>
                              <input
                                type="text"
                                value={editElevenLabsVoiceId}
                                onChange={(e) => setEditElevenLabsVoiceId(e.target.value)}
                                className="input mt-1"
                                placeholder="e.g., EXAVITQu4vr4xnSDxMaL"
                                disabled={!hasElevenLabsKey}
                              />
                              {!hasElevenLabsKey && (
                                <p className="mt-1 text-xs text-amber-500">
                                  Configure your ElevenLabs API key in Settings
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Personality settings */}
                      <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 p-4">
                        <h4 className="text-sm font-medium text-ink-0">Personality</h4>
                        <p className="text-xs text-ink-2 mt-1">Customize how your agent communicates</p>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm text-ink-1">Tone</label>
                            <select
                              value={editPersonalityTone}
                              onChange={(e) => setEditPersonalityTone(e.target.value)}
                              className="input mt-1"
                            >
                              <option value="friendly">Friendly</option>
                              <option value="professional">Professional</option>
                              <option value="casual">Casual</option>
                              <option value="formal">Formal</option>
                              <option value="enthusiastic">Enthusiastic</option>
                              <option value="calm">Calm</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm text-ink-1">Speaking Style</label>
                            <select
                              value={editPersonalitySpeakingStyle}
                              onChange={(e) => setEditPersonalitySpeakingStyle(e.target.value)}
                              className="input mt-1"
                            >
                              <option value="conversational">Conversational</option>
                              <option value="concise">Concise</option>
                              <option value="detailed">Detailed</option>
                              <option value="storytelling">Storytelling</option>
                            </select>
                          </div>
                        </div>
                        <div className="mt-4">
                          <label className="block text-sm text-ink-1">Custom Instructions (optional)</label>
                          <textarea
                            value={editPersonalityInstructions}
                            onChange={(e) => setEditPersonalityInstructions(e.target.value)}
                            className="input mt-1 resize-none"
                            rows={3}
                            placeholder="Add specific instructions for how this agent should behave, respond, or handle certain topics..."
                          />
                        </div>
                      </div>

                      {/* Scheduling settings */}
                      <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 p-4">
                        <h4 className="text-sm font-medium text-ink-0">Scheduling</h4>
                        <p className="text-xs text-ink-2 mt-1">Configure when this agent runs automatically</p>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm text-ink-1">Run Mode</label>
                            <select
                              value={editSchedulingMode}
                              onChange={(e) => setEditSchedulingMode(e.target.value as "manual" | "auto" | "cron")}
                              className="input mt-1"
                            >
                              <option value="manual">Manual (only when triggered)</option>
                              <option value="auto">Auto (runs based on triggers)</option>
                              <option value="cron">Cron (scheduled)</option>
                            </select>
                          </div>
                          {editSchedulingMode === "cron" && (
                            <div>
                              <label className="block text-sm text-ink-1">Cron Schedule</label>
                              <input
                                type="text"
                                value={editSchedulingCronSpec}
                                onChange={(e) => setEditSchedulingCronSpec(e.target.value)}
                                className="input mt-1"
                                placeholder="0 9 * * * (daily at 9am)"
                              />
                              <p className="mt-1 text-xs text-ink-2">
                                Use cron format. <a href="https://crontab.guru" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">crontab.guru</a> for help.
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="mt-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editSchedulingActive}
                              onChange={(e) => setEditSchedulingActive(e.target.checked)}
                              className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                            />
                            <span className="text-sm text-ink-0">Enable scheduled runs</span>
                          </label>
                        </div>
                      </div>

                      {/* Thinking settings */}
                      <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 p-4">
                        <h4 className="text-sm font-medium text-ink-0">Thinking Mode</h4>
                        <p className="text-xs text-ink-2 mt-1">Allow agent to plan, reason, and decide what to do next</p>
                        <div className="mt-3 space-y-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editThinkingEnabled}
                              onChange={(e) => setEditThinkingEnabled(e.target.checked)}
                              className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                            />
                            <span className="text-sm text-ink-0">Enable thinking mode</span>
                          </label>
                          {editThinkingEnabled && (
                            <>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={editThinkingPaused}
                                  onChange={(e) => setEditThinkingPaused(e.target.checked)}
                                  className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                                />
                                <span className="text-sm text-ink-0">Pause thinking (agent will not auto-decide)</span>
                              </label>
                              <div>
                                <label className="block text-sm text-ink-1">Current Goal (optional)</label>
                                <input
                                  type="text"
                                  value={editThinkingGoal}
                                  onChange={(e) => setEditThinkingGoal(e.target.value)}
                                  className="input mt-1"
                                  placeholder="e.g., Review all pending tasks and prioritize"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Browser automation settings */}
                      <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 p-4">
                        <h4 className="text-sm font-medium text-ink-0">Browser Automation (Optional)</h4>
                        <p className="text-xs text-ink-2 mt-1">Enable web scraping and browser automation tools</p>
                        <div className="mt-3 space-y-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editFirecrawlEnabled}
                              onChange={(e) => setEditFirecrawlEnabled(e.target.checked)}
                              disabled={!hasFirecrawlKey}
                              className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent disabled:opacity-50"
                            />
                            <span className={`text-sm ${hasFirecrawlKey ? "text-ink-0" : "text-ink-2"}`}>
                              Firecrawl (web scraping)
                            </span>
                            {!hasFirecrawlKey && (
                              <span className="text-xs text-amber-500">Configure in Settings</span>
                            )}
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editStagehandEnabled}
                              onChange={(e) => setEditStagehandEnabled(e.target.checked)}
                              disabled={!hasBrowserbaseKey}
                              className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent disabled:opacity-50"
                            />
                            <span className={`text-sm ${hasBrowserbaseKey ? "text-ink-0" : "text-ink-2"}`}>
                              Stagehand (AI browser automation)
                            </span>
                            {!hasBrowserbaseKey && (
                              <span className="text-xs text-amber-500">Configure Browserbase in Settings</span>
                            )}
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editBrowserUseEnabled}
                              onChange={(e) => setEditBrowserUseEnabled(e.target.checked)}
                              disabled={!hasBrowserbaseKey}
                              className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent disabled:opacity-50"
                            />
                            <span className={`text-sm ${hasBrowserbaseKey ? "text-ink-0" : "text-ink-2"}`}>
                              Browser Use (task automation)
                            </span>
                            {!hasBrowserbaseKey && (
                              <span className="text-xs text-amber-500">Configure Browserbase in Settings</span>
                            )}
                          </label>
                        </div>
                      </div>

                      {/* X/Twitter Integration */}
                      <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 p-4">
                        <h4 className="text-sm font-medium text-ink-0">X/Twitter Integration</h4>
                        <p className="text-xs text-ink-2 mt-1">
                          Use xAI for research and analysis. Use X API for posting and replies.
                        </p>
                        <div className="mt-3 space-y-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editXEnabled}
                              onChange={(e) => setEditXEnabled(e.target.checked)}
                              disabled={!hasXaiKey && !hasTwitterKey}
                              className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent disabled:opacity-50"
                            />
                            <span className={`text-sm ${hasXaiKey || hasTwitterKey ? "text-ink-0" : "text-ink-2"}`}>
                              Enable X integration
                            </span>
                            {!hasXaiKey && !hasTwitterKey && (
                              <span className="text-xs text-amber-500">Configure xAI or X API in Settings</span>
                            )}
                          </label>

                          {editXEnabled && (
                            <>
                              {editXMode === "xai_grok" && (
                                <p className="text-xs text-amber-500">
                                  xAI mode does not support posting, replies, likes, reposts, or DMs.
                                </p>
                              )}
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <label className="block text-sm text-ink-1">Integration Mode</label>
                                  <select
                                    value={editXMode}
                                    onChange={(e) => setEditXMode(e.target.value as "xai_grok" | "x_api")}
                                    className="input mt-1"
                                  >
                                    <option value="xai_grok" disabled={!hasXaiKey}>
                                      xAI Grok (research and analysis only)
                                    </option>
                                    <option value="x_api" disabled={!hasTwitterKey}>
                                      X API (direct posting)
                                    </option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm text-ink-1">Account Type</label>
                                  <select
                                    value={editXAccountType}
                                    onChange={(e) => setEditXAccountType(e.target.value as "agent" | "user")}
                                    className="input mt-1"
                                  >
                                    <option value="user">User's connected account</option>
                                    <option value="agent">Agent's own account</option>
                                  </select>
                                </div>
                              </div>

                              <div>
                                <label className="block text-sm text-ink-1">X Username (optional)</label>
                                <input
                                  type="text"
                                  value={editXUsername}
                                  onChange={(e) => setEditXUsername(e.target.value.replace("@", ""))}
                                  className="input mt-1"
                                  placeholder="username (without @)"
                                />
                              </div>

                              <div className="border-t border-surface-3 pt-3">
                                <p className="text-xs font-medium text-ink-1 mb-2">Capabilities</p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={editXCanSearch}
                                      onChange={(e) => setEditXCanSearch(e.target.checked)}
                                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                                    />
                                    <span className="text-sm text-ink-0">Search tweets</span>
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={editXCanAnalyze}
                                      onChange={(e) => setEditXCanAnalyze(e.target.checked)}
                                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                                    />
                                    <span className="text-sm text-ink-0">Analyze trends</span>
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={editXCanMonitor}
                                      onChange={(e) => setEditXCanMonitor(e.target.checked)}
                                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                                    />
                                    <span className="text-sm text-ink-0">Monitor mentions</span>
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={editXCanPost}
                                      onChange={(e) => setEditXCanPost(e.target.checked)}
                                      disabled={editXMode !== "x_api" || !hasTwitterKey}
                                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent disabled:opacity-50"
                                    />
                                    <span className={`text-sm ${editXMode === "x_api" && hasTwitterKey ? "text-ink-0" : "text-ink-2"}`}>
                                      Post tweets
                                    </span>
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={editXCanReply}
                                      onChange={(e) => setEditXCanReply(e.target.checked)}
                                      disabled={editXMode !== "x_api" || !hasTwitterKey}
                                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent disabled:opacity-50"
                                    />
                                    <span className={`text-sm ${editXMode === "x_api" && hasTwitterKey ? "text-ink-0" : "text-ink-2"}`}>
                                      Reply to tweets
                                    </span>
                                  </label>
                                </div>
                              </div>

                              {editXCanPost && (
                                <div className="border-t border-surface-3 pt-3">
                                  <p className="text-xs font-medium text-ink-1 mb-2">Auto-posting Settings</p>
                                  <div className="space-y-2">
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={editXAutoPostEnabled}
                                        onChange={(e) => setEditXAutoPostEnabled(e.target.checked)}
                                        className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                                      />
                                      <span className="text-sm text-ink-0">Enable auto-posting</span>
                                    </label>
                                    {editXAutoPostEnabled && (
                                      <label className="flex items-center gap-2 ml-6">
                                        <input
                                          type="checkbox"
                                          checked={editXAutoPostRequireApproval}
                                          onChange={(e) => setEditXAutoPostRequireApproval(e.target.checked)}
                                          className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                                        />
                                        <span className="text-sm text-ink-0">Require approval before posting</span>
                                      </label>
                                    )}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveAgent}
                        disabled={saving}
                        className="btn-accent"
                      >
                        {saving ? "Saving..." : "Save changes"}
                      </button>
                      <button
                        onClick={() => setEditingAgent(null)}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {renderAgentAvatar(agent)}
                      <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-ink-0">{agent.name}</h3>
                        {agent.isDefault && (
                          <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                            Default
                          </span>
                        )}
                        {agent.isPublic && (
                          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                            Public
                          </span>
                        )}
                      </div>
                      {agent.description && (
                        <p className="mt-1 text-sm text-ink-1">{agent.description}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                        <span>Slug: {agent.slug}</span>
                        {agent.llmConfig && (
                          <span>
                            LLM: {agent.llmConfig.provider}/{agent.llmConfig.model.split("/").pop()}
                          </span>
                        )}
                        {agent.agentEmail && <span>Email: {agent.agentEmail}</span>}
                        {agent.agentPhone && <span>Phone: {agent.agentPhone}</span>}
                      </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!agent.isDefault && (
                        <button
                          onClick={() => handleSetDefault(agent._id)}
                          className="rounded p-2 text-ink-2 hover:bg-surface-2 hover:text-accent transition-colors"
                          title="Set as default"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => startEditing(agent)}
                        className="rounded p-2 text-ink-2 hover:bg-surface-2 hover:text-ink-0 transition-colors"
                        title="Edit"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {!agent.isDefault && (
                        <button
                          onClick={() => handleDeleteAgent(agent._id)}
                          className="rounded p-2 text-ink-2 hover:bg-surface-2 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Info boxes */}
        <div className="mt-8 space-y-4">
          <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
            <h3 className="text-sm font-medium text-ink-0">About multiple agents</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink-1">
              <li>Each agent can have its own LLM configuration, skills, email inbox, and phone number</li>
              <li>Skills can be assigned to specific agents or shared across all agents</li>
              <li>Configure API keys for AgentMail and Twilio in Settings to enable communication features</li>
              <li>The default agent is used when no specific agent is specified in API calls</li>
            </ul>
          </div>

          <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
            <h3 className="text-sm font-medium text-ink-0">Setting up a phone number</h3>
            <ol className="mt-2 space-y-1 text-sm text-ink-1 list-decimal list-inside">
              <li>Create a <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Twilio account</a> if you do not have one</li>
              <li>Purchase a phone number from your <a href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Twilio console</a> (choose one with Voice and SMS capabilities)</li>
              <li>Add your Twilio credentials (Account SID:Auth Token) in <a href="/settings" className="text-accent hover:underline">Settings</a></li>
              <li>Enter the purchased phone number in your agent configuration above</li>
              <li>Configure voice settings (voice type, SMS, etc.) to customize how your agent handles calls</li>
            </ol>
            <p className="mt-3 text-xs text-ink-2">
              Your agent can answer voice calls, transcribe voicemails, and send/receive SMS messages once configured.
            </p>
          </div>
        </div>

        {showModelHelpModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowModelHelpModal(false)}
          >
            <div
              className="mx-4 w-full max-w-3xl max-h-[85vh] animate-fade-in card overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-surface-3 pb-3">
                <div>
                  <h3 className="font-semibold text-ink-0">Model name lookup</h3>
                  <p className="mt-1 text-xs text-ink-2">
                    Use provider docs for exact model IDs. Live OpenRouter list helps with cross-provider discovery.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModelHelpModal(false)}
                  className="rounded p-1 text-ink-2 hover:bg-surface-2"
                  aria-label="Close model help"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 space-y-4 overflow-y-auto pr-1">
                <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-ink-0">Provider model docs</h4>
                    <p className="text-xs text-ink-2">
                      Current provider:{" "}
                      {LLM_PROVIDERS.find((provider) => provider.id === editProvider)?.name ?? editProvider}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {PROVIDER_MODEL_REFERENCES.map((reference) => {
                      const isCurrentProvider = reference.id === editProvider;
                      return (
                        <a
                          key={reference.id}
                          href={reference.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`rounded-lg border p-3 transition-colors ${
                            isCurrentProvider
                              ? "border-accent bg-accent/10"
                              : "border-surface-3 bg-surface-0 hover:bg-surface-2"
                          }`}
                        >
                          <p className="text-sm font-medium text-ink-0">{reference.name}</p>
                          <p className="mt-1 text-xs text-ink-2 truncate">{reference.examples.join(" · ")}</p>
                        </a>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
                  <h4 className="text-sm font-medium text-ink-0">Live catalog (OpenRouter)</h4>
                  <p className="mt-1 text-xs text-ink-2">
                    Auto-updated list from OpenRouter. Good for discovery across providers.
                  </p>
                  {isLoadingOpenRouterModels ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-ink-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                      Loading model catalog...
                    </div>
                  ) : openRouterModelLoadError ? (
                    <p className="mt-3 text-xs text-amber-500">{openRouterModelLoadError}</p>
                  ) : openRouterModels.length > 0 ? (
                    <div className="mt-3 max-h-56 overflow-y-auto rounded border border-surface-3">
                      {openRouterModels.slice(0, 80).map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => {
                            setEditModel(model.id);
                            setShowModelHelpModal(false);
                          }}
                          className="flex w-full items-start justify-between gap-3 border-b border-surface-3 px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-ink-0">{model.id}</p>
                            {model.name ? <p className="mt-0.5 truncate text-xs text-ink-2">{model.name}</p> : null}
                          </div>
                          <span className="text-xs text-accent">Use</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-ink-2">No live models returned right now.</p>
                  )}
                  <p className="mt-2 text-xs text-ink-2">
                    Tip: if your provider uses OpenAI-compatible endpoints, model IDs like `glm-5` can work directly.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex justify-end border-t border-surface-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModelHelpModal(false)}
                  className="btn-secondary text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
