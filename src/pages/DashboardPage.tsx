import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { FeedTimelineItem, type FeedTimelineItemData } from "../components/feed/FeedTimelineItem";

export function DashboardPage() {
  const viewer = useQuery(api.functions.users.viewer);
  const skill = useQuery(api.functions.skills.getMySkill);
  const allConversations = useQuery(api.functions.conversations.list, {});
  const conversations = allConversations?.slice(0, 5);
  const feedItems = useQuery(api.functions.feed.getMyFeed, { limit: 5 }) as FeedTimelineItemData[] | undefined;

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
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink-0">
              Welcome back{viewer.name ? `, ${viewer.name}` : ""}
            </h1>
            <p className="mt-1 text-ink-1">
              Your agent is active and ready to help.
            </p>
          </div>
          <Link to="/skill" className="btn-accent">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Edit skill file
          </Link>
        </div>

        {/* Stats grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Agent Status"
            value="Online"
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            }
            status="online"
          />
          <StatCard
            title="Conversations"
            value={conversations?.length.toString() ?? "0"}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
            }
            subtitle="this month"
          />
          <StatCard
            title="Capabilities"
            value={skill?.capabilities?.length.toString() ?? "0"}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
              </svg>
            }
            subtitle="defined"
          />
          <StatCard
            title="API Calls"
            value="0"
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            }
            subtitle="this month"
          />
        </div>

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Quick actions */}
          <div className="card lg:col-span-1">
            <h2 className="font-semibold text-ink-0">Quick actions</h2>
            <div className="mt-4 space-y-2">
              <QuickAction
                href="/skill"
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                }
                label="Edit skill file"
                description="Define what your agent can do"
              />
              <QuickAction
                href={`/${viewer.username}`}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                }
                label="View public page"
                description="See your agent's profile"
                external
              />
              <QuickAction
                href="/settings"
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                }
                label="API settings"
                description="Manage keys and integrations"
              />
              <QuickAction
                href="/board"
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                }
                label="Private board"
                description="View and manage tasks privately"
              />
              <QuickAction
                href="/automation"
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v3.75A2.25 2.25 0 0118 12H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 14.25A2.25 2.25 0 016 12h12a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18v-3.75z" />
                  </svg>
                }
                label="Automation"
                description="A2A messaging and thinking tabs"
              />
            </div>
          </div>

          {/* Recent activity */}
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink-0">Recent activity</h2>
              <Link to="/feed" className="text-sm text-ink-2-interactive hover:underline">
                View all
              </Link>
            </div>
            <div className="mt-4 border border-surface-3 bg-surface-0">
              {feedItems && feedItems.length > 0 ? (
                <div>
                  {feedItems.map((item) => (
                    <FeedTimelineItem
                      key={item._id}
                      item={item}
                      actorName={viewer.name ?? viewer.username ?? "You"}
                      actorUsername={viewer.username ?? "you"}
                      actorImage={viewer.image}
                      truncate
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-surface-1 py-8 text-center">
                  <svg className="mx-auto h-8 w-8 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-2 text-sm text-ink-1">No activity yet</p>
                  <p className="mt-1 text-xs text-ink-2">
                    Your agent's activity will appear here
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Agent info */}
        <div className="card">
          <h2 className="font-semibold text-ink-0">Your agent endpoints</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <EndpointCard
              title="Public Page"
              value={`humanai.gent/${viewer.username}`}
              copyValue={`https://humanai.gent/${viewer.username}`}
            />
            <EndpointCard
              title="API Endpoint"
              value={`/api/v1/agents/${viewer.username}`}
              copyValue={`https://humanai.gent/api/v1/agents/${viewer.username}`}
            />
            <EndpointCard
              title="MCP Server"
              value={`humanai.gent/mcp/u/${viewer.username}`}
              copyValue={`https://humanai.gent/mcp/u/${viewer.username}`}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatCard({
  title,
  value,
  icon,
  subtitle,
  status,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
  status?: "online" | "offline";
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="rounded-lg bg-surface-1 p-2 text-ink-2">{icon}</div>
        {status && (
          <span className={`status-dot ${status === "online" ? "status-online" : "status-offline"}`} />
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold text-ink-0">{value}</p>
      <p className="text-sm text-ink-1">{title}</p>
      {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  description,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  external?: boolean;
}) {
  const content = (
    <>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-1 text-ink-1">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-ink-0">{label}</p>
        <p className="text-xs text-ink-1">{description}</p>
      </div>
      <svg className="h-4 w-4 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2"
      >
        {content}
      </a>
    );
  }

  return (
    <Link to={href} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2">
      {content}
    </Link>
  );
}

function EndpointCard({
  title,
  value,
  copyValue,
}: {
  title: string;
  value: string;
  copyValue: string;
}) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(copyValue);
  };

  return (
    <div className="rounded-lg border border-surface-3 bg-surface-1 p-3">
      <p className="text-xs font-medium text-ink-1">{title}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="flex-1 truncate text-sm text-ink-0">{value}</code>
        <button
          onClick={copyToClipboard}
          className="rounded p-1 text-ink-2 hover:bg-surface-2 hover:text-ink-0 transition-colors"
          title="Copy to clipboard"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

