import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { getAuth } from "../lib/auth";
import { notify } from "../lib/notify";
import { applyTheme, type ThemeMode } from "../lib/theme";
import {
  BROWSER_AUTOMATION_SERVICES,
  type CredentialService,
  INTEGRATION_SERVICES,
  LLM_PROVIDERS,
  platformApi,
  type ProviderType,
  X_TWITTER_SERVICES,
} from "../lib/platformApi";
type CredentialRow = {
  service: string;
  hasApiKey?: boolean;
};
type ApiKeyRow = {
  _id: Id<"apiKeys">;
  name: string;
  keyPrefix: string;
  scopes: Array<string>;
  keyType?: "user_universal" | "agent_scoped";
  allowedAgentIds?: Array<Id<"agents">>;
  allowedRouteGroups?: Array<"api" | "mcp" | "docs" | "skills">;
  isActive: boolean;
  lastUsedAt?: number;
};

type AgentOption = {
  _id: Id<"agents">;
  name: string;
  slug: string;
};

const KEY_SCOPE_OPTIONS = [
  { id: "api:call", label: "api:call" },
  { id: "mcp:call", label: "mcp:call" },
  { id: "docs:read", label: "docs:read" },
  { id: "skills:read", label: "skills:read" },
] as const;

const KEY_ROUTE_GROUP_OPTIONS = [
  { id: "api", label: "API routes" },
  { id: "mcp", label: "MCP routes" },
  { id: "docs", label: "Docs routes" },
  { id: "skills", label: "Skills routes" },
] as const;

type SecurityEventRow = {
  _id: Id<"auditLog">;
  timestamp: number;
  action: string;
  resource: string;
  status: string;
};

type RateLimitDashboard = {
  activeWindows: number;
  totalRequestsInWindow: number;
  topKeys: Array<{
    key: string;
    count: number;
    resetAt: number;
  }>;
};

