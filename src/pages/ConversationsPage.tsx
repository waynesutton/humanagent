import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Doc, Id } from "../../convex/_generated/dataModel";

type Status = "active" | "resolved" | "escalated";

// Message type
interface Message {
  role: string;
  content: string;
  timestamp: number;
}

// Conversation type 
type Conversation = Doc<"conversations">;

export function ConversationsPage() {
  const [filter, setFilter] = useState<Status | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<Id<"conversations"> | null>(null);

  const allConversations = useQuery(api.functions.conversations.list, {});
  
  // Filter conversations client-side
  const conversations = filter 
    ? allConversations?.filter((c: Conversation) => c.status === filter) 
    : allConversations;
  const selectedConversation = useQuery(
    api.functions.conversations.get,
    selectedId ? { conversationId: selectedId } : "skip"
  );

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink-0">Conversations</h1>
            <p className="mt-1 text-ink-1">
              Messages your agent has handled.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FilterButton
              label="All"
              active={filter === undefined}
              onClick={() => setFilter(undefined)}
            />
            <FilterButton
              label="Active"
              active={filter === "active"}
              onClick={() => setFilter("active")}
            />
            <FilterButton
              label="Resolved"
              active={filter === "resolved"}
              onClick={() => setFilter("resolved")}
            />
          </div>
        </div>

        {/* Content */}
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* Conversation list */}
          <div className="lg:col-span-2">
            <div className="card p-0 overflow-hidden">
              {conversations === undefined ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-12 text-center">
                  <svg className="mx-auto h-10 w-10 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                  <p className="mt-3 text-sm text-ink-1">No conversations yet</p>
                  <p className="mt-1 text-xs text-ink-2">
                    Conversations will appear when your agent receives messages
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {conversations.map((conv: Conversation) => (
                    <button
                      key={conv._id}
                      onClick={() => setSelectedId(conv._id)}
                      className={`w-full p-4 text-left transition-colors hover:bg-surface-2 ${
                        selectedId === conv._id ? "bg-surface-1" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <ChannelBadge channel={conv.channel} />
                            <StatusBadge status={conv.status} />
                          </div>
                          <p className="mt-1.5 truncate text-sm text-ink-0">
                            {conv.messages[0]?.content || "No messages"}
                          </p>
                          <p className="mt-1 text-xs text-ink-2">
                            {formatDate(conv.createdAt)}
                          </p>
                        </div>
                        <span className="text-xs text-ink-2">
                          {conv.messages.length} msg{conv.messages.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Conversation detail */}
          <div className="lg:col-span-3">
            <div className="card h-[calc(100vh-220px)] overflow-hidden lg:h-[600px]">
              {selectedConversation ? (
                <div className="flex h-full flex-col">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-surface-3 pb-4">
                    <div className="flex items-center gap-3">
                      <ChannelBadge channel={selectedConversation.channel} />
                      <StatusBadge status={selectedConversation.status} />
                    </div>
                    <span className="text-xs text-ink-2">
                      {formatDate(selectedConversation.createdAt)}
                    </span>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 space-y-4 overflow-y-auto py-4 scrollbar-hide">
                    {selectedConversation.messages.map((msg: Message, i: number) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === "agent" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                            msg.role === "agent"
                              ? "bg-accent text-white"
                              : "bg-surface-1 text-ink-0"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          <p
                            className={`mt-1 text-xs ${
                              msg.role === "agent" ? "text-white/70" : "text-ink-2"
                            }`}
                          >
                            {formatTime(msg.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  {selectedConversation.summary && (
                    <div className="border-t border-surface-3 pt-4">
                      <p className="text-xs font-medium text-ink-1">Summary</p>
                      <p className="mt-1 text-sm text-ink-0">
                        {selectedConversation.summary}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <svg className="mx-auto h-10 w-10 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                    <p className="mt-3 text-sm text-ink-1">
                      Select a conversation to view
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-text-primary text-bg-primary"
          : "bg-surface-1 text-ink-1 hover:bg-surface-2 hover:text-ink-0"
      }`}
    >
      {label}
    </button>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const icons: Record<string, React.ReactNode> = {
    email: (
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    api: (
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  };

  return (
    <span className="inline-flex items-center gap-1 rounded bg-surface-1 px-2 py-0.5 text-xs font-medium text-ink-1">
      {icons[channel] || null}
      {channel}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    resolved: "bg-surface-1 text-ink-1",
    escalated: "bg-orange-100 text-orange-700",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || styles.active}`}>
      {status}
    </span>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
