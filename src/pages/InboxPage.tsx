/**
 * Inbox Page
 *
 * View and manage agent conversations within the dashboard
 */
import { useState, type KeyboardEvent } from "react";
import { useQuery, useMutation } from "convex/react";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Id } from "../../convex/_generated/dataModel";
import { notify } from "../lib/notify";
import { platformApi } from "../lib/platformApi";

type ConversationStatus = "active" | "resolved" | "escalated";

interface Message {
  role: "agent" | "external";
  content: string;
  timestamp: number;
}

interface Conversation {
  _id: Id<"conversations">;
  channel: string;
  externalId: string;
  messages: Message[];
  status: ConversationStatus;
  summary?: string;
  createdAt: number;
}

export function InboxPage() {
  const conversations = useQuery(platformApi.convex.conversations.list, {});

  const [selectedConversation, setSelectedConversation] = useState<Id<"conversations"> | null>(null);
  const [replyText, setReplyText] = useState("");
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<ConversationStatus | "all">("all");

  const sendReply = useMutation(platformApi.convex.conversations.reply);
  const updateStatus = useMutation(platformApi.convex.conversations.updateStatus);

  // Filter conversations
  const filteredConversations = conversations?.filter((c: Conversation) => {
    if (c.channel === "dashboard") return false;
    if (filterChannel !== "all" && c.channel !== filterChannel) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    return true;
  });

  const selectedConv = conversations?.find((c: Conversation) => c._id === selectedConversation);

  // Handle sending a reply
  async function handleSendReply() {
    if (!selectedConversation || !replyText.trim()) return;
    try {
      await sendReply({
        conversationId: selectedConversation,
        content: replyText.trim(),
      });
      setReplyText("");
      notify.success("Reply sent");
    } catch (error) {
      notify.error("Could not send reply", error);
    }
  }

  function handleReplyKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || !e.shiftKey) return;
    e.preventDefault();
    if (!replyText.trim()) return;
    void handleSendReply();
  }

  // Handle status change
  async function handleStatusChange(status: ConversationStatus) {
    if (!selectedConversation) return;
    try {
      await updateStatus({ conversationId: selectedConversation, status });
      notify.success("Conversation updated", `Status set to ${status}.`);
    } catch (error) {
      notify.error("Could not update status", error);
    }
  }

  // Get channel icon
  function getChannelIcon(channel: string) {
    switch (channel) {
      case "email":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case "phone":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        );
      case "api":
      case "mcp":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      default:
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
    }
  }

  // Get status badge
  function getStatusBadge(status: ConversationStatus) {
    const styles: Record<ConversationStatus, string> = {
      active: "bg-blue-100 text-blue-700",
      resolved: "bg-green-100 text-green-700",
      escalated: "bg-red-100 text-red-700",
    };

    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }

  // Format timestamp
  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString("en-US", { weekday: "short" });
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in h-[calc(100vh-140px)]">
        {conversations === undefined ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
          </div>
        ) : (
          <div className="flex h-full rounded-lg border border-surface-3 bg-surface-0 overflow-hidden">
            {/* Sidebar: Conversation list */}
            <div className="w-80 border-r border-surface-3 flex flex-col">
              {/* Filters */}
              <div className="border-b border-surface-3 p-4">
                <h1 className="text-lg font-semibold text-ink-0">Inbox</h1>
                <div className="mt-3 flex gap-2">
                  <select
                    value={filterChannel}
                    onChange={(e) => setFilterChannel(e.target.value)}
                    className="input text-sm py-1.5"
                  >
                    <option value="all">All channels</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="api">API</option>
                    <option value="mcp">MCP</option>
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as ConversationStatus | "all")}
                    className="input text-sm py-1.5"
                  >
                    <option value="all">All status</option>
                    <option value="active">Active</option>
                    <option value="resolved">Resolved</option>
                    <option value="escalated">Escalated</option>
                  </select>
                </div>
              </div>

              {/* Conversation list */}
              <div className="flex-1 overflow-y-auto">
                {filteredConversations?.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-1">
                      <svg className="h-6 w-6 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                    </div>
                    <p className="mt-4 text-sm text-ink-1">No conversations yet</p>
                    <p className="mt-1 text-xs text-ink-2">
                      Messages from email, phone, and API will appear here
                    </p>
                  </div>
                ) : (
                  filteredConversations?.map((conv: Conversation) => (
                    <button
                      key={conv._id}
                      onClick={() => setSelectedConversation(conv._id)}
                      className={`w-full border-b border-surface-3 p-4 text-left transition-colors hover:bg-surface-1 ${
                        selectedConversation === conv._id ? "bg-surface-1" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-ink-2">{getChannelIcon(conv.channel)}</span>
                        <span className="flex-1 truncate font-medium text-ink-0">
                          {conv.externalId}
                        </span>
                        <span className="text-xs text-ink-2">
                          {formatTime(conv.messages[conv.messages.length - 1]?.timestamp ?? conv.createdAt)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        {getStatusBadge(conv.status)}
                        <span className="truncate text-sm text-ink-1">
                          {conv.messages[conv.messages.length - 1]?.content.substring(0, 50)}...
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Main: Conversation view */}
            <div className="flex-1 flex flex-col">
              {selectedConv ? (
                <>
                  {/* Header */}
                  <div className="border-b border-surface-3 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-ink-2">{getChannelIcon(selectedConv.channel)}</span>
                      <div>
                        <h2 className="font-medium text-ink-0">{selectedConv.externalId}</h2>
                        <p className="text-xs text-ink-2 capitalize">{selectedConv.channel}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(selectedConv.status)}
                      <select
                        value={selectedConv.status}
                        onChange={(e) => handleStatusChange(e.target.value as ConversationStatus)}
                        className="input text-sm py-1.5 pr-8"
                      >
                        <option value="active">Mark Active</option>
                        <option value="resolved">Mark Resolved</option>
                        <option value="escalated">Escalate</option>
                      </select>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {selectedConv.messages.map((msg: Message, idx: number) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === "agent" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            msg.role === "agent"
                              ? "bg-accent text-white"
                              : "bg-surface-1 text-ink-0"
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                          <p
                            className={`mt-1 text-xs ${
                              msg.role === "agent" ? "text-white/70" : "text-ink-2"
                            }`}
                          >
                            {new Date(msg.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reply input */}
                  <div className="border-t border-surface-3 p-4">
                    <div className="flex gap-2">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type a reply..."
                        className="input flex-1 resize-none"
                        rows={2}
                        onKeyDown={handleReplyKeyDown}
                      />
                      <button
                        onClick={handleSendReply}
                        disabled={!replyText.trim()}
                        className="btn-accent self-end"
                      >
                        Send
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-ink-2">
                      Enter = new line, Shift+Enter = send
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface-1">
                      <svg className="h-8 w-8 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="mt-4 text-lg font-medium text-ink-0">Select a conversation</h3>
                    <p className="mt-1 text-sm text-ink-1">
                      Choose a conversation from the list to view messages
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