export function SettingsPage() {
  const viewer = useQuery(platformApi.convex.auth.viewer);
  const apiKeys = useQuery(platformApi.convex.settings.listApiKeys) as ApiKeyRow[] | undefined;
  const myAgents = useQuery(platformApi.convex.agents.list) as AgentOption[] | undefined;
  const credentials = useQuery(platformApi.convex.settings.listCredentials) as
    | CredentialRow[]
    | undefined;
  const llmProviderStatus = useQuery(platformApi.convex.settings.getCredentialStatus);
  const isAdmin = useQuery(platformApi.convex.admin.isAdmin);
  const securityEvents = useQuery(
    platformApi.convex.security.getSecurityEvents
  ) as SecurityEventRow[] | undefined;
  const securityCsv = useQuery(platformApi.convex.security.exportSecurityCsv, { limit: 1000 });
  const rateLimitDashboard = useQuery(
    platformApi.convex.security.getRateLimitDashboard
  ) as RateLimitDashboard | undefined;
  const updateSettings = useMutation(platformApi.convex.settings.updateSettings);
  const deleteAccount = useMutation(platformApi.convex.settings.deleteAccount);
  const generateProfilePhotoUploadUrl = useMutation(
    platformApi.convex.settings.generateProfilePhotoUploadUrl
  );
  const setProfilePhoto = useMutation(platformApi.convex.settings.setProfilePhoto);
  const createApiKey = useMutation(platformApi.convex.settings.createApiKey);
  const revokeApiKey = useMutation(platformApi.convex.settings.revokeApiKey);
  const rotateApiKey = useMutation(platformApi.convex.settings.rotateApiKey);
  const saveCredential = useMutation(platformApi.convex.settings.saveCredential);
  const removeCredential = useMutation(platformApi.convex.settings.removeCredential);
  const auth = getAuth();

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [twitterProfile, setTwitterProfile] = useState("");
  const [linkedinProfile, setLinkedinProfile] = useState("");
  const [githubProfile, setGithubProfile] = useState("");
  const [llmProvider, setLlmProvider] = useState<ProviderType>("openrouter");
  const [llmModel, setLlmModel] = useState("anthropic/claude-sonnet-4");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  // Privacy settings
  const [privacyProfileVisible, setPrivacyProfileVisible] = useState(true);
  const [privacyShowEmail, setPrivacyShowEmail] = useState(true);
  const [privacyShowPhone, setPrivacyShowPhone] = useState(false);
  const [privacyShowSkills, setPrivacyShowSkills] = useState(true);
  const [privacyShowActivity, setPrivacyShowActivity] = useState(true);
  const [privacyShowTasks, setPrivacyShowTasks] = useState(true);
  const [privacyShowEndpoints, setPrivacyShowEndpoints] = useState(true);
  const [privacyAllowAgentToAgent, setPrivacyAllowAgentToAgent] = useState(false);

  // Token budget + rate limit config
  const [tokenBudget, setTokenBudget] = useState(100000);
  const [rlApiPerMin, setRlApiPerMin] = useState(60);
  const [rlMcpPerMin, setRlMcpPerMin] = useState(30);
  const [rlSkillPerMin, setRlSkillPerMin] = useState(20);
  const [rlEmailPerHour, setRlEmailPerHour] = useState(50);
  const [rlA2aPerMin, setRlA2aPerMin] = useState(30);

  // BYOK form state
  const [showByokForm, setShowByokForm] = useState<string | null>(null);
  const [byokApiKey, setByokApiKey] = useState("");
  const [byokBaseUrl, setByokBaseUrl] = useState("");
  const [savingByok, setSavingByok] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [securityTab, setSecurityTab] = useState<"alerts" | "rate_limits">("alerts");

  // New API key form
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
    "api:call",
    "mcp:call",
  ]);
  const [newKeyType, setNewKeyType] = useState<"user_universal" | "agent_scoped">(
    "user_universal"
  );
  const [newKeyRouteGroups, setNewKeyRouteGroups] = useState<
    Array<"api" | "mcp" | "docs" | "skills">
  >(["api", "mcp", "docs", "skills"]);
  const [newKeyAllowedAgentIds, setNewKeyAllowedAgentIds] = useState<
    Array<Id<"agents">>
  >([]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);

  useEffect(() => {
    if (viewer) {
      setUsername(viewer.username || "");
      setName(viewer.name || "");
      setBio(viewer.bio || "");
      setTwitterProfile(viewer.socialProfiles?.twitter || "");
      setLinkedinProfile(viewer.socialProfiles?.linkedin || "");
      setGithubProfile(viewer.socialProfiles?.github || "");
      setLlmProvider((viewer.llmConfig?.provider as ProviderType) || "openrouter");
      setLlmModel(viewer.llmConfig?.model || "anthropic/claude-sonnet-4");

      // Load token budget
      setTokenBudget(viewer.llmConfig?.tokenBudget ?? 100000);

      // Load rate limit config with defaults
      const rlConfig = (viewer as { rateLimitConfig?: {
        apiRequestsPerMinute?: number;
        mcpRequestsPerMinute?: number;
        skillExecutionsPerMinute?: number;
        emailsPerHour?: number;
        a2aRequestsPerMinute?: number;
      }}).rateLimitConfig;
      setRlApiPerMin(rlConfig?.apiRequestsPerMinute ?? 60);
      setRlMcpPerMin(rlConfig?.mcpRequestsPerMinute ?? 30);
      setRlSkillPerMin(rlConfig?.skillExecutionsPerMinute ?? 20);
      setRlEmailPerHour(rlConfig?.emailsPerHour ?? 50);
      setRlA2aPerMin(rlConfig?.a2aRequestsPerMinute ?? 30);

      // Load privacy settings with defaults
      const privacy = (viewer as { privacySettings?: {
        profileVisible?: boolean;
        showEmail?: boolean;
        showPhone?: boolean;
        showSkills?: boolean;
        showActivity?: boolean;
        showTasks?: boolean;
        showEndpoints?: boolean;
        allowAgentToAgent?: boolean;
      }}).privacySettings;
      setPrivacyProfileVisible(privacy?.profileVisible ?? true);
      setPrivacyShowEmail(privacy?.showEmail ?? true);
      setPrivacyShowPhone(privacy?.showPhone ?? false);
      setPrivacyShowSkills(privacy?.showSkills ?? true);
      setPrivacyShowActivity(privacy?.showActivity ?? true);
      setPrivacyShowTasks(privacy?.showTasks ?? true);
      setPrivacyShowEndpoints(privacy?.showEndpoints ?? true);
      setPrivacyAllowAgentToAgent(privacy?.allowAgentToAgent ?? false);
    }
  }, [viewer]);

  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    if (currentTheme === "dark" || currentTheme === "light") {
      setThemeMode(currentTheme);
    }
  }, []);

  async function handleSaveProfile() {
    setSaveError(null);
    setSaving(true);
    try {
      const payload = {
        username: username.trim().toLowerCase() || undefined,
        name: name.trim() || undefined,
        bio: bio.trim() || undefined,
        socialProfiles: {
          twitter: twitterProfile.trim() || undefined,
          linkedin: linkedinProfile.trim() || undefined,
          github: githubProfile.trim() || undefined,
        },
        llmProvider: llmProvider as "openrouter" | "anthropic" | "openai" | "deepseek" | "google" | "mistral" | "minimax" | "kimi" | "xai" | "custom",
        llmModel,
        tokenBudget,
        rateLimitConfig: {
          apiRequestsPerMinute: rlApiPerMin,
          mcpRequestsPerMinute: rlMcpPerMin,
          skillExecutionsPerMinute: rlSkillPerMin,
          emailsPerHour: rlEmailPerHour,
          a2aRequestsPerMinute: rlA2aPerMin,
        },
        privacySettings: {
          profileVisible: privacyProfileVisible,
          showEmail: privacyShowEmail,
          showPhone: privacyShowPhone,
          showSkills: privacyShowSkills,
          showActivity: privacyShowActivity,
          showTasks: privacyShowTasks,
          showEndpoints: privacyShowEndpoints,
          allowAgentToAgent: privacyAllowAgentToAgent,
        },
      };

      try {
        await updateSettings(payload);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error ?? "");
        // Backward-compatible fallback while Convex functions hot-reload/deploy.
        if (errorMessage.includes("allowAgentToAgent")) {
          await (updateSettings as (args: unknown) => Promise<unknown>)({
            ...payload,
            privacySettings: {
              profileVisible: privacyProfileVisible,
              showEmail: privacyShowEmail,
              showPhone: privacyShowPhone,
              showSkills: privacyShowSkills,
              showActivity: privacyShowActivity,
              showTasks: privacyShowTasks,
              showEndpoints: privacyShowEndpoints,
            },
          });
        } else {
          throw error;
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      notify.success("Settings saved");
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveError(error instanceof Error ? error.message : "Could not save settings.");
      notify.error("Could not save settings", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleProfilePhotoChange(
    file: File | null,
    input: HTMLInputElement
  ) {
    if (!file) return;
    setPhotoError(null);

    if (!file.type.startsWith("image/")) {
      const message = "Please select an image file.";
      setPhotoError(message);
      notify.warning("Invalid file", message);
      input.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      const message = "Image must be 5MB or smaller.";
      setPhotoError(message);
      notify.warning("Image too large", message);
      input.value = "";
      return;
    }

    setPhotoUploading(true);
    try {
      const uploadUrl = await generateProfilePhotoUploadUrl({});
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

      await setProfilePhoto({
        storageId: uploadResult.storageId as Id<"_storage">,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      notify.success("Profile photo updated");
    } catch (error) {
      console.error("Failed to upload profile photo:", error);
      setPhotoError("Could not upload photo. Please try again.");
      notify.error("Could not upload photo", error);
    } finally {
      setPhotoUploading(false);
      input.value = "";
    }
  }

  // Save BYOK API key
  async function handleSaveByok(service: string) {
    if (!byokApiKey.trim()) return;
    setSavingByok(true);
    try {
      await saveCredential({
        service: service as CredentialService,
        apiKey: byokApiKey.trim(),
        config: byokBaseUrl.trim() ? { baseUrl: byokBaseUrl.trim() } : undefined,
      });
      setShowByokForm(null);
      setByokApiKey("");
      setByokBaseUrl("");
      notify.success("Credential saved");
    } catch (error) {
      notify.error("Could not save credential", error);
    } finally {
      setSavingByok(false);
    }
  }

  // Remove BYOK credential
  async function handleRemoveCredential(service: string) {
    try {
      await removeCredential({ service: service as CredentialService });
      notify.success("Credential removed");
    } catch (error) {
      notify.error("Could not remove credential", error);
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    if (newKeyRouteGroups.length === 0) {
      notify.warning("Select at least one route group");
      return;
    }
    if (newKeyType === "agent_scoped" && newKeyAllowedAgentIds.length === 0) {
      notify.warning("Agent-scoped key requires at least one agent");
      return;
    }

    setCreatingKey(true);
    try {
      const result = await createApiKey({
        name: newKeyName.trim(),
        scopes: newKeyScopes,
        keyType: newKeyType,
        allowedRouteGroups: newKeyRouteGroups,
        allowedAgentIds:
          newKeyType === "agent_scoped" ? newKeyAllowedAgentIds : undefined,
      });
      setCreatedKey(result.key);
      setNewKeyName("");
      setNewKeyScopes(["api:call", "mcp:call"]);
      setNewKeyType("user_universal");
      setNewKeyRouteGroups(["api", "mcp", "docs", "skills"]);
      setNewKeyAllowedAgentIds([]);
      notify.success("API key created", "Copy your new key now.");
    } catch (error) {
      notify.error("Could not create API key", error);
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleRevokeKey(keyId: Id<"apiKeys">) {
    notify.confirmAction({
      title: "Revoke this API key?",
      description: "This cannot be undone.",
      buttonTitle: "Revoke",
      onConfirm: async () => {
        try {
          await revokeApiKey({ keyId });
          notify.success("API key revoked");
        } catch (error) {
          notify.error("Could not revoke API key", error);
        }
      },
    });
  }

  async function handleRotateKey(keyId: Id<"apiKeys">) {
    notify.confirmAction({
      title: "Rotate this API key?",
      description: "A new key will be created and the current key will be revoked.",
      buttonTitle: "Rotate",
      onConfirm: async () => {
        try {
          const result = await rotateApiKey({ keyId });
          setCreatedKey(result.key);
          setShowNewKey(false);
          notify.success("API key rotated", "Copy your new key now.");
        } catch (error) {
          notify.error("Could not rotate API key", error);
        }
      },
    });
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard
      .writeText(text)
      .then(() => notify.success("Copied to clipboard"))
      .catch((error: unknown) => notify.error("Could not copy", error));
  }

  function toggleNewKeyScope(scope: string, checked: boolean) {
    setNewKeyScopes((current) =>
      checked ? Array.from(new Set([...current, scope])) : current.filter((s) => s !== scope)
    );
  }

  function toggleNewKeyRouteGroup(
    group: "api" | "mcp" | "docs" | "skills",
    checked: boolean
  ) {
    setNewKeyRouteGroups((current) =>
      checked ? Array.from(new Set([...current, group])) : current.filter((g) => g !== group)
    );
  }

  function toggleNewKeyAgent(agentId: Id<"agents">, checked: boolean) {
    setNewKeyAllowedAgentIds((current) =>
      checked
        ? Array.from(new Set([...current, agentId]))
        : current.filter((id) => id !== agentId)
    );
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") return;

    setDeleteAccountError(null);
    setDeletingAccount(true);
    try {
      await deleteAccount({});
      await auth.signOut();
      notify.success("Account deleted");
    } catch (error) {
      console.error("Failed to delete account:", error);
      setDeleteAccountError("Could not delete account. Please try again.");
      setDeletingAccount(false);
      notify.error("Could not delete account", error);
    }
  }

  function handleThemeToggle(nextTheme: ThemeMode) {
    setThemeMode(nextTheme);
    applyTheme(nextTheme);
    notify.success(`Theme set to ${nextTheme}`);
  }

  function handleDownloadSecurityCsv() {
    if (!securityCsv) return;
    const blob = new Blob([securityCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `security-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!viewer) {
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
      <div className="mx-auto max-w-3xl animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink-0">Settings</h1>
            <p className="mt-1 text-ink-1">
              Manage your profile, LLM configuration, and API keys.
            </p>
          </div>
          {isAdmin ? (
            <span className="rounded-full border border-surface-3 bg-surface-1 px-3 py-1 text-xs font-medium text-ink-0">
              You are admin
            </span>
          ) : null}
        </div>

        <div className="mt-8 space-y-8">
          {/* Profile */}
          <section className="card">
            <h2 className="font-semibold text-ink-0">Profile</h2>
            <p className="mt-1 text-sm text-ink-1">
              Your public display information.
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-0">
                  Profile photo
                </label>
                <div className="mt-1.5 flex items-center gap-4">
                  {viewer.image ? (
                    <img
                      src={viewer.image}
                      alt="Profile"
                      className="h-14 w-14 rounded-full border border-surface-3 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-surface-3 bg-surface-2 text-lg font-semibold text-ink-1">
                      {(viewer.name || viewer.username || "U").charAt(0).toUpperCase()}
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
                          void handleProfilePhotoChange(
                            e.target.files?.[0] ?? null,
                            e.currentTarget
                          )
                        }
                      />
                    </label>
                    <p className="mt-1 text-xs text-ink-2">
                      PNG, JPG, or WebP up to 5MB.
                    </p>
                    {photoError ? (
                      <p className="mt-1 text-xs text-red-400">{photoError}</p>
                    ) : null}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-0">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input mt-1.5"
                  placeholder="your_username"
                  pattern="[a-z0-9_]+"
                  minLength={3}
                  maxLength={30}
                />
                <p className="mt-1 text-xs text-ink-2">
                  Lowercase letters, numbers, and underscores only.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-0">
                  Display name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input mt-1.5"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-0">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="input mt-1.5 resize-none"
                  rows={3}
                  placeholder="Tell people about yourself"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-0">
                  X profile
                </label>
                <input
                  type="text"
                  value={twitterProfile}
                  onChange={(e) => setTwitterProfile(e.target.value)}
                  className="input mt-1.5"
                  placeholder="https://x.com/yourname or @yourname"
                />
                <p className="mt-1 text-xs text-ink-2">
                  Paste @handle or full URL.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-0">
                  LinkedIn profile
                </label>
                <input
                  type="text"
                  value={linkedinProfile}
                  onChange={(e) => setLinkedinProfile(e.target.value)}
                  className="input mt-1.5"
                  placeholder="https://linkedin.com/in/yourname"
                />
                <p className="mt-1 text-xs text-ink-2">
                  Paste handle or full profile URL.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-0">
                  GitHub profile
                </label>
                <input
                  type="text"
                  value={githubProfile}
                  onChange={(e) => setGithubProfile(e.target.value)}
                  className="input mt-1.5"
                  placeholder="https://github.com/yourname"
                />
                <p className="mt-1 text-xs text-ink-2">
                  Paste @handle or full URL.
                </p>
              </div>
              {saveError ? (
                <p className="text-xs text-red-400">{saveError}</p>
              ) : null}
              <div className="flex justify-end">
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="btn-accent"
                >
                  {saving ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Saving
                    </>
                  ) : saved ? (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Saved
                    </>
                  ) : (
                    "Save profile"
                  )}
                </button>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="font-semibold text-ink-0">Appearance</h2>
            <p className="mt-1 text-sm text-ink-1">
              Switch between light and dark mode for the dashboard.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={() => handleThemeToggle("light")}
                className={`btn-secondary text-sm ${
                  themeMode === "light" ? "border-accent text-ink-0" : ""
                }`}
              >
                Light
              </button>
              <button
                onClick={() => handleThemeToggle("dark")}
                className={`btn-secondary text-sm ${
                  themeMode === "dark" ? "border-accent text-ink-0" : ""
                }`}
              >
                Dark
              </button>
            </div>
          </section>

          {/* Privacy & Visibility */}
          <section className="card">
            <h2 className="font-semibold text-ink-0">Privacy & Visibility</h2>
            <p className="mt-1 text-sm text-ink-1">
              Control what's visible on your public agent profile page.
            </p>
            <div className="mt-5 space-y-4">
              {/* Master toggle */}
              <div className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-1 p-4">
                <div>
                  <p className="font-medium text-ink-0">Public profile</p>
                  <p className="text-sm text-ink-1">
                    Allow others to view your agent profile at /u/{viewer.username}
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={privacyProfileVisible}
                    onChange={(e) => setPrivacyProfileVisible(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-6 w-11 rounded-full bg-surface-3 peer-checked:bg-accent peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/20 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-surface-3 after:bg-white after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                </label>
              </div>

              {/* Individual toggles (only shown if profile is visible) */}
              {privacyProfileVisible && (
                <div className="space-y-3 pl-4 border-l-2 border-surface-3">
                  <label className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-ink-0">Show agent email</span>
                      <p className="text-xs text-ink-2">Display your AgentMail address</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={privacyShowEmail}
                      onChange={(e) => setPrivacyShowEmail(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-ink-0">Show agent phone</span>
                      <p className="text-xs text-ink-2">Display your agent phone number (if configured)</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={privacyShowPhone}
                      onChange={(e) => setPrivacyShowPhone(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-ink-0">Show skills & capabilities</span>
                      <p className="text-xs text-ink-2">Display what your agent can do</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={privacyShowSkills}
                      onChange={(e) => setPrivacyShowSkills(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-ink-0">Show activity feed</span>
                      <p className="text-xs text-ink-2">Display recent agent activity</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={privacyShowActivity}
                      onChange={(e) => setPrivacyShowActivity(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-ink-0">Show public tasks</span>
                      <p className="text-xs text-ink-2">Display tasks marked as public</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={privacyShowTasks}
                      onChange={(e) => setPrivacyShowTasks(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-ink-0">Show API & MCP endpoints</span>
                      <p className="text-xs text-ink-2">Display connection endpoints for developers</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={privacyShowEndpoints}
                      onChange={(e) => setPrivacyShowEndpoints(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-ink-0">Allow agent to agent messages</span>
                      <p className="text-xs text-ink-2">Allow public agents to message your public agents</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={privacyAllowAgentToAgent}
                      onChange={(e) => setPrivacyAllowAgentToAgent(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                    />
                  </label>
                </div>
              )}

              <p className="text-xs text-ink-2">
                Note: Individual tasks and feed items can also be marked public/private when creating them.
              </p>
            </div>
          </section>

          {/* LLM Configuration */}
          <section className="card">
            <h2 className="font-semibold text-ink-0">LLM Configuration</h2>
            <p className="mt-1 text-sm text-ink-1">
              Configure the AI model powering your agent. Add your own API keys (BYOK) to use your preferred provider.
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-0">
                  Provider
                </label>
                <select
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value as ProviderType)}
                  className="input mt-1.5"
                >
                  {LLM_PROVIDERS.map((p) => {
                    const status = llmProviderStatus?.[p.id];
                    const hasKey = status?.configured;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} {hasKey ? "(key configured)" : p.id !== "openrouter" ? "(BYOK)" : "(default)"}
                      </option>
                    );
                  })}
                  <option value="custom">Custom endpoint</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-0">
                  Model
                </label>
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  className="input mt-1.5"
                  placeholder="gpt-4o or glm-5"
                />
                <p className="mt-1 text-xs text-ink-2">
                  {llmProvider === "openrouter" && "Browse models at openrouter.ai/models"}
                  {llmProvider === "anthropic" && "e.g., claude-sonnet-4, claude-opus-4"}
                  {llmProvider === "openai" && "e.g., gpt-4o, gpt-4-turbo, glm-5 (with z.ai OpenAI-compatible base URL)"}
                  {llmProvider === "deepseek" && "e.g., deepseek-chat, deepseek-reasoner"}
                  {llmProvider === "google" && "e.g., gemini-2.0-flash, gemini-1.5-pro"}
                  {llmProvider === "mistral" && "e.g., mistral-large, mistral-medium"}
                  {llmProvider === "minimax" && "e.g., minimax-m1, minimax-text-01"}
                  {llmProvider === "kimi" && "e.g., kimi-k2-0711-preview, moonshot-v1-8k"}
                  {llmProvider === "xai" && "e.g., grok-2-1212"}
                  {llmProvider === "custom" && "Enter your model identifier (e.g., glm-5)"}
                </p>
                {llmProvider === "openai" && (
                  <p className="mt-1 text-xs text-ink-2">
                    For z.ai, set your API key in BYOK and optionally set custom base URL in BYOK config.
                    {" "}
                    <a
                      href="https://docs.z.ai/devpack/faq"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      Setup reference
                    </a>
                  </p>
                )}
                {llmProvider === "deepseek" && (
                  <p className="mt-1 text-xs text-ink-2">
                    DeepSeek uses BYOK. Default API base URL is <code className="bg-surface-1 px-1 rounded">https://api.deepseek.com/v1</code>. Override base URL only if needed.
                  </p>
                )}
              </div>

            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="btn-accent"
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Saving
                  </>
                ) : saved ? (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </>
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          </section>

          {/* Usage & Rate Limits */}
          <section className="card">
            <h2 className="font-semibold text-ink-0">Usage & Rate Limits</h2>
            <p className="mt-1 text-sm text-ink-1">
              Set a universal monthly token budget and per-channel rate limits to prevent spam and control costs across all models.
            </p>

            {/* Universal token budget */}
            <div className="mt-5">
              <h3 className="text-sm font-medium text-ink-0">Monthly token budget</h3>
              <p className="mt-1 text-xs text-ink-2">
                Applies across all LLM providers and models. Your agent will stop making LLM calls once this limit is reached each month.
              </p>
              <div className="mt-3 space-y-3">
                <div className="rounded-lg bg-surface-1 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-1">Current usage</span>
                    <span className="font-mono text-sm text-ink-0">
                      {(viewer.llmConfig?.tokensUsedThisMonth ?? 0).toLocaleString()} / {tokenBudget.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{
                        width: `${Math.min(100, ((viewer.llmConfig?.tokensUsedThisMonth || 0) / (tokenBudget || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  {((viewer.llmConfig?.tokensUsedThisMonth || 0) / (tokenBudget || 1)) >= 0.9 && (
                    <p className="mt-2 text-xs text-red-500">
                      You are approaching your monthly limit. Consider increasing your budget.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-1">Token limit per month</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      type="range"
                      min={10000}
                      max={10000000}
                      step={10000}
                      value={tokenBudget}
                      onChange={(e) => setTokenBudget(Number(e.target.value))}
                      className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-surface-2 accent-accent"
                    />
                    <input
                      type="number"
                      min={1000}
                      max={100000000}
                      value={tokenBudget}
                      onChange={(e) => setTokenBudget(Math.max(1000, Number(e.target.value)))}
                      className="input w-32 text-right font-mono text-sm"
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-ink-2">
                    <span>10K</span>
                    <span>10M</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Per-channel rate limits */}
            <div className="mt-6">
              <h3 className="text-sm font-medium text-ink-0">Per-channel rate limits</h3>
              <p className="mt-1 text-xs text-ink-2">
                Set the maximum number of requests allowed per window for each channel. Requests exceeding the limit receive a 429 response.
              </p>
              <div className="mt-3 space-y-3">
                {/* API */}
                <div className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-1 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-0">REST API</p>
                    <p className="text-xs text-ink-2">Public API endpoint calls</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={rlApiPerMin}
                      onChange={(e) => setRlApiPerMin(Math.max(1, Number(e.target.value)))}
                      className="input w-20 text-right font-mono text-sm"
                    />
                    <span className="text-xs text-ink-2 whitespace-nowrap">/min</span>
                  </div>
                </div>

                {/* MCP */}
                <div className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-1 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-0">MCP Server</p>
                    <p className="text-xs text-ink-2">MCP tool calls and prompts</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={rlMcpPerMin}
                      onChange={(e) => setRlMcpPerMin(Math.max(1, Number(e.target.value)))}
                      className="input w-20 text-right font-mono text-sm"
                    />
                    <span className="text-xs text-ink-2 whitespace-nowrap">/min</span>
                  </div>
                </div>

                {/* Skill executions */}
                <div className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-1 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-0">Skill executions</p>
                    <p className="text-xs text-ink-2">Agent skill and tool invocations</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={rlSkillPerMin}
                      onChange={(e) => setRlSkillPerMin(Math.max(1, Number(e.target.value)))}
                      className="input w-20 text-right font-mono text-sm"
                    />
                    <span className="text-xs text-ink-2 whitespace-nowrap">/min</span>
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-1 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-0">Email</p>
                    <p className="text-xs text-ink-2">Outbound emails from AgentMail</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={rlEmailPerHour}
                      onChange={(e) => setRlEmailPerHour(Math.max(1, Number(e.target.value)))}
                      className="input w-20 text-right font-mono text-sm"
                    />
                    <span className="text-xs text-ink-2 whitespace-nowrap">/hour</span>
                  </div>
                </div>

                {/* A2A */}
                <div className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-1 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-0">Agent to Agent</p>
                    <p className="text-xs text-ink-2">Inbound A2A protocol messages</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={rlA2aPerMin}
                      onChange={(e) => setRlA2aPerMin(Math.max(1, Number(e.target.value)))}
                      className="input w-20 text-right font-mono text-sm"
                    />
                    <span className="text-xs text-ink-2 whitespace-nowrap">/min</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="btn-accent"
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Saving
                  </>
                ) : saved ? (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </>
                ) : (
                  "Save limits"
                )}
              </button>
            </div>
          </section>

          {/* BYOK API Keys */}
          <section className="card">
            <h2 className="font-semibold text-ink-0">API Keys (BYOK)</h2>
            <p className="mt-1 text-sm text-ink-1">
              Add your own API keys to use providers directly. Keys are encrypted and never shared.
            </p>

            {/* LLM Providers */}
            <div className="mt-5">
              <h3 className="text-sm font-medium text-ink-0">LLM Providers</h3>
              <div className="mt-3 space-y-2">
                {LLM_PROVIDERS.map((provider) => {
                  const status = llmProviderStatus?.[provider.id];
                  const hasKey = status?.configured;

                  return (
                    <div key={provider.id} className="rounded-lg border border-surface-3 bg-surface-1 p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink-0">{provider.name}</span>
                            {hasKey && (
                              <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                                Configured
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-2">{provider.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasKey ? (
                            <>
                              <button
                                onClick={() => setShowByokForm(provider.id)}
                                className="btn-secondary text-sm"
                              >
                                Update
                              </button>
                              <button
                                onClick={() => handleRemoveCredential(provider.id)}
                                className="rounded p-2 text-ink-2 hover:bg-surface-2 hover:text-red-500 transition-colors"
                                title="Remove key"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setShowByokForm(provider.id)}
                              className="btn-secondary text-sm"
                            >
                              Add key
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline form for adding/editing key */}
                      {showByokForm === provider.id && (
                        <div className="mt-3 border-t border-surface-3 pt-3">
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-ink-1">API Key</label>
                              <input
                                type="password"
                                value={byokApiKey}
                                onChange={(e) => setByokApiKey(e.target.value)}
                                className="input mt-1 text-sm"
                                placeholder={`Enter your ${provider.name} API key`}
                              />
                            </div>
                            {provider.id === "openrouter" && (
                              <p className="text-xs text-ink-2">
                                Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">openrouter.ai/keys</a>
                              </p>
                            )}
                            {provider.id === "anthropic" && (
                              <p className="text-xs text-ink-2">
                                Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">console.anthropic.com</a>
                              </p>
                            )}
                            {provider.id === "openai" && (
                              <p className="text-xs text-ink-2">
                                Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">platform.openai.com</a>
                              </p>
                            )}
                            {provider.id === "google" && (
                              <p className="text-xs text-ink-2">
                                Get your key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">aistudio.google.com</a>
                              </p>
                            )}
                            {provider.id === "deepseek" && (
                              <div className="space-y-1">
                                <p className="text-xs text-ink-2">
                                  Get your key at <a href="https://www.deepseek.com/en/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">deepseek.com</a>
                                </p>
                                <p className="text-xs text-ink-2">
                                  Optional base URL: <code className="bg-surface-1 px-1 rounded">https://api.deepseek.com/v1</code>
                                </p>
                              </div>
                            )}
                            {provider.id === "mistral" && (
                              <p className="text-xs text-ink-2">
                                Get your key at <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">console.mistral.ai</a>
                              </p>
                            )}
                            {provider.id === "minimax" && (
                              <p className="text-xs text-ink-2">
                                Get your key at <a href="https://platform.minimaxi.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">platform.minimaxi.com</a>
                              </p>
                            )}
                            {provider.id === "kimi" && (
                              <p className="text-xs text-ink-2">
                                Get your key at <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">platform.moonshot.cn</a>
                              </p>
                            )}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleSaveByok(provider.id)}
                              disabled={savingByok || !byokApiKey.trim()}
                              className="btn-accent text-sm"
                            >
                              {savingByok ? "Saving..." : "Save key"}
                            </button>
                            <button
                              onClick={() => {
                                setShowByokForm(null);
                                setByokApiKey("");
                                setByokBaseUrl("");
                              }}
                              className="btn-secondary text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Integration Services */}
            <div className="mt-6">
              <h3 className="text-sm font-medium text-ink-0">Integrations</h3>
              <div className="mt-3 space-y-2">
                {INTEGRATION_SERVICES.map((service) => {
                  const cred = credentials?.find((c) => c.service === service.id);
                  const hasKey = cred?.hasApiKey;

                  return (
                    <div key={service.id} className="rounded-lg border border-surface-3 bg-surface-1 p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink-0">{service.name}</span>
                            {hasKey && (
                              <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                                Configured
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-2">{service.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasKey ? (
                            <>
                              <button
                                onClick={() => setShowByokForm(service.id)}
                                className="btn-secondary text-sm"
                              >
                                Update
                              </button>
                              <button
                                onClick={() => handleRemoveCredential(service.id)}
                                className="rounded p-2 text-ink-2 hover:bg-surface-2 hover:text-red-500 transition-colors"
                                title="Remove key"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setShowByokForm(service.id)}
                              className="btn-secondary text-sm"
                            >
                              Add key
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline form for adding/editing key */}
                      {showByokForm === service.id && (
                        <div className="mt-3 border-t border-surface-3 pt-3">
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-ink-1">API Key</label>
                              <input
                                type="password"
                                value={byokApiKey}
                                onChange={(e) => setByokApiKey(e.target.value)}
                                className="input mt-1 text-sm"
                                placeholder={`Enter your ${service.name} API key`}
                              />
                            </div>
                            {service.id === "agentmail" && (
                              <p className="text-xs text-ink-2">
                                Get your key at <a href="https://agentmail.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">agentmail.com</a>. This enables your agent to have its own email inbox.
                              </p>
                            )}
                            {service.id === "twilio" && (
                              <div className="space-y-1">
                                <p className="text-xs text-ink-2">
                                  Get your Account SID and Auth Token at <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">console.twilio.com</a>
                                </p>
                                <p className="text-xs text-ink-2">
                                  Format: <code className="bg-surface-1 px-1 rounded">ACCOUNT_SID:AUTH_TOKEN</code>
                                </p>
                                <p className="text-xs text-ink-2">
                                  Enables voice calls and SMS for your agents. Purchase a phone number in your Twilio console, then add it to your agent.
                                </p>
                              </div>
                            )}
                            {service.id === "resend" && (
                              <p className="text-xs text-ink-2">
                                Get your key at <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">resend.com</a>
                              </p>
                            )}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleSaveByok(service.id)}
                              disabled={savingByok || !byokApiKey.trim()}
                              className="btn-accent text-sm"
                            >
                              {savingByok ? "Saving..." : "Save key"}
                            </button>
                            <button
                              onClick={() => {
                                setShowByokForm(null);
                                setByokApiKey("");
                                setByokBaseUrl("");
                              }}
                              className="btn-secondary text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Browser Automation Services */}
            <div className="mt-6">
              <h3 className="text-sm font-medium text-ink-0">Browser Automation (Optional)</h3>
              <p className="mt-1 text-xs text-ink-2">
                Enable web scraping and browser automation for your agents. Requires BYOK API keys.
              </p>
              <div className="mt-3 space-y-2">
                {BROWSER_AUTOMATION_SERVICES.map((service) => {
                  const cred = credentials?.find((c) => c.service === service.id);
                  const hasKey = cred?.hasApiKey;

                  return (
                    <div key={service.id} className="rounded-lg border border-surface-3 bg-surface-1 p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink-0">{service.name}</span>
                            {hasKey && (
                              <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                                Configured
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-2">{service.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasKey ? (
                            <>
                              <button
                                onClick={() => setShowByokForm(service.id)}
                                className="btn-secondary text-sm"
                              >
                                Update
                              </button>
                              <button
                                onClick={() => handleRemoveCredential(service.id)}
                                className="rounded p-2 text-ink-2 hover:bg-surface-2 hover:text-red-500 transition-colors"
                                title="Remove key"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setShowByokForm(service.id)}
                              className="btn-secondary text-sm"
                            >
                              Add key
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline form for adding/editing key */}
                      {showByokForm === service.id && (
                        <div className="mt-3 border-t border-surface-3 pt-3">
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-ink-1">API Key</label>
                              <input
                                type="password"
                                value={byokApiKey}
                                onChange={(e) => setByokApiKey(e.target.value)}
                                className="input mt-1 text-sm"
                                placeholder={`Enter your ${service.name} API key`}
                              />
                            </div>
                            {service.id === "firecrawl" && (
                              <p className="text-xs text-ink-2">
                                Get your key at <a href="https://firecrawl.dev" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">firecrawl.dev</a>. Enables web scraping and crawling for your agents.
                              </p>
                            )}
                            {service.id === "browserbase" && (
                              <div className="space-y-1">
                                <p className="text-xs text-ink-2">
                                  Get your API key and Project ID at <a href="https://browserbase.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">browserbase.com</a>
                                </p>
                                <p className="text-xs text-ink-2">
                                  Format: <code className="bg-surface-1 px-1 rounded">API_KEY:PROJECT_ID</code>
                                </p>
                                <p className="text-xs text-ink-2">
                                  Enables Stagehand and Browser Use for AI-powered browser automation.
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleSaveByok(service.id)}
                              disabled={savingByok || !byokApiKey.trim()}
                              className="btn-accent text-sm"
                            >
                              {savingByok ? "Saving..." : "Save key"}
                            </button>
                            <button
                              onClick={() => {
                                setShowByokForm(null);
                                setByokApiKey("");
                                setByokBaseUrl("");
                              }}
                              className="btn-secondary text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* X/Twitter Integration */}
            <div className="mt-6">
              <h3 className="text-sm font-medium text-ink-0">X/Twitter Integration</h3>
              <p className="mt-1 text-xs text-ink-2">
                Enable X/Twitter capabilities for your agents. Use xAI for research and data lookups, and X API for posting.
              </p>
              <div className="mt-3 space-y-2">
                {X_TWITTER_SERVICES.map((service) => {
                  const cred = credentials?.find((c) => c.service === service.id);
                  const hasKey = cred?.hasApiKey;

                  return (
                    <div key={service.id} className="rounded-lg border border-surface-3 bg-surface-1 p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink-0">{service.name}</span>
                            {hasKey && (
                              <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                                Configured
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-2">{service.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasKey ? (
                            <>
                              <button
                                onClick={() => setShowByokForm(service.id)}
                                className="btn-secondary text-sm"
                              >
                                Update
                              </button>
                              <button
                                onClick={() => handleRemoveCredential(service.id)}
                                className="rounded p-2 text-ink-2 hover:bg-surface-2 hover:text-red-500 transition-colors"
                                title="Remove key"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setShowByokForm(service.id)}
                              className="btn-secondary text-sm"
                            >
                              Add key
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline form for adding/editing key */}
                      {showByokForm === service.id && (
                        <div className="mt-3 border-t border-surface-3 pt-3">
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-ink-1">API Key</label>
                              <input
                                type="password"
                                value={byokApiKey}
                                onChange={(e) => setByokApiKey(e.target.value)}
                                className="input mt-1 text-sm"
                                placeholder={`Enter your ${service.name} API key`}
                              />
                            </div>
                            {service.id === "xai" && (
                              <div className="space-y-1">
                                <p className="text-xs text-ink-2">
                                  Get your API key at <a href="https://console.x.ai/team/default/api-keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">console.x.ai</a>
                                </p>
                                <p className="text-xs text-ink-2">
                                  Enables Grok models with real-time X/Twitter data for trend analysis, sentiment monitoring, research, and coordination with other agents. No direct posting or DM support.
                                </p>
                              </div>
                            )}
                            {service.id === "twitter" && (
                              <div className="space-y-1">
                                <p className="text-xs text-ink-2">
                                  Get your API credentials at <a href="https://developer.x.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">developer.x.com</a>
                                </p>
                                <p className="text-xs text-ink-2">
                                  Format: <code className="bg-surface-0 px-1 rounded">BEARER_TOKEN</code> or <code className="bg-surface-0 px-1 rounded">API_KEY:API_SECRET</code>
                                </p>
                                <p className="text-xs text-ink-2">
                                  Enables direct posting, replying, and account management on X.
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleSaveByok(service.id)}
                              disabled={savingByok || !byokApiKey.trim()}
                              className="btn-accent text-sm"
                            >
                              {savingByok ? "Saving..." : "Save key"}
                            </button>
                            <button
                              onClick={() => {
                                setShowByokForm(null);
                                setByokApiKey("");
                                setByokBaseUrl("");
                              }}
                              className="btn-secondary text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* API Keys */}
          <section className="card">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-ink-0">API Keys</h2>
                <p className="mt-1 text-sm text-ink-1">
                  Manage access to your agent's API.
                </p>
              </div>
              <button
                onClick={() => setShowNewKey(!showNewKey)}
                className="btn-secondary text-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New key
              </button>
            </div>

            {/* New key form */}
            {showNewKey && !createdKey && (
              <form onSubmit={handleCreateKey} className="mt-5 rounded-lg border border-surface-3 bg-surface-1 p-4">
                <h3 className="text-sm font-medium text-ink-0">Create API key</h3>
                <div className="mt-3 space-y-3">
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Key name (e.g., Production)"
                    className="input"
                  />
                  <div>
                    <label className="block text-sm text-ink-1">Key type</label>
                    <select
                      value={newKeyType}
                      onChange={(e) =>
                        setNewKeyType(
                          e.target.value as "user_universal" | "agent_scoped"
                        )
                      }
                      className="input mt-1"
                    >
                      <option value="user_universal">User universal key</option>
                      <option value="agent_scoped">Agent scoped key</option>
                    </select>
                    <p className="mt-1 text-xs text-ink-2">
                      Universal keys access your full namespace. Agent scoped keys can
                      be limited to selected agents.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-ink-1">Scopes</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {KEY_SCOPE_OPTIONS.map((scope) => (
                        <label key={scope.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={newKeyScopes.includes(scope.id)}
                            onChange={(e) =>
                              toggleNewKeyScope(scope.id, e.target.checked)
                            }
                            className="h-4 w-4 rounded border-surface-3 accent-accent"
                          />
                          <span className="text-sm text-ink-0">{scope.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-ink-1">Route groups</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {KEY_ROUTE_GROUP_OPTIONS.map((group) => (
                        <label key={group.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={newKeyRouteGroups.includes(group.id)}
                            onChange={(e) =>
                              toggleNewKeyRouteGroup(group.id, e.target.checked)
                            }
                            className="h-4 w-4 rounded border-surface-3 accent-accent"
                          />
                          <span className="text-sm text-ink-0">{group.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-ink-1">
                      Restrict this key to agents (optional)
                    </label>
                    <p className="mt-1 text-xs text-ink-2">
                      Keep empty for universal agent access. Select agents to limit
                      this key to specific personas.
                    </p>
                    <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-surface-3 p-2">
                      {myAgents === undefined ? (
                        <p className="text-xs text-ink-2">Loading agents...</p>
                      ) : myAgents.length === 0 ? (
                        <p className="text-xs text-ink-2">No agents found.</p>
                      ) : (
                        myAgents.map((agent) => (
                          <label key={agent._id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={newKeyAllowedAgentIds.includes(agent._id)}
                              onChange={(e) =>
                                toggleNewKeyAgent(agent._id, e.target.checked)
                              }
                              className="h-4 w-4 rounded border-surface-3 accent-accent"
                            />
                            <span className="text-sm text-ink-0">
                              {agent.name} ({agent.slug})
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    {newKeyType === "agent_scoped" && (
                      <p className="mt-1 text-xs text-ink-2">
                        Agent scoped keys require at least one selected agent.
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="submit"
                    disabled={
                      creatingKey ||
                      !newKeyName.trim() ||
                      newKeyScopes.length === 0 ||
                      newKeyRouteGroups.length === 0 ||
                      (newKeyType === "agent_scoped" &&
                        newKeyAllowedAgentIds.length === 0)
                    }
                    className="btn-accent text-sm"
                  >
                    {creatingKey ? "Creating..." : "Create key"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewKey(false);
                      setNewKeyType("user_universal");
                      setNewKeyAllowedAgentIds([]);
                      setNewKeyRouteGroups(["api", "mcp", "docs", "skills"]);
                    }}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Show created key */}
            {createdKey && (
              <div className="mt-5 rounded-lg border border-accent bg-accent/5 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-ink-0">Your API key</h3>
                    <p className="mt-1 text-xs text-ink-2-interactive">
                      Copy this key now. You won't be able to see it again.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setCreatedKey(null);
                      setShowNewKey(false);
                    }}
                    className="rounded p-1 text-ink-2 hover:bg-surface-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-0 p-3">
                  <code className="flex-1 truncate text-sm text-ink-0">{createdKey}</code>
                  <button
                    onClick={() => copyToClipboard(createdKey)}
                    className="btn-secondary text-sm"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            {/* Key list */}
            <div className="mt-5">
              {apiKeys === undefined ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="rounded-lg bg-surface-1 py-8 text-center">
                  <svg className="mx-auto h-8 w-8 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                  <p className="mt-2 text-sm text-ink-1">No API keys</p>
                  <p className="mt-1 text-xs text-ink-2">
                    Create a key to access your agent's API
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {apiKeys.map((key) => (
                    <div
                      key={key._id}
                      className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-1 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink-0">{key.name}</span>
                          {!key.isActive && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
                              Revoked
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-ink-2">
                          <code>{key.keyPrefix}...</code>
                          <span>
                            Type: {key.keyType === "agent_scoped" ? "agent scoped" : "user universal"}
                          </span>
                          <span>
                            Routes: {(key.allowedRouteGroups ?? ["api", "mcp", "docs", "skills"]).join(", ")}
                          </span>
                          {key.allowedAgentIds && key.allowedAgentIds.length > 0 && (
                            <span>Agents: {key.allowedAgentIds.length}</span>
                          )}
                          <span>Scopes: {key.scopes.join(", ")}</span>
                          {key.lastUsedAt && (
                            <span>
                              Last used: {new Date(key.lastUsedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {key.isActive && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRotateKey(key._id)}
                            className="rounded p-2 text-ink-2 hover:bg-surface-2 hover:text-ink-0 transition-colors"
                            title="Rotate key"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m14.62 2A7.5 7.5 0 005.582 9M20 20v-5h-.581m0 0a7.5 7.5 0 01-14.62-2" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleRevokeKey(key._id)}
                            className="rounded p-2 text-ink-2 hover:bg-surface-2 hover:text-red-500 transition-colors"
                            title="Revoke key"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <h2 className="font-semibold text-ink-0">Agent status</h2>
            <p className="mt-1 text-sm text-ink-1">
              Live runtime status for your account.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-surface-3 bg-surface-1 px-3 py-2">
              <span className="status-online" />
              <span className="text-sm text-ink-0">Online</span>
            </div>
          </section>

          {/* Security tab (includes rate limits) */}
          <section className="card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink-0">Security</h2>
                <p className="mt-1 text-sm text-ink-1">
                  Review alerts and rate limiting windows from one settings section.
                </p>
              </div>
              <button
                onClick={handleDownloadSecurityCsv}
                disabled={!securityCsv}
                className="btn-secondary text-sm"
              >
                Export CSV
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-surface-1 p-1">
              <button
                type="button"
                onClick={() => setSecurityTab("alerts")}
                className={`rounded-md px-3 py-2 text-sm ${
                  securityTab === "alerts"
                    ? "bg-surface-0 text-ink-0 shadow-card"
                    : "text-ink-1"
                }`}
              >
                Alerts
              </button>
              <button
                type="button"
                onClick={() => setSecurityTab("rate_limits")}
                className={`rounded-md px-3 py-2 text-sm ${
                  securityTab === "rate_limits"
                    ? "bg-surface-0 text-ink-0 shadow-card"
                    : "text-ink-1"
                }`}
              >
                Rate limits
              </button>
            </div>

            {securityTab === "alerts" ? (
              <div className="mt-4">
                {securityEvents === undefined ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                  </div>
                ) : securityEvents.length === 0 ? (
                  <p className="text-sm text-ink-1">No security alerts found.</p>
                ) : (
                  <div className="space-y-2">
                    {securityEvents.slice(0, 20).map((event) => (
                      <div
                        key={event._id}
                        className="rounded-lg border border-surface-3 bg-surface-1 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                            {event.status}
                          </span>
                          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
                            {event.action}
                          </span>
                          <span className="text-xs text-ink-2">
                            {new Date(event.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-ink-0">{event.resource}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4">
                {rateLimitDashboard === undefined ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-surface-3 bg-surface-1 p-3">
                        <p className="text-xs text-ink-1">Active windows</p>
                        <p className="mt-1 text-2xl font-semibold text-ink-0">
                          {rateLimitDashboard.activeWindows}
                        </p>
                      </div>
                      <div className="rounded-lg border border-surface-3 bg-surface-1 p-3">
                        <p className="text-xs text-ink-1">Requests in current window</p>
                        <p className="mt-1 text-2xl font-semibold text-ink-0">
                          {rateLimitDashboard.totalRequestsInWindow}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {rateLimitDashboard.topKeys.length === 0 ? (
                        <p className="text-sm text-ink-1">No active windows.</p>
                      ) : (
                        rateLimitDashboard.topKeys.map((entry) => (
                          <div
                            key={entry.key}
                            className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-1 p-3"
                          >
                            <p className="truncate text-sm text-ink-0">{entry.key}</p>
                            <span className="text-xs text-ink-1">{entry.count}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          {/* Danger zone */}
          <section className="card border-red-200">
            <h2 className="font-semibold text-red-600">Danger zone</h2>
            <p className="mt-1 text-sm text-ink-1">
              Irreversible actions. Proceed with caution.
            </p>
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
              <div>
                <p className="font-medium text-ink-0">Delete account</p>
                <p className="text-sm text-ink-1">
                  Permanently remove your account and all related data.
                </p>
                <p className="mt-2 text-xs text-ink-2">
                  Type <span className="font-mono">DELETE</span> to confirm.
                </p>
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="input sm:max-w-xs"
                  placeholder="Type DELETE"
                  disabled={deletingAccount}
                />
                <button
                  onClick={handleDeleteAccount}
                  disabled={
                    deletingAccount || deleteConfirmText.trim().toUpperCase() !== "DELETE"
                  }
                  className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingAccount ? "Deleting..." : "Delete account"}
                </button>
              </div>
              {deleteAccountError ? (
                <p className="mt-2 text-xs text-red-500">{deleteAccountError}</p>
              ) : null}
            </div>
            <div className="mt-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4">
              <div>
                <p className="font-medium text-ink-0">Sign out everywhere</p>
                <p className="text-sm text-ink-1">
                  End all active sessions on all devices.
                </p>
              </div>
              <button
                onClick={() => auth.signOut()}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Sign out
              </button>
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
