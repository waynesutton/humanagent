import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { FeedTimelineItem, type FeedTimelineItemData } from "../components/feed/FeedTimelineItem";
import { CopySimple, GithubLogo, LinkedinLogo, XLogo } from "@phosphor-icons/react";
import type { Id } from "../../convex/_generated/dataModel";
import { notify } from "../lib/notify";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface PrivacySettings {
  profileVisible: boolean;
  showEmail: boolean;
  showPhone: boolean;
  showSkills: boolean;
  showActivity: boolean;
  showTasks: boolean;
  showEndpoints: boolean;
}

interface PublicUser {
  _id: string;
  username?: string;
  name?: string;
  bio?: string;
  image?: string;
  socialProfiles?: {
    twitter?: string;
    linkedin?: string;
    github?: string;
  };
  profileHidden?: boolean;
  privacySettings?: PrivacySettings;
}

interface PublicAgentSummary {
  _id: Id<"agents">;
  name: string;
  slug: string;
  description?: string;
  isDefault: boolean;
  agentEmail?: string;
  image?: string;
  publicConnect?: {
    showApi?: boolean;
    showMcp?: boolean;
    showEmail?: boolean;
    showSkillFile?: boolean;
  };
}

interface ViewerUser {
  _id: Id<"users">;
}

interface ViewerAgent {
  _id: Id<"agents">;
  name: string;
  isDefault: boolean;
}

interface PublicSkill {
  identity?: {
    name?: string;
    bio?: string;
  };
  capabilities?: Array<{ name: string; description: string }>;
  communicationPrefs?: {
    availability?: string;
    timezone?: string;
  };
  toolDeclarations?: Array<{
    name: string;
    description: string;
    inputSchema?: object;
  }>;
}

type PublicFeedItem = FeedTimelineItemData;

interface PublicSocial {
  service: string;
  externalUsername?: string;
  profileUrl?: string;
}

type ConnectCard = {
  label: string;
  value: string;
  href: string;
  external?: boolean;
};

const DEFAULT_PRIVACY: PrivacySettings = {
  profileVisible: true,
  showEmail: true,
  showPhone: false,
  showSkills: true,
  showActivity: true,
  showTasks: true,
  showEndpoints: true,
};

