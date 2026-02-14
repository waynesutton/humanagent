import { useParams, Link, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";

// Privacy settings type
interface PrivacySettings {
  profileVisible: boolean;
  showEmail: boolean;
  showPhone: boolean;
  showSkills: boolean;
  showActivity: boolean;
  showTasks: boolean;
  showEndpoints: boolean;
}

interface PublicAgentSummary {
  _id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  agentEmail?: string;
  publicConnect?: {
    showApi?: boolean;
    showMcp?: boolean;
    showEmail?: boolean;
    showSkillFile?: boolean;
  };
}

interface PublicSkill {
  identity?: {
    name?: string;
    bio?: string;
  };
  capabilities?: Array<{ name: string; description: string }>;
  knowledgeDomains?: string[];
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

interface PublicTask {
  _id: string;
  description: string;
  status: string;
  createdAt: number;
}

interface PublicFeedItem {
  _id: string;
  type: string;
  title: string;
  content?: string;
  createdAt: number;
}

export function PublicAgentPage() {
  const { username, slug } = useParams<{ username: string; slug?: string }>();
  const location = useLocation();
  const normalizedUsername = username?.startsWith("@") ? username.slice(1) : username;
  const hasAtPrefix = Boolean(username && normalizedUsername && normalizedUsername !== username);
  const user = useQuery(
    api.functions.users.getByUsername,
    normalizedUsername ? { username: normalizedUsername } : "skip"
  );
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
  ) as
    | PublicFeedItem[]
    | undefined;
  const publicTasks = useQuery(
    api.functions.board.getPublicTasks,
    normalizedUsername ? { username: normalizedUsername } : "skip"
  ) as
    | PublicTask[]
    | undefined;

  // Get privacy settings with defaults
  const privacy: PrivacySettings = (user as { privacySettings?: PrivacySettings } | null)?.privacySettings ?? {
    profileVisible: true,
    showEmail: true,
    showPhone: false,
    showSkills: true,
    showActivity: true,
    showTasks: true,
    showEndpoints: true,
  };

  // Check if profile is hidden
  const profileHidden = (user as { profileHidden?: boolean } | null)?.profileHidden;

  const selectedAgent =
    selectedAgentBySlug ??
    (selectedAgentSlug ? publicAgents?.find((agent) => agent.slug === selectedAgentSlug) : undefined) ??
    defaultAgent;

  const selectedMcpPath =
    normalizedUsername && selectedAgent?.slug
      ? `/mcp/u/${normalizedUsername}/${selectedAgent.slug}`
      : normalizedUsername
        ? `/mcp/u/${normalizedUsername}`
        : null;

  if (hasAtPrefix && normalizedUsername) {
    return <Navigate to={slug ? `/${normalizedUsername}/${slug}` : `/${normalizedUsername}`} replace />;
  }

  // Register WebMCP tools for Chrome 146+ (navigator.modelContext)
  useEffect(() => {
    if (!username || !skill || profileHidden || !selectedMcpPath) return;

    // Check if WebMCP API is available (Chrome 146+)
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

    // Register chat tool
    const chatToolName = `chat_with_${username}${selectedAgent?.slug ? `_${selectedAgent.slug}` : ""}`;
    nav.modelContext.registerTool({
      name: chatToolName,
      description: `Send a message to ${(selectedAgent?.name ?? skill.identity?.name ?? username)}'s AI agent`,
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message to send to the agent",
          },
        },
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

    // Register capability tools from skill
    const registeredTools: string[] = [chatToolName];

    if (skill.toolDeclarations) {
      for (const tool of skill.toolDeclarations) {
        const toolName = `${username}${selectedAgent?.slug ? `_${selectedAgent.slug}` : ""}_${tool.name}`;
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

    // Cleanup on unmount
    return () => {
      if (nav.modelContext) {
        for (const toolName of registeredTools) {
          nav.modelContext.unregisterTool(toolName);
        }
      }
    };
  }, [username, skill, profileHidden, selectedMcpPath, selectedAgent?.slug, selectedAgent?.name]);

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="flex min-h-screen flex-col bg-surface-0">
        <nav className="border-b border-surface-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                <span className="text-sm font-bold text-white">H</span>
              </div>
              <span className="text-lg font-semibold text-ink-0">HumanAgent</span>
            </Link>
          </div>
        </nav>
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-ink-0">Agent not found</h1>
            <p className="mt-2 text-ink-1">
              No agent exists at /{normalizedUsername}
            </p>
            <Link to="/" className="btn-accent mt-6">
              Go home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Canonical URL: /:username/:defaultSlug
  if (
    normalizedUsername &&
    !slug &&
    defaultAgent &&
    !profileHidden &&
    location.pathname === `/${normalizedUsername}`
  ) {
    return <Navigate to={`/${normalizedUsername}/${defaultAgent.slug}`} replace />;
  }

  if (slug && selectedAgentBySlug === null) {
    return (
      <div className="flex min-h-screen flex-col bg-surface-0">
        <nav className="border-b border-surface-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                <span className="text-sm font-bold text-white">H</span>
              </div>
              <span className="text-lg font-semibold text-ink-0">HumanAgent</span>
            </Link>
          </div>
        </nav>
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-ink-0">Public agent not found</h1>
            <p className="mt-2 text-ink-1">
              No public agent exists at /{normalizedUsername}/{slug}
            </p>
            <Link to={normalizedUsername ? `/${normalizedUsername}` : "/"} className="btn-accent mt-6">
              View profile
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Profile is hidden by privacy settings
  if (profileHidden) {
    return (
      <div className="flex min-h-screen flex-col bg-surface-0">
        <nav className="border-b border-surface-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                <span className="text-sm font-bold text-white">H</span>
              </div>
              <span className="text-lg font-semibold text-ink-0">HumanAgent</span>
            </Link>
          </div>
        </nav>
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-2xl bg-surface-1">
              <svg className="h-10 w-10 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-ink-0">Profile is private</h1>
            <p className="mt-2 text-ink-1">
              /{normalizedUsername} has chosen to keep their profile private.
            </p>
            <Link to="/" className="btn-accent mt-6">
              Go home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Navigation */}
      <nav className="border-b border-surface-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <span className="text-sm font-bold text-white">H</span>
            </div>
            <span className="text-lg font-semibold text-ink-0">HumanAgent</span>
          </Link>
          <Link to="/login" className="btn-secondary text-sm">
            Sign in
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="animate-fade-in">
          {/* Profile header */}
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-accent/10 text-4xl font-bold text-ink-2-interactive">
              {(skill?.identity?.name || user.name || username)?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="mt-4 sm:ml-6 sm:mt-0">
              <h1 className="text-2xl font-bold text-ink-0">
                {selectedAgent?.name || skill?.identity?.name || user.name || normalizedUsername}
              </h1>
              <p className="mt-1 text-ink-2">/{normalizedUsername}</p>
              {selectedAgent?.slug && (
                <p className="mt-1 text-xs text-ink-2">
                  Agent: /{selectedAgent.slug}
                </p>
              )}
              {(skill?.identity?.bio || (user as { bio?: string } | null)?.bio) && (
                <p className="mt-3 max-w-lg text-ink-1">
                  {skill?.identity?.bio || (user as { bio?: string } | null)?.bio}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                {skill?.communicationPrefs?.availability && (
                  <span className="badge-accent">
                    <span className={`status-dot ${
                      skill.communicationPrefs.availability === "available"
                        ? "status-online"
                        : "status-offline"
                    }`} />
                    {skill.communicationPrefs.availability}
                  </span>
                )}
                {skill?.communicationPrefs?.timezone && (
                  <span className="badge-neutral">
                    {skill.communicationPrefs.timezone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {publicAgents && publicAgents.length > 1 && (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-ink-1">Agents</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {publicAgents.map((agent: PublicAgentSummary) => {
                  const isSelected = selectedAgent?.slug === agent.slug;
                  return (
                    <Link
                      key={agent._id}
                      to={`/${normalizedUsername}/${agent.slug}`}
                      className={`rounded-full px-3 py-1 text-sm transition-colors ${
                        isSelected
                          ? "bg-accent/10 text-accent"
                          : "bg-surface-1 text-ink-1 hover:bg-surface-2"
                      }`}
                    >
                      {agent.name}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Capabilities */}
          {privacy.showSkills && skill?.capabilities && skill.capabilities.length > 0 && (
            <section className="mt-12">
              <h2 className="text-lg font-semibold text-ink-0">Capabilities</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {skill.capabilities.map((cap, i) => (
                  <div key={i} className="card">
                    <h3 className="font-medium text-ink-0">{cap.name}</h3>
                    <p className="mt-1 text-sm text-ink-1">{cap.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Knowledge domains */}
          {privacy.showSkills && skill?.knowledgeDomains && skill.knowledgeDomains.length > 0 && (
            <section className="mt-12">
              <h2 className="text-lg font-semibold text-ink-0">Knowledge domains</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {skill.knowledgeDomains.map((domain) => (
                  <span
                    key={domain}
                    className="rounded-full bg-surface-1 px-3 py-1 text-sm text-ink-0"
                  >
                    {domain}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Public tasks */}
          {privacy.showTasks && publicTasks && publicTasks.length > 0 && (
            <section className="mt-12">
              <h2 className="text-lg font-semibold text-ink-0">Recent work</h2>
              <div className="mt-4 space-y-2">
                {publicTasks.map((task) => (
                  <div key={task._id} className="card p-4">
                    <div className="flex items-start justify-between">
                      <p className="text-ink-0">{task.description}</p>
                      <TaskStatusBadge status={task.status} />
                    </div>
                    <p className="mt-2 text-xs text-ink-2">
                      {formatDate(task.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Activity feed */}
          {privacy.showActivity && feedItems && feedItems.length > 0 && (
            <section className="mt-12">
              <h2 className="text-lg font-semibold text-ink-0">Activity</h2>
              <div className="mt-4 space-y-3">
                {feedItems.map((item) => (
                  <div key={item._id} className="card">
                    <div className="flex items-center gap-2">
                      <FeedTypeBadge type={item.type} />
                      <span className="text-xs text-ink-2">{formatDate(item.createdAt)}</span>
                    </div>
                    <h3 className="mt-2 font-medium text-ink-0">{item.title}</h3>
                    {item.content && (
                      <p className="mt-1 text-sm text-ink-1 whitespace-pre-wrap">
                        {item.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Endpoints */}
          {privacy.showEndpoints && (
            <section className="mt-12">
              <h2 className="text-lg font-semibold text-ink-0">Connect</h2>
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-ink-1">Profile endpoints</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <EndpointCard
                      title="Default API"
                      value={`humanai.gent/api/v1/agents/${normalizedUsername}/messages`}
                      icon={
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      }
                    />
                    <EndpointCard
                      title="Default MCP Server"
                      value={`humanai.gent/mcp/u/${normalizedUsername}`}
                      icon={
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                        </svg>
                      }
                    />
                    {privacy.showEmail && (
                      <EndpointCard
                        title="User Email"
                        value={`${normalizedUsername}@humanai.gent`}
                        icon={
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        }
                      />
                    )}
                    <EndpointCard
                      title="llms.txt"
                      value={`humanai.gent/${normalizedUsername}/llms.txt`}
                      icon={
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      }
                    />
                    <EndpointCard
                      title="llms-full.md"
                      value={`humanai.gent/${normalizedUsername}/llms-full.md`}
                      icon={
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      }
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-ink-1">Public agents</h3>
                  {!publicAgents || publicAgents.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-2">No public agents are currently available.</p>
                  ) : (
                    <div className="mt-3 space-y-4">
                      {publicAgents.map((agent: PublicAgentSummary) => {
                        const showApi = agent.publicConnect?.showApi ?? true;
                        const showMcp = agent.publicConnect?.showMcp ?? true;
                        const showEmail = agent.publicConnect?.showEmail ?? true;
                        const showSkillFile = agent.publicConnect?.showSkillFile ?? true;

                        return (
                          <div key={agent._id} className="rounded-lg border border-surface-3 bg-surface-1 p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <p className="font-medium text-ink-0">{agent.name}</p>
                              <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
                                /{agent.slug}
                              </span>
                              {agent.isDefault && (
                                <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                                  Default
                                </span>
                              )}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              {showApi && (
                                <EndpointCard
                                  title="Agent API"
                                  value={`humanai.gent/api/v1/agents/${normalizedUsername}/${agent.slug}/messages`}
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  }
                                />
                              )}
                              {showMcp && (
                                <EndpointCard
                                  title="Agent MCP"
                                  value={`humanai.gent/mcp/u/${normalizedUsername}/${agent.slug}`}
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                                    </svg>
                                  }
                                />
                              )}
                              {showEmail && privacy.showEmail && agent.agentEmail && (
                                <EndpointCard
                                  title="Agent Email"
                                  value={agent.agentEmail}
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                  }
                                />
                              )}
                              {showSkillFile && (
                                <EndpointCard
                                  title="Agent Skill File"
                                  value={`humanai.gent/u/${normalizedUsername}/${agent.slug}/skill.json`}
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  }
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-3 py-8">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="text-sm text-ink-1">
            Powered by{" "}
            <Link to="/" className="text-ink-2-interactive hover:underline">
              HumanAgent
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  const labels: Record<string, string> = {
    pending: "Pending",
    in_progress: "In Progress",
    completed: "Done",
    failed: "Failed",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  );
}

function FeedTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    manual_post: "Post",
    message_handled: "Message",
    task_completed: "Task",
    integration_action: "Integration",
    status_update: "Status",
  };

  return (
    <span className="rounded bg-surface-1 px-2 py-0.5 text-xs font-medium text-ink-1">
      {labels[type] || type}
    </span>
  );
}

function EndpointCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  function copyToClipboard() {
    const fullUrl = value.startsWith("http") ? value : `https://${value}`;
    navigator.clipboard.writeText(fullUrl);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-surface-3 bg-surface-1 p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink-1">{title}</p>
        <p className="truncate text-sm text-ink-0">{value}</p>
      </div>
      <button
        onClick={copyToClipboard}
        className="rounded p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink-0 transition-colors"
        title="Copy"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
    </div>
  );
}

function formatDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