export function PublicUserProfilePage() {
  const { username, slug } = useParams<{ username: string; slug?: string }>();
  const normalizedUsername = username?.startsWith("@") ? username.slice(1) : username;
  const hasAtPrefix = Boolean(username && normalizedUsername && username !== normalizedUsername);
  const isUPath = location.pathname.startsWith("/u/");
  const profileBasePath = normalizedUsername
    ? isUPath
      ? `/u/${normalizedUsername}`
      : `/${normalizedUsername}`
    : "/";
  const user = useQuery(
    api.functions.users.getByUsername,
    normalizedUsername ? { username: normalizedUsername } : "skip"
  ) as PublicUser | null | undefined;

  const publicAgents = useQuery(
    api.functions.agents.listPublicByUsername,
    normalizedUsername ? { username: normalizedUsername } : "skip"
  ) as PublicAgentSummary[] | undefined;

  const defaultAgent = useQuery(
    api.functions.agents.getPublicDefaultByUsername,
    normalizedUsername ? { username: normalizedUsername } : "skip"
  ) as PublicAgentSummary | null | undefined;

  const selectedAgentBySlug = useQuery(
    api.functions.agents.getPublicByUsernameAndSlug,
    normalizedUsername && slug ? { username: normalizedUsername, slug } : "skip"
  ) as PublicAgentSummary | null | undefined;

  const selectedAgentSlug = slug ?? defaultAgent?.slug;

  const skill = useQuery(
    api.functions.skills.getPublicSkillByAgent,
    normalizedUsername && selectedAgentSlug
      ? { username: normalizedUsername, slug: selectedAgentSlug }
      : "skip"
  ) as PublicSkill | null | undefined;

  const feedItems = useQuery(
    api.functions.feed.getPublicFeed,
    normalizedUsername ? { username: normalizedUsername, limit: 10 } : "skip"
  ) as PublicFeedItem[] | undefined;

  const socialProfiles = useQuery(
    api.functions.connectedApps.getPublicByUsername,
    normalizedUsername ? { username: normalizedUsername } : "skip"
  ) as PublicSocial[] | undefined;

  const [activeAgentId, setActiveAgentId] = useState<Id<"agents"> | null>(null);
  const [requestDescription, setRequestDescription] = useState("");
  const [requestAgentId, setRequestAgentId] = useState<Id<"agents"> | null>(null);
  const [targetAgentId, setTargetAgentId] = useState<Id<"agents"> | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isRequestFormOpen, setIsRequestFormOpen] = useState(false);

  useEscapeKey(() => setActiveAgentId(null), !!activeAgentId);
  const viewer = useQuery(api.functions.users.viewer, {}) as ViewerUser | null | undefined;
  const requesterAgents = useQuery(
    api.functions.agents.list,
    viewer ? {} : "skip"
  ) as ViewerAgent[] | undefined;
  const requestPublicAgentTask = useMutation(api.functions.board.requestPublicAgentTask);
  const selectedAgent =
    selectedAgentBySlug ??
    (selectedAgentSlug ? publicAgents?.find((agent) => agent.slug === selectedAgentSlug) : undefined) ??
    defaultAgent ??
    publicAgents?.[0];
  const activeAgent = publicAgents?.find((agent) => agent._id === activeAgentId) ?? null;
  const publicAgentPath = activeAgent && normalizedUsername ? `${profileBasePath}/${activeAgent.slug}` : null;

  const privacy = user?.privacySettings ?? DEFAULT_PRIVACY;
  const profileHidden = user?.profileHidden ?? false;
  const hasRequesterProfile = viewer !== null && viewer !== undefined;
  const hasRequesterAgent = Boolean(requesterAgents && requesterAgents.length > 0);

  const selectedMcpPath =
    normalizedUsername && selectedAgent?.slug
      ? `/mcp/u/${normalizedUsername}/${selectedAgent.slug}`
      : normalizedUsername
        ? `/mcp/u/${normalizedUsername}`
        : null;

  const socialLinks = useMemo(() => {
    const linksMap = new Map<string, { service: string; href: string; label: string }>();
    const serviceOrder = ["github", "twitter", "linkedin"] as const;

    const manualProfiles = user?.socialProfiles;
    if (manualProfiles) {
      const manualEntries = [
        { service: "github", value: manualProfiles.github },
        { service: "twitter", value: manualProfiles.twitter },
        { service: "linkedin", value: manualProfiles.linkedin },
      ] as const;
      for (const entry of manualEntries) {
        if (!entry.value) continue;
        const href = buildSocialHref(entry.service, entry.value);
        if (!href) continue;
        linksMap.set(entry.service, {
          service: entry.service,
          href,
          label: entry.value,
        });
      }
    }

    for (const service of serviceOrder) {
      const match = socialProfiles?.find((item) => item.service === service);
      if (!match) continue;
      const href = buildSocialHref(
        service,
        match.profileUrl ?? match.externalUsername ?? ""
      );
      if (!href) continue;
      if (linksMap.has(service)) continue;
      linksMap.set(service, {
        service,
        href,
        label: match.externalUsername ?? service,
      });
    }
    return serviceOrder.map((service) => linksMap.get(service)).filter(Boolean) as Array<{
      service: string;
      href: string;
      label: string;
    }>;
  }, [socialProfiles, user?.socialProfiles]);

  useEffect(() => {
    if (!requesterAgents || requesterAgents.length === 0) {
      setRequestAgentId(null);
      return;
    }
    setRequestAgentId((prev) => {
      if (prev && requesterAgents.some((agent) => agent._id === prev)) return prev;
      return requesterAgents.find((agent) => agent.isDefault)?._id ?? requesterAgents[0]!._id;
    });
  }, [requesterAgents]);

  useEffect(() => {
    if (!publicAgents || publicAgents.length === 0) {
      setTargetAgentId(null);
      return;
    }
    setTargetAgentId((prev) => {
      if (prev && publicAgents.some((agent) => agent._id === prev)) return prev;
      if (selectedAgent?._id) return selectedAgent._id;
      return publicAgents[0]!._id;
    });
  }, [publicAgents, selectedAgent?._id]);

  async function handleRequestTask() {
    if (!normalizedUsername || !targetAgentId || !requestAgentId || !requestDescription.trim()) return;
    try {
      setIsSubmittingRequest(true);
      await requestPublicAgentTask({
        targetUsername: normalizedUsername,
        targetAgentId,
        requesterAgentId: requestAgentId,
        description: requestDescription.trim(),
      });
      setRequestDescription("");
      notify.success("Task request sent", "Added to this agent's Inbox board.");
    } catch (error) {
      notify.error("Could not send task request", error);
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  function handleRequestTaskKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || !event.shiftKey) return;
    event.preventDefault();
    if (!canRequestTask) return;
    void handleRequestTask();
  }

  // Register WebMCP tools for Chrome 146+ (navigator.modelContext)
  useEffect(() => {
    if (!normalizedUsername || !skill || profileHidden || !selectedMcpPath) return;

    const nav = navigator as Navigator & {
      modelContext?: {
        registerTool: (tool: {
          name: string;
          description: string;
          inputSchema: object;
          handler: (args: Record<string, unknown>) => Promise<string>;
        }) => void;
        unregisterTool: (name: string) => void;
      };
    };
    if (!nav.modelContext) return;

    const chatToolName = `chat_with_${normalizedUsername}${selectedAgent?.slug ? `_${selectedAgent.slug}` : ""}`;
    nav.modelContext.registerTool({
      name: chatToolName,
      description: `Send a message to ${(selectedAgent?.name ?? skill.identity?.name ?? normalizedUsername)}'s AI agent`,
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
      handler: async (args) => {
        const response = await fetch(selectedMcpPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "tools/call",
            params: { name: "chat", arguments: { message: args.message } },
            id: Date.now(),
          }),
        });
        const result = await response.json();
        return result.result?.content?.[0]?.text ?? "No response";
      },
    });

    const registeredTools: string[] = [chatToolName];
    if (skill.toolDeclarations) {
      for (const tool of skill.toolDeclarations) {
        const toolName = `${normalizedUsername}${selectedAgent?.slug ? `_${selectedAgent.slug}` : ""}_${tool.name}`;
        nav.modelContext.registerTool({
          name: toolName,
          description: tool.description,
          inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
          handler: async (args) => {
            const response = await fetch(selectedMcpPath, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                method: "tools/call",
                params: { name: tool.name, arguments: args },
                id: Date.now(),
              }),
            });
            const result = await response.json();
            return result.result?.content?.[0]?.text ?? "No response";
          },
        });
        registeredTools.push(toolName);
      }
    }

    return () => {
      if (!nav.modelContext) return;
      for (const toolName of registeredTools) {
        nav.modelContext.unregisterTool(toolName);
      }
    };
  }, [normalizedUsername, profileHidden, selectedAgent?.name, selectedAgent?.slug, selectedMcpPath, skill]);

  if (hasAtPrefix && normalizedUsername) {
    return <Navigate to={`/u/${normalizedUsername}${slug ? `/${slug}` : ""}`} replace />;
  }

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin border-2 border-surface-3 border-t-ink-0" />
      </div>
    );
  }

  if (user === null) {
    return <PublicState title="Agent not found" description={`No profile exists at /u/${normalizedUsername}`} />;
  }

  if (slug && selectedAgentBySlug === null) {
    return (
      <PublicState
        title="Public agent not found"
        description={`No public agent exists at /u/${normalizedUsername}/${slug}`}
      />
    );
  }

  if (profileHidden || !privacy.profileVisible) {
    return <PublicState title="Profile is private" description={`/${normalizedUsername} is not publicly visible.`} />;
  }

  const requestTargetAgent =
    (targetAgentId ? publicAgents?.find((agent) => agent._id === targetAgentId) : undefined) ?? selectedAgent;
  const canRequestTask =
    Boolean(normalizedUsername) &&
    hasRequesterProfile &&
    hasRequesterAgent &&
    Boolean(requestTargetAgent) &&
    Boolean(requestAgentId) &&
    requestDescription.trim().length > 0 &&
    !isSubmittingRequest;

  return (
    <div className="min-h-screen bg-surface-0">
      <nav className="sticky top-0 z-40 border-b border-surface-3 bg-surface-0/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center bg-ink-0">
              <span className="text-xs font-bold text-surface-0">H</span>
            </div>
            <span className="font-semibold text-ink-0">HumanAgent</span>
          </Link>
          <Link to="/login" className="border border-surface-3 px-3 py-1.5 text-sm text-ink-1 hover:bg-surface-1">
            Sign in
          </Link>
        </div>
      </nav>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <section className="grid items-stretch gap-4 lg:grid-cols-12">
          <div className="border border-surface-3 bg-surface-0 p-4 sm:p-6 lg:col-span-4">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start lg:flex-col">
              <Avatar image={selectedAgent?.image ?? user.image} name={selectedAgent?.name ?? user.name ?? normalizedUsername ?? "U"} />
              <div className="min-w-0 flex-1">
                <h1 className="text-balance text-2xl font-semibold text-ink-0">
                  {selectedAgent?.name || skill?.identity?.name || user.name || normalizedUsername}
                </h1>
                <p className="mt-1 text-sm text-ink-2">@{normalizedUsername}</p>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-1">
                  {selectedAgent?.description || skill?.identity?.bio || user.bio || "Public AI profile"}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  {skill?.communicationPrefs?.availability && (
                    <span className="border border-surface-3 px-2 py-1 text-ink-1">{skill.communicationPrefs.availability}</span>
                  )}
                  {skill?.communicationPrefs?.timezone && (
                    <span className="border border-surface-3 px-2 py-1 text-ink-1">{skill.communicationPrefs.timezone}</span>
                  )}
                </div>
                {socialLinks.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {socialLinks.map((link) => (
                      <a
                        key={link.service}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex size-9 items-center justify-center border border-surface-3 text-ink-1 hover:bg-surface-1 hover:text-ink-0"
                        aria-label={`${link.service} profile`}
                        title={link.label}
                      >
                        <SocialIcon service={link.service} />
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-4 border border-surface-3 bg-surface-1">
                  <button
                    type="button"
                    onClick={() => setIsRequestFormOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-surface-2"
                    aria-expanded={isRequestFormOpen}
                  >
                    <span className="text-sm font-medium text-ink-0">Request an agent to do a task</span>
                    <span className="shrink-0 text-xs text-ink-2">{isRequestFormOpen ? "Hide" : "Show"}</span>
                  </button>
                  {isRequestFormOpen && (
                    <div className="border-t border-surface-3 p-4">
                      <p className="text-sm text-ink-2">
                        Sends the task into the target agent board Inbox. You must have a profile and at least one agent.
                      </p>

                      {viewer === undefined ? (
                        <div className="mt-3 border border-surface-3 bg-surface-0 p-3 text-sm text-ink-2">
                          Checking your account...
                        </div>
                      ) : !hasRequesterProfile ? (
                        <div className="mt-3 border border-surface-3 bg-surface-0 p-3 text-sm text-ink-2">
                          Sign in with your profile to request a task.
                        </div>
                      ) : !hasRequesterAgent ? (
                        <div className="mt-3 border border-surface-3 bg-surface-0 p-3 text-sm text-ink-2">
                          Create at least one agent before sending requests.
                        </div>
                      ) : (
                        <div className="mt-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-xs text-ink-2">
                              <span className="mb-1 block">Your agent</span>
                              <select
                                value={requestAgentId ?? ""}
                                onChange={(event) => setRequestAgentId(event.target.value as Id<"agents">)}
                                className="w-full border border-surface-3 bg-surface-0 px-3 py-2 text-sm text-ink-1"
                              >
                                {requesterAgents?.map((agent) => (
                                  <option key={agent._id} value={agent._id}>
                                    {agent.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-xs text-ink-2">
                              <span className="mb-1 block">Target public agent</span>
                              <select
                                value={targetAgentId ?? ""}
                                onChange={(event) => setTargetAgentId(event.target.value as Id<"agents">)}
                                className="w-full border border-surface-3 bg-surface-0 px-3 py-2 text-sm text-ink-1"
                              >
                                {publicAgents?.map((agent) => (
                                  <option key={agent._id} value={agent._id}>
                                    {agent.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="text-xs text-ink-2">
                            <span className="mb-1 block">Task description</span>
                            <textarea
                              value={requestDescription}
                              onChange={(event) => setRequestDescription(event.target.value)}
                              onKeyDown={handleRequestTaskKeyDown}
                              className="min-h-24 w-full resize-y border border-surface-3 bg-surface-0 px-3 py-2 text-sm text-ink-1"
                              placeholder="Describe what you want this agent to do"
                              maxLength={800}
                            />
                          </label>
                          <div className="flex items-center justify-between gap-2 text-xs text-ink-2">
                            <span>Enter = new line, Shift+Enter = request task</span>
                            <span>{requestDescription.trim().length}/800</span>
                            <button
                              type="button"
                              onClick={() => void handleRequestTask()}
                              disabled={!canRequestTask}
                              className="border border-surface-3 px-3 py-1.5 text-sm text-ink-1 hover:bg-surface-0 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSubmittingRequest ? "Sending..." : "Request task"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border border-surface-3 bg-surface-0 p-4 sm:p-6 lg:col-span-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-ink-2">Activity</h2>
            <div className="mt-3 max-h-96 overflow-y-auto border border-surface-3 bg-surface-0">
              {!privacy.showActivity ? (
                <div className="p-4 text-sm text-ink-2">Public activity is hidden for this profile.</div>
              ) : !feedItems || feedItems.length === 0 ? (
                <div className="p-4 text-sm text-ink-2">No public activity yet.</div>
              ) : (
                <>
                  {feedItems.slice(0, 10).map((item) => (
                    <FeedTimelineItem
                      key={item._id}
                      item={item}
                      actorName={selectedAgent?.name || user.name || normalizedUsername || "Unknown"}
                      actorUsername={normalizedUsername || "user"}
                      actorImage={selectedAgent?.image ?? user.image}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-2">Public agents</h2>
          {!publicAgents || publicAgents.length === 0 ? (
            <div className="mt-3 border border-surface-3 bg-surface-1 p-4 text-sm text-ink-2">No public agents yet.</div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {publicAgents.map((agent) => (
                <button
                  key={agent._id}
                  type="button"
                  onClick={() => setActiveAgentId(agent._id)}
                  className="flex h-full flex-col gap-3 border border-surface-3 bg-surface-0 p-4 text-left transition-colors hover:bg-surface-1"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar image={agent.image} name={agent.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-0">{agent.name}</p>
                        <p className="truncate text-xs text-ink-2">/{agent.slug}</p>
                      </div>
                    </div>
                    {agent.isDefault && <span className="border border-surface-3 px-1.5 py-0.5 text-[10px] text-ink-1">default</span>}
                  </div>
                  <p className="truncate-3 text-xs text-ink-1">{agent.description || "Public agent profile"}</p>
                  <div className="mt-auto flex flex-wrap gap-1">
                    {getConnectPills(agent, privacy).map((pill) => (
                      <span key={`${agent._id}-${pill}`} className="border border-surface-3 px-2 py-0.5 text-[10px] text-ink-2">
                        {pill}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-ink-2">Public connect options</h2>
            {requestTargetAgent && (
              <span className="border border-surface-3 px-2 py-1 text-xs text-ink-1">Target: {requestTargetAgent.name}</span>
            )}
          </div>

          {privacy.showEndpoints && normalizedUsername && requestTargetAgent ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {buildConnectCards(normalizedUsername, requestTargetAgent, privacy).map((card) => (
                  <ConnectCardRow key={card.label} card={card} />
                ))}
              </div>
              <p className="text-xs text-ink-2">
                API and MCP routes require an API key with the right scope. llms, docs, and sitemap routes are public. Use profile llms for aggregate discovery and agent llms for persona-specific integrations.
              </p>
            </div>
          ) : (
            <div className="mt-3 border border-surface-3 bg-surface-1 p-4 text-sm text-ink-2">
              Public endpoint sharing is disabled for this profile.
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-surface-3 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-ink-2 sm:px-6">Powered by HumanAgent</div>
      </footer>

      {activeAgent && normalizedUsername && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-0/40 p-4 sm:items-center" onClick={() => setActiveAgentId(null)}>
          <div className="w-full max-w-lg border border-surface-3 bg-surface-0 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-ink-0">{activeAgent.name}</h3>
                <p className="text-xs text-ink-2">/{normalizedUsername}/{activeAgent.slug}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveAgentId(null)}
                className="border border-surface-3 px-2 py-1 text-xs text-ink-1 hover:bg-surface-1"
              >
                Close
              </button>
            </div>
            <p className="mt-3 text-sm text-ink-1">{activeAgent.description || "No description yet."}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {buildConnectCards(normalizedUsername, activeAgent, privacy).map((card) => (
                <ConnectCardRow key={`modal-${card.label}`} card={card} compact />
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-2">
              API and MCP routes require an API key with the right scope. llms, docs, and sitemap routes are public. Use profile llms for aggregate discovery and agent llms for persona-specific integrations.
            </p>
            {publicAgentPath && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window === "undefined") return;
                    const fullUrl = `${window.location.origin}${publicAgentPath}`;
                    void navigator.clipboard.writeText(fullUrl);
                  }}
                  className="inline-flex border border-surface-3 px-3 py-1.5 text-xs text-ink-1 hover:bg-surface-1"
                >
                  Copy public URL
                </button>
                <a
                  href={publicAgentPath}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex border border-surface-3 px-3 py-1.5 text-xs text-ink-1 hover:bg-surface-1"
                >
                  Open in new tab
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PublicState({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-h-screen bg-surface-0">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold text-ink-0">{title}</h1>
        <p className="mt-2 text-ink-1">{description}</p>
        <Link to="/" className="mt-6 border border-surface-3 px-4 py-2 text-sm text-ink-1 hover:bg-surface-1">
          Go home
        </Link>
      </div>
    </div>
  );
}

function Avatar({
  image,
  name,
  size = "lg",
}: {
  image?: string;
  name: string;
  size?: "lg" | "sm" | "xs";
}) {
  const sizeClass = size === "lg" ? "h-20 w-20" : size === "sm" ? "h-10 w-10" : "h-8 w-8";
  const textClass = size === "lg" ? "text-xl" : size === "sm" ? "text-xs" : "text-[11px]";
  if (image) {
    return <img src={image} alt={name} className={`${sizeClass} border border-surface-3 object-cover`} />;
  }
  return (
    <div className={`${sizeClass} flex items-center justify-center border border-surface-3 bg-surface-1 font-semibold text-ink-1 ${textClass}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function SocialIcon({ service }: { service: string }) {
  if (service === "github") return <GithubLogo size={16} weight="regular" />;
  if (service === "linkedin") return <LinkedinLogo size={16} weight="regular" />;
  return <XLogo size={16} weight="regular" />;
}

function buildSocialHref(service: "github" | "twitter" | "linkedin", raw: string) {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const handle = value.replace(/^@/, "");
  if (!handle) return null;
  if (service === "twitter") return `https://x.com/${handle}`;
  if (service === "linkedin") return `https://linkedin.com/in/${handle}`;
  return `https://github.com/${handle}`;
}

function getConnectPills(agent: PublicAgentSummary, privacy: PrivacySettings): string[] {
  const pills: string[] = [];
  if (agent.publicConnect?.showApi ?? true) pills.push("API");
  if (agent.publicConnect?.showMcp ?? true) pills.push("MCP");
  if ((agent.publicConnect?.showEmail ?? true) && privacy.showEmail && agent.agentEmail) pills.push("Email");
  if (agent.publicConnect?.showSkillFile ?? true) pills.push("Skill");
  return pills;
}

function buildConnectCards(username: string, agent: PublicAgentSummary, privacy: PrivacySettings) {
  const cards: Array<ConnectCard> = [];
  if (agent.publicConnect?.showApi ?? true) {
    cards.push({
      label: "API",
      value: `humana.gent/api/v1/agents/${username}/${agent.slug}/messages`,
      href: `/api/v1/agents/${username}/${agent.slug}/messages`,
    });
  }
  if (agent.publicConnect?.showMcp ?? true) {
    cards.push({
      label: "MCP",
      value: `humana.gent/mcp/u/${username}/${agent.slug}`,
      href: `/mcp/u/${username}/${agent.slug}`,
    });
  }
  if ((agent.publicConnect?.showSkillFile ?? true) && agent.slug) {
    cards.push({
      label: "Skill file",
      value: `humana.gent/u/${username}/${agent.slug}/skill.json`,
      href: `/u/${username}/${agent.slug}/skill.json`,
    });
  }
  if ((agent.publicConnect?.showEmail ?? true) && privacy.showEmail && agent.agentEmail) {
    cards.push({
      label: "Agent email",
      value: agent.agentEmail,
      href: `mailto:${agent.agentEmail}`,
      external: true,
    });
  }
  // Discovery docs endpoints
  cards.push({
    label: "Agent llms (persona)",
    value: `humana.gent/${username}/${agent.slug}/llms.txt`,
    href: `/${username}/${agent.slug}/llms.txt`,
  });
  cards.push({
    label: "Agent llms full (persona)",
    value: `humana.gent/${username}/${agent.slug}/llms-full.md`,
    href: `/${username}/${agent.slug}/llms-full.md`,
  });
  cards.push({
    label: "Profile llms (aggregate)",
    value: `humana.gent/${username}/llms.txt`,
    href: `/${username}/llms.txt`,
  });
  cards.push({
    label: "Profile llms full (aggregate)",
    value: `humana.gent/${username}/llms-full.md`,
    href: `/${username}/llms-full.md`,
  });
  cards.push({
    label: "API Docs",
    value: `humana.gent/api/v1/agents/${username}/docs.md`,
    href: `/api/v1/agents/${username}/docs.md`,
  });
  cards.push({
    label: "Tools Docs",
    value: `humana.gent/api/v1/agents/${username}/tools.md`,
    href: `/api/v1/agents/${username}/tools.md`,
  });
  cards.push({
    label: "OpenAPI",
    value: `humana.gent/api/v1/agents/${username}/openapi.json`,
    href: `/api/v1/agents/${username}/openapi.json`,
  });
  cards.push({
    label: "Sitemap",
    value: `humana.gent/${username}/sitemap.md`,
    href: `/${username}/sitemap.md`,
  });
  return cards;
}

function ConnectCardRow({ card, compact = false }: { card: ConnectCard; compact?: boolean }) {
  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    const copyValue = card.href.startsWith("mailto:") || card.value.startsWith("http")
      ? card.value
      : `https://${card.value}`;
    await navigator.clipboard.writeText(copyValue);
  };

  if (compact) {
    return (
      <div className="flex items-start gap-2 border border-surface-3 bg-surface-0 px-3 py-2 text-xs text-ink-1">
        <a
          href={card.href}
          target={card.external ? "_blank" : undefined}
          rel={card.external ? "noreferrer" : undefined}
          className="min-w-0 flex-1"
        >
          <div className="font-medium text-ink-0">{card.label}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-ink-2">{card.value}</div>
        </a>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="mt-0.5 rounded p-1 text-ink-2 transition-colors hover:bg-surface-1 hover:text-ink-0"
          aria-label={`Copy ${card.label}`}
          title={`Copy ${card.label}`}
        >
          <CopySimple size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border border-surface-3 bg-surface-0 px-3 py-3 text-sm">
      <a
        href={card.href}
        target={card.external ? "_blank" : undefined}
        rel={card.external ? "noreferrer" : undefined}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:text-ink-0"
      >
        <span className="text-ink-1">{card.label}</span>
        <span className="truncate font-mono text-xs text-ink-2">{card.value}</span>
      </a>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="rounded p-1 text-ink-2 transition-colors hover:bg-surface-1 hover:text-ink-0"
        aria-label={`Copy ${card.label}`}
        title={`Copy ${card.label}`}
      >
        <CopySimple size={14} />
      </button>
    </div>
  );
}

